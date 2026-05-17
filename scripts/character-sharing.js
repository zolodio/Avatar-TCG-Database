// scripts/character-sharing.js
// Adds a Share button to each "My Characters" roster card.
// Shared characters are stored in the `shared_characters` Supabase table
// and displayed in the "Friends' Shared" tab and in the friend profile modal.

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
     FRIENDS' SHARED PANEL (#cc-shared-list)
  ══════════════════════════════════════════════════════════════════ */

  async function loadFriendsShared() {
    var list = document.getElementById('cc-shared-list');
    if (!list) return;

    if (!sb()) {
      list.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.82rem;">' +
        '<i class="fas fa-lock" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:10px;"></i>' +
        'Sign in to see what your community is sharing.</div>';
      return;
    }

    list.innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.82rem;">' +
      '<i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;display:block;margin-bottom:10px;"></i>' +
      'Loading shared characters…</div>';

    try {
      var uid = await getUserId();
      var query = sb().from(SB_TABLE)
        .select('data, user_id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(60);

      if (uid) query = query.neq('user_id', uid); // don't show own shared chars here

      var res = await query;
      if (res.error) throw res.error;

      if (!res.data || !res.data.length) {
        list.innerHTML =
          '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:0.82rem;">' +
          '<i class="fas fa-share-alt" style="font-size:2rem;opacity:0.2;display:block;margin-bottom:10px;"></i>' +
          'No shared characters yet — be the first to share one!</div>';
        return;
      }

      list.innerHTML = res.data.map(function (row) {
        var char = row.data || {};
        var imgHtml = char.imageData
          ? '<img src="data:' + char.imageMime + ';base64,' + char.imageData + '"' +
            ' alt="' + esc(char.givenName) + '"' +
            ' style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">'
          : '<div class="cc-char-avatar">' + getElementEmoji(char.bending) + '</div>';

        var bend = char.bending
          ? (char.bending.charAt(0).toUpperCase() + char.bending.slice(1))
          : 'Non-Bender';
        var sub = [bend, char.strike || '', char.advantage || '', char.ally || ''].filter(Boolean).join(' · ');
        var masteryBadge = char.mastery
          ? '<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:99px;font-size:0.58rem;font-weight:700;' +
            'text-transform:uppercase;letter-spacing:0.06em;border:1px solid var(--border);color:var(--text-muted);">' +
            esc(char.mastery) + '</span>'
          : '';

        return '<div class="cc-char-card" style="cursor:default;">' +
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
            '<button class="cc-char-action" ' +
              'data-view-shared-char="1" ' +
              'data-shared-uid="' + esc(String(row.user_id)) + '" ' +
              'data-shared-char=\'' + JSON.stringify(char).replace(/'/g, '&#39;') + '\' ' +
              'style="color:var(--zen);border-color:rgba(180,77,223,0.35);">' +
              '<i class="fas fa-eye"></i> View' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');

    } catch (err) {
      console.warn('[charShare] loadFriendsShared error', err);
      list.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--text-muted);">Could not load shared characters.</div>';
    }
  }

  /* ── Wire tab click to load ────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cctab="friends-shared"]')) {
      setTimeout(loadFriendsShared, 100);
    }
  });

  /* ── "View" button on shared character cards → character modal ─── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-view-shared-char]');
    if (!btn) return;
    e.stopPropagation();

    try {
      var char = JSON.parse(btn.dataset.sharedChar || '{}');
      var uid  = btn.dataset.sharedUid;
      if (typeof window.viewFriendCharacters === 'function') {
        window.viewFriendCharacters(uid, char);
      } else {
        console.warn('[charShare] viewFriendCharacters not available');
      }
    } catch (err) {
      console.warn('[charShare] view shared char parse error', err);
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     PUBLIC API: viewFriendCharacters — show friend's shared character
  ══════════════════════════════════════════════════════════════════ */
  window.viewFriendCharacters = function (friendUserId, characterData) {
    if (!characterData) return;

    var modal = document.createElement('div');
    modal.className = 'fc-char-modal';
    modal.style.cssText = [
      'position: fixed; top: 0; left: 0; right: 0; bottom: 0;',
      'background: rgba(0,0,0,0.85); z-index: 9999;',
      'display: flex; align-items: center; justify-content: center;',
      'padding: 20px; overflow-y: auto;'
    ].join('');

    var container = document.createElement('div');
    container.style.cssText = [
      'background: var(--bg-primary); border: 1px solid var(--border);',
      'border-radius: var(--radius); max-width: 600px; width: 100%;',
      'max-height: 90vh; overflow-y: auto;',
      'padding: 20px; position: relative;'
    ].join('');

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = [
      'position: absolute; top: 12px; right: 12px;',
      'background: var(--bg-card); border: 1px solid var(--border);',
      'border-radius: 4px; width: 32px; height: 32px;',
      'cursor: pointer; display: flex; align-items: center; justify-content: center;',
      'color: var(--text-secondary); transition: all 0.2s;'
    ].join('');
    closeBtn.onmouseenter = function () {
      this.style.borderColor = 'var(--zen)';
      this.style.color = 'var(--zen)';
    };
    closeBtn.onmouseleave = function () {
      this.style.borderColor = 'var(--border)';
      this.style.color = 'var(--text-secondary)';
    };
    closeBtn.addEventListener('click', function () {
      modal.remove();
    });

    var charImg = characterData.imageData
      ? '<img src="data:' + characterData.imageMime + ';base64,' + characterData.imageData + '" ' +
        'alt="' + esc(characterData.givenName) + '" ' +
        'style="width: 100%; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--border);">'
      : '';

    var elementEmoji = getElementEmoji(characterData.bending || 'non-bender');
    var bending = characterData.bending
      ? (characterData.bending.charAt(0).toUpperCase() + characterData.bending.slice(1))
      : 'Non-Bender';

    var masteryBadge = characterData.mastery
      ? '<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 99px; ' +
        'font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; ' +
        'border: 1px solid var(--border); color: var(--text-secondary);">' +
        esc(characterData.mastery) + '</span>'
      : '';

    var traits = [];
    if (characterData.strike) traits.push(characterData.strike);
    if (characterData.advantage) traits.push(characterData.advantage);
    if (characterData.ally) traits.push(characterData.ally);

    var traitsHtml = traits.length
      ? '<div style="margin: 12px 0; font-size: 0.78rem; color: var(--text-secondary);">' +
        traits.map(function (t) {
          return '<span style="display: inline-block; background: var(--bg-card); border: 1px solid var(--border); ' +
            'border-radius: 4px; padding: 4px 8px; margin-right: 6px; margin-bottom: 6px; text-transform: capitalize;">' +
            esc(t) + '</span>';
        }).join('') +
        '</div>'
      : '';

    var backstoryHtml = '';
    if (characterData.bsNation || characterData.bsTraining || characterData.backstoryFree) {
      backstoryHtml = '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 0.8rem;">' +
        '<p style="color: var(--text-muted); margin: 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Background</p>';
      if (characterData.bsNation) {
        backstoryHtml += '<div style="margin-bottom: 8px;"><strong>Nation:</strong> ' + esc(characterData.bsNation) + '</div>';
      }
      if (characterData.bsTraining) {
        backstoryHtml += '<div style="margin-bottom: 8px;"><strong>Training:</strong> ' + esc(characterData.bsTraining) + '</div>';
      }
      if (characterData.backstoryFree) {
        backstoryHtml += '<div style="margin-bottom: 8px;"><strong>Story:</strong></div><p style="margin: 6px 0; color: var(--text-secondary);">' + esc(characterData.backstoryFree).replace(/\n/g, '<br>') + '</p>';
      }
      backstoryHtml += '</div>';
    }

    var detailsHtml = '';
    if (characterData.height || characterData.weight || characterData.eyes || characterData.hair) {
      detailsHtml = '<div style="margin-top: 12px; font-size: 0.78rem; color: var(--text-secondary);">';
      if (characterData.height) detailsHtml += '<div>Height: ' + esc(characterData.height) + '</div>';
      if (characterData.weight) detailsHtml += '<div>Weight: ' + esc(characterData.weight) + '</div>';
      if (characterData.eyes) detailsHtml += '<div>Eyes: ' + esc(characterData.eyes) + '</div>';
      if (characterData.hair) detailsHtml += '<div>Hair: ' + esc(characterData.hair) + '</div>';
      detailsHtml += '</div>';
    }

    container.innerHTML =
      charImg +
      '<button style="position: absolute; top: 12px; right: 12px; background: var(--bg-card); border: 1px solid var(--border); ' +
      'border-radius: 4px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; ' +
      'justify-content: center; color: var(--text-secondary); transition: all 0.2s; font-size: 1rem;">' +
      '<i class="fas fa-times"></i></button>' +
      '<div style="font-family: \'Cinzel\', serif; font-size: 1.4rem; font-weight: 700; margin-bottom: 4px;">' +
        esc(characterData.givenName || 'Unnamed') +
        (characterData.nickName ? ' <span style="color: var(--text-muted); font-weight: 400; font-size: 0.75rem;">"' + esc(characterData.nickName) + '"</span>' : '') +
      '</div>' +
      '<div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px;">' +
        '<span>' + elementEmoji + ' ' + bending + '</span>' +
        masteryBadge +
      '</div>' +
      traitsHtml +
      detailsHtml +
      backstoryHtml +
      '<div style="margin-top: 16px; font-size: 0.8rem; color: var(--text-muted);">' +
        '<i class="fas fa-user-circle" style="margin-right: 6px;"></i>Shared with the community' +
      '</div>';

    // Wire close button
    container.querySelector('button').addEventListener('click', function () {
      modal.remove();
    });

    // Close on overlay click
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    modal.appendChild(container);
    document.body.appendChild(modal);
  };

  /* ══════════════════════════════════════════════════════════════════
     CSS — share button hover state (injected once)
  ══════════════════════════════════════════════════════════════════ */
  (function injectStyles() {
    if (document.getElementById('char-sharing-styles')) return;
    var s = document.createElement('style');
    s.id = 'char-sharing-styles';
    s.textContent = [
      '.share-char-btn:hover { border-color: var(--zen) !important; color: var(--zen) !important; background: rgba(180,77,223,0.1) !important; }',
      '.share-char-btn.unshare:hover { border-color: var(--danger) !important; color: var(--danger) !important; background: rgba(224,72,72,0.08) !important; }',
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
    shareCharacter:   shareCharacter,
    unshareCharacter: unshareCharacter,
    loadFriendsShared: loadFriendsShared
  };

  console.log('[character-sharing.js] loaded ✓');
})();
