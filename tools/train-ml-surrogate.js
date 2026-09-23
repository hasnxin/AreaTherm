/* AreaTherm — ML surrogate trainer (dev-only, never shipped).
   Gradient-boosted regression trees, from scratch, squared-error loss (so
   "gradient boosting" reduces to "repeatedly fit a tree to the residuals" --
   no separate gradient-computation abstraction needed). Trains 4 independent
   boosters, one per target. Reports HONEST accuracy against entire climate
   contexts held out of training entirely (never just random rows -- row-
   level splitting alone would leak near-duplicate design draws from the
   same context between train and test).

   Run: node tools/train-ml-surrogate.js
   Output: app/js/ml-model-data.js (window.APP_ML_MODEL = {...}) */

const fs = require("fs");
const path = require("path");

const FEATURE_NAMES = [
  "U_wall", "alpha_wall", "U_roof", "alpha_roof", "orientationFactor",
  "windowWallRatioPct", "U_window", "SHGC", "massKg", "cp_mass",
  "floorAreaM2", "wallAreaM2", "roofAreaM2", "volumeM3",
  "internalGainW", "airLeakageAch",
  "tMinC", "tMaxC", "solarKwhDay", "daylightHours", "windMs", "latitude", "avgTempCAnnual"
];
const TARGETS = ["comfortScore", "heatRetentionPct", "solarUtilizationPct", "energyDemandKwhPerDay"];

const MAX_DEPTH = 4, MIN_LEAF = 20, LEARNING_RATE = 0.08, MAX_ROUNDS = 150, PATIENCE = 10;

function toVector(features) { return FEATURE_NAMES.map(f => features[f]); }

// ---- CART regression tree (greedy variance-reduction split) --------------
function fitTree(X, resid, indices, depth) {
  const n = indices.length;
  const mean = indices.reduce((s, i) => s + resid[i], 0) / n;
  if (depth >= MAX_DEPTH || n < 2 * MIN_LEAF) return { leaf: true, value: mean };

  let best = null;
  for (let f = 0; f < FEATURE_NAMES.length; f++) {
    const pairs = indices.map(i => [X[i][f], resid[i]]).sort((a, b) => a[0] - b[0]);
    let sumAll = 0, sumSqAll = 0;
    for (const [, r] of pairs) { sumAll += r; sumSqAll += r * r; }
    let sumL = 0, sumSqL = 0;
    for (let k = 0; k < pairs.length - 1; k++) {
      sumL += pairs[k][1]; sumSqL += pairs[k][1] * pairs[k][1];
      const nl = k + 1, nr = pairs.length - nl;
      if (nl < MIN_LEAF || nr < MIN_LEAF || pairs[k][0] === pairs[k + 1][0]) continue;
      const sseL = sumSqL - (sumL * sumL) / nl;
      const sumR = sumAll - sumL, sseR = (sumSqAll - sumSqL) - (sumR * sumR) / nr;
      const totalSse = sumSqAll - (sumAll * sumAll) / pairs.length;
      const gain = totalSse - (sseL + sseR);
      if (!best || gain > best.gain) best = { gain, feature: f, threshold: (pairs[k][0] + pairs[k + 1][0]) / 2 };
    }
  }
  if (!best || best.gain <= 1e-9) return { leaf: true, value: mean };

  const leftIdx = indices.filter(i => X[i][best.feature] <= best.threshold);
  const rightIdx = indices.filter(i => X[i][best.feature] > best.threshold);
  if (leftIdx.length < MIN_LEAF || rightIdx.length < MIN_LEAF) return { leaf: true, value: mean };

  return {
    leaf: false, feature: best.feature, threshold: best.threshold,
    left: fitTree(X, resid, leftIdx, depth + 1),
    right: fitTree(X, resid, rightIdx, depth + 1)
  };
}
function evalTree(tree, x) {
  let node = tree;
  while (!node.leaf) node = x[node.feature] <= node.threshold ? node.left : node.right;
  return node.value;
}
function evalEnsemble(model, x) {
  let pred = model.f0;
  for (const tree of model.trees) pred += model.learningRate * evalTree(tree, x);
  return pred;
}

function mae(actual, predicted) {
  return actual.reduce((s, a, i) => s + Math.abs(a - predicted[i]), 0) / actual.length;
}
function r2(actual, predicted) {
  const meanA = actual.reduce((a, b) => a + b, 0) / actual.length;
  const ssTot = actual.reduce((s, a) => s + (a - meanA) ** 2, 0);
  const ssRes = actual.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : 1;
}

function trainBooster(Xtrain, ytrain, Xval, yval) {
  const f0 = ytrain.reduce((a, b) => a + b, 0) / ytrain.length;
  let predTrain = ytrain.map(() => f0);
  let predVal = yval.map(() => f0);
  const trees = [];
  let bestValMae = Infinity, bestRound = 0, roundsSinceBest = 0;
  const allIdx = Xtrain.map((_, i) => i);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const resid = ytrain.map((y, i) => y - predTrain[i]);
    const tree = fitTree(Xtrain, resid, allIdx, 0);
    trees.push(tree);
    predTrain = predTrain.map((p, i) => p + LEARNING_RATE * evalTree(tree, Xtrain[i]));
    predVal = predVal.map((p, i) => p + LEARNING_RATE * evalTree(tree, Xval[i]));
    const valMae = mae(yval, predVal);
    if (valMae < bestValMae - 1e-6) { bestValMae = valMae; bestRound = round; roundsSinceBest = 0; }
    else { roundsSinceBest++; if (roundsSinceBest >= PATIENCE) break; }
  }
  return { f0, learningRate: LEARNING_RATE, trees: trees.slice(0, bestRound), bestRound, bestValMae };
}

