/* ═══════════════════════════════════════════════════════════════════════
   digital-collection.js  —  Avatar Quick Strike TCG Database
   Handles: digital card storage · AQS3 code redemption · URL hash import
            (#import=AQS3…) · card grid display · JSON backup/restore
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     STORAGE KEYS
  ───────────────────────────────────────────────────────────── */
  var DC_KEY    = 'aqtcg_digital_v1';
  var CODES_KEY = 'aqtcg_used_codes_v1';

  /* ─────────────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────────────── */
  var dc          = {};          // { cardNumber: { qty, lastAcquired } }
  var dcFilter    = 'all';
  var dcSearch    = '';
  var dcSort      = 'acquired';
  var initialized = false;

  /* ─────────────────────────────────────────────────────────────
     STORAGE HELPERS
  ───────────────────────────────────────────────────────────── */
function loadDC() {
  try { 
    dc = JSON.parse(localStorage.getItem(DC_KEY) || '{}'); 
    window.aqstDigitalCollection = dc;  // ← Expose globally
  }
  catch (e) { dc = {}; }
}
function saveDC() {
  try { 
    localStorage.setItem(DC_KEY, JSON.stringify(dc));
    window.aqstDigitalCollection = dc;  // ← Expose globally after save
    // Trigger cloud sync if user is logged in
    if (typeof window._aqst_cloudSync === 'function') {
      window._aqst_cloudSync();
    }
  }
  catch (e) {}
}
  function getUsedCodes() {
    try { return JSON.parse(localStorage.getItem(CODES_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function markCodeUsed(ck) {
    var used = getUsedCodes();
    used.push(ck);
    try { localStorage.setItem(CODES_KEY, JSON.stringify(used)); }
    catch (e) {}
  }
  function isCodeUsed(ck) {
    return getUsedCodes().indexOf(ck) !== -1;
  }

  /* ─────────────────────────────────────────────────────────────
     CHECKSUM  (must stay identical to pack-opener.html)
  ───────────────────────────────────────────────────────────── */
  function simpleChecksum(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & h; // keep 32-bit
    }
    return Math.abs(h).toString(36);
  }

  /* ─────────────────────────────────────────────────────────────
     AQS3 DECODE & VERIFY
  ───────────────────────────────────────────────────────────── */
  function decodeAQS3(code) {
    try {
      code = (code || '').trim();
      if (!code.startsWith('AQS3')) {
        return { error: 'Invalid code — must begin with AQS3.' };
      }
      var o = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!o.v || !o.p || !Array.isArray(o.c) || !o.s || !o.t || !o.ck) {
        return { error: 'Malformed redemption code — missing required fields.' };
      }
      // Verify integrity checksum
      var cksrc = o.c.join(',') + '|' + o.t + '|' + o.p;
      if (simpleChecksum(cksrc) !== o.ck) {
        return { error: 'Integrity check failed — code may be corrupted or tampered.' };
      }
      if (isCodeUsed(o.ck)) {
        return { error: 'This redemption code has already been used on this device.' };
      }
      return { payload: o };
    } catch (e) {
      return { error: 'Could not decode code: ' + (e.message || 'unknown error') };
    }
  }

  /* ─────────────────────────────────────────────────────────────
     ADD CARDS FROM DECODED PAYLOAD
  ───────────────────────────────────────────────────────────── */
function redeemPayload(payload) {
  var added = 0;
  var now   = Date.now();
  payload.c.forEach(function (num) {
    if (!dc[num]) dc[num] = { qty: 0, lastAcquired: now };
    dc[num].qty++;
    dc[num].lastAcquired = now;
    added++;
  });
  saveDC();  // ← This now triggers cloud sync automatically
  window.aqstDigitalCollection = dc;  // ← Add this line
  markCodeUsed(payload.ck);
  return added;
}
  /* ─────────────────────────────────────────────────────────────
     PUBLIC: removeDigitalCard  (called from card detail modal)
  ───────────────────────────────────────────────────────────── */
  function removeDigitalCard(num) {
    if (!dc[num]) return;
    dc[num].qty--;
    if (dc[num].qty <= 0) delete dc[num];
    saveDC();  // ← This now triggers cloud sync automatically
    window.aqstDigitalCollection = dc; 
    renderDigitalCards();
    updateDigitalStats();
    showToastDC('Card removed from digital collection');
  }
  window.removeDigitalCard = removeDigitalCard;

  /* ─────────────────────────────────────────────────────────────
     TOAST
  ───────────────────────────────────────────────────────────── */
  function showToastDC(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ─────────────────────────────────────────────────────────────
     ESCAPE HTML
  ───────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ─────────────────────────────────────────────────────────────
     DIGITAL STATS BAR
  ───────────────────────────────────────────────────────────── */
  function updateDigitalStats() {
    var bar = document.getElementById('digital-stats-bar');
    if (!bar) return;

    var totalUnique = Object.keys(dc).length;
    var totalCards  = 0;
    var coreOwned   = 0;
    Object.keys(dc).forEach(function (num) {
      totalCards += (dc[num].qty || 0);
      var n = parseInt(num, 10);
      if (!isNaN(n) && n >= 1 && n <= 235) coreOwned++;
    });
    var pct = Math.round((coreOwned / 248) * 100);

    bar.innerHTML =
      '<div class="stat-box">' +
        '<div class="stat-value">' + totalCards + '</div>' +
        '<div class="stat-label">Total Cards</div>' +
      '</div>' +
      '<div class="stat-box">' +
        '<div class="stat-value">' + totalUnique + '</div>' +
        '<div class="stat-label">Unique Cards</div>' +
      '</div>' +
      '<div class="stat-box">' +
        '<div class="stat-value">' + pct + '%</div>' +
        '<div class="stat-label">Core Complete</div>' +
      '</div>';
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER DIGITAL CARD GRID
  ───────────────────────────────────────────────────────────── */
  var RC_MAP = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };

  function renderDigitalCards() {
    var grid  = document.getElementById('digital-cards-display');
    var empty = document.getElementById('digital-empty-state');
    var count = document.getElementById('digital-results-count');
    if (!grid) return;

    var allCards = window.allCards || [];
    var q = dcSearch.toLowerCase();

    var cards = allCards.filter(function (c) {
      if (!dc[c.number] || dc[c.number].qty <= 0) return false;
      if (dcFilter !== 'all' && c.rarity !== dcFilter) return false;
      if (q && c.name.toLowerCase().indexOf(q) === -1 &&
               c.number.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    // Sort
    var ro = { common:0, uncommon:1, rare:2, zenemental:3, promo:4 };
    if (dcSort === 'acquired') {
      cards.sort(function (a, b) {
        return (dc[b.number].lastAcquired || 0) - (dc[a.number].lastAcquired || 0);
      });
    } else if (dcSort === 'number') {
      cards.sort(function (a, b) {
        return (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0);
      });
    } else if (dcSort === 'name') {
      cards.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else if (dcSort === 'rarity') {
      cards.sort(function (a, b) { return (ro[b.rarity] || 0) - (ro[a.rarity] || 0); });
    }

    if (count) {
      count.textContent = cards.length + ' card' + (cards.length !== 1 ? 's' : '');
    }

    if (cards.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    var html = '';
    cards.forEach(function (c) {
      var qty = dc[c.number].qty || 0;
      var rc  = RC_MAP[c.rarity] || 'var(--text-secondary)';
      html +=
        '<div class="card-item owned" data-number="' + esc(c.number) + '" style="--rarity-color:' + rc + '">' +
          '<span class="list-card-number">#' + esc(c.number) + '</span>' +
          '<div class="card-img-wrap">' +
            '<div class="card-flip-container">' +
              '<div class="card-flip-inner" data-flip-id="' + esc(c.number) + '">' +
                '<div class="card-flip-front">' +
                  (c.imageLink ? '<img src="' + esc(c.imageLink) + '" alt="' + esc(c.name) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
                '</div>' +
                '<div class="card-flip-back">' +
                  (c.backImageLink ? '<img src="' + esc(c.backImageLink) + '" alt="' + esc(c.name) + ' back" loading="lazy" onerror="this.style.display=\'none\'">' : '<div class="card-img-placeholder"><i class="fas fa-hat-wizard"></i></div>') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<span class="card-number-badge">#' + esc(c.number) + '</span>' +
            '<span class="card-owned-badge"><i class="fas fa-layer-group"></i></span>' +
            (qty > 1 ? '<span class="card-qty-badge">x' + qty + '</span>' : '') +
            '<button class="card-flip-btn" data-flip-target="' + esc(c.number) + '" title="Flip card"><i class="fas fa-rotate"></i></button>' +
          '</div>' +
          '<div class="card-info">' +
            '<div class="card-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
            '<div class="card-meta">' +
              '<span class="card-type-tag tag-' + esc(c.type) + '">' + esc(c.type) + '</span>' +
              '<span class="card-rarity-dot dot-' + esc(c.rarity) + '"></span>' +
              '<span class="card-rarity-label rarity-' + esc(c.rarity) + '">' + esc(c.rarity) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="list-card-right">' +
            '<span class="list-owned-icon show"><i class="fas fa-check-circle"></i></span>' +
            (qty > 1 ? '<span class="list-qty show">x' + qty + '</span>' : '') +
            '<span class="list-card-arrow"><i class="fas fa-chevron-right"></i></span>' +
          '</div>' +
        '</div>';
    });

    grid.innerHTML = html;
  }

  /* ─────────────────────────────────────────────────────────────
     IMPORT CONFIRMATION MODAL
     Shown when arriving via #import=AQS3… from the pack opener
  ───────────────────────────────────────────────────────────── */
  var MODAL_ID = 'dcImportModal';

  var SRC_LABELS = {
    game_win:   '⚔️  Earned in Battle',
    tournament: '🏆  Tournament Reward',
    daily:      '📅  Daily Reward',
    gift:       '🎁  Gifted Pack',
    purchase:   '💎  Purchased',
    demo:       '🔮  Preview Pack',
    legacy:     '📜  Shared Pack',
    digital:    '💿  Digital Pack',
    booster:    '📦  Booster Pack'
  };

  var RARITY_HEX = {
    common:     '#8b8fa8',
    uncommon:   '#5cb85c',
    rare:       '#2e8ce8',
    zenemental: '#b44ddf',
    promo:      '#e8b632'
  };

  function buildImportModal() {
    if (document.getElementById(MODAL_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.86);z-index:600;' +
      'display:none;align-items:center;justify-content:center;padding:16px;' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';

    overlay.innerHTML =
      '<div id="dcImportBox" style="' +
        'background:#0f1322;border:1px solid #252a42;border-radius:18px;' +
        'max-width:460px;width:100%;max-height:88vh;' +
        'display:flex;flex-direction:column;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);' +
        'animation:modalSlideUp 0.3s ease;">' +

        /* Header */
        '<div style="padding:20px 20px 14px;border-bottom:1px solid #252a42;flex-shrink:0;">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:44px;height:44px;border-radius:12px;flex-shrink:0;' +
              'background:rgba(61,184,108,0.12);border:1px solid rgba(61,184,108,0.28);' +
              'display:flex;align-items:center;justify-content:center;">' +
              '<i class="fas fa-layer-group" style="color:#3db86c;font-size:1.15rem;"></i>' +
            '</div>' +
            '<div>' +
              '<div id="dcImportTitle" style="font-family:Cinzel,serif;font-weight:700;font-size:1.05rem;color:#e8e6f0;">Import Pack to Collection</div>' +
              '<div id="dcImportSub" style="font-size:0.7rem;color:#5a5e78;margin-top:3px;"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Source badge + card list */
        '<div style="padding:14px 18px 0;flex-shrink:0;" id="dcImportBadgeRow"></div>' +
        '<div id="dcImportCardList" style="overflow-y:auto;padding:8px 18px 16px;flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;"></div>' +

        /* Footer */
        '<div style="padding:14px 18px 18px;border-top:1px solid #252a42;display:flex;gap:10px;flex-shrink:0;">' +
          '<button id="dcImportConfirmBtn" style="' +
            'flex:1;padding:14px;border-radius:10px;cursor:pointer;transition:all 0.2s;' +
            'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.9rem;' +
            'background:linear-gradient(135deg,#1e4a12,#338020);color:#6fda80;' +
            'border:1px solid rgba(61,184,108,0.4);' +
            'display:flex;align-items:center;justify-content:center;gap:8px;' +
            'box-shadow:0 4px 18px rgba(61,184,108,0.18);">' +
            '<i class="fas fa-layer-group"></i> Import to My Collection' +
          '</button>' +
          '<button id="dcImportDismissBtn" style="' +
            'padding:14px 18px;border-radius:10px;cursor:pointer;transition:all 0.2s;' +
            'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.85rem;' +
            'background:#151a2c;border:1px solid #252a42;color:#8b8fa8;">' +
            'Dismiss' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('dcImportConfirmBtn').addEventListener('click', function () {
      var payload = this._payload;
      if (!payload) return;
      var added = redeemPayload(payload);  // ← This now triggers cloud sync
      renderDigitalCards();
      updateDigitalStats();
      closeImportModal();
      showToastDC('✓ ' + added + ' card' + (added !== 1 ? 's' : '') + ' added to your digital collection!');
      // Navigate to Digital Collection → Collection tab
      if (typeof window.switchTab === 'function') window.switchTab('digital-collection');
      setTimeout(function () {
        var btn = document.querySelector('[data-nested-tab="digital-main"]');
        if (btn) btn.click();
      }, 200);
      clearImportHash();
    });

    document.getElementById('dcImportDismissBtn').addEventListener('click', function () {
      closeImportModal();
      clearImportHash();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === this) { closeImportModal(); clearImportHash(); }
    });
  }

  function clearImportHash() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  function openImportModal(payload) {
    buildImportModal();
    var overlay  = document.getElementById(MODAL_ID);
    var list     = document.getElementById('dcImportCardList');
    var badge    = document.getElementById('dcImportBadgeRow');
    var subEl    = document.getElementById('dcImportSub');
    var confirm  = document.getElementById('dcImportConfirmBtn');
    if (!overlay || !list || !confirm) return;

    confirm._payload = payload;

    var allCards = window.allCards || [];
    var cardCount = payload.c.length;

    if (subEl) {
      subEl.textContent = cardCount + ' card' + (cardCount !== 1 ? 's' : '') +
        ' will be added to your digital collection';
    }

    // Source badge
    var srcLabel = SRC_LABELS[payload.s] || '📦  Pack';
    if (badge) {
      badge.innerHTML =
        '<div style="display:inline-flex;align-items:center;gap:6px;' +
          'padding:5px 14px;border-radius:99px;margin-bottom:10px;' +
          'background:rgba(74,125,255,0.08);border:1px solid rgba(74,125,255,0.2);' +
          'font-size:0.68rem;color:#8b8fa8;font-weight:700;letter-spacing:0.06em;">' +
          esc(srcLabel) +
        '</div>';
    }

    // Card rows
    var rows = payload.c.map(function (num) {
      var card   = allCards.find(function (c) { return c.number === num; });
      var name   = card ? card.name   : 'Card #' + num;
      var rarity = card ? card.rarity : 'common';
      var imgSrc = card ? card.imageLink : '';
      var dot    = RARITY_HEX[rarity] || '#8b8fa8';
      var alreadyOwned = dc[num] && dc[num].qty > 0;

      return (
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;' +
          'background:#151a2c;border:1px solid #252a42;border-radius:8px;">' +
          (imgSrc
            ? '<img src="' + esc(imgSrc) + '" loading="lazy" ' +
              'style="width:34px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;" ' +
              'onerror="this.style.display=\'none\'">'
            : '<div style="width:34px;height:48px;background:#0a0c14;border-radius:4px;flex-shrink:0;' +
              'display:flex;align-items:center;justify-content:center;">' +
              '<i class="fas fa-hat-wizard" style="opacity:0.2;font-size:0.65rem;"></i></div>'
          ) +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;font-size:0.78rem;color:#e8e6f0;' +
              'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(name) + '</div>' +
            '<div style="font-size:0.6rem;color:#5a5e78;margin-top:2px;">' +
              '#' + esc(num) +
              (alreadyOwned ? ' &nbsp;·&nbsp; <span style="color:#f0c946;">+1 (already own)</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;"></div>' +
        '</div>'
      );
    }).join('');

    list.innerHTML = rows;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeImportModal() {
    var overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  /* ─────────────────────────────────────────────────────────────
     URL HASH DETECTION  (#import=AQS3…)
  ───────────────────────────────────────────────────────────── */
  function checkImportHash() {
    var hash = location.hash || '';
    if (!hash || hash.indexOf('AQS3') === -1) return;

    // Support both  #import=AQS3…  and  #AQS3…  from legacy pack links
    var code = '';
    if (hash.indexOf('import=') !== -1) {
      code = hash.replace(/^.*import=/, '');
    } else if (hash.startsWith('#AQS3')) {
      code = hash.slice(1);
    }
    if (!code.startsWith('AQS3')) return;

    function tryDecode() {
      var result = decodeAQS3(code);
      if (result.error) {
        // Show error toast and clear hash
        showToastDC('Import failed: ' + result.error);
        clearImportHash();
        return;
      }
      openImportModal(result.payload);
    }

    // Wait for allCards to be populated (CSV fetch may still be in flight)
    if (window.allCards && window.allCards.length > 0) {
      tryDecode();
    } else {
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        if ((window.allCards && window.allCards.length > 0) || attempts > 40) {
          clearInterval(poll);
          tryDecode();
        }
      }, 250);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     WIRE REDEEM TAB
  ───────────────────────────────────────────────────────────── */
  function wireRedeemTab() {
    var inp    = document.getElementById('redemption-code-input');
    var btnRdm = document.getElementById('btn-redeem');
    var btnClr = document.getElementById('btn-redeem-clear');
    var msgEl  = document.getElementById('redemption-message');

    if (!inp || !btnRdm) return;

    function showMsg(text, type) {
      if (!msgEl) return;
      // Clear old classes, set new
      msgEl.className = '';
      if (type) msgEl.classList.add(type);
      msgEl.textContent = text;
      msgEl.style.display = text ? '' : 'none';
    }

    function doRedeem() {
      var code = (inp.value || '').trim();
      if (!code) {
        showMsg('Please paste a redemption code first.', 'error');
        return;
      }
      showMsg('Verifying code…', '');

      // Short delay so the "Verifying…" message is visible
      setTimeout(function () {
        var result = decodeAQS3(code);
        if (result.error) {
          showMsg('✗  ' + result.error, 'error');
          return;
        }
        var added = redeemPayload(result.payload);  // ← This now triggers cloud sync
        renderDigitalCards();
        updateDigitalStats();
        inp.value = '';
        showMsg(
          '✓  Success! ' + added + ' card' + (added !== 1 ? 's' : '') +
          ' added to your digital collection.',
          'success'
        );
        // Switch to the collection view after 1.8 s
        setTimeout(function () {
          var btn = document.querySelector('[data-nested-tab="digital-main"]');
          if (btn) btn.click();
        }, 1800);
      }, 180);
    }

    btnRdm.addEventListener('click', doRedeem);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doRedeem();
    });

    if (btnClr) {
      btnClr.addEventListener('click', function () {
        inp.value = '';
        showMsg('', '');
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     WIRE EXPORT / IMPORT JSON / CLEAR
  ───────────────────────────────────────────────────────────── */
  function wireControlBar() {
    var expBtn = document.getElementById('btn-digital-export-json');
    var impBtn = document.getElementById('btn-digital-import-json');
    var clrBtn = document.getElementById('btn-digital-clear');

    if (expBtn) {
      expBtn.addEventListener('click', function () {
        var blob = new Blob([JSON.stringify(dc, null, 2)], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'avatar_digital_collection.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        showToastDC('Digital collection exported!');
      });
    }

    if (impBtn) {
      impBtn.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = function (e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var parsed = JSON.parse(reader.result);
              if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad format');
              dc = parsed; saveDC();  // ← This now triggers cloud sync
              renderDigitalCards(); updateDigitalStats();
              showToastDC('Digital collection imported from JSON!');
            } catch (err) {
              showToastDC('Failed to import — file does not look like a valid backup.');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    if (clrBtn) {
      clrBtn.addEventListener('click', function () {
        if (!confirm('Clear your entire digital collection?\n\nThis cannot be undone — export a backup first if you want to keep your cards.')) return;
        dc = {}; saveDC();  // ← This now triggers cloud sync
        renderDigitalCards(); updateDigitalStats();
        showToastDC('Digital collection cleared');
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     WIRE SEARCH, FILTERS, SORT
  ───────────────────────────────────────────────────────────── */
  function wireSearchFilters() {
    var searchEl  = document.getElementById('digital-search');
    var clearEl   = document.getElementById('digital-search-clear');
    var sortEl    = document.getElementById('digital-sort-by');
    var filtersEl = document.getElementById('digital-filters');

    if (searchEl) {
      searchEl.addEventListener('input', function () {
        dcSearch = this.value;
        if (clearEl) clearEl.classList.toggle('visible', this.value.length > 0);
        renderDigitalCards();
      });
    }

    if (clearEl) {
      clearEl.addEventListener('click', function () {
        if (searchEl) { searchEl.value = ''; dcSearch = ''; }
        this.classList.remove('visible');
        renderDigitalCards();
      });
    }

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        dcSort = this.value;
        renderDigitalCards();
      });
    }

    if (filtersEl) {
      filtersEl.addEventListener('click', function (e) {
        var pill = e.target.closest('.filter-pill[data-filter]');
        if (!pill) return;
        filtersEl.querySelectorAll('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        dcFilter = pill.getAttribute('data-filter');
        renderDigitalCards();
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     PUBLIC INIT  (called by the HTML after all scripts load)
  ───────────────────────────────────────────────────────────── */
  window.initDigitalCollectionTab = function () {
    if (initialized) return;
    initialized = true;

    loadDC();
    wireRedeemTab();
    wireControlBar();
    wireSearchFilters();
    renderDigitalCards();
    updateDigitalStats();

    // Re-render when allCards finishes loading (CSV is async)
    var dcPollCount = 0;
    var dcPoll = setInterval(function () {
      dcPollCount++;
      if ((window.allCards && window.allCards.length > 0) || dcPollCount > 60) {
        clearInterval(dcPoll);
        renderDigitalCards();
        updateDigitalStats();
      }
    }, 300);

    // Check for incoming pack import link
    setTimeout(checkImportHash, 600);
  };

  // Also catch hash changes (e.g. user navigates back from pack opener)
  window.addEventListener('hashchange', function () {
    checkImportHash();
  });

  // Expose renderDigitalCards so other scripts can trigger a refresh
  window.refreshDigitalCards = function () {
    loadDC();
    renderDigitalCards();
    updateDigitalStats();
  };
  window.aqstDigitalCollection = dc;  // Expose for cloud sync 

})();
