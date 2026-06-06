// ================================================================
//  AVATAR TCG — Cloud Sync via Supabase
// ================================================================
(function () {
  'use strict';

  var sb          = null;
  var currentUser = null;

  // ── Helpers ───────────────────────────────────────────────────
  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function $(id) { return document.getElementById(id); }
  function show(id) { var e=$(id); if(e) e.style.display=''; }
  function hide(id) { var e=$(id); if(e) e.style.display='none'; }
  function setDisplay(id, d) { var e=$(id); if(e) e.style.display=d; }
  function setText(id, t) { var e=$(id); if(e) e.textContent=t; }
  function val(id) { var e=$(id); return e ? e.value.trim() : ''; }
  function showErr(m) { var e=$('auth-err'); if(e){e.textContent=m;e.style.display='block';} }
  function clearErr() { var e=$('auth-err'); if(e){e.textContent='';e.style.display='none';} }
  function showStatus(m) { setText('auth-status', m); }

  function setSyncDot(state) {
    var map = {
      syncing: { text:'🔄 Syncing…',       color:'var(--air)' },
      ok:      { text:'✅ Synced',          color:'var(--success)' },
      error:   { text:'❌ Sync error',      color:'var(--danger)' },
      idle:    { text:'Not synced',         color:'var(--text-muted)' }
    };
    var s = map[state] || map.idle;
    var e = $('auth-sync-dot');
    if (e) { e.textContent = s.text; e.style.color = s.color; }
  }

  // ── Collection accessors ──────────────────────────────────────
  function getPhysical()            { return window.collection              || {}; }
  function getPhysicalTimestamps()  { return window.collectionTimestamps    || {}; }
  function getPhysicalConditions()  { return window.collectionConditions    || {}; }
  function getDigital()             { return window.aqstDigitalCollection   || {}; }

  function applyPhysical(data, timestamps, conditions) {
    if (!data || typeof data !== 'object') return;
    window.collection = data;
    if (timestamps && typeof timestamps === 'object') {
      window.collectionTimestamps = timestamps;
      if (typeof window.saveTimestamps === 'function') window.saveTimestamps();
    }
    if (conditions && typeof conditions === 'object') {
      window.collectionConditions = conditions;
      if (typeof window.saveConditions === 'function') window.saveConditions();
    }
    if (typeof window.saveCollection        === 'function') window.saveCollection();
    if (typeof window.updateStats           === 'function') window.updateStats();
    if (typeof window.buildFilters          === 'function') window.buildFilters();
    if (typeof window.renderCards           === 'function') window.renderCards();
    if (typeof window.updateSaveCodeDisplay === 'function') window.updateSaveCodeDisplay();
    if (typeof window.updateAllPackCounters === 'function') window.updateAllPackCounters();
  }

function applyDigital(data) {
  if (!data || typeof data !== 'object') return;
  window.aqstDigitalCollection = data;
  if (typeof window.aqstRefreshDigital === 'function') window.aqstRefreshDigital(data);
}

  // ── Cloud push / pull ─────────────────────────────────────────
  async function cloudPush() {
    if (!currentUser || !sb) return;
    setSyncDot('syncing');
    try {
      var res = await sb.from('collections').upsert({
        user_id:              currentUser.id,
        physical:             getPhysical(),
        physical_timestamps:  getPhysicalTimestamps(),
        physical_conditions:  getPhysicalConditions(),
        digital:              getDigital()
      }, { onConflict: 'user_id' });
      if (res.error) throw res.error;
      setSyncDot('ok');
    } catch (e) {
      console.warn('[AvatarTCG] Push failed:', e.message || e);
      setSyncDot('error');
    }
  }

  var debouncedPush = debounce(cloudPush, 2500);
  window._aqst_cloudSync = function () { if (currentUser) debouncedPush(); };

  async function cloudPull() {
    if (!currentUser || !sb) return null;
    try {
      var res = await sb.from('collections')
        .select('physical, physical_timestamps, physical_conditions, digital, updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    } catch (e) {
      console.warn('[AvatarTCG] Pull failed:', e.message || e);
      return null;
    }
  }

  // ── Login / logout state ──────────────────────────────────────
  async function onLogin(user) {
    currentUser = user;
    hide('auth-logged-out');
    setDisplay('auth-logged-in', 'block');
    setText('auth-user-email', user.email);
    setSyncDot('syncing');
    if (typeof window.resetPhysicalCardSearch === 'function') window.resetPhysicalCardSearch();

    var cloud = await cloudPull();

    if (!cloud) { await cloudPush(); }
    else {
      var localCount = Object.keys(getPhysical()).length;
      var cloudCount = Object.keys(cloud.physical || {}).length;

      if (localCount === 0 && cloudCount === 0) { setSyncDot('ok'); }
      else if (localCount === 0) { applyPhysical(cloud.physical, cloud.physical_timestamps, cloud.physical_conditions); applyDigital(cloud.digital); setSyncDot('ok'); }
      else if (cloudCount === 0) { await cloudPush(); }
      else {
        // Both sides have data — only show conflict dialog if they actually differ.
        // Use a robust comparison that isn't sensitive to key ordering.
        function objEqual(a, b) {
          if (a === b) return true;
          if (!a || !b) return false;
          var ka = Object.keys(a), kb = Object.keys(b);
          if (ka.length !== kb.length) return false;
          for (var i = 0; i < ka.length; i++) {
            var k = ka[i];
            if (String(a[k]) !== String(b[k])) return false;
          }
          return true;
        }

        var physMatch = objEqual(getPhysical(), cloud.physical || {});
        var digMatch  = objEqual(getDigital(),  cloud.digital  || {});

        if (physMatch && digMatch) {
          // Data is identical — silently mark as synced
          setSyncDot('ok');
        } else {
          // Genuine conflict — show the dialog
          window._pendingCloudData = cloud;
          var when = cloud.updated_at ? ' (saved ' + new Date(cloud.updated_at).toLocaleDateString() + ')' : '';
          setText('auth-merge-local', localCount + ' card entries on this device');
          setText('auth-merge-cloud', cloudCount + ' card entries in the cloud' + when);
          setDisplay('auth-merge-dlg', 'flex');
        }
      }
    }

    // ── Fire social hook ──────────────────────────────────────
    if (typeof window.socialOnLogin === 'function') window.socialOnLogin(user);
  }

  function onLogout() {
    currentUser = null;
    setDisplay('auth-logged-in', 'none');
    show('auth-logged-out');
    setSyncDot('idle');

    // ── Fire social hook ──────────────────────────────────────
    if (typeof window.socialOnLogout === 'function') window.socialOnLogout();
  }

  // ── Auth actions ──────────────────────────────────────────────
  async function doLogin() {
    clearErr(); showStatus('');
    var email = val('auth-email'), pass = val('auth-pass');
    if (!email || !pass) { showErr('Enter email and password.'); return; }
    var btn = $('auth-login-btn');
    btn.disabled = true; btn.textContent = 'Logging in…';
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    btn.disabled = false; btn.textContent = 'Log In';
    if (res.error) showErr(res.error.message);
  }

  async function doSignup() {
    clearErr(); showStatus('');
    var email = val('auth-email'), pass = val('auth-pass'), pass2 = val('auth-pass2');
    if (!email || !pass)  { showErr('Enter email and password.'); return; }
    if (pass !== pass2)   { showErr('Passwords do not match.'); return; }
    if (pass.length < 6)  { showErr('Password needs at least 6 characters.'); return; }
    var btn = $('auth-signup-btn');
    btn.disabled = true; btn.textContent = 'Creating account…';
    var res = await sb.auth.signUp({ email: email, password: pass });
    btn.disabled = false; btn.textContent = 'Sign Up';
    if (res.error) showErr(res.error.message);
    else showStatus('✅ Check your email to confirm, then log in!');
  }

  async function doLogout()  { await sb.auth.signOut(); }

  async function doResetPassword() {
    var email = val('auth-email');
    if (!email) { showErr('Enter your email address first.'); return; }
    var res = await sb.auth.resetPasswordForEmail(email);
    if (res.error) showErr(res.error.message);
    else showStatus('📧 Password reset email sent!');
  }

  // ── Wire up buttons ───────────────────────────────────────────
  function wireButtons() {
    var safe = function(id, fn) {
      var el = $(id); if (el) el.addEventListener('click', fn);
    };

    safe('auth-login-btn',  doLogin);
    safe('auth-signup-btn', doSignup);
    safe('auth-logout-btn', doLogout);
    safe('auth-reset-btn',  doResetPassword);

    safe('auth-push-btn', cloudPush);
    safe('auth-pull-btn', async function () {
      var data = await cloudPull();
      if (data) { applyPhysical(data.physical, data.physical_timestamps, data.physical_conditions); applyDigital(data.digital); setSyncDot('ok'); }
    });

    safe('auth-use-cloud', function () {
      var d = window._pendingCloudData;
      if (d) { applyPhysical(d.physical, d.physical_timestamps, d.physical_conditions); applyDigital(d.digital); }
      setDisplay('auth-merge-dlg', 'none'); setSyncDot('ok');
    });
    safe('auth-use-local', function () {
      setDisplay('auth-merge-dlg', 'none'); cloudPush();
    });

    ['auth-email','auth-pass','auth-pass2'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });
  }

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.indexOf('YOUR_PROJECT') !== -1) {
      hide('auth-logged-out');
      hide('auth-logged-in');
      setDisplay('auth-no-config', 'block');
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      showErr('Supabase SDK failed to load. Check your internet connection.');
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ── Expose client globally for social features ────────────
    window.sb = sb;

    wireButtons();

    sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) onLogin(session.user);
      else onLogout();
    });

    setInterval(function () { if (currentUser) cloudPush(); }, 120000);
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