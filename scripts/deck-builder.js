/*  deck-builder.js  —  Avatar Quick Strike TCG  Deck Builder  */
(function (global) {
  'use strict';

  var EXCLUDED_TYPES = ['sealed', 'other', 'print', 'unreleased', 'promo-sealed', 'promo sealed'];
  var CHAMBER_TYPE   = 'chamber';
  var STANDARD_TYPES = ['strike', 'advantage', 'ally'];

  var STRENGTHS = [
    { value: 'random',   label: 'Random',         icon: '🎲', desc: 'Anything goes'              },
    { value: 'attack',   label: 'Attack',          icon: '⚔️', desc: 'Max Force / Strike heavy'   },
    { value: 'defense',  label: 'Defense',         icon: '🛡️', desc: 'Max Intercept heavy'        },
    { value: 'balanced', label: 'Balanced',        icon: '⚖️', desc: 'Mix of everything'          },
    { value: 'energy',   label: 'Energy Saver',    icon: '⚡', desc: 'Low energy cost cards'      },
    { value: 'chamber',  label: 'Chamber Charger', icon: '🪟', desc: 'Advantage / chamber synergy'},
    { value: 'wild',     label: 'Wild Card',       icon: '🃏', desc: 'Focus on rules-text cards'  },
    { value: 'support',  label: 'Support',         icon: '🤝', desc: 'Ally heavy'                 }
  ];

  var DECK_SIZES = {
    full:   { standard: 60,  label: 'Full (60 + 1)' },
    half:   { standard: 30,  label: 'Half (30 + 1)' },
    custom: { standard: null, label: 'Custom'        }
  };

  var STORAGE_KEY    = 'aqst_decks';
  var MAX_COPIES     = 4;
  var RARITY_ORDER   = { common: 0, uncommon: 1, rare: 2, zenemental: 3, promo: 4 };

  var S = {
    view:   'list',
    pool:   'all',
    decks:  [],
    viewingDeck: null,
    rng: {
      name:            '',
      strength:        'balanced',
      deckSize:        'full',
      customSize:      60,
      selfPickChamber: false,
      chosenChamber:   null
    },
    build: {
      name:       '',
      deckSize:   'full',
      customSize: 60,
      chamber:    null,
      cards:      {},
      typeFilter: 'all',
      search:     '',
      sortBy:     'number',
      sortDir:    'asc'
    },
    exportSortMode:  'number',
    exportChecked:   {}
  };

  /* ═══════════════════════════════════════════════════════════════
     CARD FILTERING
  ═══════════════════════════════════════════════════════════════ */
  function isValidForDeck(card) {
    var t = (card.type || '').toLowerCase().trim();
    for (var i = 0; i < EXCLUDED_TYPES.length; i++) {
      if (t === EXCLUDED_TYPES[i]) return false;
    }
    if (t === CHAMBER_TYPE) return true;
    return STANDARD_TYPES.indexOf(t) !== -1;
  }

  function getDigitalCollection() {
    if (global.digitalCollectionData && typeof global.digitalCollectionData === 'object') {
      return global.digitalCollectionData;
    }
    try {
      var raw = localStorage.getItem('aqst_digital_col') ||
                localStorage.getItem('avatarDigitalCollection');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  }

  function getPoolCards() {
    var base = (global.allCards || []).filter(isValidForDeck);
    if (S.pool === 'physical') {
      var col = global.collection || {};
      return base.filter(function (c) { return (col[c.number] || 0) > 0; });
    }
    if (S.pool === 'digital') {
      var dc = getDigitalCollection();
      return base.filter(function (c) { return (dc[c.number] || 0) > 0; });
    }
    return base;
  }

  function parseTraits(str) {
    if (!str || !str.trim()) return [];
    return str.split(/[,;\s]+/)
      .map(function (t) { return t.trim().toLowerCase(); })
      .filter(function (t) { return t.length > 0; });
  }

  function getChamberTraits(chamberCard) {
    return parseTraits(chamberCard.traits || '');
  }

  function isCompatibleWithChamber(card, chamberCard) {
    if (!chamberCard) return true;
    var cardTraits = parseTraits(card.traits);
    if (cardTraits.length === 0) return true;
    var ct = getChamberTraits(chamberCard);
    if (ct.length === 0) return true;
    for (var i = 0; i < cardTraits.length; i++) {
      if (ct.indexOf(cardTraits[i]) !== -1) return true;
    }
    return false;
  }

  function getStandardCards(pool) {
    return pool.filter(function (c) { return c.type !== CHAMBER_TYPE; });
  }
  function getChamberCards(pool) {
    return pool.filter(function (c) { return c.type === CHAMBER_TYPE; });
  }

  function availableQty(cardNumber) {
    if (S.pool === 'physical') return (global.collection || {})[cardNumber] || 0;
    if (S.pool === 'digital')  return (getDigitalCollection()[cardNumber] || 0);
    return 99;
  }

  function maxCopiesForCard(cardNumber) {
    return S.pool === 'all' ? MAX_COPIES : Math.min(MAX_COPIES, availableQty(cardNumber));
  }

  /* ═══════════════════════════════════════════════════════════════
     DECK SCORING
  ═══════════════════════════════════════════════════════════════ */
  function cardScore(card, strength) {
    var force     = parseFloat(card.force)        || 0;
    var intercept = parseFloat(card.intercept)    || 0;
    var gE  = parseFloat(card.greenEnergy)   || 0;
    var yE  = parseFloat(card.yellowEnergy)  || 0;
    var rE  = parseFloat(card.redEnergy)     || 0;
    var E   = gE + yE + rE;
    var hasRules = ((card.rulesText || '').trim().length > 8);
    var t   = (card.type || '').toLowerCase();
    var noise = Math.random() * 0.5;
    switch (strength) {
      case 'attack':   return force * 3 + intercept * 0.5 + noise;
      case 'defense':  return intercept * 3 + force * 0.5 + noise;
      case 'energy':   return (E > 0 ? (12 / E) : 6) + noise;
      case 'chamber':  return (t === 'advantage' ? 5 : t === 'strike' ? 2 : 1) + noise;
      case 'wild':     return (hasRules ? (4 + force + intercept) : noise);
      case 'support':  return (t === 'ally' ? 5 : t === 'advantage' ? 2 : 1) + noise;
      case 'balanced': return (force + intercept + (hasRules ? 1 : 0)) + noise;
      default:         return Math.random() * 10;
    }
  }

  function chamberScore(chamber, strength) {
    var fI = parseFloat(chamber.chamberFrontI) || 0;
    var fF = parseFloat(chamber.chamberFrontF) || 0;
    var bI = parseFloat(chamber.chamberBackI)  || 0;
    var bF = parseFloat(chamber.chamberBackF)  || 0;
    var fE = (parseFloat(chamber.chamberFrontR)||0)+(parseFloat(chamber.chamberFrontY)||0)+(parseFloat(chamber.chamberFrontG)||0);
    var bE = (parseFloat(chamber.chamberBackR) ||0)+(parseFloat(chamber.chamberBackY) ||0)+(parseFloat(chamber.chamberBackG) ||0);
    var noise = Math.random() * 0.5;
    switch (strength) {
      case 'attack':  return (fF + bF) * 3 + (fI + bI) + noise;
      case 'defense': return (fI + bI) * 3 + (fF + bF) + noise;
      case 'energy':  var E = fE + bE; return (E > 0 ? 20 / E : 10) + noise;
      default:        return (fF + bF + fI + bI) + noise;
    }
  }

  function computeDeckStats(entries) {
    var totalForce = 0, totalIntercept = 0, totalEnergy = 0;
    var strikeC = 0, advantageC = 0, allyC = 0, chamberC = 0, rulesC = 0, totalCards = 0;
    entries.forEach(function (e) {
      var c = e.card; if (!c) return;
      var qty = e.qty || 1;
      totalCards += qty;
      totalForce     += (parseFloat(c.force)        || 0) * qty;
      totalIntercept += (parseFloat(c.intercept)    || 0) * qty;
      var E = ((parseFloat(c.greenEnergy)||0)+(parseFloat(c.yellowEnergy)||0)+(parseFloat(c.redEnergy)||0));
      totalEnergy += E * qty;
      var t = (c.type || '').toLowerCase();
      if (t === 'strike')    strikeC    += qty;
      if (t === 'advantage') advantageC += qty;
      if (t === 'ally')      allyC      += qty;
      if (t === CHAMBER_TYPE) chamberC  += qty;
      if ((c.rulesText || '').trim().length > 8) rulesC += qty;
    });
    var n = totalCards || 1;
    var avgF = totalForce / n, avgI = totalIntercept / n, avgE = totalEnergy / n;
    var attackScore  = Math.min(100, Math.round((avgF / 8)  * 100));
    var defenseScore = Math.min(100, Math.round((avgI / 8)  * 100));
    var supportScore = Math.min(100, Math.round(((allyC + advantageC) / n) * 100));
    return {
      totalCards, strikeC, advantageC, allyC, chamberC, rulesC,
      avgForce: avgF.toFixed(2), avgIntercept: avgI.toFixed(2), avgEnergy: avgE.toFixed(2),
      attackScore, defenseScore, supportScore
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     ENCODE / DECODE
  ═══════════════════════════════════════════════════════════════ */
  function encodeDeck(deck) {
    var cardPairs = Object.keys(deck.cards || {})
      .map(function (n) { return n + ':' + deck.cards[n]; }).join(',');
    var raw = [
      (deck.name       || 'Unnamed').replace(/\|/g, ' '),
      (deck.chamber    || ''),
      cardPairs,
      (deck.deckSize   || 'full'),
      (deck.customSize || 60),
      (deck.strength   || '')
    ].join('|');
    try { return 'AQSD1' + btoa(unescape(encodeURIComponent(raw))); } catch (e) { return ''; }
  }

  function decodeDeck(code) {
    try {
      code = (code || '').trim();
      if (code.substring(0, 5) !== 'AQSD1') return null;
      var raw = decodeURIComponent(escape(atob(code.substring(5))));
      var parts = raw.split('|');
      if (parts.length < 4) return null;
      var cards = {};
      if (parts[2]) {
        parts[2].split(',').forEach(function (pair) {
          var p = pair.split(':');
          if (p.length === 2) { var q = parseInt(p[1], 10); if (q > 0) cards[p[0]] = q; }
        });
      }
      return {
        name: parts[0] || 'Unnamed', chamber: parts[1] || null,
        cards: cards, deckSize: parts[3] || 'full',
        customSize: parseInt(parts[4], 10) || 60, strength: parts[5] || ''
      };
    } catch (e) { return null; }
  }

  /* ═══════════════════════════════════════════════════════════════
     PERSISTENCE
  ═══════════════════════════════════════════════════════════════ */
  function saveDecks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S.decks)); } catch (_) {}
  }

  function loadDecks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) S.decks = JSON.parse(raw);
    } catch (_) { S.decks = []; }
  }

  function persistDeck(deck) {
    deck.id      = deck.id      || ('deck_' + Date.now());
    deck.created = deck.created || Date.now();
    deck.encoded = encodeDeck(deck);
    var idx = S.decks.findIndex(function (d) { return d.id === deck.id; });
    if (idx >= 0) S.decks[idx] = deck; else S.decks.unshift(deck);
    saveDecks();
  }

  function removeDeck(id) {
    S.decks = S.decks.filter(function (d) { return d.id !== id; });
    saveDecks();
  }

  /* ═══════════════════════════════════════════════════════════════
     RANDOMIZER ENGINE
  ═══════════════════════════════════════════════════════════════ */
  function pickBestChamber(pool, strength) {
    var chambers = getChamberCards(pool);
    if (chambers.length === 0) return null;
    chambers.sort(function (a, b) { return chamberScore(b, strength) - chamberScore(a, strength); });
    var top = chambers.slice(0, Math.min(3, chambers.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  function buildRandomDeck(opts) {
    var pool       = getPoolCards();
    var strength   = opts.strength   || 'random';
    var deckSize   = opts.deckSize   || 'full';
    var customSize = opts.customSize || 60;
    var target     = deckSize === 'full' ? 60 : deckSize === 'half' ? 30 : customSize;
    var chamber    = opts.chamber || pickBestChamber(pool, strength);
    if (!chamber) return null;

    var standard = getStandardCards(pool).filter(function (c) {
      return isCompatibleWithChamber(c, chamber);
    });
    if (standard.length === 0) return null;

    standard.sort(function (a, b) { return cardScore(b, strength) - cardScore(a, strength); });

    var selectedCards = {};
    var totalAdded    = 0;

    var topTier   = Math.ceil(standard.length * 0.3);
    var midTier   = Math.ceil(standard.length * 0.6);
    for (var i = 0; i < standard.length && totalAdded < target; i++) {
      var c    = standard[i];
      var maxC = Math.min(
        strength === 'random' ? (1 + Math.floor(Math.random() * MAX_COPIES)) :
          i < topTier ? 4 : i < midTier ? 2 : 1,
        maxCopiesForCard(c.number),
        target - totalAdded
      );
      if (maxC > 0) { selectedCards[c.number] = maxC; totalAdded += maxC; }
    }

    if (totalAdded < target) {
      var pass2 = 0;
      while (totalAdded < target && pass2 < standard.length * MAX_COPIES) {
        var card2 = standard[pass2 % standard.length];
        var cur   = selectedCards[card2.number] || 0;
        var mx    = maxCopiesForCard(card2.number);
        if (cur < mx) { selectedCards[card2.number] = cur + 1; totalAdded++; }
        pass2++;
        if (pass2 > standard.length * MAX_COPIES) break;
      }
    }

    return {
      id:         'deck_' + Date.now(),
      name:       opts.name || 'Randomized Deck',
      chamber:    chamber.number,
      cards:      selectedCards,
      deckSize:   deckSize,
      customSize: customSize,
      strength:   strength,
      pool:       S.pool,
      created:    Date.now()
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORT HELPERS
  ═══════════════════════════════════════════════════════════════ */
  function buildExportEntries(deck, sortMode) {
    var allC    = global.allCards || [];
    var entries = [];

    if (deck.chamber) {
      var ch = allC.find(function (c) { return c.number === deck.chamber; });
      if (ch) entries.push({ card: ch, qty: 1, isChamber: true });
    }
    Object.keys(deck.cards || {}).forEach(function (num) {
      var card = allC.find(function (c) { return c.number === num; });
      if (card) entries.push({ card: card, qty: deck.cards[num], isChamber: false });
    });

    sortMode = sortMode || 'number';
    entries.sort(function (a, b) {
      if (a.isChamber !== b.isChamber) return a.isChamber ? -1 : 1;
      if (sortMode === 'type-number') {
        var tc = (a.card.type || '').localeCompare(b.card.type || '');
        if (tc !== 0) return tc;
      } else if (sortMode === 'name') {
        return a.card.name.localeCompare(b.card.name);
      } else if (sortMode === 'rarity') {
        var ra = RARITY_ORDER[a.card.rarity] || 0;
        var rb = RARITY_ORDER[b.card.rarity] || 0;
        if (ra !== rb) return ra - rb;
      }
      var nA = parseInt(a.card.number, 10), nB = parseInt(b.card.number, 10);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      return a.card.number.localeCompare(b.card.number);
    });
    return entries;
  }

  /* ═══════════════════════════════════════════════════════════════
     ING UTILITIES
  ═══════════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function cardImg(card) { return (card && card.imageLink) ? card.imageLink : ''; }

  function dotColor(rarity) {
    var m = { common:'var(--text-secondary)', uncommon:'var(--earth)', rare:'var(--water)', zenemental:'var(--zen)', promo:'var(--promo)' };
    return m[rarity] || 'var(--text-muted)';
  }

  function strengthLabel(val) {
    var s = STRENGTHS.find(function (x) { return x.value === val; });
    return s ? s.icon + ' ' + s.label : val;
  }

  var RARITY_COLORS = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };

  /* ── SVG Radar Chart ────────────────────────────────────────── */
  function svgRadar(attack, defense, support) {
    var cx = 80, cy = 82, r = 58;
    var angles = { atk: -90, def: 30, sup: 150 };

    function pt(angleDeg, pct) {
      var rad = angleDeg * Math.PI / 180;
      var d   = r * (pct / 100);
      return [+(cx + d * Math.cos(rad)).toFixed(2), +(cy + d * Math.sin(rad)).toFixed(2)];
    }
    function poly(pct) {
      var pa = pt(angles.atk, pct), pd = pt(angles.def, pct), ps = pt(angles.sup, pct);
      return pa[0]+','+pa[1]+' '+pd[0]+','+pd[1]+' '+ps[0]+','+ps[1];
    }

    var da = pt(angles.atk, attack),  dd = pt(angles.def, defense), ds = pt(angles.sup, support);
    var dataPath = 'M'+da[0]+','+da[1]+' L'+dd[0]+','+dd[1]+' L'+ds[0]+','+ds[1]+' Z';
    var oa = pt(angles.atk, 115), od = pt(angles.def, 116), os = pt(angles.sup, 116);

    var gridLines = [25,50,75,100].map(function(pct) {
      return '<polygon points="'+poly(pct)+'" fill="none" stroke="var(--border)" stroke-width="1"/>';
    }).join('');

    var axisLines = Object.values(angles).map(function(a) {
      var ep = pt(a, 100);
      return '<line x1="'+cx+'" y1="'+cy+'" x2="'+ep[0]+'" y2="'+ep[1]+'" stroke="var(--border-light)" stroke-width="1"/>';
    }).join('');

    return '<svg viewBox="0 0 160 160" width="160" height="160" style="display:block;">'
      + gridLines + axisLines
      + '<path d="'+dataPath+'" fill="rgba(180,77,223,0.22)" stroke="var(--zen)" stroke-width="2" stroke-linejoin="round"/>'
      + [da,dd,ds].map(function(p){ return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.5" fill="var(--zen)" stroke="var(--bg-secondary)" stroke-width="2"/>'; }).join('')
      + '<text x="'+oa[0]+'" y="'+(oa[1]+3)+'" text-anchor="middle" font-size="9" fill="var(--fire)" font-family="Nunito Sans,sans-serif" font-weight="700">ATK</text>'
      + '<text x="'+od[0]+'" y="'+(od[1]+3)+'" text-anchor="middle" font-size="9" fill="var(--water)" font-family="Nunito Sans,sans-serif" font-weight="700">DEF</text>'
      + '<text x="'+os[0]+'" y="'+(os[1]+3)+'" text-anchor="middle" font-size="9" fill="var(--earth)" font-family="Nunito Sans,sans-serif" font-weight="700">SUP</text>'
      + '</svg>';
  }

  /* ═══════════════════════════════════════════════════════════════
     INJECT CSS
  ═══════════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('aqst-db-styles')) return;
    var s = document.createElement('style');
    s.id  = 'aqst-db-styles';
    s.textContent = `
/* ── Deck Builder Shell ───────────────────────────────────── */
.db-wrap { padding-bottom:48px; }

.db-top-bar {
  display:flex; align-items:center; justify-content:space-between;
  flex-wrap:wrap; gap:10px; margin-bottom:16px;
}
.db-heading {
  font-family:'Cinzel',serif; font-size:1rem; font-weight:700; color:var(--text-primary);
  display:flex; align-items:center; gap:8px;
}

/* Pool toggle */
.db-pool-row { display:flex; gap:6px; }
.db-pool-btn {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:7px 12px; font-family:'Nunito Sans',sans-serif; font-size:0.72rem;
  font-weight:700; color:var(--text-secondary); cursor:pointer; transition:all .2s;
  white-space:nowrap;
}
.db-pool-btn:hover { border-color:var(--border-light); }
.db-pool-btn.active { background:rgba(180,77,223,.12); color:var(--zen); border-color:rgba(180,77,223,.4); }

/* Mode cards */
.db-mode-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; }
.db-mode-card {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; background:var(--bg-card); border:1px solid var(--border);
  border-radius:var(--radius-lg); padding:22px 10px; cursor:pointer;
  font-family:'Nunito Sans',sans-serif; font-size:0.82rem; font-weight:700;
  color:var(--text-secondary); transition:all .22s; text-align:center;
}
.db-mode-card .db-mode-icon { font-size:1.8rem; }
.db-mode-card:hover { border-color:var(--promo); color:var(--text-primary); transform:translateY(-2px); box-shadow:var(--shadow-md); }

/* Saved decks grid */
.db-deck-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(138px,1fr)); gap:12px;
}
.db-deck-card {
  background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
  overflow:hidden; cursor:pointer; transition:all .22s;
}
.db-deck-card:hover { border-color:var(--zen); transform:translateY(-2px); box-shadow:var(--shadow-md); filter:drop-shadow(0 0 6px var(--zen)); }
.db-deck-thumb {
  width:100%; aspect-ratio:3/4; background:var(--bg-primary) center/cover no-repeat;
  position:relative;
}
.db-deck-overlay {
  position:absolute; bottom:0; left:0; right:0;
  background:linear-gradient(transparent,rgba(0,0,0,.88));
  padding:22px 8px 8px;
}
.db-deck-name {
  font-family:'Cinzel',serif; font-size:0.7rem; font-weight:700; color:#fff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.db-deck-qty { font-size:0.58rem; color:rgba(255,255,255,.55); margin-top:1px; }
.db-deck-footer { padding:6px 8px; }
.db-deck-miniscores { display:flex; justify-content:space-between; margin-bottom:5px; }
.db-deck-actions { display:flex; gap:4px; justify-content:flex-end; }

/* Mini buttons */
.db-mini-btn {
  background:var(--bg-card); border:1px solid var(--border); border-radius:6px;
  padding:5px 9px; font-size:0.68rem; color:var(--text-secondary);
  cursor:pointer; font-family:'Nunito Sans',sans-serif; font-weight:700;
  transition:all .18s; display:inline-flex; align-items:center; gap:4px;
}
.db-mini-btn:hover { border-color:var(--accent); color:var(--accent); }
.db-delete-btn:hover { border-color:var(--danger)!important; color:var(--danger)!important; }
.db-export-btn:hover { border-color:var(--earth)!important; color:var(--earth)!important; }

/* Back bar */
.db-back-row { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.db-back-btn {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:8px 14px; color:var(--text-secondary); font-family:'Nunito Sans',sans-serif;
  font-size:0.78rem; font-weight:700; cursor:pointer; transition:all .2s;
  display:flex; align-items:center; gap:6px;
}
.db-back-btn:hover { border-color:var(--border-light); color:var(--text-primary); }

/* Form pieces */
.db-section { margin-bottom:18px; }
.db-label {
  display:block; font-size:0.66rem; text-transform:uppercase; letter-spacing:.1em;
  color:var(--text-muted); font-weight:700; margin-bottom:8px;
}
.db-input {
  width:100%; background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; padding:11px 13px; color:var(--text-primary);
  font-size:.88rem; font-family:'Nunito Sans',sans-serif; outline:none;
  transition:border-color .2s; box-sizing:border-box;
}
.db-input:focus { border-color:var(--zen); }
.db-select {
  width:100%; background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; padding:10px 12px; color:var(--text-primary);
  font-family:'Nunito Sans',sans-serif; font-size:.85rem; outline:none; cursor:pointer;
}

/* Strength grid */
.db-strength-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); gap:7px;
}
.db-strength-btn {
  display:flex; flex-direction:column; align-items:center; gap:4px;
  background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius);
  padding:10px 6px; font-family:'Nunito Sans',sans-serif; font-size:0.7rem;
  font-weight:700; color:var(--text-secondary); cursor:pointer; transition:all .2s; text-align:center;
}
.db-strength-btn .db-s-icon { font-size:1.35rem; }
.db-strength-btn .db-s-desc { font-size:0.58rem; color:var(--text-muted); font-weight:400; }
.db-strength-btn:hover { border-color:var(--border-light); color:var(--text-primary); }
.db-strength-btn.active { background:rgba(180,77,223,.12); border-color:var(--zen); color:var(--zen); }

/* Size buttons */
.db-size-row { display:flex; gap:7px; flex-wrap:wrap; }
.db-size-btn {
  flex:1; min-width:80px; background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; padding:9px 8px; font-family:'Nunito Sans',sans-serif;
  font-size:0.74rem; font-weight:700; color:var(--text-secondary); cursor:pointer;
  transition:all .2s; white-space:nowrap; text-align:center;
}
.db-size-btn:hover { border-color:var(--border-light); }
.db-size-btn.active { background:rgba(74,125,255,.1); border-color:var(--accent); color:var(--accent); }

/* Radio rows */
.db-radio-row {
  display:flex; align-items:center; gap:10px; padding:10px 13px;
  border:1px solid var(--border); border-radius:8px; background:var(--bg-card);
  cursor:pointer; transition:border-color .18s; font-size:.85rem; color:var(--text-primary);
}
.db-radio-row:hover { border-color:var(--border-light); }

/* Primary CTA */
.db-primary-btn {
  width:100%; padding:13px; border-radius:var(--radius); border:none;
  background:var(--zen); color:#fff; font-family:'Nunito Sans',sans-serif;
  font-size:.9rem; font-weight:700; cursor:pointer; transition:all .2s;
  display:flex; align-items:center; justify-content:center; gap:8px; letter-spacing:.03em;
}
.db-primary-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
.db-primary-btn:disabled { opacity:.4; cursor:not-allowed; }

/* Chamber picker grid */
.db-chamber-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(92px,1fr));
  gap:8px; max-height:340px; overflow-y:auto; padding:2px;
}
.db-chamber-chip {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  overflow:hidden; cursor:pointer; text-align:center; transition:all .2s; padding-bottom:6px;
}
.db-chamber-chip:hover { border-color:var(--air); transform:translateY(-2px); box-shadow:var(--shadow-md); }
.db-chamber-chip img { width:100%; aspect-ratio:3/4; object-fit:cover; display:block; }
.db-chamber-chip-name { font-size:0.6rem; font-weight:700; color:var(--text-primary); padding:4px 3px 0; line-height:1.2; word-break:break-word; }
.db-chamber-chip-num { font-size:0.54rem; color:var(--text-muted); }

/* Selected chamber bar */
.db-selected-chamber {
  display:flex; align-items:center; gap:10px;
  background:rgba(240,201,70,.05); border:1px solid rgba(240,201,70,.25);
  border-radius:var(--radius); padding:10px 12px; margin-bottom:6px;
}

/* ── BUILD CARD PICKER: matches main card grid exactly ─────── */
.db-pick-controls {
  display:flex; gap:7px; margin-bottom:10px; flex-wrap:wrap; align-items:center;
}
.db-pick-search {
  flex:1; min-width:130px; background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; padding:9px 12px; color:var(--text-primary);
  font-size:.82rem; font-family:'Nunito Sans',sans-serif; outline:none; transition:border-color .2s;
}
.db-pick-search:focus { border-color:var(--zen); }
.db-type-pill {
  background:var(--bg-card); border:1px solid var(--border); border-radius:99px;
  padding:6px 13px; font-size:0.72rem; font-weight:700; color:var(--text-secondary);
  cursor:pointer; font-family:'Nunito Sans',sans-serif; transition:all .18s; white-space:nowrap;
}
.db-type-pill:hover { border-color:var(--border-light); }
.db-type-pill.active { background:var(--zen); color:#fff; border-color:var(--zen); }

/* ── Build sort controls ───────────────────────────────────── */
.db-sort-row {
  display:flex; gap:7px; align-items:center; margin-bottom:10px; flex-wrap:wrap;
}
.db-sort-select {
  flex:1; min-width:130px; background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; padding:8px 10px; color:var(--text-secondary);
  font-family:'Nunito Sans',sans-serif; font-size:0.74rem; outline:none; cursor:pointer;
}
.db-sort-dir-btn {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  color:var(--text-secondary); font-size:0.85rem; padding:7px 11px;
  cursor:pointer; transition:all 0.2s; display:flex; align-items:center;
  justify-content:center; line-height:1;
}
.db-sort-dir-btn:hover { border-color:var(--accent); color:var(--accent); }

.db-progress-bar {
  display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:8px 12px; position:sticky; top:0; z-index:5;
}
.db-progress-label { font-size:0.72rem; color:var(--text-secondary); font-weight:600; }
.db-progress-count { font-family:'Cinzel',serif; font-size:0.82rem; font-weight:700; }

.db-cards-scroll { max-height:60vh; overflow-y:auto; padding-right:2px; }
.db-cards-scroll::-webkit-scrollbar { width:4px; }
.db-cards-scroll::-webkit-scrollbar-thumb { background:var(--border-light); border-radius:2px; }

/* Build card: reuse .card-item but add deck-specific overlays */
.db-build-card { cursor:pointer; }
.db-build-card.db-selected {
  border-color:var(--zen) !important;
  background:linear-gradient(135deg,var(--bg-card) 80%,rgba(180,77,223,.12)) !important;
  filter:drop-shadow(0 0 7px var(--zen)) !important;
}
.db-build-card.db-maxed {
  border-color:var(--promo) !important;
  filter:drop-shadow(0 0 5px var(--promo)) !important;
}

/* Qty overlay — shown on selected cards */
.db-build-qty-overlay {
  position:absolute; bottom:0; left:0; right:0;
  background:linear-gradient(transparent,rgba(0,0,0,.88));
  padding:28px 8px 9px;
  display:flex; align-items:center; justify-content:center; gap:8px;
  z-index:5;
}
.db-build-qty-minus, .db-build-qty-plus {
  width:26px; height:26px; border-radius:6px; border:none;
  background:rgba(180,77,223,.85); color:#fff; font-size:.88rem;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition:background .13s; flex-shrink:0; font-family:'Nunito Sans',sans-serif;
}
.db-build-qty-minus:hover, .db-build-qty-plus:hover { background:var(--zen); }
.db-build-qty-minus:disabled, .db-build-qty-plus:disabled { opacity:.3; cursor:not-allowed; }
.db-build-qty-num {
  font-size:.9rem; font-weight:700; color:#fff;
  min-width:18px; text-align:center; text-shadow:0 1px 3px rgba(0,0,0,.8);
}

/* Add overlay — visible on hover for unselected cards */
.db-build-add-overlay {
  position:absolute; bottom:8px; left:0; right:0;
  display:flex; align-items:center; justify-content:center;
  z-index:5; opacity:0; transition:opacity .18s; pointer-events:none;
}
.db-build-card:hover .db-build-add-overlay { opacity:1; pointer-events:auto; }
.db-build-add-btn {
  background:rgba(180,77,223,.9); color:#fff; border:none; border-radius:8px;
  padding:6px 18px; font-size:.74rem; font-weight:700;
  font-family:'Nunito Sans',sans-serif; cursor:pointer; transition:background .15s;
  backdrop-filter:blur(4px);
}
.db-build-add-btn:hover { background:var(--zen); }
.db-build-add-btn:disabled { opacity:.35; cursor:not-allowed; pointer-events:none; }

/* Stats view */
.db-stat-pill {
  font-size:.63rem; padding:2px 9px; border-radius:99px;
  border:1px solid; font-weight:700; white-space:nowrap; display:inline-block;
}

/* Checklist */
.db-checklist-item {
  display:flex; align-items:center; gap:9px;
  padding:8px 10px; border-bottom:1px solid var(--border);
  cursor:pointer; transition:background .13s; border-radius:6px;
}
.db-checklist-item:hover { background:var(--bg-card-hover); }
.db-checklist-item.is-chamber { background:rgba(240,201,70,.04); }
.db-checklist-item.is-checked { opacity:.48; }
.db-check-box {
  width:20px; height:20px; border-radius:5px; border:2px solid var(--border-light);
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  font-size:.65rem; color:var(--success); background:transparent; transition:all .13s;
}
.db-checklist-item.is-checked .db-check-box { background:rgba(61,184,108,.15); border-color:var(--success); }

@media (max-width:480px) {
  .db-deck-grid { grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:9px; }
  .db-strength-grid { grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); }
  .db-chamber-grid  { grid-template-columns:repeat(auto-fill,minmax(80px,1fr)); }
}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     VIEWS
  ═══════════════════════════════════════════════════════════════ */
  function getEl() { return document.getElementById('nested-digital-deckbuilder'); }

function render() {
  var el = getEl(); if (!el) return;

  // ── preserve card-picker scroll position across re-renders ──
  var scrollEl = el.querySelector('.db-cards-scroll');
  var savedScroll = scrollEl ? scrollEl.scrollTop : 0;

  switch (S.view) {
    case 'list':      el.innerHTML = vList();      break;
    case 'randomize': el.innerHTML = vRandomize(); break;
    case 'build':     el.innerHTML = vBuild();     break;
    case 'stats':     el.innerHTML = vStats();     break;
    case 'export':    el.innerHTML = vExport();    break;
  }
  wire();

  // ── restore scroll after the new DOM is in place ──
  var newScrollEl = el.querySelector('.db-cards-scroll');
  if (newScrollEl && savedScroll > 0) newScrollEl.scrollTop = savedScroll;
}

  /* ── POOL BAR ─────────────────────────────────────────────── */
  function poolBar() {
    return ['all','physical','digital'].map(function (p) {
      var lbl = { all:'🗃 All', physical:'📦 Physical', digital:'☁️ Digital' }[p];
      return '<button class="db-pool-btn'+(S.pool===p?' active':'')+'" data-pool="'+p+'">'+lbl+'</button>';
    }).join('');
  }

  /* ── LIST VIEW ──────────────────────────────────────────────── */
  function vList() {
    var allC = global.allCards || [];
    var deckCards = S.decks.map(function (deck) {
      var ch = allC.find(function (c) { return c.number === deck.chamber; });
      var totalStd = Object.values(deck.cards || {}).reduce(function(a,b){return a+b;},0);
      var img = ch ? cardImg(ch) : '';
      var entries = Object.keys(deck.cards||{}).map(function(n){
        var c=allC.find(function(x){return x.number===n;}); return c?{card:c,qty:deck.cards[n]}:null;
      }).filter(Boolean);
      if (ch) entries.unshift({card:ch,qty:1});
      var st = computeDeckStats(entries);
      return '<div class="db-deck-card" data-deck-id="'+esc(deck.id)+'">'
        +'<div class="db-deck-thumb" style="'+(img?'background-image:url('+esc(img)+')':'background:var(--bg-primary)')+'">'
          +'<div class="db-deck-overlay">'
            +'<div class="db-deck-name">'+esc(deck.name)+'</div>'
            +'<div class="db-deck-qty">'+totalStd+' cards + Chamber</div>'
          +'</div>'
        +'</div>'
        +'<div class="db-deck-footer">'
          +'<div class="db-deck-miniscores">'
            +'<span style="font-size:.58rem;color:var(--fire);">ATK '+st.attackScore+'%</span>'
            +'<span style="font-size:.58rem;color:var(--water);">DEF '+st.defenseScore+'%</span>'
            +'<span style="font-size:.58rem;color:var(--earth);">SUP '+st.supportScore+'%</span>'
          +'</div>'
          +'<div class="db-deck-actions">'
            +'<button class="db-mini-btn db-export-btn" data-deck-id="'+esc(deck.id)+'" title="Export"><i class="fas fa-file-export"></i></button>'
            +'<button class="db-mini-btn db-delete-btn" data-deck-id="'+esc(deck.id)+'" title="Delete"><i class="fas fa-trash"></i></button>'
          +'</div>'
        +'</div>'
      +'</div>';
    }).join('');

    return '<div class="db-wrap">'
      +'<div class="db-top-bar">'
        +'<div class="db-heading"><i class="fas fa-layer-group" style="color:var(--promo)"></i> Deck Builder</div>'
        +'<div class="db-pool-row">'+poolBar()+'</div>'
      +'</div>'
      +'<div class="db-mode-grid">'
        +'<button class="db-mode-card" id="dbBuildOwnBtn"><span class="db-mode-icon">🔨</span><span>Build Your Own</span></button>'
        +'<button class="db-mode-card" id="dbRandomizeBtn"><span class="db-mode-icon">🎲</span><span>Randomize</span></button>'
      +'</div>'
      +(S.decks.length===0
        ?'<div class="empty-state" style="padding:50px 20px;"><i class="fas fa-layer-group" style="font-size:2rem;opacity:.2;display:block;margin-bottom:10px;"></i><p>No saved decks yet.<br>Build or randomize your first deck!</p></div>'
        :'<div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;margin-bottom:10px;"><i class="fas fa-bookmark" style="margin-right:5px;"></i>Saved Decks ('+S.decks.length+')</div>'
          +'<div class="db-deck-grid">'+deckCards+'</div>'
      )
    +'</div>';
  }

  /* ── RANDOMIZE VIEW ─────────────────────────────────────────── */
  function vRandomize() {
    var pool     = getPoolCards();
    var chambers = getChamberCards(pool);
    var r        = S.rng;

    var strengthBtns = STRENGTHS.map(function (s) {
      return '<button class="db-strength-btn'+(r.strength===s.value?' active':'')+'" data-strength="'+s.value+'">'
        +'<span class="db-s-icon">'+s.icon+'</span>'
        +'<span>'+esc(s.label)+'</span>'
        +'<span class="db-s-desc">'+esc(s.desc)+'</span>'
      +'</button>';
    }).join('');

    var sizeBtns = ['full','half','custom'].map(function(sz){
      return '<button class="db-size-btn'+(r.deckSize===sz?' active':'')+'" data-size="'+sz+'" data-ctx="rng">'
        +{full:'Full (60+1)',half:'Half (30+1)',custom:'Custom'}[sz]+'</button>';
    }).join('');

    var chamberOpts = '<option value="">— randomizer picks best —</option>'
      + chambers.map(function(c){
        return '<option value="'+esc(c.number)+'"'+(r.chosenChamber===c.number?' selected':'')+'>'+esc(c.name)+' (#'+esc(c.number)+')</option>';
      }).join('');

    return '<div class="db-wrap">'
      +'<div class="db-back-row"><button class="db-back-btn" id="dbBack"><i class="fas fa-arrow-left"></i> Back</button>'
        +'<span style="font-family:\'Cinzel\',serif;font-weight:700;font-size:.92rem;">Randomize Deck</span>'
        +'<div style="margin-left:auto;"><div class="db-pool-row">'+poolBar()+'</div></div>'
      +'</div>'
      +'<div class="db-section"><label class="db-label">Deck Name</label>'
        +'<input class="db-input" id="rngName" type="text" placeholder="My Randomized Deck" value="'+esc(r.name)+'" maxlength="40">'
      +'</div>'
      +'<div class="db-section"><label class="db-label">Deck Strength</label><div class="db-strength-grid">'+strengthBtns+'</div></div>'
      +'<div class="db-section"><label class="db-label">Deck Size</label>'
        +'<div class="db-size-row">'+sizeBtns+'</div>'
        +(r.deckSize==='custom'?'<div style="margin-top:9px;display:flex;align-items:center;gap:9px;"><span style="font-size:.78rem;color:var(--text-secondary);">Standard cards:</span><input class="db-input" id="rngCustomSize" type="number" min="10" max="127" value="'+r.customSize+'" style="width:88px;"></div>':'')
      +'</div>'
      +'<div class="db-section"><label class="db-label">Chamber Card</label>'
        +'<div style="display:flex;flex-direction:column;gap:7px;">'
          +'<label class="db-radio-row" style="font-size:.82rem;"><input type="radio" name="chamberPick" value="auto" '+(r.selfPickChamber?'':'checked')+' style="margin-right:8px;"> Randomizer picks the best chamber for this strength</label>'
          +'<label class="db-radio-row" style="font-size:.82rem;"><input type="radio" name="chamberPick" value="self" '+(r.selfPickChamber?'checked':'')+' style="margin-right:8px;"> I\'ll choose my own</label>'
        +'</div>'
        +(r.selfPickChamber?'<select class="db-select" id="rngChamberSelect" style="margin-top:9px;">'+chamberOpts+'</select>':'')
        +(chambers.length===0?'<div style="color:var(--danger);font-size:.74rem;margin-top:6px;"><i class="fas fa-exclamation-circle"></i> No chamber cards in this pool.</div>':'')
      +'</div>'
      +'<button class="db-primary-btn" id="dbRandomizeGo"><i class="fas fa-dice-d20"></i> Randomize!</button>'
    +'</div>';
  }
/* ── Shared filter+sort used by both vBuild and autoCompleteDeck ── */
function getBuildFilteredSorted() {
  var pool        = getPoolCards();
  var b           = S.build;
  var chamberCard = b.chamber
    ? (global.allCards || []).find(function (c) { return c.number === b.chamber; })
    : null;
  if (!chamberCard) return [];

  var compatible = getStandardCards(pool).filter(function (c) {
    return isCompatibleWithChamber(c, chamberCard);
  });

  var searchVal = (b.search || '').toLowerCase();
  var filtered  = compatible.filter(function (c) {
    if (b.typeFilter !== 'all' && c.type !== b.typeFilter) return false;
    if (searchVal) {
      return c.name.toLowerCase().indexOf(searchVal) !== -1
          || c.number.toLowerCase().indexOf(searchVal) !== -1;
    }
    return true;
  });

  var sortBy  = b.sortBy  || 'number';
  var sortDir = b.sortDir || 'asc';
  var _dir    = sortDir === 'asc' ? 1 : -1;
  var _ro     = { common: 0, uncommon: 1, rare: 2, zenemental: 3, promo: 4 };

  filtered.sort(function (a, b2) {
    if (sortBy === 'name')    return _dir * a.name.localeCompare(b2.name);
    if (sortBy === 'rarity')  return _dir * ((_ro[a.rarity] || 0) - (_ro[b2.rarity] || 0));
    if (sortBy === 'type')    return _dir * a.type.localeCompare(b2.type);
    if (sortBy === 'intercept') {
      var iA = parseFloat(a.intercept)  || 0;
      var iB = parseFloat(b2.intercept) || 0;
      return _dir * (iA - iB);
    }
    if (sortBy === 'force') {
      var fA = parseFloat(a.force)  || 0;
      var fB = parseFloat(b2.force) || 0;
      return _dir * (fA - fB);
    }
    if (sortBy === 'energy') {
      function sumE(c) {
        return (parseFloat(c.redEnergy) || 0)
             + (parseFloat(c.yellowEnergy) || 0)
             + (parseFloat(c.greenEnergy) || 0);
      }
      return _dir * (sumE(a) - sumE(b2));
    }
    var nA = parseInt(a.number, 10), nB = parseInt(b2.number, 10);
    if (!isNaN(nA) && !isNaN(nB)) return _dir * (nA - nB);
    return _dir * a.number.localeCompare(b2.number);
  });

  return filtered;
}
function autoCompleteDeck() {
  var b          = S.build;
  var targetSize = b.deckSize === 'full' ? 60 : b.deckSize === 'half' ? 30 : b.customSize;
  var total      = Object.values(b.cards).reduce(function (a, v) { return a + v; }, 0);
  if (total >= targetSize) { toast('Deck is already full!'); return; }

  var sorted = getBuildFilteredSorted();
  if (sorted.length === 0) { toast('No compatible cards to fill from.'); return; }

  /* First pass: top up each card to its max, in sorted order */
  for (var i = 0; i < sorted.length && total < targetSize; i++) {
    var c   = sorted[i];
    var cur = b.cards[c.number] || 0;
    var max = maxCopiesForCard(c.number);
    var can = Math.min(max - cur, targetSize - total);
    if (can > 0) {
      b.cards[c.number] = cur + can;
      total += can;
    }
  }

  render();
  toast('Deck auto-completed!');
}
  /* ── BUILD VIEW ─────────────────────────────────────────────── */
  function vBuild() {
    var pool      = getPoolCards();
    var chambers  = getChamberCards(pool);
    var b         = S.build;
    var chamberCard = b.chamber ? (global.allCards||[]).find(function(c){return c.number===b.chamber;}) : null;
    if (b.chamber && !chamberCard) chamberCard = pool.find(function(c){return c.number===b.chamber;});

    var sizeBtns = ['full','half','custom'].map(function(sz){
      return '<button class="db-size-btn'+(b.deckSize===sz?' active':'')+'" data-size="'+sz+'" data-ctx="build">'
        +{full:'Full (60+1)',half:'Half (30+1)',custom:'Custom'}[sz]+'</button>';
    }).join('');

    var targetSize = b.deckSize==='full'?60:b.deckSize==='half'?30:b.customSize;
    var totalSelected = Object.values(b.cards).reduce(function(a,v){return a+v;},0);
    var remaining     = targetSize - totalSelected;
    var pctFull       = Math.min(100, Math.round((totalSelected/targetSize)*100));

    var body = '';

    if (!chamberCard) {
      /* ── Step 1: pick chamber ── */
      var chipHtml = chambers.map(function(c){
        return '<div class="db-chamber-chip" data-chamber="'+esc(c.number)+'">'
          +'<img src="'+esc(cardImg(c))+'" alt="'+esc(c.name)+'" loading="lazy" onerror="this.style.display=\'none\'">'
          +'<div class="db-chamber-chip-name">'+esc(c.name)+'</div>'
          +'<div class="db-chamber-chip-num">#'+esc(c.number)+'</div>'
        +'</div>';
      }).join('');
      body = '<div class="db-section"><label class="db-label">Choose Chamber Card</label>'
        +(chambers.length===0?'<div style="color:var(--danger);font-size:.8rem;">No chamber cards available in this pool.</div>':'')
        +'<div class="db-chamber-grid">'+chipHtml+'</div>'
      +'</div>';
    } else {
      /* ── Step 2: pick standard cards — uses main card-grid style ── */
      var compatible = getStandardCards(pool).filter(function(c){
        return isCompatibleWithChamber(c, chamberCard);
      });

      var searchVal = (b.search||'').toLowerCase();
      var typeOpts  = ['all'].concat(
        compatible.map(function(c){return c.type;}).filter(function(t,i,a){return a.indexOf(t)===i;}).sort()
      );
      var filtered  = compatible.filter(function(c){
        if (b.typeFilter !== 'all' && c.type !== b.typeFilter) return false;
        if (searchVal) {
          return c.name.toLowerCase().indexOf(searchVal)!==-1
            || c.number.toLowerCase().indexOf(searchVal)!==-1;
        }
        return true;
      });

      /* ── Multi-key sort matching the main card collection page ── */
      var sortBy  = b.sortBy  || 'number';
      var sortDir = b.sortDir || 'asc';
      var _dir = sortDir === 'asc' ? 1 : -1;
      var _rarityOrd = { common:0, uncommon:1, rare:2, zenemental:3, promo:4 };

      filtered.sort(function(a, b2) {
        if (sortBy === 'name') return _dir * a.name.localeCompare(b2.name);
        if (sortBy === 'rarity') return _dir * ((_rarityOrd[a.rarity]||0) - (_rarityOrd[b2.rarity]||0));
        if (sortBy === 'type')  return _dir * a.type.localeCompare(b2.type);
        if (sortBy === 'intercept') {
          var iA = a.type===CHAMBER_TYPE ? Math.max(parseFloat(a.chamberFrontI)||0, parseFloat(a.chamberBackI)||0) : parseFloat(a.intercept)||0;
          var iB = b2.type===CHAMBER_TYPE ? Math.max(parseFloat(b2.chamberFrontI)||0, parseFloat(b2.chamberBackI)||0) : parseFloat(b2.intercept)||0;
          return _dir * (iA - iB);
        }
        if (sortBy === 'force') {
          var fA = a.type===CHAMBER_TYPE ? Math.max(parseFloat(a.chamberFrontF)||0, parseFloat(a.chamberBackF)||0) : parseFloat(a.force)||0;
          var fB = b2.type===CHAMBER_TYPE ? Math.max(parseFloat(b2.chamberFrontF)||0, parseFloat(b2.chamberBackF)||0) : parseFloat(b2.force)||0;
          return _dir * (fA - fB);
        }
        if (sortBy === 'energy') {
          function sumE(c) {
            if (c.type===CHAMBER_TYPE) {
              return Math.max(parseFloat(c.chamberFrontR)||0, parseFloat(c.chamberBackR)||0)
                   + Math.max(parseFloat(c.chamberFrontY)||0, parseFloat(c.chamberBackY)||0)
                   + Math.max(parseFloat(c.chamberFrontG)||0, parseFloat(c.chamberBackG)||0);
            }
            return (parseFloat(c.redEnergy)||0)+(parseFloat(c.yellowEnergy)||0)+(parseFloat(c.greenEnergy)||0);
          }
          return _dir * (sumE(a) - sumE(b2));
        }
        /* default: number */
        var nA=parseInt(a.number,10), nB=parseInt(b2.number,10);
        if(!isNaN(nA)&&!isNaN(nB)) return _dir * (nA - nB);
        return _dir * a.number.localeCompare(b2.number);
      });

      var typePills = typeOpts.map(function(t){
        return '<button class="db-type-pill'+(b.typeFilter===t?' active':'')+'" data-type="'+esc(t)+'">'+esc(t==='all'?'All Types':t)+'</button>';
      }).join('');

      /* Build card HTML — same structure as main renderCards() */
      var cardHtml = filtered.map(function(c){
        var qty   = b.cards[c.number] || 0;
        var maxCp = maxCopiesForCard(c.number);
        var poolQ = availableQty(c.number);
        var sel   = qty > 0;
        var maxed = qty >= maxCp;
        var rc    = RARITY_COLORS[c.rarity] || 'var(--text-secondary)';
        var backImg = c.backImageLink || '';

        /* Flip inner */
        var flipHtml =
          '<div class="card-flip-container">'
            +'<div class="card-flip-inner" data-flip-id="db-'+esc(c.number)+'">'
              +'<div class="card-flip-front">'
                +'<img src="'+esc(cardImg(c))+'" alt="'+esc(c.name)+'" loading="lazy" onerror="this.style.display=\'none\'">'
              +'</div>'
              +'<div class="card-flip-back">'
                +(backImg
                  ?'<img src="'+esc(backImg)+'" alt="'+esc(c.name)+' back" loading="lazy" onerror="this.style.display=\'none\'">'
                  :'<div class="card-img-placeholder"><i class="fas fa-hat-wizard"></i></div>')
              +'</div>'
            +'</div>'
          +'</div>';

        /* Qty overlay (shown when selected) */
        var qtyOverlayHtml = sel
          ? '<div class="db-build-qty-overlay">'
              +'<button class="db-build-qty-minus" data-card="'+esc(c.number)+'"'+(qty<=1?' disabled':'')+'>−</button>'
              +'<span class="db-build-qty-num">'+qty+'</span>'
              +'<button class="db-build-qty-plus" data-card="'+esc(c.number)+'"'+(maxed||remaining<=0?' disabled':'')+'>+</button>'
            +'</div>'
          : '';

        /* Add overlay (shown on hover when not selected) */
        var addOverlayHtml = !sel
          ? '<div class="db-build-add-overlay">'
              +'<button class="db-build-add-btn" data-card="'+esc(c.number)+'"'+(remaining<=0?' disabled':'')+'>+ Add</button>'
            +'</div>'
          : '';

        return '<div class="card-item db-build-card'+(sel?' db-selected':'')+(maxed?' db-maxed':'')+'" data-card="'+esc(c.number)+'" style="--rarity-color:'+rc+'">'
          +'<div class="card-img-wrap" style="position:relative;">'
            +flipHtml
            +'<span class="card-number-badge">#'+esc(c.number)+(S.pool!=='all'?' ('+poolQ+')':'')+'</span>'
            +(sel?'<span class="card-qty-badge">x'+qty+'</span>':'')
            +(maxed?'<span class="card-owned-badge" style="background:var(--promo);" title="Max copies"><i class="fas fa-lock"></i></span>':'')
            +'<button class="card-flip-btn db-build-flip-btn" data-flip-target="db-'+esc(c.number)+'" title="Flip View"><i class="fas fa-rotate"></i></button>'
            +qtyOverlayHtml
            +addOverlayHtml
          +'</div>'
          +'<div class="card-info">'
            +'<div class="card-name" title="'+esc(c.name)+'">'+esc(c.name)+'</div>'
            +'<div class="card-meta">'
              +'<span class="card-type-tag tag-'+esc(c.type)+'">'+esc(c.type)+'</span>'
              +'<span class="card-rarity-dot dot-'+esc(c.rarity)+'"></span>'
              +'<span class="card-rarity-label rarity-'+esc(c.rarity)+'">'+esc(c.rarity)+'</span>'
            +'</div>'
          +'</div>'
        +'</div>';
      }).join('');

      var progressColor = remaining<0?'var(--danger)':remaining===0?'var(--success)':'var(--zen)';
      var progressText  = remaining===0?'✓ Complete':remaining<0?'Over by '+Math.abs(remaining):remaining+' more';
      var chamberTraitList = getChamberTraits(chamberCard);

      body = ''
        +'<div class="db-section"><label class="db-label">Chamber Card</label>'
          +'<div class="db-selected-chamber">'
            +'<img src="'+esc(cardImg(chamberCard))+'" alt="" style="width:48px;height:64px;object-fit:cover;border-radius:6px;" loading="lazy">'
            +'<div style="flex:1;min-width:0;">'
              +'<div style="font-weight:700;font-size:.85rem;">'+esc(chamberCard.name)+'</div>'
              +'<div style="font-size:.65rem;color:var(--text-muted);">#'+esc(chamberCard.number)+'</div>'
              +(chamberTraitList.length>0?'<div style="font-size:.64rem;color:var(--air);margin-top:2px;">Traits: '+esc(chamberTraitList.join(', '))+'</div>':'')
            +'</div>'
            +'<button class="db-mini-btn" id="dbChangeChamber">↩ Change</button>'
          +'</div>'
        +'</div>'

        +'<div class="db-section">'
          +'<div class="db-progress-bar">'
          +'<span class="db-progress-label">Cards selected</span>'
          +'<span class="db-progress-count" style="color:'+progressColor+'">'+totalSelected+' / '+targetSize+'  '+progressText+'</span>'
          +(remaining > 0
            ? '<button class="db-mini-btn" id="dbAutoCompleteBtn" title="Fill remaining slots using current sort order" style="border-color:var(--zen);color:var(--zen);margin-left:8px;white-space:nowrap;"><i class="fas fa-wand-magic-sparkles"></i> Auto-fill</button>'
            : '')
        +'</div>'
          +'<div style="height:4px;background:var(--bg-primary);border-radius:99px;overflow:hidden;margin-bottom:12px;">'
            +'<div style="height:100%;width:'+pctFull+'%;background:'+progressColor+';border-radius:99px;transition:width .3s;"></div>'
          +'</div>'

          +'<label class="db-label">Compatible Standard Cards ('+compatible.length+')'
            +(chamberTraitList.length>0?' — matching: <span style="color:var(--air);">'+esc(chamberTraitList.join(', '))+'</span>':'')+'</label>'

          +'<div class="db-pick-controls">'
            +'<input class="db-pick-search" id="buildSearch" type="text" placeholder="Search\u2026" value="'+esc(b.search||'')+'">'
            +typePills
          +'</div>'
          +'<div class="db-sort-row">'
            +'<select class="db-sort-select" id="buildSortBy">'
              +'<option value="number"'+(sortBy==='number'?' selected':'')+'>Sort: Number</option>'
              +'<option value="name"'+(sortBy==='name'?' selected':'')+'>Sort: Name</option>'
              +'<option value="rarity"'+(sortBy==='rarity'?' selected':'')+'>Sort: Rarity</option>'
              +'<option value="type"'+(sortBy==='type'?' selected':'')+'>Sort: Type</option>'
              +'<option value="intercept"'+(sortBy==='intercept'?' selected':'')+'>Sort: Intercept</option>'
              +'<option value="force"'+(sortBy==='force'?' selected':'')+'>Sort: Force</option>'
              +'<option value="energy"'+(sortBy==='energy'?' selected':'')+'>Sort: Energy</option>'
            +'</select>'
            +'<button class="db-sort-dir-btn" id="buildSortDir" title="'+(sortDir==='asc'?'Ascending \u2014 click to reverse':'Descending \u2014 click to reverse')+'">'
              +'<i class="fas fa-arrow-'+(sortDir==='asc'?'up-short-wide':'down-wide-short')+'"></i>'
            +'</button>'
          +'</div>'

          +'<div class="db-cards-scroll">'
            +(filtered.length===0
              ?'<div style="color:var(--text-muted);font-size:.8rem;padding:14px 0;">No cards match filter.</div>'
              :'<div class="card-grid" style="padding-bottom:8px;">'+cardHtml+'</div>'
            )
          +'</div>'
        +'</div>'

        +'<button class="db-primary-btn" id="dbSaveDeckBtn" '+(totalSelected===0?'disabled':'')+' style="'+(totalSelected===0?'opacity:.4;cursor:not-allowed':'')+'"><i class="fas fa-save"></i> Save Deck</button>';
    }

    return '<div class="db-wrap">'
      +'<div class="db-back-row">'
        +'<button class="db-back-btn" id="dbBack"><i class="fas fa-arrow-left"></i> Back</button>'
        +'<span style="font-family:\'Cinzel\',serif;font-weight:700;font-size:.92rem;">Build Your Own</span>'
        +'<div style="margin-left:auto;"><div class="db-pool-row">'+poolBar()+'</div></div>'
      +'</div>'
      +'<div class="db-section"><label class="db-label">Deck Name</label>'
        +'<input class="db-input" id="buildName" type="text" placeholder="My Deck" value="'+esc(b.name)+'" maxlength="40">'
      +'</div>'
      +'<div class="db-section"><label class="db-label">Deck Size</label>'
        +'<div class="db-size-row">'+sizeBtns+'</div>'
        +(b.deckSize==='custom'?'<div style="margin-top:9px;display:flex;align-items:center;gap:9px;"><span style="font-size:.78rem;color:var(--text-secondary);">Standard cards:</span><input class="db-input" id="buildCustomSize" type="number" min="10" max="127" value="'+b.customSize+'" style="width:88px;"></div>':'')
      +'</div>'
      +body
    +'</div>';
  }

  /* ── STATS VIEW ─────────────────────────────────────────────── */
  function vStats() {
    var deck = S.viewingDeck; if (!deck) { S.view='list'; return vList(); }
    var allC = global.allCards||[];
    var ch   = allC.find(function(c){return c.number===deck.chamber;});
    var entries = Object.keys(deck.cards||{}).map(function(n){
      var c=allC.find(function(x){return x.number===n;}); return c?{card:c,qty:deck.cards[n]}:null;
    }).filter(Boolean);
    if (ch) entries.unshift({card:ch,qty:1});
    var st       = computeDeckStats(entries);
    var totalStd = Object.values(deck.cards||{}).reduce(function(a,v){return a+v;},0);

    var typeCount = {};
    entries.forEach(function(e){
      var t=(e.card.type||'other'); typeCount[t]=(typeCount[t]||0)+e.qty;
    });
    var typeRows = Object.keys(typeCount).sort().map(function(t){
      var pct=Math.round((typeCount[t]/(totalStd+1))*100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        +'<span style="font-size:.74rem;color:var(--text-secondary);text-transform:capitalize;min-width:80px;">'+esc(t)+'</span>'
        +'<div style="flex:1;height:5px;background:var(--bg-primary);border-radius:99px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:var(--zen);border-radius:99px;"></div></div>'
        +'<span style="font-size:.68rem;color:var(--text-muted);min-width:56px;text-align:right;">'+typeCount[t]+' ('+pct+'%)</span>'
      +'</div>';
    }).join('');

    var sortedEntries = entries.slice().sort(function(a,b2){
      if((a.card.type===CHAMBER_TYPE)!==(b2.card.type===CHAMBER_TYPE)) return a.card.type===CHAMBER_TYPE?-1:1;
      var nA=parseInt(a.card.number,10),nB=parseInt(b2.card.number,10);
      if(!isNaN(nA)&&!isNaN(nB)) return nA-nB;
      return a.card.number.localeCompare(b2.card.number);
    });

    var cardListHtml = sortedEntries.map(function(e){
      var rd=dotColor(e.card.rarity);
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">'
        +'<img src="'+esc(cardImg(e.card))+'" alt="" style="width:30px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;" loading="lazy">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:.76rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(e.card.name)+'</div>'
          +'<div style="display:flex;align-items:center;gap:5px;margin-top:2px;">'
            +'<span style="width:6px;height:6px;border-radius:50%;background:'+rd+';display:inline-block;flex-shrink:0;"></span>'
            +'<span style="font-size:.6rem;color:var(--text-muted);text-transform:capitalize;">'+esc(e.card.type)+'</span>'
            +'<span style="font-size:.58rem;color:var(--text-muted);">#'+esc(e.card.number)+'</span>'
            +(e.card.type===CHAMBER_TYPE?'<span class="db-stat-pill" style="color:var(--air);border-color:rgba(240,201,70,.25);background:rgba(240,201,70,.1);font-size:.56rem;">CHAMBER</span>':'')
          +'</div>'
        +'</div>'
        +(e.card.type!==CHAMBER_TYPE?'<span style="font-family:\'Cinzel\',serif;font-size:.76rem;font-weight:700;color:var(--text-primary);">x'+e.qty+'</span>':'')
      +'</div>';
    }).join('');

    return '<div class="db-wrap">'
      +'<div class="db-back-row">'
        +'<button class="db-back-btn" id="dbBack"><i class="fas fa-arrow-left"></i> Back</button>'
        +'<button class="db-mini-btn db-export-btn" data-deck-id="'+esc(deck.id)+'" style="margin-left:auto;"><i class="fas fa-file-export"></i> Export</button>'
      +'</div>'
      +'<div style="display:flex;gap:12px;align-items:flex-start;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;margin-bottom:14px;">'
        +(ch?'<img src="'+esc(cardImg(ch))+'" alt="" style="width:56px;height:74px;object-fit:cover;border-radius:6px;flex-shrink:0;" loading="lazy">':'')
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:.98rem;margin-bottom:4px;">'+esc(deck.name)+'</div>'
          +'<div style="font-size:.68rem;color:var(--text-muted);margin-bottom:7px;">'
            +(ch?esc(ch.name)+' &bull; ':'')+(totalStd)+' standard cards'
            +(deck.strength?' &bull; '+esc(strengthLabel(deck.strength)):'')
          +'</div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap;">'
            +'<span class="db-stat-pill" style="color:var(--fire);border-color:rgba(232,83,46,.25);background:rgba(232,83,46,.08);">ATK '+st.attackScore+'%</span>'
            +'<span class="db-stat-pill" style="color:var(--water);border-color:rgba(46,140,232,.25);background:rgba(46,140,232,.08);">DEF '+st.defenseScore+'%</span>'
            +'<span class="db-stat-pill" style="color:var(--earth);border-color:rgba(92,184,92,.25);background:rgba(92,184,92,.08);">SUP '+st.supportScore+'%</span>'
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">'
        +'<div style="flex-shrink:0;">'+svgRadar(st.attackScore,st.defenseScore,st.supportScore)+'</div>'
        +'<div style="flex:1;min-width:110px;">'
          +'<div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;margin-bottom:10px;">Average Stats</div>'
          +'<div style="font-size:.78rem;margin-bottom:5px;"><span style="color:var(--fire);font-weight:700;">Force:</span> <span style="color:var(--text-primary);">'+st.avgForce+'</span></div>'
          +'<div style="font-size:.78rem;margin-bottom:5px;"><span style="color:var(--water);font-weight:700;">Intercept:</span> <span style="color:var(--text-primary);">'+st.avgIntercept+'</span></div>'
          +'<div style="font-size:.78rem;margin-bottom:5px;"><span style="color:var(--earth);font-weight:700;">Avg Energy:</span> <span style="color:var(--text-primary);">'+st.avgEnergy+'</span></div>'
          +'<div style="font-size:.78rem;"><span style="color:var(--zen);font-weight:700;">Rules Text:</span> <span style="color:var(--text-primary);">'+st.rulesC+' cards</span></div>'
        +'</div>'
      +'</div>'
      +'<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px;">'
        +'<div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;margin-bottom:12px;">Card Composition</div>'
        +typeRows
      +'</div>'
      +'<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;">'
        +'<div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;margin-bottom:8px;">Full Card List ('+(totalStd+1)+' total)</div>'
        +cardListHtml
      +'</div>'
    +'</div>';
  }

  /* ── EXPORT / CHECKLIST VIEW ─────────────────────────────── */
  function vExport() {
    var deck = S.viewingDeck; if (!deck) { S.view='list'; return vList(); }
    var entries     = buildExportEntries(deck, S.exportSortMode||'number');
    var checked     = S.exportChecked||{};
    var checkedCount= Object.values(checked).filter(Boolean).length;
    var total       = entries.length;
    var pct         = total>0?Math.round((checkedCount/total)*100):0;
    var code        = deck.encoded || encodeDeck(deck);

    var sortOpts = [
      {v:'number',l:'Card Number'},
      {v:'type-number',l:'Type → Number'},
      {v:'name',l:'Name A–Z'},
      {v:'rarity',l:'Rarity'}
    ].map(function(o){
      return '<option value="'+o.v+'"'+(S.exportSortMode===o.v?' selected':'')+'>'+o.l+'</option>';
    }).join('');

    var items = entries.map(function(e){
      var id      = e.card.number+(e.isChamber?'_ch':'');
      var isCheck = checked[id]||false;
      return '<div class="db-checklist-item'+(isCheck?' is-checked':'')+(e.isChamber?' is-chamber':'')+'" data-check-id="'+esc(id)+'">'
        +'<div class="db-check-box" data-check-id="'+esc(id)+'">'+(isCheck?'<i class="fas fa-check"></i>':'')+'</div>'
        +'<img src="'+esc(cardImg(e.card))+'" alt="" style="width:28px;height:37px;object-fit:cover;border-radius:4px;flex-shrink:0;" loading="lazy">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:.76rem;font-weight:700;'+(isCheck?'text-decoration:line-through;':'')+'">'+esc(e.card.name)+'</div>'
          +'<div style="font-size:.6rem;color:var(--text-muted);">#'+esc(e.card.number)+' &bull; '+esc(e.card.type)+' &bull; '+esc(e.card.rarity)+(e.isChamber?' &bull; <span style="color:var(--air);">CHAMBER</span>':'')+'</div>'
        +'</div>'
        +(!e.isChamber?'<span style="font-size:.72rem;font-weight:700;color:var(--text-secondary);flex-shrink:0;">x'+e.qty+'</span>':'')
      +'</div>';
    }).join('');

    return '<div class="db-wrap">'
      +'<div class="db-back-row">'
        +'<button class="db-back-btn" id="dbBack"><i class="fas fa-arrow-left"></i> Back</button>'
        +'<span style="font-family:\'Cinzel\',serif;font-weight:700;font-size:.82rem;">'+esc(deck.name)+' — Checklist</span>'
      +'</div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:11px;">'
        +'<select class="db-select" id="exportSortSelect" style="font-size:.76rem;flex:1;min-width:140px;">'+sortOpts+'</select>'
        +'<button class="db-mini-btn" id="exportClearChecks">Clear All</button>'
        +'<button class="db-mini-btn" id="exportCopyCode" style="border-color:var(--zen);color:var(--zen);"><i class="fas fa-copy"></i> Copy Code</button>'
        +'<button class="db-mini-btn" id="exportCSV" style="border-color:var(--accent);color:var(--accent);"><i class="fas fa-file-csv"></i> CSV</button>'
      +'</div>'
      +'<div style="font-size:.7rem;color:var(--text-muted);margin-bottom:8px;">'+checkedCount+' / '+total+' collected</div>'
      +'<div style="height:4px;background:var(--bg-primary);border-radius:99px;overflow:hidden;margin-bottom:12px;">'
        +'<div style="height:100%;width:'+pct+'%;background:var(--success);border-radius:99px;transition:width .3s;"></div>'
      +'</div>'
      +'<div style="font-size:.58rem;color:var(--text-muted);margin-bottom:4px;display:flex;justify-content:space-between;">'
        +'<span>Deck Code <span style="opacity:.6;">(select to copy manually)</span></span>'
        +'<span style="color:var(--zen);font-size:.58rem;">AQSD1 format</span>'
      +'</div>'
      +'<div id="exportCodeDisplay" style="font-family:monospace;font-size:.6rem;color:var(--zen);word-break:break-all;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:14px;cursor:text;user-select:all;-webkit-user-select:all;">'+esc(code)+'</div>'
      +'<div id="dbChecklistContainer">'+items+'</div>'
    +'</div>';
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT WIRING
  ═══════════════════════════════════════════════════════════════ */
  function wire() {
    var el = getEl(); if (!el) return;

    /* Pool buttons */
    el.querySelectorAll('.db-pool-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ S.pool=this.dataset.pool; render(); });
    });

    /* ── LIST ──────────────────────────────────────────────── */
    var bOwn = document.getElementById('dbBuildOwnBtn');
    if (bOwn) bOwn.addEventListener('click', function(){
      S.view='build';
      S.build={name:'',deckSize:'full',customSize:60,chamber:null,cards:{},typeFilter:'all',search:'',sortBy:'number',sortDir:'asc'};
      render();
    });
    var bRng = document.getElementById('dbRandomizeBtn');
    if (bRng) bRng.addEventListener('click', function(){ S.view='randomize'; render(); });

    el.querySelectorAll('.db-deck-card').forEach(function(card){
      card.addEventListener('click', function(e){
        if (e.target.closest('.db-mini-btn')) return;
        var d=S.decks.find(function(x){return x.id===this.dataset.deckId;}.bind(this));
        if (d) { S.viewingDeck=d; S.view='stats'; render(); }
      });
    });

    el.querySelectorAll('.db-export-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id=this.dataset.deckId||(S.viewingDeck&&S.viewingDeck.id);
        var d=S.decks.find(function(x){return x.id===id;});
        if (d){ S.viewingDeck=d; S.view='export'; S.exportChecked={}; S.exportSortMode='number'; render(); }
      });
    });

    el.querySelectorAll('.db-delete-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id=this.dataset.deckId;
        if (!confirm('Delete this deck? This cannot be undone.')) return;
        removeDeck(id);
        if (S.viewingDeck && S.viewingDeck.id===id){ S.viewingDeck=null; S.view='list'; }
        render(); toast('Deck deleted.');
      });
    });

    /* ── BACK ─────────────────────────────────────────────── */
    var backBtn=document.getElementById('dbBack');
    if (backBtn) backBtn.addEventListener('click', function(){
      if (S.view==='export'){ S.view='stats'; }
      else { S.view='list'; S.exportChecked={}; }
      render();
    });

    /* ── RANDOMIZE ────────────────────────────────────────── */
    var rngName=document.getElementById('rngName');
    if (rngName) rngName.addEventListener('input',function(){ S.rng.name=this.value; });

    var rngCS=document.getElementById('rngCustomSize');
    if (rngCS) rngCS.addEventListener('change',function(){ S.rng.customSize=Math.max(10,Math.min(127,parseInt(this.value,10)||60)); });

    el.querySelectorAll('.db-strength-btn').forEach(function(btn){
      btn.addEventListener('click',function(){ S.rng.strength=this.dataset.strength; render(); });
    });

    el.querySelectorAll('[name="chamberPick"]').forEach(function(radio){
      radio.addEventListener('change',function(){
        S.rng.selfPickChamber=(this.value==='self'); render();
      });
    });

    var rngCS2=document.getElementById('rngChamberSelect');
    if (rngCS2) rngCS2.addEventListener('change',function(){ S.rng.chosenChamber=this.value||null; });

    var goBtn=document.getElementById('dbRandomizeGo');
    if (goBtn) goBtn.addEventListener('click', function(){
      var r=S.rng;
      var pool=getPoolCards();
      var chambers=getChamberCards(pool);
      var chosenChamber=null;
      if (r.selfPickChamber){
        if (!r.chosenChamber){ toast('Please select a chamber card.'); return; }
        chosenChamber=pool.find(function(c){return c.number===r.chosenChamber;});
        if (!chosenChamber){ toast('Selected chamber not available in this pool.'); return; }
      }
      if (chambers.length===0&&!chosenChamber){ toast('No chamber cards available in this pool.'); return; }
      var name=(r.name.trim()||('Randomized Deck '+(S.decks.length+1)));
      var deck=buildRandomDeck({name:name,strength:r.strength,deckSize:r.deckSize,customSize:r.customSize,chamber:chosenChamber});
      if (!deck){ toast('Not enough compatible cards to fill deck.'); return; }
      persistDeck(deck);
      S.viewingDeck=deck; S.view='stats';
      toast('Deck randomized & saved!'); render();
    });

    /* ── BUILD ───────────────────────────────────────────── */
    var bName=document.getElementById('buildName');
    if (bName) bName.addEventListener('input',function(){ S.build.name=this.value; });

    var bCS=document.getElementById('buildCustomSize');
    if (bCS) bCS.addEventListener('change',function(){ S.build.customSize=Math.max(10,Math.min(127,parseInt(this.value,10)||60)); });

    var autoFillBtn = document.getElementById('dbAutoCompleteBtn');
    if (autoFillBtn) autoFillBtn.addEventListener('click', autoCompleteDeck);

    el.querySelectorAll('.db-size-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        var sz=this.dataset.size;
        if (this.dataset.ctx==='build') S.build.deckSize=sz; else S.rng.deckSize=sz;
        render();
      });
    });

    el.querySelectorAll('.db-chamber-chip').forEach(function(chip){
      chip.addEventListener('click',function(){
        S.build.chamber=this.dataset.chamber; S.build.cards={}; render();
      });
    });

    var changeCh=document.getElementById('dbChangeChamber');
    if (changeCh) changeCh.addEventListener('click',function(){ S.build.chamber=null; S.build.cards={}; render(); });

    var bSearch=document.getElementById('buildSearch');
    if (bSearch) bSearch.addEventListener('input',function(){ S.build.search=this.value; render(); });

    el.querySelectorAll('.db-type-pill').forEach(function(pill){
      pill.addEventListener('click',function(){ S.build.typeFilter=this.dataset.type; render(); });
    });

    /* ── BUILD SORT CONTROLS ─────────────────────────────── */
    var bSortBy=document.getElementById('buildSortBy');
    if(bSortBy){
      bSortBy.addEventListener('change',function(){
        S.build.sortBy=this.value;
        /* Default to descending for stat-heavy sorts, ascending for name/type/number */
        S.build.sortDir=['rarity','intercept','force','energy'].indexOf(this.value)!==-1?'desc':'asc';
        render();
      });
    }

    var bSortDir=document.getElementById('buildSortDir');
    if(bSortDir){
      bSortDir.addEventListener('click',function(){
        S.build.sortDir=S.build.sortDir==='asc'?'desc':'asc';
        render();
      });
    }

    /* ── BUILD CARD INTERACTIONS ────────────────────────── */

    /* Flip buttons in the build grid */
    el.querySelectorAll('.db-build-flip-btn').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var target=this.dataset.flipTarget;
        var inner=el.querySelector('.card-flip-inner[data-flip-id="'+target+'"]');
        if (inner){ inner.classList.toggle('flipped'); this.classList.toggle('is-flipped'); }
      });
    });

    /* + button (qty increase on selected cards) */
    el.querySelectorAll('.db-build-qty-plus').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var n=this.dataset.card;
        S.build.cards[n]=(S.build.cards[n]||0)+1;
        render();
      });
    });

    /* − button (qty decrease on selected cards) */
    el.querySelectorAll('.db-build-qty-minus').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var n=this.dataset.card;
        var cur=S.build.cards[n]||0;
        if (cur<=1) delete S.build.cards[n]; else S.build.cards[n]=cur-1;
        render();
      });
    });

    /* Add button (hover overlay on unselected cards) */
    el.querySelectorAll('.db-build-add-btn').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var n=this.dataset.card;
        S.build.cards[n]=(S.build.cards[n]||0)+1;
        render();
      });
    });

    /* Click on card body itself: toggle add/remove */
    el.querySelectorAll('.db-build-card').forEach(function(chip){
      chip.addEventListener('click',function(e){
        if (e.target.closest('button')) return;
        var n=this.dataset.card;
        var qty=S.build.cards[n]||0;
        if (qty>0){
          delete S.build.cards[n];
        } else {
          var targetSize=S.build.deckSize==='full'?60:S.build.deckSize==='half'?30:S.build.customSize;
          var total=Object.values(S.build.cards).reduce(function(a,v){return a+v;},0);
          if (total>=targetSize) return;
          S.build.cards[n]=1;
        }
        render();
      });
    });

    var saveBtn=document.getElementById('dbSaveDeckBtn');
    if (saveBtn) saveBtn.addEventListener('click',function(){
      var b=S.build;
      if (!b.chamber){ toast('Please pick a chamber card.'); return; }
      var total=Object.values(b.cards).reduce(function(a,v){return a+v;},0);
      if (total===0){ toast('Add some standard cards first.'); return; }
      var name=b.name.trim()||('My Deck '+(S.decks.length+1));
      var deck={
        id:'deck_'+Date.now(), name:name, chamber:b.chamber,
        cards:Object.assign({},b.cards), deckSize:b.deckSize,
        customSize:b.customSize, pool:S.pool, created:Date.now()
      };
      persistDeck(deck);
      S.viewingDeck=deck; S.view='stats';
      toast('Deck saved!'); render();
    });

    /* ── EXPORT ─────────────────────────────────────────── */
    var sortSel=document.getElementById('exportSortSelect');
    if (sortSel) sortSel.addEventListener('change',function(){ S.exportSortMode=this.value; render(); });

    var clearChecks=document.getElementById('exportClearChecks');
    if (clearChecks) clearChecks.addEventListener('click',function(){ S.exportChecked={}; render(); });

    var copyCode=document.getElementById('exportCopyCode');
    if (copyCode) copyCode.addEventListener('click',function(){
      var code=(S.viewingDeck&&(S.viewingDeck.encoded||encodeDeck(S.viewingDeck)))||'';
      if (!code) return;
      if (navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(code)
          .then(function(){ toast('Deck code copied!'); })
          .catch(function(){ selectAll(document.getElementById('exportCodeDisplay')); toast('Select the code box above to copy manually'); });
      } else {
        selectAll(document.getElementById('exportCodeDisplay'));
        toast('Select the code box above to copy manually');
      }
    });

    var csvBtn=document.getElementById('exportCSV');
    if (csvBtn) csvBtn.addEventListener('click',function(){
      var deck=S.viewingDeck; if (!deck) return;
      var entries=buildExportEntries(deck,S.exportSortMode||'number');
      var csv='Number,Name,Type,Rarity,Quantity,Chamber\n';
      entries.forEach(function(e){
        csv+=[e.card.number,'"'+e.card.name.replace(/"/g,'""')+'"',e.card.type,e.card.rarity,e.isChamber?1:e.qty,e.isChamber?'Yes':'No'].join(',')+'\n';
      });
      var blob=new Blob([csv],{type:'text/csv'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      a.href=url; a.download=(deck.name||'deck').replace(/[^a-z0-9]/gi,'_')+'_decklist.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); },3000);
      toast('Exported as CSV!');
    });

    el.querySelectorAll('.db-checklist-item,.db-check-box').forEach(function(item){
      item.addEventListener('click',function(){
        var id=this.dataset.checkId;
        if (!id&&this.closest('[data-check-id]')) id=this.closest('[data-check-id]').dataset.checkId;
        if (!id) return;
        S.exportChecked=S.exportChecked||{};
        S.exportChecked[id]=!S.exportChecked[id];
        render();
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════════════════════════ */
  function toast(msg) {
    if (global.showToast) { global.showToast(msg); return; }
    var t=document.getElementById('toast'); if (!t) return;
    t.textContent=msg; t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); },2200);
  }

  function selectAll(el) {
    if (!el) return;
    try {
      var r=document.createRange(); r.selectNodeContents(el);
      var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch(_){}
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API + INIT
  ═══════════════════════════════════════════════════════════════ */
  function init() {
    injectCSS();
    loadDecks();
    render();
  }

  global.DeckBuilder = { init:init, render:render, encodeDeck:encodeDeck, decodeDeck:decodeDeck };

  global.initDeckBuilderTab = function () {
    if (global.allCards && global.allCards.length > 0) {
      init(); return;
    }
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if ((global.allCards && global.allCards.length > 0) || attempts > 60) {
        clearInterval(timer); init();
      }
    }, 250);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var trigger = document.querySelector('[data-nested-tab="digital-deckbuilder"]');
    if (!trigger) return;
    var initialized = false;
    trigger.addEventListener('click', function () {
      if (!initialized) { initialized = true; global.initDeckBuilderTab(); }
      else { render(); }
    });
  });

})(window);