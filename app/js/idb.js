/* AreaTherm — tiny promise-based IndexedDB wrapper.
   Backs the two localStorage-quota-sensitive stores (the reliability
   layer's weather/NASA POWER/elevation cache, and the saved-projects
   list) with a database that typically has hundreds of MB to low-GB of
   headroom instead of localStorage's ~5-10MB, while keeping the same
   per-origin, no-server, no-install storage model. Every method resolves
   to a safe fallback (null / [] / 0) rather than throwing, so a caller in
   a context where IndexedDB is unavailable (private browsing in some
   browsers, disabled storage) degrades the same way the old localStorage
   cache already did — a cache miss, not a crash. */

window.APP_IDB = (function () {
  const DB_NAME = "areatherm_db";
  const DB_VERSION = 1;
  const STORE_NAMES = ["apiCache", "projects"];

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB not available")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORE_NAMES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function get(storeName, key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result != null ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }

  async function set(storeName, key, value) {
    const db = await openDb(); // let this throw — callers (cacheWrite/mirrorIntoProjectsList) already handle a rejected write
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function del(storeName, key) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* nothing to delete or storage unavailable */ }
  }

  // Returns [{key, value}] for every row — used both to list saved
  // projects and to find the oldest API-cache entries to evict.
  async function getAllEntries(storeName) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const store = db.transaction(storeName, "readonly").objectStore(storeName);
        const out = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { out.push({ key: cursor.key, value: cursor.value }); cursor.continue(); }
          else resolve(out);
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    } catch (e) { return []; }
  }

  async function clearStore(storeName) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* storage unavailable */ }
  }

  return { get, set, del, getAllEntries, clearStore };
})();
