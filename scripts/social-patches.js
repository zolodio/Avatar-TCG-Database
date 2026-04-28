/* ================================================================
   Avatar TCG — social.js targeted patches  (social-patches.js)

   Load this script immediately AFTER social.js:
     <script src="scripts/social.js"></script>
     <script src="scripts/social-patches.js"></script>

   Patches applied:
     1. injectFriendProfileModal  — adds inline Compare button to footer
     2. openFriendProfileModal    — wires Compare button
     3. renderFriendProfile       — adds rarity progress bars (physical)
                                    + digital collection rarity counts
   ================================================================ */
(function () {
  'use strict';

  /* ── tiny helpers shared with social.js ────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function sb()     { return window.sb; }
  function allCards(){ return window.allCards || []; }

  var RARITY_COLORS = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };
  var RARITY_LABELS = {
    common:'Common', uncommon:'Uncommon', rare:'Rare',
    zenemental:'Zen', promo:'Promo'
  };
  var PACK_RARITIES = ['common','uncommon','rare','zenemental'];

  /* ------------------------------------------------------------------
     isPackCard — same definition as index.html; cards #1–235 only
     (matches pack-opening progress bars as authoritative for rarities)
  ------------------------------------------------------------------ */
  function isPackCard(num) {
    var n = parseInt(num, 10);
    return /^\d+$/.test(String(num)) && !isNaN(n) && n >= 1 && n <= 235;
  }

  /* ------------------------------------------------------------------
     isCoreCard — same definition as index.html; authoritative for "all"
  ------------------------------------------------------------------ */
  function isCoreCard(num) {
    var s = String(num).trim();
    if (/^ABK00[1-8]$/i.test(s) || /^APR00[1-2]$/i.test(s) || /^FPR00[1-3]$/i.test(s)) return true;
    var n = parseInt(s, 10);
    return /^\d+$/.test(s) && !isNaN(n) && n >= 1 && n <= 235;
  }

  /* ------------------------------------------------------------------
     fetchFriendCollectionData — reads collections table (same as social.js)
  ------------------------------------------------------------------ */
  async function fetchFriendCollectionData(userId) {
    if (!sb() || !userId) return { physical: {}, digital: {} };
    try {
      var res = await sb()
        .from('collections')
        .select('physical, digital')
        .eq('user_id', userId)
        .maybeSingle();
      if (res.error) throw res.error;
      // Normalise digital: it may be stored as array or map
      var dig = (res.data && res.data.digital) || {};
      if (Array.isArray(dig)) {
        var map = {};
        dig.forEach(function(item) {
          if (item && item.number) map[String(item.number)] = (map[String(item.number)] || 0) + 1;
        });
        dig = map;
      }
      return {
        physical: (res.data && res.data.physical) || {},
        digital:  dig
      };
    } catch (e) {
      console.warn('[social-patches] fetchFriendCollectionData:', e.message || e);
      return { physical: {}, digital: {} };
    }
  }

  /* ------------------------------------------------------------------
     buildPhysicalStats — rarity progress bars matching pack-calculator
     logic (isPackCard #1–235) + overall bar matching main page (isCoreCard)
  ------------------------------------------------------------------ */
  function buildPhysicalStats(physCol) {
    var ac = allCards();

    // Overall — matches main page (isCoreCard / 248)
    var coreTotal = ac.filter(function(c) { return isCoreCard(c.number); }).length || 248;
    var coreOwned = ac.filter(function(c) { return isCoreCard(c.number) && (physCol[c.number] || 0) > 0; }).length;
    var corePct   = Math.round((coreOwned / coreTotal) * 100);

    var overallHtml =
      '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">Physical · All Cards</span>' +
          '<span style="font-family:\'Cinzel\',serif;font-size:0.82rem;font-weight:700;color:white;">' + coreOwned + ' / ' + coreTotal + ' &nbsp;(' + corePct + '%)</span>' +
        '</div>' +
        '<div style="height:7px;background:var(--bg-primary);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--water),var(--accent),var(--zen));width:' + corePct + '%;transition:width 0.5s;"></div>' +
        '</div>' +
      '</div>';

    // Rarity bars — matches pack-opening calculators (isPackCard)
    var rarityBarsHtml = PACK_RARITIES.map(function(r) {
      var pool  = ac.filter(function(c) { return isPackCard(c.number) && c.rarity === r; });
      var total = pool.length || 1;
      var owned = pool.filter(function(c) { return (physCol[c.number] || 0) > 0; }).length;
      var pct   = Math.round((owned / total) * 100);
      var clr   = RARITY_COLORS[r];
      return '<div style="margin-bottom:9px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
          '<span style="font-size:0.6rem;text-transform:capitalize;color:' + clr + ';font-weight:700;">' + RARITY_LABELS[r] + '</span>' +
          '<span style="font-size:0.6rem;color:var(--text-muted);">' + owned + ' / ' + total + ' (' + pct + '%)</span>' +
        '</div>' +
        '<div style="height:4px;background:var(--bg-primary);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:99px;background:' + clr + ';width:' + pct + '%;"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    return overallHtml +
      '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">' +
        '<div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;margin-bottom:10px;">Rarity Breakdown (pack cards)</div>' +
        rarityBarsHtml +
      '</div>';
  }

  /* ------------------------------------------------------------------
     buildDigitalStats — total + per-rarity counts for digital collection
  ------------------------------------------------------------------ */
  function buildDigitalStats(digCol) {
    var ac = allCards();

    var digAll = Object.keys(digCol).filter(function(n) { return (digCol[n] || 0) > 0; }).length;

    var countsByRarity = {};
    PACK_RARITIES.forEach(function(r) { countsByRarity[r] = 0; });
    ac.forEach(function(c) {
      if ((digCol[c.number] || 0) > 0 && countsByRarity[c.rarity] !== undefined) {
        countsByRarity[c.rarity]++;
      }
    });

    var rarityChips = PACK_RARITIES.map(function(r) {
      return '<div style="text-align:center;padding:6px 4px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;">' +
        '<div style="font-family:\'Cinzel\',serif;font-size:0.78rem;font-weight:700;color:' + RARITY_COLORS[r] + ';">' + countsByRarity[r] + '</div>' +
        '<div style="font-size:0.5rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-top:2px;">' + RARITY_LABELS[r] + '</div>' +
      '</div>';
    }).join('');

    return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-top:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">Digital · All Cards</span>' +
        '<span style="font-family:\'Cinzel\',serif;font-size:0.82rem;font-weight:700;color:var(--zen);">' + digAll + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(' + PACK_RARITIES.length + ',1fr);gap:5px;">' +
        rarityChips +
      '</div>' +
    '</div>';
  }

  /* ================================================================
     PATCH 1 — injectFriendProfileModal
     Adds a "Compare" button inline next to Chat / Offer Trade.
     Replaces the existing function on the module's closure by
     temporarily storing the original then re-defining the helper
     that social.js also calls.  Because social.js wraps everything
     in an IIFE, we patch via the shared DOM side-effect.
  ================================================================ */

  /* We can't redefine social.js's private injectFriendProfileModal
     directly, but we CAN replace the #fpCompareBtn after the modal
     is first created.  The cleanest hook is to observe when the
     modal overlay is first added to the DOM. */

  var _modalInjected = false;

  function ensureCompareBtn() {
    var overlay = $('friendProfileOverlay');
    if (!overlay || _modalInjected) return;

    // Find the footer row (last direct child div of the modal div)
    var modal  = overlay.querySelector('#friendProfileOverlay > div');
    if (!modal) modal = overlay.firstElementChild;
    if (!modal) return;

    // Footer = last child of modal that contains fpChatBtn
    var footer = modal.querySelector('div:last-child');
    if (!footer || footer.querySelector('#fpCompareBtn')) return;

    _modalInjected = true;

    // Build the inline Compare button and insert before the close btn
    var btn = document.createElement('button');
    btn.id = 'fpCompareBtn';
    btn.style.cssText = [
      'flex:1;padding:10px;border-radius:8px;',
      'border:1px solid rgba(46,140,232,0.35);',
      'background:rgba(46,140,232,0.08);',
      'color:var(--water);',
      'font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;',
      'cursor:pointer;transition:all 0.2s;',
      'display:flex;align-items:center;justify-content:center;gap:5px;',
    ].join('');
    btn.innerHTML = '<i class="fas fa-people-arrows"></i> Compare';

    var closeBtn = footer.querySelector('#fpCloseBtn');
    if (closeBtn) footer.insertBefore(btn, closeBtn);
    else footer.appendChild(btn);

    // Wiring handled by friend-compare.js (MutationObserver on style)
  }

  /* ================================================================
     PATCH 2 — renderFriendProfile
     Wraps the original: waits for pane HTML to be written then
     appends enhanced stats (rarity bars + digital breakdown).
  ================================================================ */

  // We wait for the module's own renderFriendProfile to finish
  // (it sets pane.innerHTML) then append extra content.
  // We achieve this via a MutationObserver on #friendProfilePane.
  var _paneObs = null;

  function patchPaneContent(userId) {
    var pane = $('friendProfilePane');
    if (!pane) return;

    // Disconnect previous observer if any
    if (_paneObs) { _paneObs.disconnect(); _paneObs = null; }

    _paneObs = new MutationObserver(function(mutations) {
      // The original renderFriendProfile finishes by setting innerHTML
      // Stop observing to avoid re-entry
      _paneObs.disconnect(); _paneObs = null;

      // Check if this is the profile tab (heuristic: pane has a bio/stats)
      if (!pane.querySelector || !userId) return;

      // Append enhanced stats
      appendEnhancedStats(pane, userId);
    });

    _paneObs.observe(pane, { childList: true, subtree: false });
  }

  async function appendEnhancedStats(pane, userId) {
    var data = await fetchFriendCollectionData(userId);
    var physHtml = buildPhysicalStats(data.physical);
    var digHtml  = buildDigitalStats(data.digital);

    // Remove any previously injected stats section
    var old = pane.querySelector('#fp-enhanced-stats');
    if (old) old.remove();

    var wrapper = document.createElement('div');
    wrapper.id = 'fp-enhanced-stats';
    wrapper.style.marginTop = '14px';
    wrapper.innerHTML = physHtml + digHtml;
    pane.appendChild(wrapper);
  }

  /* ================================================================
     PATCH 3 — openFriendProfileModal hook
     We intercept tab clicks on the profile tab so we can trigger
     enhanced stats whenever the Profile tab is (re)opened.
  ================================================================ */

  document.addEventListener('click', function(e) {
    // Intercept "Profile" fpTab click
    var fpTab = e.target.closest('.fpTab[data-fp-tab="profile"]');
    if (fpTab) {
      var overlay = $('friendProfileOverlay');
      if (!overlay) return;
      var userId = overlay.getAttribute('data-fp-uid');
      if (userId) {
        // Give social.js's async renderFriendProfile a moment to write the pane
        setTimeout(function() { patchPaneContent(userId); }, 60);
      }
      return;
    }

    // Intercept "Profile" button in friend list → openFriendProfileModal
    var viewBtn = e.target.closest('[data-view-friend]');
    if (viewBtn) {
      var uid = viewBtn.getAttribute('data-view-friend');
      if (uid) setTimeout(function() { patchPaneContent(uid); }, 400);
      return;
    }
  });

  /* ================================================================
     DOM observation — ensure Compare button is present whenever
     the friend profile overlay is shown
  ================================================================ */
  var _overlayObs = new MutationObserver(function() {
    var overlay = $('friendProfileOverlay');
    if (overlay && overlay.style.display !== 'none') {
      ensureCompareBtn();
    }
  });
  _overlayObs.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['style', 'id']
  });

  console.log('[social-patches.js] loaded ✓');

})();
