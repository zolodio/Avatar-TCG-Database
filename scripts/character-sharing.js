// scripts/character-sharing.js
// Adds a Share button to each "My Characters" roster card.
// Shared characters are stored in the `shared_characters` Supabase table
// and displayed in the "Friends' Shared" tab and in the friend profile modal.
//
// NEW: loadFriendsShared() fetches all shared characters from Supabase and
//      renders them in #cc-shared-list. Each card gets a "View" button that
//      opens the character detail modal (character-modal.js) for that character.

(function () {
  'use strict';

  var SB_TABLE = 'shared_characters';
  var LS_KEY   = 'aqst_characters';

  /* ── tiny helpers ──────────────────────────────────────────────── */
  function sb()  { return window.sb; }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function getElementEmoji(el) {
    var map = { water: '💧', earth: '🪨', fire: '🔥', air: '🌬️', 'non-bender': '⚔️', spirit: '✨' };
    return map[el] || '🌀';
  }
  function showToast(msg) {
    var t = document.getElementById('cc-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ── localStorage helpers ──────────────────────────────────────── */
  function getCharacters() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveCharacters(chars) {
    // Writing through the normal key lets characters-sync.js push to Supabase too
    localStorage.setItem(LS_KEY, JSON.stringify(chars));
  }

  /* ── auth ──────────────────────────────────────────────────────── */
  async function getUserId() {
    if (!sb()) return null;
    var s = await sb().auth.getSession();
    return (s.data && s.data.session && s.data.session.user)
      ? s.data.session.user.id : null;
  }

  /* ── trigger roster re-render (same trick as characters-sync.js) ─ */
  function triggerRosterRerender() {
    var panel = document.getElementById('cctab-my-characters');
    if (panel && panel.style.display !== 'none') {
      var btn = document.querySelector('#ccTabs [data-cctab="my-characters"]');
      if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     SHARE / UNSHARE
  ══════════════════════════════════════════════════════════════════ */

  async function shareCharacter(charId) {
    var uid = await getUserId();
    if (!uid) { showToast('Sign in to share characters.'); return; }

    var chars = getCharacters();
    var char  = chars.find(function (c) { return String(c.id) === String(charId); });
    if (!char) return;

    char.shared   = true;
    char.sharedAt = Date.now();
    saveCharacters(chars);   // also triggers characters-sync.js cloud push

    if (sb()) {
      var row = {
        id:         String(char.id),
        user_id:    uid,
        data:       char,
        updated_at: new Date().toISOString()
      };
      var res = await sb().from(SB_TABLE).upsert(row, { onConflict: 'id,user_id' });
      if (res.error) console.warn('[charShare] share upsert error', res.error);
    }

    showToast('✨ Character shared with the community!');
    triggerRosterRerender();
  }

  async function unshareCharacter(charId) {
    var uid = await getUserId();
    if (!uid) return;

    var chars = getCharacters();
    var char  = chars.find(function (c) { return String(c.id) === String(charId); });
    if (char) {
      char.shared   = false;
      char.sharedAt = null;
      saveCharacters(chars);
    }

    if (sb()) {
      var res = await sb().from(SB_TABLE)
        .delete()
        .eq('id', String(charId))
        .eq('user_id', uid);
      if (res.error) console.warn('[charShare] unshare delete error', res.error);
    }

    showToast('Character removed from sharing.');
    triggerRosterRerender();
  }

  /* ══════════════════════════════════════════════════════════════════
     INJECT SHARE BUTTONS via MutationObserver on #cc-roster-list
     (non-invasive: no changes to the existing IIFE renderRoster)
  ══════════════════════════════════════════════════════════════════ */

  function buildShareBtn(charId, isShared) {
    var btn = document.createElement('button');
    btn.className   = 'cc-char-action share-char-btn';
    btn.dataset.id  = charId;
    btn.title       = isShared ? 'Stop sharing this character' : 'Share with community';

    if (isShared) {
      btn.innerHTML = '<i class="fas fa-share-alt"></i> Shared';
      btn.style.cssText = 'border-color:rgba(180,77,223,0.45);color:var(--zen);background:rgba(180,77,223,0.08);';
    } else {
      btn.innerHTML = '<i class="fas fa-share-alt"></i> Share';
    }
    return btn;
  }

  function injectShareButtons(rosterList) {
    var chars = getCharacters();
    var byId  = {};
    chars.forEach(function (c) { byId[String(c.id)] = c; });

    rosterList.querySelectorAll('.cc-char-card[data-id]').forEach(function (card) {
      if (card.querySelector('.share-char-btn')) return; // already injected
      var charId  = card.dataset.id;
      var char    = byId[charId];
      var actions = card.querySelector('.cc-char-actions');
      if (!actions || !char) return;

      var btn    = buildShareBtn(charId, !!char.shared);
      var delBtn = actions.querySelector('.del');
      actions.insertBefore(btn, delBtn || null);
    });
  }

  function watchRosterList() {
    var roster = document.getElementById('cc-roster-list');
    if (!roster) return;
    new MutationObserver(function () {
      injectShareButtons(roster);
    }).observe(roster, { childList: true, subtree: true });
    injectShareButtons(roster);
  }

  /* ── Share button click (event delegation) ─────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.share-char-btn');
    if (!btn) return;
    e.stopPropagation();

    var charId = btn.dataset.id;
    var chars  = getCharacters();
    var char   = chars.find(function (c) { return String(c.id) === String(charId); });
    if (!char) return;

    if (char.shared) {
      if (confirm('Stop sharing "' + (char.givenName || 'this character') + '"?\nIt will be removed from the community view.')) {
        unshareCharacter(charId);
      }
    } else {
      shareCharacter(charId);
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     VIEW BUTTON — delegated handler for #cc-shared-list "View" buttons.
     Reads the character JSON stored on the button's data-char attribute
     and calls the modal API exposed by character-modal.js.
     (The modal's own hookSharedList also handles card-body clicks via
      data-char / window._sharedCharCache, so both paths work.)
  ══════════════════════════════════════════════════════════════════ */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.view-shared-char-btn');
    if (!btn) return;
    e.stopPropagation();

    var char = null;

    // Primary: JSON embedded on the button itself
    if (btn.dataset.char) {
      try { char = JSON.parse(btn.dataset.char); } catch (err) { char = null; }
    }

    // Fallback: look up the cache by id (populated by loadFriendsShared)
    if (!char && btn.dataset.id && window._sharedCharCache) {
      char = window._sharedCharCache[btn.dataset.id] || null;
    }

    if (!char) { console.warn('[charShare] View: could not resolve character data'); return; }

    if (typeof window.openCharDetailModal === 'function') {
      window.openCharDetailModal(char);
    } else {
      console.warn('[charShare] window.openCharDetailModal not available — is character-modal.js loaded?');
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     LOAD FRIENDS' SHARED — fetches all rows from `shared_characters`
     and renders them into #cc-shared-list.

     Each card:
       • has data-id and data-char (full JSON) for character-modal.js hooks
       • registers the character in window._sharedCharCache
       • gets a "View" button (.view-shared-char-btn) that opens the modal

     Call this when the "Friends' Shared" tab becomes active, e.g.:
       window.charSharing.loadFriendsShared();
  ══════════════════════════════════════════════════════════════════ */

  async function loadFriendsShared() {
    var container = document.getElementById('cc-shared-list');
    if (!container) { console.warn('[charShare] #cc-shared-list not found'); return; }

    // Loading spinner
    container.innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.82rem;">' +
      '<i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;display:block;margin-bottom:10px;"></i>' +
      'Loading shared characters…</div>';

    if (!sb()) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.82rem;">' +
        '<i class="fas fa-lock" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:10px;"></i>' +
        'Sign in to see what your community is sharing.</div>';
      return;
    }

    try {
      // Exclude the signed-in user's own rows so they only see others' characters
      var uid = await getUserId();
      var query = sb()
        .from(SB_TABLE)
        .select('id, user_id, data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(60);
      if (uid) query = query.neq('user_id', uid);

      var res = await query;
      if (res.error) throw res.error;

      var rows = res.data || [];

      if (!rows.length) {
        container.innerHTML =
          '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.82rem;">' +
          '<i class="fas fa-share-alt" style="font-size:2rem;opacity:0.2;display:block;margin-bottom:10px;"></i>' +
          'No shared characters yet — be the first to share one!</div>';
        return;
      }

      // Populate the global cache that character-modal.js uses as fallback (pattern b)
      window._sharedCharCache = window._sharedCharCache || {};

      container.innerHTML = rows.map(function (row) {
        var char = row.data || {};
        var id   = String(row.id || char.id || '');

        // Register in cache for modal's pattern-b lookup
        if (id) window._sharedCharCache[id] = char;

        // Portrait: real image if saved, otherwise element emoji avatar
        var imgHtml = char.imageData
          ? '<img src="data:' + char.imageMime + ';base64,' + char.imageData + '"' +
            ' alt="' + esc(char.givenName) + '"' +
            ' style="width:44px;height:44px;border-radius:8px;object-fit:cover;' +
            'border:1px solid var(--border);flex-shrink:0;">'
          : '<div class="cc-char-avatar">' + getElementEmoji(char.bending) + '</div>';

        // Sub-line: bending · strike · advantage · ally
        var bend = char.bending
          ? (char.bending.charAt(0).toUpperCase() + char.bending.slice(1))
          : 'Non-Bender';
        var sub = [bend, char.strike || '', char.advantage || '', char.ally || '']
          .filter(Boolean).join(' · ');

        var masteryBadge = char.mastery
          ? '<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:99px;' +
            'font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;' +
            'border:1px solid var(--border);color:var(--text-muted);">' +
            esc(char.mastery) + '</span>'
          : '';

        // Embed char JSON on card (pattern a) and on the View button for our delegated handler
        var charJson = JSON.stringify(char).replace(/'/g, '&#39;');

        return '<div class="cc-char-card" data-id="' + esc(id) + '" data-char=\'' + charJson + '\' style="cursor:default;">' +
          imgHtml +
          '<div class="cc-char-info">' +
            '<div class="cc-char-name">' +
              esc(char.givenName || 'Unnamed') +
              (char.nickName ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">"' + esc(char.nickName) + '"</span>' : '') +
              masteryBadge +
            '</div>' +
            '<div class="cc-char-sub">' + esc(sub) + '</div>' +
          '</div>' +
          '<div class="cc-char-actions">' +
            '<button ' +
              'class="cc-char-action view-shared-char-btn" ' +
              'data-id="' + esc(id) + '" ' +
              'data-char=\'' + charJson + '\' ' +
              'title="View character details" ' +
              'style="color:var(--zen);border-color:rgba(180,77,223,0.35);">' +
              '<i class="fas fa-eye"></i> View' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');

      console.log('[charShare] loadFriendsShared rendered', rows.length, 'character(s)');

    } catch (err) {
      console.warn('[charShare] loadFriendsShared error', err);
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--text-muted);">' +
        'Could not load shared characters.</div>';
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     CSS — share button hover state + view button styles (injected once)
  ══════════════════════════════════════════════════════════════════ */
  (function injectStyles() {
    if (document.getElementById('char-sharing-styles')) return;
    var s = document.createElement('style');
    s.id = 'char-sharing-styles';
    s.textContent = [
      /* Share button */
      '.share-char-btn:hover { border-color: var(--zen) !important; color: var(--zen) !important; background: rgba(180,77,223,0.1) !important; }',
      '.share-char-btn.unshare:hover { border-color: var(--danger) !important; color: var(--danger) !important; background: rgba(224,72,72,0.08) !important; }',

      /* View button — sits in the shared list, distinct from share/delete actions */
      '.view-shared-char-btn {',
      '  display: inline-flex; align-items: center; gap: 5px;',
      '  padding: 5px 12px; border-radius: 8px;',
      '  font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;',
      '  border: 1px solid rgba(255,255,255,0.18);',
      '  background: rgba(255,255,255,0.05);',
      '  color: rgba(255,255,255,0.65);',
      '  cursor: pointer;',
      '  transition: border-color 0.18s, color 0.18s, background 0.18s, transform 0.15s;',
      '}',
      '.view-shared-char-btn:hover {',
      '  border-color: var(--zen, #b44ddf) !important;',
      '  color: var(--zen, #b44ddf) !important;',
      '  background: rgba(180,77,223,0.12) !important;',
      '  transform: translateY(-1px);',
      '}',
      '.view-shared-char-btn:active { transform: translateY(0); }',
    ].join('\n');
    document.head.appendChild(s);
  })();

  /* ── INIT ──────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchRosterList);
  } else {
    watchRosterList();
  }

  /* ── Public API ────────────────────────────────────────────────── */
  window.charSharing = {
    shareCharacter:    shareCharacter,
    unshareCharacter:  unshareCharacter,
    loadFriendsShared: loadFriendsShared   // ← now implemented
  };

  console.log('[character-sharing.js] loaded ✓');
})();