// ---- Compact serialization (array encoding, no repeated JSON keys) -------
function serializeTree(tree) {
  // [isLeaf, value] or [isLeaf, feature, threshold, leftIdx, rightIdx] flattened into one array.
  const nodes = [];
  function walk(node) {
    const idx = nodes.length;
    if (node.leaf) { nodes.push([1, node.value]); return idx; }
    nodes.push(null); // placeholder
    const leftIdx = walk(node.left);
    const rightIdx = walk(node.right);
    nodes[idx] = [0, node.feature, node.threshold, leftIdx, rightIdx];
    return idx;
  }
  walk(tree);
  return nodes;
}

async function main() {
  const dataPath = path.join(__dirname, "training-data.json");
  console.log(`Loading ${dataPath}...`);
  const { contexts, rows } = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  console.log(`${rows.length} rows across ${contexts.length} contexts`);

  // Context-level split: hold out ~9 entire contexts for the test set.
  const shuffledContexts = [...contexts].sort(() => Math.random() - 0.5);
  const testContexts = new Set(shuffledContexts.slice(0, 9));
  const trainValRows = rows.filter(r => !testContexts.has(r.context));
  const testRows = rows.filter(r => testContexts.has(r.context));
  console.log(`Test contexts (held out entirely): ${[...testContexts].join(", ")}`);
  console.log(`Train+val rows: ${trainValRows.length}, Test rows: ${testRows.length}`);

  // Row-level 85/15 split within the remaining contexts.
  const shuffled = [...trainValRows].sort(() => Math.random() - 0.5);
  const splitAt = Math.floor(shuffled.length * 0.85);
  const trainRows = shuffled.slice(0, splitAt), valRows = shuffled.slice(splitAt);

  const Xtrain = trainRows.map(r => toVector(r.features));
  const Xval = valRows.map(r => toVector(r.features));
  const Xtest = testRows.map(r => toVector(r.features));

  const models = {};
  const accuracy = {};
  for (const target of TARGETS) {
    console.log(`\n--- Training booster for ${target} ---`);
    const ytrain = trainRows.map(r => r.targets[target]);
    const yval = valRows.map(r => r.targets[target]);
    const ytest = testRows.map(r => r.targets[target]);
    const t0 = Date.now();
    const model = trainBooster(Xtrain, ytrain, Xval, yval);
    const trainSec = (Date.now() - t0) / 1000;
    const predTest = Xtest.map(x => evalEnsemble(model, x));
    const testMae = mae(ytest, predTest), testR2 = r2(ytest, predTest);
    console.log(`  Stopped at round ${model.bestRound}/${MAX_ROUNDS} (${trainSec.toFixed(1)}s), val MAE=${model.bestValMae.toFixed(3)}`);
    console.log(`  HELD-OUT TEST (never-seen contexts): MAE=${testMae.toFixed(3)}, R2=${testR2.toFixed(4)}, n=${ytest.length}`);
    models[target] = { f0: model.f0, learningRate: model.learningRate, trees: model.trees.map(serializeTree) };
    accuracy[target] = { mae: Math.round(testMae * 100) / 100, r2: Math.round(testR2 * 10000) / 10000, testN: ytest.length };
  }

  const output = {
    version: "1.0.0",
    trainedAt: new Date().toISOString(),
    featureNames: FEATURE_NAMES,
    targets: TARGETS,
    trainRows: trainRows.length, valRows: valRows.length, testRows: testRows.length,
    testContexts: [...testContexts],
    accuracy,
    models
  };
  const outPath = path.join(__dirname, "..", "app", "js", "ml-model-data.js");
  const js = `/* AreaTherm — ML surrogate trained weights (generated file, do not hand-edit).
   Regenerate via: node tools/generate-training-data.js && node tools/train-ml-surrogate.js
   Trained ${output.trainedAt} on ${output.trainRows} rows (held-out test: ${output.testRows} rows
   from ${output.testContexts.length} entire climate contexts never seen during training).
   Accuracy below is measured against THIS APP'S OWN PHYSICS ENGINE OUTPUT on held-out
   data — not a claim about real-world accuracy, which the physics model itself has not
   been field-validated against either (see ARCHITECTURE.md SS8). See ml-surrogate.js for
   how this is used, and Settings -> "ML Surrogate" for the user-facing explanation. */
window.APP_ML_MODEL = ${JSON.stringify(output)};
`;
  fs.writeFileSync(outPath, js, "utf8");
  console.log(`\nWrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
  console.log("\n=== Final held-out test accuracy (vs this app's own physics engine, not real-world) ===");
  for (const t of TARGETS) console.log(`  ${t}: MAE ${accuracy[t].mae}, R2 ${accuracy[t].r2} (n=${accuracy[t].testN})`);
}

main().catch(e => { console.error(e); process.exit(1); });
