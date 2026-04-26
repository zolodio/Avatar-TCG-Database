/* ================================================================
   Avatar TCG — One-Click Friend Compare  (friend-compare.js v2)

   Fixes:
     • Digital collection stored as dcCards[] array was being treated
       as a {number:qty} map — now converted on the way in.
     • Physical compare fallback correctly sets window.compareCollection
       and triggers re-render even without applyCompareCollection.

   Drop in /scripts/ and add ONE line after social.js:
     <script src="scripts/friend-compare.js"></script>
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

  /**
   * The digital collection is stored as the raw dcCards[] array
   * (uid, number, name, rarity, …).  Compare views need a
   * {cardNumber: qty} map instead.  Convert here.
   */
  function digitalArrayToMap(data) {
    if (!data) return {};
    // Already a plain object / map — return as-is
    if (!Array.isArray(data)) {
      return typeof data === 'object' ? data : {};
    }
    // Array of dcCard records → aggregate by .number
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
        // Normalise digital regardless of whether it was stored as array or map
        digital:  digitalArrayToMap((res.data && res.data.digital) || {})
      };
    } catch (e) {
      console.warn('[friend-compare] fetch error:', e.message || e);
      return { physical: {}, digital: {} };
    }
  }

  // ── apply physical compare (reuses existing engine) ───────────
  function applyPhysicalCompare(col, username) {
    if (typeof window.applyCompareCollection === 'function') {
      window.applyCompareCollection(col);
    } else {
      // Fallback: set global and trigger whichever render helpers exist
      window.compareCollection = col;
      if (typeof window.buildFilters      === 'function') window.buildFilters();
      if (typeof window.renderCards       === 'function') window.renderCards();
      if (typeof window.updateCompareBtn  === 'function') window.updateCompareBtn();
    }
    // Switch to Card Collection tab
    var homeTab = document.querySelector('[data-tab="home"]');
    if (homeTab) homeTab.click();
    var count = Object.keys(col).filter(function (n) { return (col[n] || 0) > 0; }).length;
    toast('📊 Comparing ' + username + '\'s physical collection (' + count + ' cards)');
  }

  // ── apply digital compare ──────────────────────────────────────
  function applyDigitalCompare(col, username) {
    // col is already a {number: qty} map (converted in fetchFriendData)
    window.compareDigitalCollection = col;
    refreshDigitalCompare();
    // Switch to Digital Collection tab then the Collection sub-tab
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

    // Remove stale compare badges
    grid.querySelectorAll('.fcv-dig-cmp').forEach(function (el) { el.remove(); });
    if (!hasCmp) return;

    // Add a teal badge to every card tile the friend owns
    grid.querySelectorAll('.card-item[data-number]').forEach(function (tile) {
      var num = tile.getAttribute('data-number');
      var qty = cmp[String(num)] || 0;
      if (!qty) return;

      var wrap = tile.querySelector('.card-img-wrap');
      if (!wrap) return;
      if (wrap.querySelector('.fcv-dig-cmp')) return; // avoid duplicates

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

  // ── main entry point ───────────────────────────────────────────
  async function loadAndCompare(userId, username, mode) {
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

  // ── inject Compare button into friend modal footer ─────────────
  function patchFriendModal() {
    var footer = document.querySelector('#friendProfileOverlay > div > div:last-child');
    if (!footer || document.getElementById('fpCompareBtn')) return;

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

    var closeBtn = document.getElementById('fpCloseBtn');
    if (closeBtn) footer.insertBefore(btn, closeBtn);
    else footer.appendChild(btn);

    btn.addEventListener('click', function () {
      var existing = document.getElementById('fpCompareDrop');
      if (existing) { existing.remove(); return; }

      var overlay  = document.getElementById('friendProfileOverlay');
      var userId   = overlay && overlay.getAttribute('data-fp-uid');
      var username = overlay && overlay.getAttribute('data-fp-uname') || 'Friend';

      var drop = document.createElement('div');
      drop.id = 'fpCompareDrop';
      drop.style.cssText = [
        'position:absolute;bottom:62px;left:16px;right:16px;z-index:10;',
        'background:var(--bg-secondary);border:1px solid var(--border);',
        'border-radius:var(--radius);box-shadow:var(--shadow-lg);',
        'display:flex;flex-direction:column;overflow:hidden;',
        'animation:modalSlideUp 0.2s ease;',
      ].join('');

      drop.innerHTML = [
        '<div style="padding:8px 14px;font-size:0.62rem;text-transform:uppercase;',
          'letter-spacing:0.1em;color:var(--text-muted);font-weight:700;',
          'border-bottom:1px solid var(--border);">Compare on…</div>',
        '<button data-cmp-mode="physical" style="',
          'padding:12px 16px;border:none;background:none;text-align:left;cursor:pointer;',
          'font-family:\'Nunito Sans\',sans-serif;font-size:0.82rem;font-weight:600;',
          'color:var(--text-primary);display:flex;align-items:center;gap:10px;',
          'border-bottom:1px solid var(--border);transition:background 0.15s;">',
          '<i class="fas fa-clone" style="color:var(--zen);width:16px;text-align:center;',
            'transform:scale(.75,1.175);"></i>',
          '<div><div>Card Collection</div>',
            '<div style="font-size:0.68rem;color:var(--text-muted);font-weight:400;">',
              'Physical cards — blue badges on the main grid</div></div>',
        '</button>',
        '<button data-cmp-mode="digital" style="',
          'padding:12px 16px;border:none;background:none;text-align:left;cursor:pointer;',
          'font-family:\'Nunito Sans\',sans-serif;font-size:0.82rem;font-weight:600;',
          'color:var(--text-primary);display:flex;align-items:center;gap:10px;',
          'transition:background 0.15s;">',
          '<i class="fas fa-cloud-download-alt" style="color:var(--water);width:16px;text-align:center;"></i>',
          '<div><div>Digital Collection</div>',
            '<div style="font-size:0.68rem;color:var(--text-muted);font-weight:400;">',
              'Digital cards — teal badges on the digital grid</div></div>',
        '</button>',
      ].join('');

      drop.querySelectorAll('button[data-cmp-mode]').forEach(function (b) {
        b.addEventListener('mouseenter', function () { this.style.background = 'var(--bg-card-hover)'; });
        b.addEventListener('mouseleave', function () { this.style.background = 'none'; });
        b.addEventListener('click', function () {
          drop.remove();
          loadAndCompare(userId, username, this.getAttribute('data-cmp-mode'));
        });
      });

      var footerEl = document.querySelector('#friendProfileOverlay > div > div:last-child');
      if (footerEl) {
        footerEl.style.position = 'relative';
        footerEl.appendChild(drop);
      }

      setTimeout(function () {
        document.addEventListener('click', function removeDrop(e) {
          if (!drop.contains(e.target) && e.target !== btn) {
            drop.remove();
            document.removeEventListener('click', removeDrop);
          }
        });
      }, 10);
    });
  }

  // ── watch for the modal being opened ──────────────────────────
  var _observer = new MutationObserver(function () {
    var overlay = document.getElementById('friendProfileOverlay');
    if (overlay && overlay.style.display !== 'none') {
      patchFriendModal();
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

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

  // ── sync clear: wipe digital compare when physical compare clears ─
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'clearCompareOk') {
      window.compareDigitalCollection = {};
      refreshDigitalCompare();
    }
  });

  // Expose for external use
  window.refreshDigitalCompare = refreshDigitalCompare;

  console.log('[friend-compare.js] loaded ✓');

})();
