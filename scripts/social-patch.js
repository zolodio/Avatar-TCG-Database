/* ================================================================
   social-patch.js  — drop-in after social.js
   Applies three changes without modifying social.js:
     1. Removes the × close button from the friend-profile-modal
        footer so the Trade button can expand to fill the space.
     2. Injects a "Compare" button into every accepted-friend card
        in the friend list (delegates to window.loadAndCompare).
     3. Adds a "Decks" tab to the friend-profile modal that shows
        the friend's public decks from the `decks` Supabase table.
   ================================================================ */
(function () {
  'use strict';

  function sb()  { return window.sb; }
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ══════════════════════════════════════════════════════════════
     1. PATCH FRIEND PROFILE MODAL
        • Remove × close button (keep backdrop-click-to-close)
        • Make remaining footer buttons equal-width
        • Add a Decks tab
  ══════════════════════════════════════════════════════════════ */

  /* Watch for the overlay being injected into <body> (fires once). */
  new MutationObserver(function (mutations, obs) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (!node || node.id !== 'friendProfileOverlay') return;

        /* ── Remove × button ── */
        var closeBtn = node.querySelector('#fpCloseBtn');
        if (closeBtn) closeBtn.remove();

        /* ── Make footer buttons stretch equally ── */
        ['fpChatBtn', 'fpCompareBtn', 'fpTradeBtn'].forEach(function (id) {
          var b = node.querySelector('#' + id);
          if (b) b.style.flex = '1';
        });

        /* ── Add Decks tab ── */
        var tabBar = node.querySelector('.fpTab') && node.querySelector('.fpTab').parentNode;
        if (!tabBar) return;

        var decksBtn = document.createElement('button');
        decksBtn.className = 'fpTab';
        decksBtn.setAttribute('data-fp-tab', 'decks');
        decksBtn.style.cssText = [
          'flex:1;padding:11px 0;border:none;background:none;cursor:pointer;',
          'font-family:"Nunito Sans",sans-serif;font-size:0.8rem;font-weight:700;',
          'color:var(--text-muted);border-bottom:2px solid transparent;',
          'transition:all 0.15s;white-space:nowrap;'
        ].join('');
        decksBtn.innerHTML = '<i class="fas fa-layer-group" style="margin-right:5px;"></i>Decks';

        decksBtn.addEventListener('click', function () {
          node.querySelectorAll('.fpTab').forEach(function (b) {
            b.style.color = 'var(--text-muted)';
            b.style.borderBottomColor = 'transparent';
          });
          decksBtn.style.color = 'var(--zen)';
          decksBtn.style.borderBottomColor = 'var(--zen)';
          var uid   = node.getAttribute('data-fp-uid');
          var uname = node.getAttribute('data-fp-uname') || 'Friend';
          renderFriendDecks(uid, uname);
        });

        tabBar.appendChild(decksBtn);
        obs.disconnect(); /* only need to run once */
      });
    });
  }).observe(document.body, { childList: true });

  /* ══════════════════════════════════════════════════════════════
     2. COMPARE BUTTON ON FRIEND LIST CARDS
        social.js rebuilds #friendList innerHTML on every load,
        so we watch for DOM changes and inject Compare buttons.
  ══════════════════════════════════════════════════════════════ */

  /* Event delegation — handles clicks on any injected Compare btn */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-compare-friend]');
    if (!btn) return;
    var uid   = btn.getAttribute('data-compare-friend');
    var uname = btn.getAttribute('data-friend-uname') || 'Friend';
    if (typeof window.loadAndCompare === 'function') {
      window.loadAndCompare(uid, uname, 'physical');
    } else {
      /* Fallback: fetch directly and apply */
      fetchAndApplyCompare(uid, uname);
    }
  });

  /* Inject Compare buttons whenever #friendList is repainted */
  function watchFriendList() {
    var list = document.getElementById('friendList');
    if (!list) return;
    new MutationObserver(function () {
      list.querySelectorAll('.friend-card').forEach(injectCompareBtn);
    }).observe(list, { childList: true, subtree: true });
    /* Also run once immediately in case cards already exist */
    list.querySelectorAll('.friend-card').forEach(injectCompareBtn);
  }

  function injectCompareBtn(card) {
    if (card.querySelector('[data-compare-friend]')) return; /* already patched */

    var viewBtn = card.querySelector('[data-view-friend]');
    if (!viewBtn) return;

    var uid   = viewBtn.getAttribute('data-view-friend');
    var uname = viewBtn.getAttribute('data-friend-name') || 'Friend';

    var cmpBtn = document.createElement('button');
    cmpBtn.className = 'friend-btn';
    cmpBtn.setAttribute('data-compare-friend', uid);
    cmpBtn.setAttribute('data-friend-uname', uname);
    cmpBtn.title = 'Compare ' + uname + '\'s collection with yours';
    cmpBtn.style.cssText = [
      'background:rgba(46,140,232,0.08);',
      'border-color:rgba(46,140,232,0.3);',
      'color:var(--water);'
    ].join('');
    cmpBtn.innerHTML = '<i class="fas fa-people-arrows" style="font-size:0.62rem;margin-right:3px;"></i>Compare';

    /* Insert right after the Profile/View button */
    viewBtn.insertAdjacentElement('afterend', cmpBtn);
  }

  /* Start watching — either immediately or after DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchFriendList);
  } else {
    watchFriendList();
  }

  /* Also re-attempt when the Friends pane becomes active */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-nested-tab="friends"]')) {
      setTimeout(watchFriendList, 150);
    }
  });

  /* ══════════════════════════════════════════════════════════════
     3. RENDER FRIEND DECKS
        Queries `decks` table for rows where
          user_id = <friendUserId>  AND  is_public = true
        and renders them in the friend-profile modal pane.
  ══════════════════════════════════════════════════════════════ */

  async function renderFriendDecks(userId, username) {
    var pane = document.getElementById('friendProfilePane');
    if (!pane) return;

    pane.innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.8rem;">' +
        '<i class="fas fa-circle-notch fa-spin" style="margin-right:6px;"></i>' +
        'Loading ' + esc(username) + '\u2019s decks\u2026' +
      '</div>';

    if (!sb()) {
      pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Not available offline.</div>';
      return;
    }

    try {
      var res = await sb()
        .from('decks')
        .select('id, name, description, cards, updated_at, format')
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('updated_at', { ascending: false });

      if (res.error) throw res.error;

      var decks = res.data || [];

      if (!decks.length) {
        pane.innerHTML =
          '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">' +
            '<i class="fas fa-layer-group" style="font-size:2rem;opacity:0.22;display:block;margin-bottom:12px;"></i>' +
            '<p style="font-size:0.82rem;">' + esc(username) + ' hasn\u2019t shared any public decks yet.</p>' +
          '</div>';
        return;
      }

      var html =
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:12px;">' +
          esc(username) + ' has <strong style="color:var(--text-primary);">' + decks.length + '</strong> ' +
          'public deck' + (decks.length !== 1 ? 's' : '') +
        '</div>';

      html += decks.map(function (deck) {
        var cards = deck.cards || [];
        var count = Array.isArray(cards) ? cards.length : Object.keys(cards).length;
        var fmt   = deck.format ? deck.format.charAt(0).toUpperCase() + deck.format.slice(1) : '';

        return (
          '<div style="' +
              'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);' +
              'padding:14px 16px;margin-bottom:8px;transition:border-color 0.2s;cursor:default;"' +
            ' onmouseenter="this.style.borderColor=\'var(--border-light)\'"' +
            ' onmouseleave="this.style.borderColor=\'var(--border)\'">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;">' +
              '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.88rem;color:var(--text-primary);' +
                  'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">' +
                esc(deck.name || 'Untitled Deck') +
              '</div>' +
              '<span style="font-size:0.62rem;color:var(--text-muted);flex-shrink:0;margin-left:8px;">' +
                esc(fmtDate(deck.updated_at)) +
              '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">' +
              '<span style="' +
                  'background:rgba(61,184,108,0.1);border:1px solid rgba(61,184,108,0.22);' +
                  'color:var(--success);font-size:0.6rem;font-weight:700;' +
                  'padding:2px 8px;border-radius:99px;letter-spacing:0.05em;text-transform:uppercase;">' +
                'Public' +
              '</span>' +
              '<span style="font-size:0.7rem;color:var(--text-secondary);">' +
                count + ' card' + (count !== 1 ? 's' : '') +
              '</span>' +
              (fmt
                ? '<span style="font-size:0.68rem;color:var(--text-muted);">\u00b7 ' + esc(fmt) + '</span>'
                : '') +
              (deck.description
                ? '<span style="font-size:0.7rem;color:var(--text-muted);flex:1;min-width:0;' +
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                    esc(deck.description) + '</span>'
                : '') +
            '</div>' +
          '</div>'
        );
      }).join('');

      pane.innerHTML = html;

    } catch (err) {
      console.warn('[social-patch] renderFriendDecks error:', err);
      pane.innerHTML =
        '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.8rem;">' +
          'Could not load decks. Try again later.' +
        '</div>';
    }
  }

  /* ── Fallback compare (if friend-compare.js isn't loaded) ──────── */
  async function fetchAndApplyCompare(userId, username) {
    if (!sb()) return;
    try {
      var res = await sb()
        .from('collections')
        .select('physical')
        .eq('user_id', userId)
        .maybeSingle();
      var col = (res.data && res.data.physical) || {};
      if (!Object.keys(col).length) {
        if (typeof window.showToast === 'function') window.showToast(username + ' hasn\u2019t synced their collection yet.');
        return;
      }
      if (typeof window.applyCompareCollection === 'function') {
        window.applyCompareCollection(col);
      } else {
        window.compareCollection = col;
        if (typeof window.buildFilters  === 'function') window.buildFilters();
        if (typeof window.renderCards   === 'function') window.renderCards();
        if (typeof window.updateCompareBtn === 'function') window.updateCompareBtn();
      }
      var homeTab = document.querySelector('[data-tab="home"]');
      if (homeTab) homeTab.click();
      if (typeof window.showToast === 'function') {
        window.showToast('Comparing with ' + username + '\u2019s collection!');
      }
    } catch (e) {
      console.warn('[social-patch] fetchAndApplyCompare error:', e);
    }
  }

  /* Expose for external use */
  window.renderFriendDecks = renderFriendDecks;

  console.log('[social-patch.js] loaded \u2713');

})();
