/* ================================================================
   Avatar TCG — One-Click Friend Compare  (friend-compare.js v3)

   Changes from v2:
     • Compare button is now INLINE in the friend-profile-modal
       footer (injected by social.js).  This file simply wires it
       directly to a physical-collection compare — no dropdown.
     • loadAndCompare() is exposed on window so social.js can also
       call it directly if desired.
     • Digital compare path kept for future use.
   ================================================================ */
(function () {
  'use strict';

  // ── state ──────────────────────────────────────────────────────
  window.compareDigitalCollection = window.compareDigitalCollection || {};

  // ── helpers ────────────────────────────────────────────────────
  function sb()   { return window.sb; }
  function toast(m) {
    if (typeof window.showToast === 'function') { window.showToast(m); return; }
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = m; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function digitalArrayToMap(data) {
    if (!data) return {};
    if (!Array.isArray(data)) {
      return typeof data === 'object' ? data : {};
    }
    var map = {};
    data.forEach(function (item) {
      if (item && item.number) {
        map[String(item.number)] = (map[String(item.number)] || 0) + 1;
      }
    });
    return map;
  }

  // ── fetch friend's collections row ─────────────────────────────
  async function fetchFriendData(userId) {
    if (!sb() || !userId) return { physical: {}, digital: {} };
    try {
      var res = await sb()
        .from('collections')
        .select('physical, digital')
        .eq('user_id', userId)
        .maybeSingle();
      if (res.error) throw res.error;
      return {
        physical: (res.data && res.data.physical) || {},
        digital:  digitalArrayToMap((res.data && res.data.digital) || {})
      };
    } catch (e) {
      console.warn('[friend-compare] fetch error:', e.message || e);
      return { physical: {}, digital: {} };
    }
  }

  // ── apply physical compare ─────────────────────────────────────
  function applyPhysicalCompare(col, username) {
    if (typeof window.applyCompareCollection === 'function') {
      window.applyCompareCollection(col);
    } else {
      window.compareCollection = col;
      if (typeof window.buildFilters     === 'function') window.buildFilters();
      if (typeof window.renderCards      === 'function') window.renderCards();
      if (typeof window.updateCompareBtn === 'function') window.updateCompareBtn();
    }
    // Navigate to Card Collection tab
    var homeTab = document.querySelector('[data-tab="home"]');
    if (homeTab) homeTab.click();
    var count = Object.keys(col).filter(function (n) { return (col[n] || 0) > 0; }).length;
    toast('📊 Comparing ' + username + '\'s physical collection (' + count + ' cards)');
  }

  // ── apply digital compare ──────────────────────────────────────
  function applyDigitalCompare(col, username) {
    window.compareDigitalCollection = col;
    refreshDigitalCompare();
    var digTab = document.querySelector('[data-tab="digital-collection"]');
    if (digTab) digTab.click();
    setTimeout(function () {
      var mainTab = document.querySelector('[data-nested-tab="digital-main"]');
      if (mainTab) mainTab.click();
    }, 80);
    var count = Object.keys(col).filter(function (n) { return (col[n] || 0) > 0; }).length;
    toast('📊 Comparing ' + username + '\'s digital collection (' + count + ' cards)');
  }

  // ── re-render digital grid with compare badges ─────────────────
  function refreshDigitalCompare() {
    var grid = document.getElementById('digital-cards-display');
    if (!grid) return;
    var cmp    = window.compareDigitalCollection || {};
    var hasCmp = Object.keys(cmp).some(function (n) { return (cmp[n] || 0) > 0; });

    grid.querySelectorAll('.fcv-dig-cmp').forEach(function (el) { el.remove(); });
    if (!hasCmp) return;

    grid.querySelectorAll('.card-item[data-number]').forEach(function (tile) {
      var num = tile.getAttribute('data-number');
      var qty = cmp[String(num)] || 0;
      if (!qty) return;
      var wrap = tile.querySelector('.card-img-wrap');
      if (!wrap) return;
      if (wrap.querySelector('.fcv-dig-cmp')) return;

      var badge = document.createElement('span');
      badge.className = 'fcv-dig-cmp';
      badge.style.cssText = [
        'position:absolute;bottom:6px;left:38px;z-index:5;',
        'background:rgba(0,0,0,0.75);color:var(--water);',
        'font-size:0.68rem;font-weight:700;',
        'padding:2px 8px;border-radius:99px;',
        'backdrop-filter:blur(4px);',
        'display:flex;align-items:center;gap:3px;',
      ].join('');
      badge.innerHTML = '<i class="fas fa-user-group" style="font-size:0.55rem;"></i> ×' + qty;
      wrap.appendChild(badge);
    });
  }

  // ── main entry point (physical by default) ─────────────────────
  async function loadAndCompare(userId, username, mode) {
    mode = mode || 'physical';

    // Indicate loading on the inline Compare button
    var btn = document.getElementById('fpCompareBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:5px;"></i>Loading…';
    }

    var data = await fetchFriendData(userId);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-people-arrows" style="margin-right:5px;"></i>Compare';
    }

    var physCount = Object.keys(data.physical).filter(function (n) { return (data.physical[n] || 0) > 0; }).length;
    var digCount  = Object.keys(data.digital).filter(function (n)  { return (data.digital[n]  || 0) > 0; }).length;

    if (physCount === 0 && digCount === 0) {
      toast(username + ' hasn\'t synced their collection yet.');
      return;
    }

    // Close the friend profile modal
    var overlay = document.getElementById('friendProfileOverlay');
    if (overlay) overlay.style.display = 'none';

    if (mode === 'digital') {
      applyDigitalCompare(data.digital, username);
    } else {
      applyPhysicalCompare(data.physical, username);
    }
  }

  // ── Wire the inline #fpCompareBtn whenever the modal opens ──────
  // social.js creates the button; we observe the overlay for visibility
  // changes and bind the click handler each time it opens.
  var _observer = new MutationObserver(function () {
    var overlay = document.getElementById('friendProfileOverlay');
    if (!overlay || overlay.style.display === 'none') return;

    var btn = document.getElementById('fpCompareBtn');
    if (!btn || btn.dataset.fcvWired) return;
    btn.dataset.fcvWired = '1';

    btn.addEventListener('click', function () {
      var uid   = overlay.getAttribute('data-fp-uid');
      var uname = overlay.getAttribute('data-fp-uname') || 'Friend';
      // Always physical — direct compare, no dropdown needed
      loadAndCompare(uid, uname, 'physical');
    });
  });

  _observer.observe(document.body, {
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['style']
  });

  // ── re-apply digital compare badges after grid re-renders ──────
  var _digitalObs = new MutationObserver(function (mutations) {
    var cmp = window.compareDigitalCollection || {};
    if (!Object.keys(cmp).length) return;
    var grid = document.getElementById('digital-cards-display');
    if (!grid) return;
    mutations.forEach(function (m) {
      if (m.target === grid || grid.contains(m.target)) {
        clearTimeout(window._digCmpTimer);
        window._digCmpTimer = setTimeout(refreshDigitalCompare, 120);
      }
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var grid = document.getElementById('digital-cards-display');
      if (grid) _digitalObs.observe(grid, { childList: true });
    });
  } else {
    var grid = document.getElementById('digital-cards-display');
    if (grid) _digitalObs.observe(grid, { childList: true });
  }

  // ── clear digital compare when physical compare clears ─────────
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'clearCompareOk') {
      window.compareDigitalCollection = {};
      refreshDigitalCompare();
    }
  });

  // ── public API ─────────────────────────────────────────────────
  window.loadAndCompare       = loadAndCompare;
  window.refreshDigitalCompare = refreshDigitalCompare;

  console.log('[friend-compare.js] v3 loaded ✓');

})();
