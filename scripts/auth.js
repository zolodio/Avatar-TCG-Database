// ================================================================
//  AVATAR TCG — Cross-device sync & auth via Supabase
// ================================================================
(function () {
  'use strict';

  var sb          = null;   // Supabase client
  var currentUser = null;
  var syncTimer   = null;

  // ── Debounce ──────────────────────────────────────────────────
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // ── Get collection data from page globals ─────────────────────
  // (The main script uses plain `var` so these are on window)
  function getPhysical() { return window.collection || {}; }
  function getDigital()  { return window.aqstDigitalCollection || {}; }

  // ── Push to cloud ─────────────────────────────────────────────
  async function cloudPush() {
    if (!currentUser || !sb) return;
    setSyncDot('syncing');
    try {
      var res = await sb.from('collections').upsert({
        user_id:  currentUser.id,
        physical: getPhysical(),
        digital:  getDigital()
      }, { onConflict: 'user_id' });
      if (res.error) throw res.error;
      setSyncDot('ok');
    } catch (e) {
      console.warn('[AvatarTCG] Cloud push failed:', e.message || e);
      setSyncDot('error');
    }
  }

  var debouncedPush = debounce(cloudPush, 2500);

  // Expose so the inline script hook can call it
  window._aqst_cloudSync = function () {
    if (currentUser) debouncedPush();
  };

  // ── Pull from cloud ───────────────────────────────────────────
  async function cloudPull() {
    if (!currentUser || !sb) return null;
    try {
      var res = await sb
        .from('collections')
        .select('physical, digital, updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    } catch (e) {
      console.warn('[AvatarTCG] Cloud pull failed:', e.message || e);
      return null;
    }
  }

  // ── Apply cloud data to the page ──────────────────────────────
  function applyPhysical(data) {
    if (!data || typeof data !== 'object') return;
    window.collection = data;
    if (typeof window.saveCollection       === 'function') window.saveCollection();
    if (typeof window.updateStats          === 'function') window.updateStats();
    if (typeof window.buildFilters         === 'function') window.buildFilters();
    if (typeof window.renderCards          === 'function') window.renderCards();
    if (typeof window.updateSaveCodeDisplay=== 'function') window.updateSaveCodeDisplay();
    if (typeof window.updateAllPackCounters=== 'function') window.updateAllPackCounters();
  }

  function applyDigital(data) {
    if (!data || typeof data !== 'object') return;
    window.aqstDigitalCollection = data;
    if (typeof window.aqstRefreshDigital === 'function') window.aqstRefreshDigital();
  }

  // ── After login: decide what to do with cloud vs local data ───
  async function onLogin(user) {
    currentUser = user;
    renderLoggedIn(user.email);
    setSyncDot('syncing');

    var cloud = await cloudPull();

    // No cloud row at all → push local up immediately
    if (!cloud) { await cloudPush(); return; }

    var localCount = Object.keys(getPhysical()).length;
    var cloudCount = Object.keys(cloud.physical || {}).length;

    // No data anywhere
    if (localCount === 0 && cloudCount === 0) { setSyncDot('ok'); return; }
    // Only cloud has data → pull it down
    if (localCount === 0) { applyPhysical(cloud.physical); applyDigital(cloud.digital); setSyncDot('ok'); return; }
    // Only local has data → push it up
    if (cloudCount === 0) { await cloudPush(); return; }

    // Both have data → ask the user
    window._pendingCloudData = cloud;
    showMergeDialog(cloud);
  }

  function onLogout() {
    currentUser = null;
    window._pendingCloudData = null;
    renderLoggedOut();
    setSyncDot('idle');
  }

  // ── Auth actions ──────────────────────────────────────────────
  async function doLogin() {
    clearErr();
    var email = val('auth-email');
    var pass  = val('auth-pass');
    if (!email || !pass) { showErr('Enter email and password.'); return; }
    setLoading('auth-login-btn', true);
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    setLoading('auth-login-btn', false);
    if (res.error) showErr(res.error.message);
  }

  async function doSignup() {
    clearErr();
    var email = val('auth-email');
    var pass  = val('auth-pass');
    var pass2 = val('auth-pass2');
    if (!email || !pass)  { showErr('Enter email and password.'); return; }
    if (pass !== pass2)   { showErr('Passwords do not match.'); return; }
    if (pass.length < 6)  { showErr('Password needs 6+ characters.'); return; }
    setLoading('auth-signup-btn', true);
    var res = await sb.auth.signUp({ email: email, password: pass });
    setLoading('auth-signup-btn', false);
    if (res.error) { showErr(res.error.message); return; }
    showStatus('✅ Check your email to confirm, then log in!');
  }

  async function doLogout() {
    await sb.auth.signOut();
  }

  async function doResetPassword() {
    var email = val('auth-email');
    if (!email) { showErr('Enter your email address first.'); return; }
    var res = await sb.auth.resetPasswordForEmail(email);
    if (res.error) showErr(res.error.message);
    else showStatus('📧 Password reset email sent!');
  }

  // ── Sync-dot indicator ────────────────────────────────────────
  var DOT_STATES = {
    idle:    { text: 'Not synced',  color: 'var(--text-muted)' },
    syncing: { text: '🔄 Syncing…', color: 'var(--air)' },
    ok:      { text: '✅ Synced',   color: 'var(--success)' },
    error:   { text: '❌ Sync error — try Sync Now', color: 'var(--danger)' }
  };
  function setSyncDot(state) {
    var el = document.getElementById('auth-sync-dot');
    if (!el) return;
    var s = DOT_STATES[state] || DOT_STATES.idle;
    el.textContent = s.text;
    el.style.color = s.color;
  }

  // ── Small UI helpers ──────────────────────────────────────────
  function val(id)  { var el=document.getElementById(id); return el ? el.value.trim() : ''; }
  function showErr(m)  { var el=document.getElementById('auth-err'); if(el){el.textContent=m;el.style.display='block';} }
  function clearErr()  { var el=document.getElementById('auth-err'); if(el){el.textContent='';el.style.display='none';} }
  function showStatus(m) { var el=document.getElementById('auth-status'); if(el) el.textContent=m; }
  function setLoading(id, on) {
    var btn=document.getElementById(id); if(!btn) return;
    btn.disabled=on;
    if(on){ btn.dataset.orig=btn.textContent; btn.textContent='Please wait…'; }
    else  { btn.textContent=btn.dataset.orig||btn.textContent; }
  }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Merge conflict dialog ─────────────────────────────────────
  function showMergeDialog(cloud) {
    var local = Object.keys(getPhysical()).length;
    var cld   = Object.keys(cloud.physical || {}).length;
    var when  = cloud.updated_at ? ' (saved ' + new Date(cloud.updated_at).toLocaleDateString() + ')' : '';
    var dlg   = document.getElementById('auth-merge-dlg');
    if (!dlg) return;
    document.getElementById('auth-merge-local').textContent = local + ' card entries on this device';
    document.getElementById('auth-merge-cloud').textContent = cld + ' card entries in the cloud' + when;
    dlg.style.display = 'flex';
  }
  function hideMergeDialog() {
    var dlg = document.getElementById('auth-merge-dlg');
    if (dlg) dlg.style.display = 'none';
  }

  // ── Render logged-in panel ────────────────────────────────────
  function renderLoggedIn(email) {
    var p = document.getElementById('auth-panel');
    if (!p) return;
    p.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
        '<div style="width:40px;height:40px;border-radius:50%;background:var(--zen);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">👤</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(email) + '</div>' +
          '<div id="auth-sync-dot" style="font-size:0.7rem;margin-top:2px;color:var(--text-muted);">Not synced</div>' +
        '</div>' +
        '<button id="auth-logout-btn" style="padding:7px 13px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-size:0.72rem;font-family:\'Nunito Sans\',sans-serif;font-weight:600;cursor:pointer;">Log Out</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button id="auth-push-btn" style="padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--zen);font-size:0.78rem;font-family:\'Nunito Sans\',sans-serif;font-weight:700;cursor:pointer;">☁️ Sync Now</button>' +
        '<button id="auth-pull-btn" style="padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--water);font-size:0.78rem;font-family:\'Nunito Sans\',sans-serif;font-weight:700;cursor:pointer;">⬇️ Load Cloud</button>' +
      '</div>';

    document.getElementById('auth-logout-btn').addEventListener('click', doLogout);
    document.getElementById('auth-push-btn').addEventListener('click', cloudPush);
    document.getElementById('auth-pull-btn').addEventListener('click', async function () {
      var data = await cloudPull();
      if (data) { applyPhysical(data.physical); applyDigital(data.digital); setSyncDot('ok'); }
    });
  }

  // ── Render logged-out panel ───────────────────────────────────
  var INPUT_STYLE = 'width:100%;padding:11px 13px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-size:0.85rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;';
  var BTN_BASE    = 'padding:12px;border-radius:var(--radius);font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;width:100%;';

  function renderLoggedOut() {
    var p = document.getElementById('auth-panel');
    if (!p) return;
    p.innerHTML =
      '<div style="margin-bottom:14px;">' +
        '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;margin-bottom:4px;">Sign In / Create Account</div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted);">Sync your collection across any device.</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;">' +
        '<input id="auth-email" type="email"    placeholder="Email address"                style="' + INPUT_STYLE + '">' +
        '<input id="auth-pass"  type="password" placeholder="Password"                    style="' + INPUT_STYLE + '">' +
        '<input id="auth-pass2" type="password" placeholder="Confirm password (sign up only)" style="' + INPUT_STYLE + '">' +
        '<div id="auth-err"    style="display:none;font-size:0.76rem;color:var(--danger);padding:8px 12px;background:rgba(224,72,72,0.08);border-radius:6px;border:1px solid rgba(224,72,72,0.2);"></div>' +
        '<div id="auth-status" style="font-size:0.74rem;color:var(--text-muted);min-height:16px;"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<button id="auth-login-btn"  style="' + BTN_BASE + 'border:none;background:var(--zen);color:#fff;">Log In</button>' +
          '<button id="auth-signup-btn" style="' + BTN_BASE + 'border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);">Sign Up</button>' +
        '</div>' +
        '<button id="auth-reset-btn" style="background:none;border:none;color:var(--text-muted);font-size:0.7rem;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;padding:0;">Forgot password?</button>' +
      '</div>';

    document.getElementById('auth-login-btn' ).addEventListener('click', doLogin);
    document.getElementById('auth-signup-btn').addEventListener('click', doSignup);
    document.getElementById('auth-reset-btn' ).addEventListener('click', doResetPassword);
    ['auth-email','auth-pass','auth-pass2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });
  }

  // ── Build the auth card & merge dialog in the DOM ─────────────
  function buildUI() {
    var profileTab = document.getElementById('tab-profile');
    if (!profileTab) return;

    // Auth card injected at the very top of the Profile tab
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;margin-bottom:18px;';
    var panel = document.createElement('div');
    panel.id = 'auth-panel';
    card.appendChild(panel);
    profileTab.insertBefore(card, profileTab.firstChild);

    // Merge-conflict dialog appended to body
    var dlg = document.createElement('div');
    dlg.id = 'auth-merge-dlg';
    dlg.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:300;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
    dlg.innerHTML =
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;max-width:360px;width:100%;">' +
        '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;margin-bottom:5px;">Collection Conflict</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;">Both this device and the cloud have data. Which should win?</div>' +
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;font-size:0.82rem;">' +
          '<div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;">THIS DEVICE</div>' +
          '<div id="auth-merge-local" style="margin-bottom:10px;"></div>' +
          '<div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;">CLOUD</div>' +
          '<div id="auth-merge-cloud"></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button id="auth-use-cloud" style="padding:12px;border-radius:var(--radius);border:none;background:var(--water);color:#fff;font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;">Use Cloud Data</button>' +
          '<button id="auth-use-local" style="padding:12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;">Keep Local & Upload It</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);

    document.getElementById('auth-use-cloud').addEventListener('click', function () {
      var d = window._pendingCloudData;
      if (d) { applyPhysical(d.physical); applyDigital(d.digital); }
      hideMergeDialog(); setSyncDot('ok');
    });
    document.getElementById('auth-use-local').addEventListener('click', function () {
      hideMergeDialog(); cloudPush();
    });

    renderLoggedOut();
  }

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.indexOf('YOUR_PROJECT') !== -1) {
      console.warn('[AvatarTCG] Supabase not configured. Edit scripts/supabase-config.js');
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('[AvatarTCG] Supabase SDK not loaded.');
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    buildUI();

    sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) onLogin(session.user);
      else onLogout();
    });

    // Background sync every 2 min
    setInterval(function () { if (currentUser) cloudPush(); }, 120000);

    // Sync when user tabs away or closes the page
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && currentUser) cloudPush();
    });
    window.addEventListener('beforeunload', function () {
      if (currentUser) cloudPush();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
