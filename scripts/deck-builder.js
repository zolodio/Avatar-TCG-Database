/* ============================================================
   Avatar Quick Strike TCG — Deck Builder
   Place at:  scripts/deck-builder.js
   Add to HTML before </body>:
     <script src="scripts/deck-builder.js"></script>
   ============================================================ */
(function () {
  'use strict';

  /* ── CONSTANTS ─────────────────────────────────────────────── */
  var STORAGE_KEY = 'aqst_decks_v1';
  var MAX_CARDS   = 60;
  var MAX_COPIES  = 4;

  /* ── STATE ──────────────────────────────────────────────────── */
  var S = {
    ready      : false,
    decks      : [],
    editing    : null,   // { id, name, chamber, cards:[] }
    editingIdx : -1,
    search     : '',
    filterRarity: 'all',
    showIncompat: false,
    isDirty    : false
  };

  /* ── STORAGE ─────────────────────────────────────────────────── */
  function loadDecks() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function persistDecks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S.decks)); } catch (_) {}
  }

  /* ── ENCODE (for external play site) ─────────────────────────── */
  // Format:  DECK1 + base64( chamberNumber + "|" + card1,card2,… )
  function encodeDeck(deck) {
    try {
      var payload = (deck.chamber || '') + '|' + (deck.cards || []).join(',');
      return 'DECK1' + btoa(unescape(encodeURIComponent(payload)));
    } catch (_) { return null; }
  }

  /* ── UTILITIES ───────────────────────────────────────────────── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 2200); }
  }
  function allCards()  { return window.allCards  || []; }
  function traitIcons(){ return window.traitIconMap || {}; }

  /* ── TRAIT / COMPATIBILITY ───────────────────────────────────── */
  function parseTraits(s) {
    if (!s || !s.trim()) return [];
    return s.split(/[\s,;]+/).map(function(t){ return t.trim().toLowerCase(); }).filter(Boolean);
  }
  function chamberCards() {
    return allCards().filter(function(c){ return c.type === 'chamber'; });
  }
  function isCompatible(card, chamberNum) {
    if (!chamberNum || card.type === 'chamber') return false;
    var ch = allCards().find(function(c){ return c.number === chamberNum; });
    if (!ch) return false;
    var ct  = parseTraits(card.traits);
    if (ct.length === 0) return true;             // no traits = universal
    var cht = parseTraits(ch.traits);
    return ct.some(function(t){ return cht.indexOf(t) !== -1; });
  }
  function compatList(chamberNum) {
    return allCards().filter(function(c){ return isCompatible(c, chamberNum); });
  }

  /* ── DECK HELPERS ────────────────────────────────────────────── */
  function deckSize(deck) { return (deck.cards || []).length; }
  function copyCount(deck, num) {
    return (deck.cards || []).filter(function(n){ return n === num; }).length;
  }
  function rarityClr(r) {
    return ({common:'var(--text-secondary)',uncommon:'var(--earth)',
             rare:'var(--water)',zenemental:'var(--zen)',promo:'var(--promo)'})[r]
           || 'var(--text-secondary)';
  }

  /* ══════════════════════════════════════════════════════════════
     CARD STACK VISUAL
     Layers of card backs appear behind the chamber face card.
     The stack grows as more cards are added.
  ═══════════════════════════════════════════════════════════════ */
  function stackLayers(count) {
    if (count === 0) return 0;
    if (count <= 10) return 1;
    if (count <= 20) return 2;
    if (count <= 30) return 3;
    if (count <= 42) return 4;
    if (count <= 54) return 5;
    return 6;
  }

  function renderStack(deck, opts) {
    opts = opts || {};
    var W      = opts.W      || 130;
    var H      = Math.round(W * 1.395);           // standard card 2.5×3.5 ratio
    var OFF    = opts.offset || Math.max(4, Math.round(W * 0.04));
    var badge  = opts.badge  !== false;

    var count  = deckSize(deck);
    var layers = stackLayers(count);
    var full   = count >= MAX_CARDS;
    var ch     = deck.chamber
      ? allCards().find(function(c){ return c.number === deck.chamber; })
      : null;

    /* outer container sized to fit all layers */
    var CW = W + layers * OFF + OFF + 2;
    var CH = H + Math.round(layers * OFF * 0.65) + (badge ? 22 : 4);
    var BR = Math.round(W * 0.07);

    var html = '<div style="position:relative;width:' + CW + 'px;height:' + CH + 'px;flex-shrink:0;">';

    /* ─ Background card layers (card backs) ─ */
    for (var i = layers; i >= 1; i--) {
      var dx  = i * OFF;
      var dy  = Math.round(i * OFF * 0.6);
      /* alternate rotation: odd layers go right, even go left */
      var deg = (i % 2 === 0 ? 1 : -1) * (0.8 + (layers - i) * 0.7);
      var lum = 0.22 + (i / (layers + 1)) * 0.2;

      html +=
        '<div style="position:absolute;left:' + dx + 'px;top:' + dy + 'px;' +
          'width:' + W + 'px;height:' + H + 'px;border-radius:' + BR + 'px;' +
          'background:' +
            'radial-gradient(ellipse at 30% 28%, rgba(180,77,223,' + lum + ') 0%, transparent 58%),' +
            'radial-gradient(ellipse at 72% 74%, rgba(46,140,232,' + (lum * 0.55) + ') 0%, transparent 52%),' +
            'linear-gradient(148deg, rgba(28,35,60,0.97), rgba(10,13,26,0.99));' +
          'border:1px solid rgba(255,255,255,0.06);' +
          'transform:rotate(' + deg + 'deg);' +
          'box-shadow:0 3px 12px rgba(0,0,0,0.55);' +
        '"></div>';
    }

    /* ─ Chamber card face (front, on top) ─ */
    html +=
      '<div style="position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;' +
        'border-radius:' + BR + 'px;overflow:hidden;z-index:10;' +
        'border:1.5px solid rgba(255,255,255,' + (ch ? '0.2' : '0.07') + ');' +
        'box-shadow:0 8px 30px rgba(0,0,0,0.78),0 0 0 1px rgba(0,0,0,0.5)' +
        (full ? ',0 0 20px rgba(61,184,108,0.5)' : '') + ';' +
      '">';
    if (ch && ch.imageLink) {
      html +=
        '<img src="' + esc(ch.imageLink) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" ' +
        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div style="display:none;width:100%;height:100%;background:linear-gradient(135deg,var(--zen),var(--water));' +
          'align-items:center;justify-content:center;">' +
          '<i class="fas fa-window-maximize" style="font-size:' + Math.round(W*0.22) + 'px;color:rgba(255,255,255,0.35);"></i>' +
        '</div>';
    } else {
      html +=
        '<div style="width:100%;height:100%;background:linear-gradient(148deg,var(--bg-surface),var(--bg-card));' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;">' +
          '<i class="fas fa-window-maximize" style="color:var(--zen);font-size:' + Math.round(W*0.22) + 'px;opacity:0.35;"></i>' +
          '<span style="font-size:' + Math.round(W*0.053) + 'px;color:var(--text-muted);opacity:0.5;text-align:center;padding:0 8px;line-height:1.3;">Choose<br>Chamber</span>' +
        '</div>';
    }
    html += '</div>';

    /* ─ Card count badge ─ */
    if (badge) {
      var bg  = full ? 'var(--success)' : count > MAX_CARDS * 0.75 ? 'var(--air)' : 'rgba(8,10,20,0.9)';
      var clr = (full || count > MAX_CARDS * 0.75) ? '#000' : '#fff';
      html +=
        '<div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);z-index:20;' +
          'background:' + bg + ';color:' + clr + ';' +
          'font-size:' + Math.round(W * 0.073) + 'px;font-weight:700;font-family:\'Cinzel\',serif;' +
          'padding:2px 10px;border-radius:99px;white-space:nowrap;' +
          'box-shadow:0 2px 8px rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.12);' +
        '">' + count + '/' + MAX_CARDS + '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ── SHARED STYLE HELPERS ────────────────────────────────────── */
  function traitPill(t, small) {
    var fs = small ? '0.5rem'  : '0.55rem';
    var p  = small ? '1px 5px' : '2px 7px';
    var iconUrl = traitIcons()[t];
    var inner   = iconUrl
      ? '<img src="' + esc(iconUrl) + '" style="width:10px;height:10px;object-fit:contain;vertical-align:middle;margin-right:3px;" loading="lazy">' + esc(t)
      : esc(t);
    return '<span style="font-size:' + fs + ';font-weight:700;text-transform:capitalize;' +
      'padding:' + p + ';border-radius:4px;background:rgba(180,77,223,0.1);color:var(--zen);' +
      'border:1px solid rgba(180,77,223,0.2);display:inline-flex;align-items:center;">' + inner + '</span>';
  }
  function actionBtn(bg, clr) {
    clr = clr || '#fff';
    return 'padding:9px 16px;border-radius:var(--radius);border:none;background:' + bg + ';color:' + clr + ';' +
      'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.82rem;cursor:pointer;' +
      'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:opacity 0.2s;';
  }
  function ghostBtn(extra) {
    return 'background:none;border:1px solid var(--border);border-radius:8px;padding:8px 12px;' +
      'color:var(--text-secondary);cursor:pointer;font-size:0.78rem;' +
      'font-family:\'Nunito Sans\',sans-serif;font-weight:700;transition:all 0.18s;' + (extra||'');
  }
  function miniBtn() {
    return 'padding:6px 11px;border-radius:7px;border:1px solid var(--border);background:var(--bg-card);' +
      'color:var(--text-secondary);font-size:0.7rem;font-family:\'Nunito Sans\',sans-serif;' +
      'font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;transition:all 0.18s;';
  }
  function incBtn(disabled) {
    return 'width:21px;height:21px;border-radius:5px;border:1px solid var(--border);' +
      'background:var(--bg-primary);color:' + (disabled ? 'var(--text-muted)' : 'var(--text-primary)') + ';' +
      'font-size:0.9rem;cursor:' + (disabled ? 'default' : 'pointer') + ';' +
      'display:flex;align-items:center;justify-content:center;line-height:1;padding:0;' +
      'font-family:\'Nunito Sans\',sans-serif;transition:all 0.15s;';
  }
  function rarPill(active) {
    return 'padding:5px 10px;border-radius:99px;font-size:0.65rem;font-weight:700;cursor:pointer;' +
      'font-family:\'Nunito Sans\',sans-serif;white-space:nowrap;transition:all 0.18s;text-transform:capitalize;' +
      'border:1px solid ' + (active ? 'white' : 'var(--border)') + ';' +
      'background:' + (active ? 'var(--zen)' : 'var(--bg-card)') + ';' +
      'color:' + (active ? '#fff' : 'var(--text-secondary)') + ';';
  }

  /* ── INJECT CSS (hover states, transitions) ─────────────────── */
  function injectStyles() {
    if (document.getElementById('db-css')) return;
    var s = document.createElement('style');
    s.id = 'db-css';
    s.textContent = [
      '.db-deck-tile { transition: border-color 0.22s, transform 0.22s, box-shadow 0.22s; }',
      '.db-deck-tile:hover { border-color: var(--border-light) !important; transform: translateY(-3px); box-shadow: var(--shadow-md); }',
      '.db-ch-pick { transition: border-color 0.22s, transform 0.22s, filter 0.22s; }',
      '.db-ch-pick:hover { border-color: var(--zen) !important; transform: translateY(-2px); filter: drop-shadow(0 0 7px var(--zen)); }',
      '.db-bc { transition: border-color 0.18s, transform 0.18s, opacity 0.18s; }',
      '.db-bc:hover { border-color: var(--border-light) !important; transform: translateY(-1px); }',
      '.db-bc.in-deck { border-color: rgba(180,77,223,0.45) !important; }',
      '.db-incbtn:hover:not(:disabled) { border-color: var(--zen) !important; color: var(--zen) !important; }',
      '.db-plusbtn:hover:not(:disabled) { background: rgba(180,77,223,0.12) !important; border-color: var(--zen) !important; color: var(--zen) !important; }',
      '.db-minusbtn:hover:not(:disabled) { background: rgba(224,72,72,0.1) !important; border-color: var(--danger) !important; color: var(--danger) !important; }',
      '.db-edit-btn:hover { border-color: var(--zen) !important; color: var(--zen) !important; }',
      '.db-copy-btn:hover { border-color: var(--water) !important; color: var(--water) !important; }',
      '.db-del-btn:hover  { border-color: var(--danger) !important; color: var(--danger) !important; }',
      '.db-ghost-btn:hover { border-color: var(--border-light) !important; color: var(--text-primary) !important; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════
     CONTAINER HELPER
  ═══════════════════════════════════════════════════════════════ */
  function $c() { return document.getElementById('nested-digital-deckbuilder'); }

  /* ══════════════════════════════════════════════════════════════
     VIEW: LIST
  ═══════════════════════════════════════════════════════════════ */
  function showList() {
    S.decks    = loadDecks();
    S.editing  = null;
    S.isDirty  = false;
    var el = $c(); if (!el) return;

    var html =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
        '<div>' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;color:var(--text-primary);">My Decks</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + S.decks.length + ' deck' + (S.decks.length !== 1 ? 's' : '') + ' saved</div>' +
        '</div>' +
        '<button id="db-new" style="' + actionBtn('var(--zen)') + '">' +
          '<i class="fas fa-plus"></i> New Deck' +
        '</button>' +
      '</div>';

    if (S.decks.length === 0) {
      html +=
        '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">' +
          '<i class="fas fa-layer-group" style="font-size:3rem;opacity:0.2;margin-bottom:14px;display:block;"></i>' +
          '<p style="font-size:0.85rem;line-height:1.7;">No decks yet.<br>Build your first deck to get started!</p>' +
        '</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:14px;">';
      S.decks.forEach(function(deck, idx) {
        var ch = deck.chamber ? allCards().find(function(c){ return c.number===deck.chamber; }) : null;
        var chTraits = ch ? parseTraits(ch.traits) : [];
        var size = deckSize(deck);

        html +=
          '<div class="db-deck-tile" data-idx="' + idx + '" style="' +
            'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);' +
            'padding:16px 14px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:11px;">' +

          '<div style="margin-top:6px;">' + renderStack(deck, { W: 102, offset: 4 }) + '</div>' +

          '<div style="text-align:center;width:100%;">' +
            '<div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);' +
              'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">' + esc(deck.name || 'Unnamed Deck') + '</div>' +
            '<div style="font-size:0.63rem;color:var(--text-muted);">' + esc(ch ? ch.name : 'No Chamber') + '</div>' +
          '</div>';

        if (chTraits.length > 0) {
          html += '<div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;">';
          chTraits.forEach(function(t){ html += traitPill(t, true); });
          html += '</div>';
        }

        html +=
          '<div style="display:flex;gap:5px;width:100%;" onclick="event.stopPropagation()">' +
            '<button class="db-edit-btn" data-idx="' + idx + '" style="' + miniBtn() + ';flex:1;">' +
              '<i class="fas fa-pen"></i> Edit</button>' +
            '<button class="db-copy-btn" data-idx="' + idx + '" title="Copy deck code for play site" style="' + miniBtn() + ';width:34px;padding:6px;">' +
              '<i class="fas fa-share-nodes"></i></button>' +
            '<button class="db-del-btn" data-idx="' + idx + '" title="Delete deck" style="' + miniBtn() + ';width:34px;padding:6px;">' +
              '<i class="fas fa-trash-alt"></i></button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;

    /* events */
    el.querySelector('#db-new').addEventListener('click', function(){ showChamberSelect(null); });

    el.querySelectorAll('.db-deck-tile').forEach(function(t){
      t.addEventListener('click', function(){
        startEdit(S.decks[+this.dataset.idx], +this.dataset.idx);
      });
    });
    el.querySelectorAll('.db-edit-btn').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        startEdit(S.decks[+this.dataset.idx], +this.dataset.idx);
      });
    });
    el.querySelectorAll('.db-copy-btn').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        var deck = S.decks[+this.dataset.idx];
        var code = encodeDeck(deck);
        if (!code) { toast('Could not encode deck'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function(){ toast('\u2713 Deck code copied to clipboard!'); });
        } else {
          /* fallback: prompt */
          window.prompt('Copy this deck code:', code);
        }
      });
    });
    el.querySelectorAll('.db-del-btn').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        var idx  = +this.dataset.idx;
        var name = S.decks[idx].name || 'this deck';
        if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return;
        S.decks.splice(idx, 1);
        persistDecks();
        showList();
        toast('Deck deleted');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: CHAMBER SELECT
  ═══════════════════════════════════════════════════════════════ */
  function showChamberSelect(forDeck) {
    var el = $c(); if (!el) return;
    var chambers = chamberCards();

    var html =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">' +
        '<button id="db-ch-back" class="db-ghost-btn" style="' + ghostBtn() + '">' +
          '<i class="fas fa-chevron-left"></i> Back</button>' +
        '<div>' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;color:var(--text-primary);">Choose Chamber Card</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">Your chamber defines which cards are compatible with your deck</div>' +
        '</div>' +
      '</div>';

    if (chambers.length === 0) {
      html += '<p style="color:var(--text-muted);text-align:center;padding:40px;">No chamber cards found in the database.</p>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:10px;">';
      chambers.forEach(function(ch){
        var traits = parseTraits(ch.traits);
        var compatCount = allCards().filter(function(c){ return isCompatible(c, ch.number); }).length;
        html +=
          '<div class="db-ch-pick" data-num="' + esc(ch.number) + '" style="' +
            'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;">' +
            '<div style="position:relative;aspect-ratio:3/4;background:var(--bg-primary);">' +
              '<img src="' + esc(ch.imageLink) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display=\'none\'">' +
              '<span style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,0.74);color:#fff;font-size:0.56rem;font-weight:700;padding:1px 6px;border-radius:99px;">#' + esc(ch.number) + '</span>' +
              '<span style="position:absolute;bottom:5px;right:5px;background:rgba(46,140,232,0.85);color:#fff;font-size:0.52rem;font-weight:700;padding:1px 6px;border-radius:99px;">' + compatCount + ' cards</span>' +
            '</div>' +
            '<div style="padding:8px 9px 10px;">' +
              '<div style="font-weight:700;font-size:0.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;">' + esc(ch.name) + '</div>' +
              '<div style="display:flex;gap:3px;flex-wrap:wrap;">' +
              traits.map(function(t){ return traitPill(t, true); }).join('') +
              '</div>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;

    el.querySelector('#db-ch-back').addEventListener('click', function(){
      if (forDeck) startEdit(forDeck, S.editingIdx);
      else showList();
    });

    el.querySelectorAll('.db-ch-pick').forEach(function(pick){
      pick.addEventListener('click', function(){
        var num = this.dataset.num;
        if (forDeck) {
          /* changing chamber: strip incompatible cards */
          forDeck.chamber = num;
          forDeck.cards = (forDeck.cards || []).filter(function(n){
            var card = allCards().find(function(c){ return c.number === n; });
            return card && isCompatible(card, num);
          });
          startEdit(forDeck, S.editingIdx);
          toast('Chamber changed — incompatible cards removed');
        } else {
          startEdit({ id: uid(), name: '', chamber: num, cards: [] }, -1);
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: DECK EDITOR
  ═══════════════════════════════════════════════════════════════ */
  function startEdit(deck, savedIdx) {
    S.editing    = JSON.parse(JSON.stringify(deck));
    S.editingIdx = savedIdx;
    S.search     = '';
    S.filterRarity = 'all';
    S.showIncompat = false;
    S.isDirty    = (savedIdx === -1);
    showEditor();
  }

  function showEditor(opts) {
    opts = opts || {};
    var el = $c(); if (!el) return;
    var deck  = S.editing;

    var ch      = deck.chamber ? allCards().find(function(c){ return c.number===deck.chamber; }) : null;
    var chTraits = ch ? parseTraits(ch.traits) : [];

    /* ─ build display pool ─ */
    var pool = S.showIncompat
      ? allCards().filter(function(c){ return c.type !== 'chamber'; })
      : compatList(deck.chamber);

    if (S.search) {
      var q = S.search.toLowerCase();
      pool = pool.filter(function(c){
        return c.name.toLowerCase().indexOf(q) !== -1 || c.number.toLowerCase().indexOf(q) !== -1;
      });
    }
    if (S.filterRarity !== 'all') {
      pool = pool.filter(function(c){ return c.rarity === S.filterRarity; });
    }

    var size   = deckSize(deck);
    var full   = size >= MAX_CARDS;
    var pct    = Math.round((size / MAX_CARDS) * 100);
    var barClr = full ? 'var(--success)' : size > 45 ? 'var(--air)' : 'linear-gradient(90deg,var(--water),var(--zen))';

    /* ─ rarity counts ─ */
    var rarCount = {};
    (deck.cards || []).forEach(function(num){
      var card = allCards().find(function(c){ return c.number===num; });
      if (card) rarCount[card.rarity] = (rarCount[card.rarity] || 0) + 1;
    });

    /* ── HTML ── */
    var html = '';

    /* top bar */
    html +=
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<button id="db-ed-back" class="db-ghost-btn" style="' + ghostBtn() + '">' +
          '<i class="fas fa-chevron-left"></i></button>' +
        '<input id="db-deck-name" type="text" maxlength="40" placeholder="Name your deck\u2026" value="' + esc(deck.name || '') + '" ' +
          'style="flex:1;min-width:110px;background:var(--bg-primary);border:1px solid var(--border);' +
          'border-radius:8px;padding:9px 12px;color:var(--text-primary);font-size:0.88rem;' +
          'font-family:\'Nunito Sans\',sans-serif;outline:none;transition:border-color 0.2s;">' +
        '<button id="db-save-btn" style="' + actionBtn('var(--zen)') + '">' +
          '<i class="fas fa-floppy-disk"></i> Save</button>' +
      '</div>';

    /* main flex layout */
    html += '<div id="db-ed-layout" style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">';

    /* ─ LEFT: deck preview panel ─ */
    html +=
      '<div id="db-preview-panel" style="' +
        'flex-shrink:0;width:170px;display:flex;flex-direction:column;align-items:center;gap:10px;' +
        'background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;">';

    html += '<div id="db-stack-wrap" style="margin-top:6px;">' + renderStack(deck, { W: 126, offset: 6 }) + '</div>';

    /* chamber info */
    if (ch) {
      html +=
        '<div style="text-align:center;width:100%;">' +
          '<div style="font-size:0.57rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;margin-bottom:4px;">Chamber</div>' +
          '<div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);line-height:1.3;">' + esc(ch.name) + '</div>';
      if (chTraits.length > 0) {
        html += '<div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;margin-top:6px;">';
        chTraits.forEach(function(t){ html += traitPill(t, true); });
        html += '</div>';
      }
      html += '</div>';
    }

    /* progress bar */
    html +=
      '<div style="width:100%;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);margin-bottom:4px;">' +
          '<span>Cards in deck</span>' +
          '<span style="font-weight:700;color:' + (full ? 'var(--success)' : size > 45 ? 'var(--air)' : 'var(--text-primary)') + ';">' + size + '/' + MAX_CARDS + '</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--bg-primary);border-radius:99px;overflow:hidden;">' +
          '<div id="db-prog-fill" style="height:100%;width:' + pct + '%;border-radius:99px;background:' + barClr + ';transition:width 0.3s;"></div>' +
        '</div>' +
      '</div>';

    /* rarity breakdown */
    var rarOrder = ['common','uncommon','rare','zenemental','promo'];
    var hasRar = rarOrder.some(function(r){ return rarCount[r]; });
    if (hasRar) {
      html += '<div style="width:100%;border-top:1px solid var(--border);padding-top:8px;">';
      rarOrder.forEach(function(r){
        if (!rarCount[r]) return;
        html +=
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;">' +
            '<span style="font-size:0.62rem;color:' + rarityClr(r) + ';text-transform:capitalize;">' + r + '</span>' +
            '<span style="font-size:0.62rem;font-weight:700;color:var(--text-secondary);">' + rarCount[r] + '</span>' +
          '</div>';
      });
      html += '</div>';
    }

    /* change chamber + deck code buttons */
    html +=
      '<div style="display:flex;flex-direction:column;gap:6px;width:100%;border-top:1px solid var(--border);padding-top:10px;">' +
        '<button id="db-ch-change" class="db-ghost-btn" style="' + ghostBtn('width:100%;justify-content:center;font-size:0.68rem;padding:7px 10px;') + '">' +
          '<i class="fas fa-rotate" style="margin-right:5px;font-size:0.7rem;"></i>Change Chamber</button>' +
        '<button id="db-copy-code" class="db-ghost-btn" style="' + ghostBtn('width:100%;justify-content:center;font-size:0.68rem;padding:7px 10px;color:var(--water);border-color:rgba(46,140,232,0.3);') + '" title="Copy deck code for play site">' +
          '<i class="fas fa-share-nodes" style="margin-right:5px;font-size:0.7rem;"></i>Copy Deck Code</button>' +
      '</div>';

    html += '</div>'; /* end preview panel */

    /* ─ RIGHT: card browser ─ */
    html += '<div style="flex:1;min-width:220px;">';

    /* search */
    html +=
      '<div style="position:relative;margin-bottom:8px;">' +
        '<i class="fas fa-search" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:0.8rem;pointer-events:none;"></i>' +
        '<input id="db-search-inp" type="text" placeholder="Search compatible cards\u2026" value="' + esc(S.search) + '" ' +
          'style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);' +
          'padding:9px 9px 9px 33px;color:var(--text-primary);font-size:0.88rem;' +
          'font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
      '</div>';

    /* filter pills */
    html +=
      '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:9px;">' +
      ['all','common','uncommon','rare','zenemental'].map(function(r){
        return '<button class="db-rfil" data-r="' + r + '" style="' + rarPill(S.filterRarity===r) + '">' +
          (r==='all' ? 'All' : r.charAt(0).toUpperCase()+r.slice(1)) + '</button>';
      }).join('') +
      '<div style="flex:1;min-width:6px;"></div>' +
      '<label style="display:flex;align-items:center;gap:5px;font-size:0.67rem;color:var(--text-secondary);cursor:pointer;white-space:nowrap;user-select:none;">' +
        '<input type="checkbox" id="db-show-all" ' + (S.showIncompat?'checked':'') + ' style="accent-color:var(--zen);width:13px;height:13px;">' +
        'Show all cards' +
      '</label>' +
    '</div>';

    /* result count */
    html +=
      '<div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:9px;">' +
        pool.length + ' card' + (pool.length!==1?'s':'') +
        (full ? ' &nbsp;&middot;&nbsp; <span style="color:var(--success);font-weight:700;">Deck is full!</span>' : '') +
      '</div>';

    /* card grid */
    html += '<div id="db-browser" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:7px;">';

    pool.forEach(function(card){
      var inDeck  = copyCount(deck, card.number);
      var canAdd  = !full && inDeck < MAX_COPIES;
      var compat  = isCompatible(card, deck.chamber);

      html +=
        '<div class="db-bc' + (inDeck > 0 ? ' in-deck' : '') + '" data-num="' + esc(card.number) + '" style="' +
          'background:var(--bg-card);border:1px solid ' + (inDeck > 0 ? 'rgba(180,77,223,0.42)' : 'var(--border)') + ';' +
          'border-radius:var(--radius);overflow:hidden;' +
          'opacity:' + (S.showIncompat && !compat ? '0.38' : '1') + ';' +
          (inDeck > 0 ? 'box-shadow:0 0 0 1px rgba(180,77,223,0.16);' : '') +
          '">' +

          '<div style="position:relative;aspect-ratio:3/4;background:var(--bg-primary);">' +
            '<img src="' + esc(card.imageLink) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<span style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.76);color:#fff;font-size:0.5rem;font-weight:700;padding:1px 5px;border-radius:99px;">#' + esc(card.number) + '</span>' +
            (inDeck > 0
              ? '<span style="position:absolute;top:4px;right:4px;background:var(--zen);color:#fff;font-size:0.56rem;font-weight:700;padding:1px 6px;border-radius:99px;">' + inDeck + '</span>'
              : '') +
          '</div>' +

          '<div style="padding:5px 6px 7px;">' +
            '<div style="font-size:0.63rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
              'color:var(--text-primary);margin-bottom:5px;" title="' + esc(card.name) + '">' + esc(card.name) + '</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:3px;">' +
              '<div style="display:flex;align-items:center;gap:2px;">' +
                '<button class="db-incbtn db-minusbtn" data-num="' + esc(card.number) + '" ' + (inDeck===0?'disabled':'') + ' style="' + incBtn(inDeck===0) + '">\u2212</button>' +
                '<span style="font-family:\'Cinzel\',serif;font-size:0.68rem;font-weight:700;min-width:14px;text-align:center;color:' + (inDeck>0?'var(--zen)':'var(--text-muted)') + ';">' + inDeck + '</span>' +
                '<button class="db-incbtn db-plusbtn" data-num="' + esc(card.number) + '" ' + (!canAdd?'disabled':'') + ' style="' + incBtn(!canAdd) + '">+</button>' +
              '</div>' +
              '<span style="font-size:0.47rem;font-weight:700;text-transform:uppercase;color:' + rarityClr(card.rarity) + ';letter-spacing:0.04em;">' +
                (card.rarity==='zenemental'?'ZEN':card.rarity==='uncommon'?'UC':card.rarity.slice(0,1).toUpperCase()) +
              '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>'; /* browser grid */
    html += '</div>'; /* browser panel */
    html += '</div>'; /* flex layout */

    el.innerHTML = html;

    /* ─ restore search focus + scroll ─ */
    if (opts.focusSearch) {
      var sinp = document.getElementById('db-search-inp');
      if (sinp) { sinp.focus(); sinp.setSelectionRange(sinp.value.length, sinp.value.length); }
    }
    if (opts.scrollY !== undefined) window.scrollTo(0, opts.scrollY);

    /* ─ wire events ─ */
    document.getElementById('db-ed-back').addEventListener('click', function(){
      if (S.isDirty && !window.confirm('Discard unsaved changes?')) return;
      showList();
    });

    var nameInp = document.getElementById('db-deck-name');
    nameInp.addEventListener('input', function(){ S.editing.name = this.value; S.isDirty = true; });
    nameInp.addEventListener('focus', function(){ this.style.borderColor='var(--zen)'; });
    nameInp.addEventListener('blur',  function(){ this.style.borderColor='var(--border)'; });

    document.getElementById('db-save-btn').addEventListener('click', saveDeckAction);

    document.getElementById('db-ch-change').addEventListener('click', function(){
      showChamberSelect(S.editing);
    });

    document.getElementById('db-copy-code').addEventListener('click', function(){
      var code = encodeDeck(S.editing);
      if (!code) { toast('Save the deck first to generate a code'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function(){ toast('\u2713 Deck code copied!'); });
      } else { window.prompt('Copy this deck code:', code); }
    });

    document.getElementById('db-search-inp').addEventListener('input', function(){
      S.search = this.value;
      showEditor({ focusSearch: true, scrollY: window.scrollY });
    });
    document.getElementById('db-search-inp').addEventListener('focus', function(){ this.style.borderColor='var(--zen)'; });
    document.getElementById('db-search-inp').addEventListener('blur',  function(){ this.style.borderColor='var(--border)'; });

    document.getElementById('db-show-all').addEventListener('change', function(){
      S.showIncompat = this.checked;
      showEditor({ scrollY: window.scrollY });
    });

    el.querySelectorAll('.db-rfil').forEach(function(b){
      b.addEventListener('click', function(){
        S.filterRarity = this.dataset.r;
        showEditor({ scrollY: window.scrollY });
      });
    });

    /* add / remove cards — partial update for snappy feel */
    el.querySelectorAll('.db-plusbtn').forEach(function(b){
      b.addEventListener('click', function(){
        var num = this.dataset.num;
        if (deckSize(S.editing) >= MAX_CARDS) { toast('Deck is full (' + MAX_CARDS + ' cards max)'); return; }
        if (copyCount(S.editing, num) >= MAX_COPIES) { toast('Max ' + MAX_COPIES + ' copies per card'); return; }
        S.editing.cards.push(num);
        S.isDirty = true;
        patchCardTile(num);
        patchPreview();
      });
    });

    el.querySelectorAll('.db-minusbtn').forEach(function(b){
      b.addEventListener('click', function(){
        var num = this.dataset.num;
        var idx = S.editing.cards.lastIndexOf(num);
        if (idx !== -1) {
          S.editing.cards.splice(idx, 1);
          S.isDirty = true;
          patchCardTile(num);
          patchPreview();
        }
      });
    });
  }

  /* ── Partial DOM patch: card tile controls ───────────────────── */
  function patchCardTile(num) {
    var el     = $c(); if (!el) return;
    var deck   = S.editing;
    var size   = deckSize(deck);
    var full   = size >= MAX_CARDS;
    var inDeck = copyCount(deck, num);
    var canAdd = !full && inDeck < MAX_COPIES;

    var tile   = el.querySelector('.db-bc[data-num="' + num + '"]');
    if (!tile) return;

    /* border + shadow */
    tile.style.border = '1px solid ' + (inDeck > 0 ? 'rgba(180,77,223,0.42)' : 'var(--border)');
    tile.style.boxShadow = inDeck > 0 ? '0 0 0 1px rgba(180,77,223,0.16)' : '';
    tile.classList.toggle('in-deck', inDeck > 0);

    /* badge inside image wrap */
    var imgWrap = tile.querySelector('[style*="aspect-ratio"]');
    if (imgWrap) {
      var oldBadge = imgWrap.querySelector('span:not(:first-child)');
      if (oldBadge) oldBadge.remove();
      if (inDeck > 0) {
        var badge = document.createElement('span');
        badge.style.cssText = 'position:absolute;top:4px;right:4px;background:var(--zen);color:#fff;font-size:0.56rem;font-weight:700;padding:1px 6px;border-radius:99px;';
        badge.textContent = inDeck;
        imgWrap.appendChild(badge);
      }
    }

    /* count span */
    var cntSpan = tile.querySelector('[style*="font-family:\'Cinzel\'"]');
    if (cntSpan) {
      cntSpan.textContent = inDeck;
      cntSpan.style.color = inDeck > 0 ? 'var(--zen)' : 'var(--text-muted)';
    }

    /* plus / minus buttons */
    var plus  = tile.querySelector('.db-plusbtn');
    var minus = tile.querySelector('.db-minusbtn');

    if (plus) {
      plus.disabled = !canAdd;
      plus.style.cssText = incBtn(!canAdd);
      /* re-attach */
      var plusClone = plus.cloneNode(true);
      plus.parentNode.replaceChild(plusClone, plus);
      plusClone.addEventListener('click', function(){
        if (deckSize(S.editing) >= MAX_CARDS) { toast('Deck is full'); return; }
        if (copyCount(S.editing, num) >= MAX_COPIES) { toast('Max ' + MAX_COPIES + ' copies'); return; }
        S.editing.cards.push(num);
        S.isDirty = true;
        patchCardTile(num);
        patchPreview();
      });
    }
    if (minus) {
      minus.disabled = inDeck === 0;
      minus.style.cssText = incBtn(inDeck === 0);
      var minusClone = minus.cloneNode(true);
      minus.parentNode.replaceChild(minusClone, minus);
      minusClone.addEventListener('click', function(){
        var idx = S.editing.cards.lastIndexOf(num);
        if (idx !== -1) {
          S.editing.cards.splice(idx, 1);
          S.isDirty = true;
          patchCardTile(num);
          patchPreview();
        }
      });
    }

    /* update full banner */
    var el2 = $c();
    if (el2) {
      var rcDiv = el2.querySelector('#db-browser');
      if (rcDiv) {
        var prevSibling = rcDiv.previousElementSibling;
        if (prevSibling && prevSibling.textContent.indexOf('card') !== -1) {
          var pool = S.showIncompat
            ? allCards().filter(function(c){ return c.type !== 'chamber'; })
            : compatList(S.editing.chamber);
          if (S.search) {
            var q = S.search.toLowerCase();
            pool = pool.filter(function(c){ return c.name.toLowerCase().indexOf(q)!==-1 || c.number.toLowerCase().indexOf(q)!==-1; });
          }
          if (S.filterRarity !== 'all') pool = pool.filter(function(c){ return c.rarity===S.filterRarity; });
          var fullNow = deckSize(S.editing) >= MAX_CARDS;
          prevSibling.innerHTML = pool.length + ' card' + (pool.length!==1?'s':'') +
            (fullNow ? ' &nbsp;&middot;&nbsp; <span style="color:var(--success);font-weight:700;">Deck is full!</span>' : '');
        }
      }
    }
  }

  /* ── Partial DOM patch: left preview panel ───────────────────── */
  function patchPreview() {
    var wrap = document.getElementById('db-stack-wrap');
    if (wrap) wrap.innerHTML = renderStack(S.editing, { W: 126, offset: 6 });

    var size   = deckSize(S.editing);
    var full   = size >= MAX_CARDS;
    var pct    = Math.round((size / MAX_CARDS) * 100);
    var barClr = full ? 'var(--success)' : size > 45 ? 'var(--air)' : 'linear-gradient(90deg,var(--water),var(--zen))';

    var fill = document.getElementById('db-prog-fill');
    if (fill) { fill.style.width = pct + '%'; fill.style.background = barClr; }

    /* update count label */
    var panel = document.getElementById('db-preview-panel');
    if (panel) {
      var spans = panel.querySelectorAll('span');
      spans.forEach(function(sp){
        if (sp.textContent.indexOf('/60') !== -1) {
          sp.textContent = size + '/' + MAX_CARDS;
          sp.style.color = full ? 'var(--success)' : size > 45 ? 'var(--air)' : 'var(--text-primary)';
        }
      });

      /* rarity breakdown: re-render the section */
      var rarCount = {};
      (S.editing.cards || []).forEach(function(n){
        var c = allCards().find(function(x){ return x.number===n; });
        if (c) rarCount[c.rarity] = (rarCount[c.rarity]||0) + 1;
      });
      var rarOrder = ['common','uncommon','rare','zenemental','promo'];
      var rarSect  = panel.querySelector('[style*="border-top:1px"]');
      if (rarSect) {
        rarSect.innerHTML = '';
        rarOrder.forEach(function(r){
          if (!rarCount[r]) return;
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:2px 0;';
          row.innerHTML =
            '<span style="font-size:0.62rem;color:'+rarityClr(r)+';text-transform:capitalize;">'+r+'</span>' +
            '<span style="font-size:0.62rem;font-weight:700;color:var(--text-secondary);">'+rarCount[r]+'</span>';
          rarSect.appendChild(row);
        });
      }
    }
  }

  /* ── SAVE DECK ───────────────────────────────────────────────── */
  function saveDeckAction() {
    var deck = S.editing;
    if (!deck.chamber) { toast('Select a chamber card first'); return; }
    if (!deck.name || !deck.name.trim()) {
      var ch = allCards().find(function(c){ return c.number===deck.chamber; });
      deck.name = (ch ? ch.name : 'My') + ' Deck';
      var ni = document.getElementById('db-deck-name');
      if (ni) ni.value = deck.name;
    }
    S.decks = loadDecks();
    if (S.editingIdx >= 0 && S.editingIdx < S.decks.length) {
      S.decks[S.editingIdx] = deck;
    } else {
      S.decks.unshift(deck);
    }
    persistDecks();
    S.isDirty = false;
    toast('\u2713 Deck saved!');
    showList();
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════════════ */
  function init() {
    /* wait for allCards to load */
    if (!window.allCards || window.allCards.length === 0) {
      setTimeout(init, 400);
      return;
    }
    injectStyles();
    S.decks = loadDecks();
    showList();
    S.ready = true;
  }

  /* expose so main HTML can call window.initDeckBuilder() if needed */
  window.initDeckBuilder = init;

  /* auto-trigger when the deck builder nested tab is clicked */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('.tab-btn-nested[data-nested-tab="digital-deckbuilder"]');
    if (!btn) return;
    setTimeout(function(){
      if (!S.ready) { init(); }
      else          { S.decks = loadDecks(); showList(); }
    }, 60);
  });

})();
