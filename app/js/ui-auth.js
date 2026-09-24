/* AreaTherm — login/register screens. The app requires the backend (see
   backend-api.js) to be running; these two screens gate everything else.
   Same real-async pattern already used in ui-1.js's location-load handlers:
   disable button + loading class, status text, await, toast/render on
   success, catch sets an error message and re-enables. */
window.UI = window.UI || {};
(function () {
  const BACKEND = window.APP_BACKEND;
  // Carries the just-registered (or not-yet-verified) email into the verify
  // screen — same simple module-level-variable pattern as ui-1.js's
  // Guided Setup wizard step state.
  let pendingVerificationEmail = null;

  function authShellHtml(title, subtitle, bodyHtml) {
    return `<div class="card" style="max-width:400px;width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
        <div class="brand-mark" style="width:34px;height:34px;border-radius:8px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">AT</div>
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--text);">AreaTherm</div>
          <div style="font-size:10.5px;color:var(--text-faint);letter-spacing:var(--tracking-wide);">Passive Shelter Design</div>
        </div>
      </div>
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
      ${bodyHtml}
    </div>`;
  }

  window.UI.renderLogin = function (root) {
    root.innerHTML = authShellHtml("Sign in", "Sign in to your AreaTherm account to continue.", `
      <div class="form-row"><label>Email</label><input id="loginEmail" type="email" autocomplete="username" /></div>
      <div class="form-row"><label>Password</label><input id="loginPassword" type="password" autocomplete="current-password" /></div>
      <div id="loginStatus" class="hint status-error" hidden></div>
      <button id="loginBtn" class="btn btn-accent" style="width:100%;margin-top:4px;">Sign In</button>
      <p class="hint" style="text-align:center;margin-top:16px;">No account yet? <a href="#/register" style="color:var(--accent);font-weight:600;">Register</a></p>
    `);

    async function doLogin() {
      const email = U.qs("#loginEmail", root).value.trim();
      const password = U.qs("#loginPassword", root).value;
      const statusEl = U.qs("#loginStatus", root);
      const btn = U.qs("#loginBtn", root);
      statusEl.hidden = true;
      if (!email || !password) {
        statusEl.hidden = false;
        statusEl.textContent = "Enter both email and password.";
        return;
      }
      btn.disabled = true;
      btn.classList.add("is-loading");
      try {
        await BACKEND.login(email, password);
        window.APP.toast("Signed in.");
        window.APP.navigate("dashboard");
      } catch (e) {
        statusEl.hidden = false;
        if (e.status === 403) {
          pendingVerificationEmail = email;
          statusEl.innerHTML = 'Please verify your email first. <a href="#/verify-email" style="color:inherit;font-weight:700;text-decoration:underline;">Enter your code →</a>';
        } else {
          statusEl.textContent = e.status === 401 ? "Incorrect email or password." : ("Could not sign in: " + e.message + " — is the backend running?");
        }
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    }

    U.on("#loginBtn", "click", doLogin, root);
    U.on("#loginPassword", "keydown", (e) => { if (e.key === "Enter") doLogin(); }, root);
    U.qs("#loginEmail", root).focus();
  };

  window.UI.renderRegister = function (root) {
    root.innerHTML = authShellHtml("Create account", "Set up an AreaTherm account — your projects, designs, and simulations are saved to the server.", `
      <div class="form-row"><label>Name</label><input id="regName" autocomplete="name" /></div>
      <div class="form-row"><label>Email</label><input id="regEmail" type="email" autocomplete="username" /></div>
      <div class="form-row"><label>Password</label><input id="regPassword" type="password" autocomplete="new-password" /></div>
      <div class="form-row"><label>Confirm Password</label><input id="regPassword2" type="password" autocomplete="new-password" /></div>
      <div id="regStatus" class="hint status-error" hidden></div>
      <button id="regBtn" class="btn btn-accent" style="width:100%;margin-top:4px;">Create Account</button>
      <p class="hint" style="text-align:center;margin-top:16px;">Already have an account? <a href="#/login" style="color:var(--accent);font-weight:600;">Sign in</a></p>
    `);

    async function doRegister() {
      const displayName = U.qs("#regName", root).value.trim();
      const email = U.qs("#regEmail", root).value.trim();
      const password = U.qs("#regPassword", root).value;
      const password2 = U.qs("#regPassword2", root).value;
      const statusEl = U.qs("#regStatus", root);
      const btn = U.qs("#regBtn", root);
      statusEl.hidden = true;
      if (!displayName || !email || !password) {
        statusEl.hidden = false;
        statusEl.textContent = "Fill in every field.";
        return;
      }
      if (password.length < 8) {
        statusEl.hidden = false;
        statusEl.textContent = "Password must be at least 8 characters.";
        return;
      }
      if (password !== password2) {
        statusEl.hidden = false;
        statusEl.textContent = "Passwords don't match.";
        return;
      }
      btn.disabled = true;
      btn.classList.add("is-loading");
      try {
        await BACKEND.register({ email: email, displayName: displayName, password: password });
        pendingVerificationEmail = email;
        window.APP.toast("Account created — check your email for a verification code.");
        window.APP.navigate("verify-email");
      } catch (e) {
        statusEl.hidden = false;
        statusEl.textContent = e.status === 409 ? "An account with that email already exists." : ("Could not create account: " + e.message);
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    }

    U.on("#regBtn", "click", doRegister, root);
    U.qs("#regName", root).focus();
  };

  window.UI.renderVerifyEmail = function (root) {
    // No pending email (e.g. a direct link/reload) — nothing to verify yet,
    // send them to register rather than showing a broken/empty form.
    if (!pendingVerificationEmail) { window.APP.navigate("register"); return; }
    const email = pendingVerificationEmail;

    root.innerHTML = authShellHtml("Check your email", `We sent a 6-digit verification code to <b>${U.esc(email)}</b>. Enter it below to finish signing in.`, `
      <div class="form-row"><label>Verification Code</label><input id="verifyCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="letter-spacing:4px;font-size:18px;text-align:center;" /></div>
      <div id="verifyStatus" class="hint status-error" hidden></div>
      <button id="verifyBtn" class="btn btn-accent" style="width:100%;margin-top:4px;">Verify</button>
      <p class="hint" style="text-align:center;margin-top:16px;">Didn't get a code? <a id="resendLink" href="#" style="color:var(--accent);font-weight:600;">Resend it</a></p>
    `);

    async function doVerify() {
      const code = U.qs("#verifyCode", root).value.trim();
      const statusEl = U.qs("#verifyStatus", root);
      const btn = U.qs("#verifyBtn", root);
      statusEl.hidden = true;
      if (!code) { statusEl.hidden = false; statusEl.textContent = "Enter the code from your email."; return; }
      btn.disabled = true;
      btn.classList.add("is-loading");
      try {
        await BACKEND.verifyEmail(email, code);
        pendingVerificationEmail = null;
        window.APP.toast("Email verified — welcome to AreaTherm.");
        window.APP.navigate("dashboard");
      } catch (e) {
        statusEl.hidden = false;
        statusEl.textContent = e.status === 400 ? "That code is invalid or has expired — try resending it." : ("Could not verify: " + e.message);
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    }

    U.on("#verifyBtn", "click", doVerify, root);
    U.on("#verifyCode", "keydown", (e) => { if (e.key === "Enter") doVerify(); }, root);
    U.on("#resendLink", "click", async (e) => {
      e.preventDefault();
      const link = U.qs("#resendLink", root);
      const statusEl = U.qs("#verifyStatus", root);
      link.textContent = "Sending…";
      try {
        await BACKEND.resendVerification(email);
        window.APP.toast("A new code is on its way.");
      } catch (err) {
        statusEl.hidden = false;
        statusEl.textContent = "Could not resend: " + err.message;
      } finally {
        link.textContent = "Resend it";
      }
    }, root);
    U.qs("#verifyCode", root).focus();
  };
})();
