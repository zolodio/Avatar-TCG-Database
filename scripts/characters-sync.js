// scripts/characters-sync.js
// Syncs the Creations character roster to/from the Supabase 'characters' table.
// No changes needed to the existing IIFE — this intercepts localStorage writes.

(function () {
  'use strict';

  var LS_KEY   = 'aqst_characters';
  var _writing = false; // guard: cloud-pull writes must not re-trigger cloud-push

  /* ── helpers ──────────────────────────────────────────────────── */

  function getLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function setLocalSilent(chars) {
    _writing = true;
    localStorage.setItem(LS_KEY, JSON.stringify(chars));
    _writing = false;
  }

  async function getUserId() {
    var sb = window.sb;
    if (!sb) return null;
    var s = await sb.auth.getSession();
    return (s.data && s.data.session && s.data.session.user)
      ? s.data.session.user.id : null;
  }

  /* ── cloud writes ─────────────────────────────────────────────── */

  async function upsertAll(chars, uid) {
    var sb = window.sb;
    if (!sb || !uid || !chars.length) return;
    var rows = chars.map(function (c) {
      return {
        id:         String(c.id),
        user_id:    uid,
        data:       c,
        updated_at: new Date().toISOString()
      };
    });
    var res = await sb.from('characters').upsert(rows, { onConflict: 'id,user_id' });
    if (res.error) console.warn('[charSync] upsert error', res.error);
  }

  async function pruneCloud(localIds, uid) {
    var sb = window.sb;
    if (!sb || !uid) return;
    var res = await sb.from('characters').select('id').eq('user_id', uid);
    if (res.error || !res.data) return;
    var toDelete = res.data
      .map(function (r) { return r.id; })
      .filter(function (id) { return localIds.indexOf(id) === -1; });
    if (!toDelete.length) return;
    await sb.from('characters').delete().in('id', toDelete).eq('user_id', uid);
  }

  /* ── cloud read / merge ───────────────────────────────────────── */

  async function syncFromCloud(uid) {
    var sb = window.sb;
    if (!sb || !uid) return;

    var res = await sb.from('characters')
      .select('data')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (res.error || !res.data || !res.data.length) return;

    // Merge: cloud wins when updatedAt is equal or newer
    var byId = {};
    getLocal().forEach(function (c) { byId[String(c.id)] = c; });
    res.data.forEach(function (row) {
      var cc  = row.data;
      var key = String(cc.id);
      var ex  = byId[key];
      if (!ex || (cc.updatedAt || 0) >= (ex.updatedAt || 0)) {
        byId[key] = cc;
      }
    });

    var merged = Object.values(byId).sort(function (a, b) {
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });

    setLocalSilent(merged);
    rerenderRoster();
    console.log('[charSync] pulled', res.data.length, 'characters from cloud');
  }

  /* ── roster re-render ─────────────────────────────────────────── */

  function rerenderRoster() {
    // The IIFE calls renderRoster() whenever the roster tab button is clicked.
    // If the roster panel is currently visible, we click the button to refresh it.
    var panel = document.getElementById('cctab-roster');
    if (panel && panel.style.display !== 'none') {
      var btn = document.querySelector('#ccTabs [data-cctab="roster"]');
      if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  /* ── intercept localStorage writes ───────────────────────────── */
  // Any save or delete by the IIFE calls localStorage.setItem(LS_KEY, ...).
  // We hook that to push the full updated array to Supabase.

  var _origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    _origSet.call(this, key, value);
    if (_writing || this !== localStorage || key !== LS_KEY) return;

    (async function () {
      var uid = await getUserId();
      if (!uid) return;
      var chars;
      try { chars = JSON.parse(value); } catch (e) { return; }
      if (!Array.isArray(chars)) return;

      await upsertAll(chars, uid);
      await pruneCloud(chars.map(function (c) { return String(c.id); }), uid);
    })();
  };

  /* ── auth polling: pull on login ──────────────────────────────── */

  var _lastUid = null;
  setInterval(async function () {
    var uid = await getUserId();
    if (uid && uid !== _lastUid) {
      _lastUid = uid;
      await syncFromCloud(uid);
    } else if (!uid && _lastUid) {
      _lastUid = null; // logged out — local data stays until next login
    }
  }, 3000);

  /* ── public API ───────────────────────────────────────────────── */
  window.charSync = { syncFromCloud: syncFromCloud };

  console.log('[characters-sync.js] loaded ✓');
})();