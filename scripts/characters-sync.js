// scripts/characters-sync.js
// Syncs the Creations character roster to/from the Supabase 'characters' table.
// Also fetches and renders friends' shared characters into #cc-shared-list.

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
      await loadSharedCharacters(uid);        // ← also load friends' characters
    } else if (!uid && _lastUid) {
      _lastUid = null;
      renderSharedList([]);                   // ← clear shared list on logout
    }
  }, 3000);

  /* ══════════════════════════════════════════════════════════════════
     FRIENDS' SHARED CHARACTERS
  ══════════════════════════════════════════════════════════════════ */

  /**
   * Fetch all characters belonging to the current user's friends and
   * render them into #cc-shared-list as standard .cc-char-card elements
   * with data-char set to the full character JSON.
   *
   * Table assumptions (adjust to match your actual schema):
   *   friendships  — user_id TEXT, friend_id TEXT, status TEXT ('accepted')
   *   profiles     — user_id TEXT, username TEXT
   *   characters   — user_id TEXT, data JSONB
   *
   * If your friendship table uses different column names (e.g. requester_id /
   * addressee_id), update the two .eq() / .or() calls in getFriendIds below.
   */

  async function getFriendIds(uid) {
    var sb = window.sb;
    if (!sb) return [];

    // Query both directions: rows where we are user_id OR friend_id
    var res = await sb
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or('user_id.eq.' + uid + ',friend_id.eq.' + uid);

    if (res.error || !res.data || !res.data.length) return [];

    return res.data.map(function (row) {
      return row.user_id === uid ? row.friend_id : row.user_id;
    });
  }

  async function loadSharedCharacters(uid) {
    var sb = window.sb;
    if (!sb || !uid) return;

    var friendIds = await getFriendIds(uid);
    if (!friendIds.length) {
      renderSharedList([]);
      return;
    }

    // Fetch all characters for those friends in one query
    var charRes = await sb
      .from('characters')
      .select('user_id, data')
      .in('user_id', friendIds);

    if (charRes.error || !charRes.data || !charRes.data.length) {
      renderSharedList([]);
      return;
    }

    // Fetch usernames for attribution — one profile query for all friend IDs
    var profileRes = await sb
      .from('profiles')
      .select('user_id, username')
      .in('user_id', friendIds);

    var usernameMap = {};
    if (profileRes.data) {
      profileRes.data.forEach(function (p) {
        usernameMap[p.user_id] = p.username;
      });
    }

    // Attach the owner's username to each character object for display
    var chars = charRes.data
      .map(function (row) {
        var c = Object.assign({}, row.data);
        c._ownerUsername = usernameMap[row.user_id] || 'Friend';
        return c;
      })
      .filter(function (c) { return c && c.givenName; })
      .sort(function (a, b) {
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });

    renderSharedList(chars);
    console.log('[charSync] loaded', chars.length, 'shared characters');
  }

  /* ── render shared list ───────────────────────────────────────── */

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getElementEmoji(bending) {
    var map = { water:'💧', earth:'🪨', fire:'🔥', air:'🌬️', spirit:'✨' };
    return map[bending] || '⚔️';
  }

  function renderSharedList(chars) {
    var list = document.getElementById('cc-shared-list');
    if (!list) return;

    if (!chars.length) {
      list.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.82rem;">' +
          '<i class="fas fa-share-alt" style="font-size:2rem;opacity:0.2;display:block;margin-bottom:10px;"></i>' +
          'No shared characters yet — check back soon!' +
        '</div>';
      return;
    }

    list.innerHTML = chars.map(function (char) {
      var imgHtml = char.imageData
        ? '<img src="data:' + esc(char.imageMime) + ';base64,' + char.imageData +
          '" alt="' + esc(char.givenName) + '" ' +
          'style="width:44px;height:44px;border-radius:8px;object-fit:cover;' +
          'border:1px solid var(--border);flex-shrink:0;">'
        : '<div class="cc-char-avatar">' + getElementEmoji(char.bending) + '</div>';

      var bend = char.bending
        ? char.bending.charAt(0).toUpperCase() + char.bending.slice(1)
        : 'Non-Bender';
      var sub = [bend, char.strike || '', char.advantage || '', char.ally || '']
        .filter(Boolean).join(' · ');

      // Embed the full character object as JSON so character-modal.js can read it
      // directly from the DOM without needing a separate lookup.
      var dataChar = esc(JSON.stringify(char));

      return '<div class="cc-char-card" data-char="' + dataChar + '" ' +
               'style="cursor:pointer;">' +
               imgHtml +
               '<div class="cc-char-info">' +
                 '<div class="cc-char-name">' + esc(char.givenName) +
                   (char.nickName
                     ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">&ldquo;' + esc(char.nickName) + '&rdquo;</span>'
                     : '') +
                 '</div>' +
                 '<div class="cc-char-sub">' + esc(sub) + '</div>' +
                 '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">' +
                   '<i class="fas fa-user" style="margin-right:3px;opacity:0.5;"></i>' +
                   esc(char._ownerUsername) +
                 '</div>' +
               '</div>' +
             '</div>';
    }).join('');
  }

  /* ── public API ───────────────────────────────────────────────── */
  window.charSync = {
    syncFromCloud:        syncFromCloud,
    loadSharedCharacters: loadSharedCharacters
  };

  console.log('[characters-sync.js] loaded ✓');
})();
