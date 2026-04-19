/* =============================================================================
   DIGITAL COLLECTION — digital-collection.js
   Handles AQS3 redemption codes, IndexedDB storage, and digital card display.
   Consumed by the main Avatar TCG Database index.html.
   ============================================================================= */

(function () {
  'use strict';

  /* ── CONSTANTS ────────────────────────────────────────────────────────────── */
  var DC_DB_NAME    = 'AvatarQSDigital';
  var DC_DB_STORE   = 'digitalCards';
  var DC_USED_STORE = 'usedCodes';
  var DC_DB_VER     = 2;

  /* ── INDEXEDDB HELPERS ───────────────────────────────────────────────────── */
  function dcOpenDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DC_DB_NAME, DC_DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(DC_DB_STORE)) {
          db.createObjectStore(DC_DB_STORE, { keyPath: 'uid' });
        }
        if (!db.objectStoreNames.contains(DC_USED_STORE)) {
          db.createObjectStore(DC_USED_STORE, { keyPath: 'code' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function dcGetAll() {
    return dcOpenDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(DC_DB_STORE, 'readonly');
        var req = tx.objectStore(DC_DB_STORE).getAll();
        req.onsuccess = function () { db.close(); resolve(req.result || []); };
        req.onerror   = function () { db.close(); reject(req.error); };
      });
    });
  }

  function dcSaveAll(records) {
    return dcOpenDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx    = db.transaction(DC_DB_STORE, 'readwrite');
        var store = tx.objectStore(DC_DB_STORE);
        records.forEach(function (r) { store.put(r); });
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror    = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function dcClearAll() {
    return dcOpenDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DC_DB_STORE, 'readwrite');
        tx.objectStore(DC_DB_STORE).clear();
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror    = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function dcIsCodeUsed(code) {
    return dcOpenDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(DC_USED_STORE, 'readonly');
        var req = tx.objectStore(DC_USED_STORE).get(code);
        req.onsuccess = function () { db.close(); resolve(!!req.result); };
        req.onerror   = function () { db.close(); reject(req.error); };
      });
    });
  }

  function dcMarkCodeUsed(code) {
    return dcOpenDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DC_USED_STORE, 'readwrite');
        tx.objectStore(DC_USED_STORE).put({ code: code, usedAt: Date.now() });
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror    = function () { db.close(); reject(tx.error); };
      });
    });
  }

  /* ── AQS3 DECODE (mirrors pack-opening site exactly) ────────────────────── */
  function simpleChecksum(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // keep 32-bit
    }
    return Math.abs(hash).toString(36);
  }

  function decodeAQS3(code) {
    try {
      code = code.trim();
      if (!code.startsWith('AQS3')) return { ok: false, error: 'Not a valid redemption code. Codes start with AQS3.' };
      var raw = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!raw.v || !raw.p || !Array.isArray(raw.c) || !raw.s || !raw.t || !raw.ck) {
        return { ok: false, error: 'Code is malformed or corrupted.' };
      }
      var checksumSource = raw.c.join(',') + '|' + raw.t + '|' + raw.p;
      if (simpleChecksum(checksumSource) !== raw.ck) {
        return { ok: false, error: 'Code checksum invalid — it may have been modified.' };
      }
      return { ok: true, payload: raw };
    } catch (e) {
      return { ok: false, error: 'Could not decode code. Make sure you pasted the full code.' };
    }
  }

  /* ── UI HELPERS ──────────────────────────────────────────────────────────── */
  function dcEscHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dcShowMsg(msg, type) {
    var el = document.getElementById('redemption-message');
    if (!el) return;
    el.textContent = msg;
    el.className   = type || '';
    el.style.display = msg ? '' : 'none';
  }

  function dcShowToast(msg) {
    // Reuse the main site's toast if available, else fallback
    if (typeof showToast === 'function') { showToast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ── RARITY / TYPE COLOR MAP ─────────────────────────────────────────────── */
  var DC_RARITY_COLOR = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };

  /* ── STATE ───────────────────────────────────────────────────────────────── */
  var dcCards          = [];   // raw records from DB
  var dcFilterRarity   = 'all';
  var dcSearchQuery    = '';
  var dcSortBy         = 'acquired';

  /* ── STATS BAR ───────────────────────────────────────────────────────────── */
  function dcRenderStats() {
    var bar = document.getElementById('digital-stats-bar');
    if (!bar) return;
    var total  = dcCards.length;
    var unique = new Set(dcCards.map(function (r) { return r.number; })).size;
    var packs  = new Set(dcCards.map(function (r) { return r.codeKey; })).size;
    bar.innerHTML =
      '<div class="stat-box"><div class="stat-value" style="filter:drop-shadow(0 0 8px var(--water))">' + unique + '</div><div class="stat-label">Unique Cards</div></div>' +
      '<div class="stat-box"><div class="stat-value" style="filter:drop-shadow(0 0 8px var(--zen))">'   + total  + '</div><div class="stat-label">Total Owned</div></div>' +
      '<div class="stat-box"><div class="stat-value" style="filter:drop-shadow(0 0 8px var(--earth))">' + packs  + '</div><div class="stat-label">Packs Opened</div></div>';
  }

  /* ── CARD GRID ───────────────────────────────────────────────────────────── */
  function dcGetFiltered() {
    var q = dcSearchQuery.toLowerCase();

    // Group by number to get quantities
    var grouped = {};
    dcCards.forEach(function (r) {
      if (!grouped[r.number]) {
        grouped[r.number] = { number: r.number, name: r.name, rarity: r.rarity, type: r.type, imageLink: r.imageLink, qty: 0, acquiredAt: r.acquiredAt };
      }
      grouped[r.number].qty++;
    });

    var cards = Object.values(grouped);

    if (dcFilterRarity !== 'all') {
      cards = cards.filter(function (c) { return c.rarity === dcFilterRarity || c.type === dcFilterRarity; });
    }

    if (q) {
      cards = cards.filter(function (c) {
        return c.name.toLowerCase().indexOf(q) !== -1 || c.number.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (dcSortBy === 'acquired') {
      cards.sort(function (a, b) { return b.acquiredAt - a.acquiredAt; });
    } else if (dcSortBy === 'number') {
      cards.sort(function (a, b) { return parseInt(a.number) - parseInt(b.number); });
    } else if (dcSortBy === 'name') {
      cards.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else if (dcSortBy === 'rarity') {
      var ro = { common: 0, uncommon: 1, rare: 2, zenemental: 3, promo: 4 };
      cards.sort(function (a, b) { return (ro[b.rarity] || 0) - (ro[a.rarity] || 0); });
    }

    return cards;
  }

  function dcRenderCards() {
    var grid    = document.getElementById('digital-cards-display');
    var empty   = document.getElementById('digital-empty-state');
    var counter = document.getElementById('digital-results-count');
    if (!grid) return;

    var cards = dcGetFiltered();
    if (counter) counter.textContent = cards.length + ' card' + (cards.length !== 1 ? 's' : '');

    if (cards.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    var html = '';
    cards.forEach(function (c) {
      var rc = DC_RARITY_COLOR[c.rarity] || 'var(--text-secondary)';
      html +=
        '<div class="card-item owned" data-number="' + dcEscHtml(c.number) + '" style="--rarity-color:' + rc + '">' +
          '<div class="card-img-wrap">' +
            '<div class="card-flip-container">' +
              '<div class="card-flip-inner">' +
                '<div class="card-flip-front">' +
                  (c.imageLink
                    ? '<img src="' + dcEscHtml(c.imageLink) + '" alt="' + dcEscHtml(c.name) + '" loading="lazy">'
                    : '<div class="card-img-placeholder"><i class="fas fa-layer-group"></i><span>#' + dcEscHtml(c.number) + '</span></div>') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<span class="card-number-badge">#' + dcEscHtml(c.number) + '</span>' +
            '<span class="card-owned-badge"><i class="fas fa-check"></i></span>' +
            (c.qty > 1 ? '<span class="card-qty-badge">x' + c.qty + '</span>' : '') +
          '</div>' +
          '<div class="card-info">' +
            '<div class="card-name" title="' + dcEscHtml(c.name) + '">' + dcEscHtml(c.name) + '</div>' +
            '<div class="card-meta">' +
              '<span class="card-type-tag tag-' + dcEscHtml(c.type) + '">' + dcEscHtml(c.type) + '</span>' +
              '<span class="card-rarity-dot dot-' + dcEscHtml(c.rarity) + '"></span>' +
              '<span class="card-rarity-label rarity-' + dcEscHtml(c.rarity) + '">' + dcEscHtml(c.rarity) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    grid.innerHTML = html;
  }

  /* ── FILTER PILLS ────────────────────────────────────────────────────────── */
  function dcInitFilters() {
    var row = document.getElementById('digital-filters');
    if (!row) return;
    row.querySelectorAll('.filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        row.querySelectorAll('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        dcFilterRarity = pill.dataset.filter;
        dcRenderCards();
      });
    });
  }

  /* ── SEARCH ──────────────────────────────────────────────────────────────── */
  function dcInitSearch() {
    var inp   = document.getElementById('digital-search');
    var clear = document.getElementById('digital-search-clear');
    if (!inp) return;
    inp.addEventListener('input', function () {
      dcSearchQuery = this.value;
      if (clear) clear.classList.toggle('visible', this.value.length > 0);
      dcRenderCards();
    });
    if (clear) {
      clear.addEventListener('click', function () {
        inp.value = '';
        dcSearchQuery = '';
        this.classList.remove('visible');
        inp.focus();
        dcRenderCards();
      });
    }
  }

  /* ── SORT ────────────────────────────────────────────────────────────────── */
  function dcInitSort() {
    var sel = document.getElementById('digital-sort-by');
    if (!sel) return;
    sel.addEventListener('change', function () {
      dcSortBy = this.value;
      dcRenderCards();
    });
  }

  /* ── EXPORT / IMPORT ─────────────────────────────────────────────────────── */
  function dcExportJSON() {
    if (dcCards.length === 0) { dcShowToast('No digital cards to export'); return; }
    var blob = new Blob([JSON.stringify(dcCards, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'avatar_digital_collection.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    dcShowToast('Digital collection exported!');
  }

  function dcExportCSV() {
    if (dcCards.length === 0) { dcShowToast('No digital cards to export'); return; }
    var grouped = {};
    dcCards.forEach(function (r) {
      grouped[r.number] = (grouped[r.number] || 0) + 1;
    });
    var csv = 'Number,Name,Type,Rarity,Quantity\n';
    Object.keys(grouped).forEach(function (num) {
      var r = dcCards.find(function (c) { return c.number === num; });
      csv += num + ',"' + (r.name || '').replace(/"/g, '""') + '",' + (r.type || '') + ',' + (r.rarity || '') + ',' + grouped[num] + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'avatar_digital_collection.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    dcShowToast('CSV exported!');
  }

  function dcImportJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        dcSaveAll(data).then(function () {
          dcCards = data;
          dcRenderStats();
          dcRenderCards();
          dcShowToast('Digital collection imported — ' + data.length + ' records');
        });
      } catch (e) {
        dcShowToast('Import failed: invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  /* ── CLEAR ───────────────────────────────────────────────────────────────── */
  function dcClearCollection() {
    if (!confirm('Clear ALL digital cards? This cannot be undone.')) return;
    dcClearAll().then(function () {
      dcCards = [];
      dcRenderStats();
      dcRenderCards();
      dcShowToast('Digital collection cleared');
    });
  }

  /* ── REMOVE SINGLE CARD (called from the modal in index.html) ────────────── */
  window.removeDigitalCard = function (cardNumber) {
    // Remove ONE instance of this card number from dcCards
    var idx = dcCards.findIndex(function (r) { return r.number === cardNumber; });
    if (idx === -1) { dcShowToast('Card not found in digital collection'); return; }
    var removed = dcCards.splice(idx, 1)[0];

    // Persist: rewrite all remaining records
    dcSaveAll(dcCards).then(function () {
      dcRenderStats();
      dcRenderCards();
      dcShowToast('Removed ' + (removed.name || cardNumber) + ' from digital collection');
    }).catch(function () {
      dcShowToast('Error removing card — please try again');
    });
  };

  /* ── REDEEM ──────────────────────────────────────────────────────────────── */
  function dcRedeem() {
    var inp    = document.getElementById('redemption-code-input');
    var code   = (inp ? inp.value.trim() : '');

    dcShowMsg('', '');

    if (!code) {
      dcShowMsg('Please paste a redemption code first.', 'error');
      return;
    }

    // Decode the AQS3 code
    var result = decodeAQS3(code);
    if (!result.ok) {
      dcShowMsg(result.error, 'error');
      return;
    }

    var payload = result.payload;

    // Check for duplicate redemption
    dcIsCodeUsed(code).then(function (used) {
      if (used) {
        dcShowMsg('This code has already been redeemed!', 'error');
        return;
      }

      // Resolve card numbers to full card objects via the main site's allCards array
      var resolvedCards = [];
      payload.c.forEach(function (num) {
        var cardNum = String(num);
        // Try to look up from main site's allCards (global)
        var found = null;
        if (typeof allCards !== 'undefined' && Array.isArray(allCards)) {
          found = allCards.find(function (c) { return c.number === cardNum; });
        }
        // Also try cardDatabase wrapper if present
        if (!found && typeof cardDatabase !== 'undefined' && cardDatabase.findCard) {
          found = cardDatabase.findCard(cardNum);
        }

        if (found) {
          resolvedCards.push({
            uid:        cardNum + '_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            number:     found.number,
            name:       found.name,
            type:       found.type,
            rarity:     found.rarity,
            imageLink:  found.imageLink  || '',
            set:        found.set        || '',
            codeKey:    code.slice(0, 32), // store prefix to group by pack
            acquiredAt: payload.t || Date.now()
          });
        } else {
          // Card not in database — store with minimal info
          resolvedCards.push({
            uid:        cardNum + '_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            number:     cardNum,
            name:       'Card #' + cardNum,
            type:       'unknown',
            rarity:     'common',
            imageLink:  '',
            set:        '',
            codeKey:    code.slice(0, 32),
            acquiredAt: payload.t || Date.now()
          });
        }
      });

      // Save cards and mark code used
      Promise.all([
        dcSaveAll(resolvedCards),
        dcMarkCodeUsed(code)
      ]).then(function () {
        dcCards = dcCards.concat(resolvedCards);
        dcRenderStats();
        dcRenderCards();

        if (inp) inp.value = '';
        dcShowMsg(
          '✓ Redeemed ' + resolvedCards.length + ' card' + (resolvedCards.length !== 1 ? 's' : '') + ' from pack ' + (payload.p || '') + '!',
          'success'
        );
        dcShowToast('Added ' + resolvedCards.length + ' cards to digital collection!');

        // Switch to the Collection sub-tab so user sees the cards
        var collectionBtn = document.querySelector('#tab-digital-collection .tab-btn-nested[data-nested-tab="digital-main"]');
        if (collectionBtn) collectionBtn.click();

      }).catch(function (err) {
        dcShowMsg('Failed to save cards: ' + (err && err.message ? err.message : err), 'error');
      });

    }).catch(function () {
      dcShowMsg('Could not verify code — please try again.', 'error');
    });
  }

  /* ── EVENT WIRING ────────────────────────────────────────────────────────── */
  function dcWireEvents() {
    // Redeem button
    var btnRedeem = document.getElementById('btn-redeem');
    if (btnRedeem) {
      btnRedeem.addEventListener('click', dcRedeem);
    }

    // Redeem textarea — Enter key submits (Shift+Enter = newline)
    var redeemInp = document.getElementById('redemption-code-input');
    if (redeemInp) {
      redeemInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dcRedeem(); }
      });
    }

    // Clear input button next to redeem
    var btnRedeemClear = document.getElementById('btn-redeem-clear');
    if (btnRedeemClear) {
      btnRedeemClear.addEventListener('click', function () {
        var inp = document.getElementById('redemption-code-input');
        if (inp) inp.value = '';
        dcShowMsg('', '');
      });
    }

    // Export JSON
    var btnExJ = document.getElementById('btn-digital-export-json');
    if (btnExJ) btnExJ.addEventListener('click', dcExportJSON);

    // Export CSV (button removed from HTML but handler kept for safety)
    var btnExC = document.getElementById('btn-digital-export-csv');
    if (btnExC) btnExC.addEventListener('click', dcExportCSV);

    // Import JSON
    var btnImJ = document.getElementById('btn-digital-import-json');
    if (btnImJ) {
      btnImJ.addEventListener('click', function () {
        var fi = document.createElement('input');
        fi.type = 'file'; fi.accept = '.json';
        fi.addEventListener('change', function (e) {
          if (e.target.files[0]) dcImportJSON(e.target.files[0]);
        });
        fi.click();
      });
    }

    // Clear all digital cards
    var btnClear = document.getElementById('btn-digital-clear');
    if (btnClear) btnClear.addEventListener('click', dcClearCollection);
  }

  /* ── PUBLIC INIT ─────────────────────────────────────────────────────────── */

  // Called during main app init() — loads DB and primes state
  window.initDigitalCollection = function () {
    dcGetAll().then(function (records) {
      dcCards = records || [];
      dcRenderStats();
      dcRenderCards();
    }).catch(function () {
      dcCards = [];
    });

    dcInitFilters();
    dcInitSearch();
    dcInitSort();
    dcWireEvents();
  };

  // Called again after tab switch (idempotent re-render)
  window.initDigitalCollectionTab = function () {
    dcRenderStats();
    dcRenderCards();
  };

})();
