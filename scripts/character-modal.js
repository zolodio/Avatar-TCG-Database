// scripts/character-modal.js
// Beautiful character detail modal — click any roster card to open.
// Tabs: Overview · Stats · Combat · Backstory
// Features: SVG radar chart, animated stat bars, element-themed particles,
//            hexagonal mastery ring, trait icon display, Supabase-aware.

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     ELEMENT THEMES
  ══════════════════════════════════════════════════════════════════ */
  var THEMES = {
    water:      { primary: '#2e8ce8', glow: '#3da5ff', emoji: '💧', label: 'Waterbender',   mesh: 'radial-gradient(ellipse at 30% 40%, #2e8ce855 0%, transparent 65%), radial-gradient(ellipse at 80% 80%, #3da5ff33 0%, transparent 60%)' },
    earth:      { primary: '#5cb85c', glow: '#6fd86f', emoji: '🪨', label: 'Earthbender',   mesh: 'radial-gradient(ellipse at 20% 60%, #5cb85c55 0%, transparent 65%), radial-gradient(ellipse at 75% 20%, #6fd86f33 0%, transparent 60%)' },
    fire:       { primary: '#e8532e', glow: '#ff6b3d', emoji: '🔥', label: 'Firebender',    mesh: 'radial-gradient(ellipse at 50% 20%, #e8532e66 0%, transparent 65%), radial-gradient(ellipse at 85% 70%, #ff6b3d33 0%, transparent 60%)' },
    air:        { primary: '#f0c946', glow: '#ffd966', emoji: '🌬️', label: 'Airbender',     mesh: 'radial-gradient(ellipse at 70% 30%, #f0c94655 0%, transparent 65%), radial-gradient(ellipse at 15% 75%, #ffd96633 0%, transparent 60%)' },
    spirit:     { primary: '#b44ddf', glow: '#d16bff', emoji: '✨', label: 'Spirit Bender', mesh: 'radial-gradient(ellipse at 40% 30%, #b44ddf55 0%, transparent 65%), radial-gradient(ellipse at 75% 75%, #d16bff33 0%, transparent 60%)' },
    'non-bender':{ primary: '#8b8fa8', glow: '#a0a4bd', emoji: '⚔️', label: 'Non-Bender',  mesh: 'radial-gradient(ellipse at 50% 50%, #8b8fa833 0%, transparent 65%), radial-gradient(ellipse at 20% 20%, #a0a4bd22 0%, transparent 60%)' }
  };

  var MASTERY = {
    novice:      { label: 'Novice',       color: '#8b8fa8', stars: 1, ring: '#8b8fa8' },
    adept:       { label: 'Adept',        color: '#5cb85c', stars: 2, ring: '#5cb85c' },
    master:      { label: 'Master',       color: '#2e8ce8', stars: 3, ring: '#2e8ce8' },
    grandmaster: { label: 'Grandmaster',  color: '#b44ddf', stars: 4, ring: '#b44ddf' }
  };

  var TRAIT_ICONS = window.traitIconMap || {};

  var TRAIT_META = {
    strike:    { label: 'Strike',    vals: { bull:'🐂', fox:'🦊', lion:'🦁' },        border: '#e8532e' },
    advantage: { label: 'Advantage', vals: { mind:'🧠', body:'💪', spirit:'✨' },      border: '#5cb85c' },
    ally:      { label: 'Ally',      vals: { light:'☀️', shadow:'🌑', dark:'🌑' },    border: '#2e8ce8' }
  };

  /* ══════════════════════════════════════════════════════════════════
     INJECT STYLES
  ══════════════════════════════════════════════════════════════════ */
  var styleEl = document.createElement('style');
  styleEl.textContent = `
    /* ── Modal shell ── */
    #cdm-overlay {
      position: fixed; inset: 0; z-index: 210;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      display: none; align-items: center; justify-content: center;
      padding: 16px; overflow-y: auto;
    }
    #cdm-overlay.active { display: flex; }

    #cdm-shell {
      background: var(--bg-secondary);
      border-radius: 22px;
      max-width: 620px; width: 100%;
      margin: auto;
      overflow: hidden;
      box-shadow: 0 40px 100px rgba(0,0,0,0.7);
      animation: cdmIn 0.38s cubic-bezier(0.34,1.46,0.64,1) both;
      border: 1px solid rgba(255,255,255,0.07);
      position: relative;
    }

    @keyframes cdmIn {
      from { opacity:0; transform: scale(0.88) translateY(24px); }
      to   { opacity:1; transform: scale(1)    translateY(0);    }
    }

    /* ── Hero ── */
    #cdm-hero {
      position: relative;
      padding: 32px 24px 22px;
      overflow: hidden;
      min-height: 180px;
    }
    #cdm-hero-mesh {
      position: absolute; inset: 0;
      opacity: 1;
      pointer-events: none;
    }
    #cdm-hero-noise {
      position: absolute; inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
      opacity: 0.6; pointer-events: none;
    }
    #cdm-particles { position:absolute; inset:0; pointer-events:none; overflow:hidden; }

    .cdm-particle {
      position: absolute;
      border-radius: 50%;
      animation: cdmFloat var(--dur) var(--del) ease-in-out infinite alternate;
    }
    @keyframes cdmFloat {
      from { transform: translate(0,0) scale(1);   opacity: var(--opa); }
      to   { transform: translate(var(--tx), var(--ty)) scale(1.3); opacity: calc(var(--opa) * 0.3); }
    }

    /* ── Portrait ── */
    #cdm-portrait-wrap {
      position: relative; width: 96px; height: 128px;
      flex-shrink: 0;
    }
    #cdm-portrait {
      width: 100%; height: 100%;
      border-radius: 16px; overflow: hidden;
      border: 2px solid rgba(255,255,255,0.15);
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      position: relative; z-index: 2;
    }
    #cdm-portrait img { width:100%; height:100%; object-fit:cover; display:block; }
    #cdm-portrait-placeholder {
      width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      font-size: 3rem;
      background: rgba(255,255,255,0.05);
    }
    #cdm-mastery-ring {
      position: absolute; top: -6px; left: -6px;
      width: calc(100% + 12px); height: calc(100% + 12px);
      z-index: 1;
    }

    /* ── Name block ── */
    #cdm-name {
      font-family: 'Cinzel', serif; font-weight: 900;
      font-size: 1.45rem; color: #fff; line-height: 1.15;
      text-shadow: 0 2px 12px rgba(0,0,0,0.6);
      word-break: break-word;
    }
    #cdm-nick {
      font-size: 0.8rem; color: rgba(255,255,255,0.55);
      font-style: italic; margin-top: 3px;
    }
    #cdm-badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .cdm-badge {
      display:inline-flex; align-items:center; gap:4px;
      padding: 4px 11px; border-radius: 99px;
      font-size: 0.62rem; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.09em;
      border: 1px solid; white-space: nowrap;
    }

    /* ── Close ── */
    #cdm-close {
      position: absolute; top: 16px; right: 16px; z-index: 20;
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff; font-size: 1rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, transform 0.2s;
    }
    #cdm-close:hover { background: rgba(255,255,255,0.15); transform: scale(1.1); }

    /* ── Tabs ── */
    #cdm-tabs {
      display: flex;
      background: rgba(0,0,0,0.25);
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .cdm-tab {
      flex: 1; padding: 12px 4px;
      background: none; border: none;
      font-family: 'Nunito Sans', sans-serif; font-weight: 800;
      font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
      color: rgba(255,255,255,0.35); cursor: pointer;
      transition: color 0.2s;
      border-bottom: 2px solid transparent;
      position: relative; bottom: -1px;
    }
    .cdm-tab:hover { color: rgba(255,255,255,0.7); }
    .cdm-tab.active { color: #fff; }

    /* ── Body ── */
    #cdm-body {
      padding: 22px 22px 28px;
      max-height: 58vh; overflow-y: auto;
      background: var(--bg-secondary);
    }
    #cdm-body::-webkit-scrollbar { width: 5px; }
    #cdm-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

    /* ── Sections ── */
    .cdm-section-label {
      font-family: 'Cinzel', serif; font-size: 0.65rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.14em;
      color: rgba(255,255,255,0.3);
      margin: 20px 0 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .cdm-section-label:first-child { margin-top: 0; }
    .cdm-section-label::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.07); }

    .cdm-block {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px; padding: 16px;
      margin-bottom: 10px;
    }

    /* ── Stat bars ── */
    .cdm-bar-row { margin-bottom: 9px; }
    .cdm-bar-row:last-child { margin-bottom: 0; }
    .cdm-bar-meta { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
    .cdm-bar-lbl { font-size:0.71rem; font-weight:700; color:rgba(255,255,255,0.5); }
    .cdm-bar-val { font-family:'Cinzel',serif; font-size:0.72rem; font-weight:700; }
    .cdm-bar-track { height:6px; background:rgba(255,255,255,0.06); border-radius:99px; overflow:hidden; }
    .cdm-bar-fill {
      height:100%; border-radius:99px;
      width: 0%;
      transition: width 0.9s cubic-bezier(0.4,0,0.2,1);
    }

    /* ── Trait cards ── */
    .cdm-trait-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }
    .cdm-trait-card {
      border-radius: 14px; padding: 16px 10px; text-align:center;
      border: 1px solid; background: rgba(255,255,255,0.03);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cdm-trait-card:hover { transform: translateY(-2px); }
    .cdm-trait-card img { width:38px; height:38px; object-fit:contain; margin:0 auto 8px; display:block; border-radius:9px; padding:4px; }
    .cdm-trait-card-emoji { font-size:2rem; margin-bottom:8px; display:block; }
    .cdm-trait-card-label { font-size:0.58rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.4); font-weight:700; }
    .cdm-trait-card-val { font-size:0.8rem; font-weight:800; margin-top:4px; font-family:'Cinzel',serif; }

    /* ── Radar SVG ── */
    #cdm-radar-wrap { text-align:center; margin-bottom:16px; }
    #cdm-radar-wrap svg { overflow:visible; }

    /* ── Stat grid pills ── */
    .cdm-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .cdm-stat-pill {
      background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
      border-radius:10px; padding:10px 8px; text-align:center;
    }
    .cdm-stat-pill-lbl { font-size:0.56rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.35); font-weight:700; margin-bottom:5px; }
    .cdm-stat-pill-val { font-family:'Cinzel',serif; font-weight:700; font-size:1.1rem; color:#fff; }

    /* ── Tag chips ── */
    .cdm-chip {
      display:inline-flex; align-items:center;
      padding:4px 12px; border-radius:99px; font-size:0.7rem; font-weight:700;
      border:1px solid;
    }

    /* ── Backstory ── */
    .cdm-backstory-text {
      font-size:0.85rem; color:rgba(255,255,255,0.65);
      line-height:1.8; white-space:pre-wrap;
    }
    .cdm-bs-row {
      display:flex; gap:12px; align-items:flex-start;
      background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
      border-radius:11px; padding:12px 14px; margin-bottom:8px;
    }
    .cdm-bs-icon { font-size:1.2rem; flex-shrink:0; margin-top:1px; }
    .cdm-bs-lbl { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.3); font-weight:800; margin-bottom:4px; }
    .cdm-bs-body { font-size:0.83rem; color:rgba(255,255,255,0.7); line-height:1.55; }

    /* ── Specialty / flaw tags ── */
    .cdm-tags { display:flex; flex-wrap:wrap; gap:6px; }

    /* ── Responsive ── */
    @media (max-width: 480px) {
      #cdm-shell { border-radius: 0; }
      #cdm-overlay { padding: 0; align-items: flex-end; }
      #cdm-body { max-height: 55vh; }
      #cdm-name { font-size:1.15rem; }
      .cdm-trait-grid { grid-template-columns:repeat(3,1fr); gap:6px; }
      .cdm-stat-grid { grid-template-columns:repeat(2,1fr); }
    }

    /* ── Roster card hover cue ── */
    .cc-char-card { cursor: pointer !important; }
    .cc-char-card::after {
      content: 'View';
      position:absolute; right:0; top:50%; transform:translateY(-50%);
      font-size:0.62rem; font-weight:700; color:rgba(255,255,255,0);
      text-transform:uppercase; letter-spacing:0.1em;
      transition: color 0.2s, right 0.2s;
      padding-right:14px;
    }
  `;
  document.head.appendChild(styleEl);

  /* ══════════════════════════════════════════════════════════════════
     DOM SKELETON
  ══════════════════════════════════════════════════════════════════ */
  function buildModalDOM() {
    if (document.getElementById('cdm-overlay')) return;

    var html = `
    <div id="cdm-overlay" role="dialog" aria-modal="true">
      <div id="cdm-shell">
        <!-- HERO -->
        <div id="cdm-hero">
          <div id="cdm-hero-mesh"></div>
          <div id="cdm-hero-noise"></div>
          <div id="cdm-particles"></div>
          <button id="cdm-close" title="Close (Esc)"><i class="fas fa-times"></i></button>
          <div style="position:relative;z-index:5;display:flex;gap:18px;align-items:flex-start;">
            <div id="cdm-portrait-wrap">
              <svg id="cdm-mastery-ring" viewBox="0 0 108 140" xmlns="http://www.w3.org/2000/svg" fill="none">
                <rect x="3" y="3" width="102" height="134" rx="17" ry="17" stroke="transparent" stroke-width="2.5"/>
                <rect id="cdm-ring-path" x="3" y="3" width="102" height="134" rx="17" ry="17"
                  stroke-width="2.5" stroke-linecap="round" stroke-dasharray="460" stroke-dashoffset="460"
                  style="transition:stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1) 0.2s;"/>
              </svg>
              <div id="cdm-portrait"></div>
            </div>
            <div style="flex:1;min-width:0;padding-top:4px;">
              <div id="cdm-name"></div>
              <div id="cdm-nick"></div>
              <div id="cdm-badges"></div>
            </div>
          </div>
        </div>

        <!-- TABS -->
        <div id="cdm-tabs">
          <button class="cdm-tab active" data-tab="overview">Overview</button>
          <button class="cdm-tab" data-tab="stats">Stats</button>
          <button class="cdm-tab" data-tab="combat">Combat</button>
          <button class="cdm-tab" data-tab="backstory">Backstory</button>
        </div>

        <!-- BODY -->
        <div id="cdm-body">
          <div id="cdm-panel-overview"></div>
          <div id="cdm-panel-stats"     style="display:none;"></div>
          <div id="cdm-panel-combat"    style="display:none;"></div>
          <div id="cdm-panel-backstory" style="display:none;"></div>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    // Tab wiring
    document.getElementById('cdm-tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.cdm-tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    document.getElementById('cdm-close').addEventListener('click', closeModal);
    document.getElementById('cdm-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
  }

  var _activeTab = 'overview';
  var _theme = THEMES['non-bender'];

  function switchTab(name) {
    _activeTab = name;
    document.querySelectorAll('.cdm-tab').forEach(function (b) {
      var active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.style.borderBottomColor = active ? _theme.primary : 'transparent';
    });
    ['overview','stats','combat','backstory'].forEach(function (p) {
      var el = document.getElementById('cdm-panel-' + p);
      if (el) el.style.display = p === name ? '' : 'none';
    });
    // Trigger bar animations on the newly-visible panel
    requestAnimationFrame(function () {
      var panel = document.getElementById('cdm-panel-' + name);
      if (!panel) return;
      panel.querySelectorAll('.cdm-bar-fill').forEach(function (bar) {
        var w = bar.dataset.w || '0%';
        bar.style.width = '0%';
        requestAnimationFrame(function () { bar.style.width = w; });
      });
      // Radar path
      var ring = document.getElementById('cdm-ring-path');
      if (ring) {
        ring.style.strokeDashoffset = '460';
        requestAnimationFrame(function () { ring.style.strokeDashoffset = ring.dataset.target || '460'; });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     OPEN MODAL
  ══════════════════════════════════════════════════════════════════ */
  function openModal(char) {
    buildModalDOM();
    _theme = THEMES[char.bending] || THEMES['non-bender'];

    populateHero(char);
    populateOverview(char);
    populateStats(char);
    populateCombat(char);
    populateBackstory(char);

    // Reset to overview
    _activeTab = 'overview';
    document.querySelectorAll('.cdm-tab').forEach(function (b) {
      var active = b.dataset.tab === 'overview';
      b.classList.toggle('active', active);
      b.style.borderBottomColor = active ? _theme.primary : 'transparent';
    });
    ['overview','stats','combat','backstory'].forEach(function (p) {
      var el = document.getElementById('cdm-panel-' + p);
      if (el) el.style.display = p === 'overview' ? '' : 'none';
    });

    document.getElementById('cdm-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    // Trigger ring animation
    setTimeout(function () {
      var ring = document.getElementById('cdm-ring-path');
      if (ring) ring.style.strokeDashoffset = ring.dataset.target || '460';
    }, 80);

    // Trigger bars in overview
    setTimeout(function () {
      var panel = document.getElementById('cdm-panel-overview');
      if (panel) panel.querySelectorAll('.cdm-bar-fill').forEach(function (bar) {
        bar.style.width = bar.dataset.w || '0%';
      });
    }, 120);
  }

  function closeModal() {
    var ov = document.getElementById('cdm-overlay');
    if (ov) ov.classList.remove('active');
    document.body.style.overflow = '';
  }

  /* ══════════════════════════════════════════════════════════════════
     HERO
  ══════════════════════════════════════════════════════════════════ */
  function populateHero(char) {
    var t = _theme;

    // Background mesh
    document.getElementById('cdm-hero-mesh').style.background = t.mesh;

    // Particles
    buildParticles(t);

    // Portrait
    var portrait = document.getElementById('cdm-portrait');
    portrait.style.boxShadow = '0 12px 32px ' + t.primary + '66';
    portrait.style.borderColor = t.primary + 'aa';
    if (char.imageData) {
      portrait.innerHTML = '<img src="data:' + char.imageMime + ';base64,' + char.imageData + '" alt="' + esc(char.givenName) + '">';
    } else {
      portrait.innerHTML = '<div id="cdm-portrait-placeholder" style="background:linear-gradient(145deg,' + t.primary + '22,' + t.glow + '11);">' + t.emoji + '</div>';
    }

    // Mastery ring
    var mc = MASTERY[char.mastery];
    var ring = document.getElementById('cdm-ring-path');
    if (mc) {
      var circumference = 460;
      var filled = Math.round(circumference * (mc.stars / 4));
      ring.setAttribute('stroke', mc.ring);
      ring.style.filter = 'drop-shadow(0 0 4px ' + mc.ring + ')';
      ring.dataset.target = circumference - filled;
      ring.style.strokeDashoffset = circumference; // start hidden; animate on open
    } else {
      ring.setAttribute('stroke', 'transparent');
    }

    // Name
    document.getElementById('cdm-name').textContent = char.givenName || 'Unnamed';
    var nickEl = document.getElementById('cdm-nick');
    nickEl.textContent = char.nickName ? '"' + char.nickName + '"' : '';

    // Badges
    var badges = [];
    if (char.bending) {
      badges.push(badge(t.emoji + ' ' + t.label, t.primary, t.primary + '44'));
    }
    if (char.mastery && mc) {
      var stars = '★'.repeat(mc.stars) + '☆'.repeat(4 - mc.stars);
      badges.push(badge(stars + ' ' + mc.label, mc.ring, mc.ring + '33'));
    }
    if (char.lifepath) {
      var lp = char.lifepath === 'open-palm' ? '☯ Open Palm' : '✊ Closed Fist';
      badges.push(badge(lp, 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.1)'));
    }
    if (char.temperament) {
      badges.push(badge(cap(char.temperament), 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.07)'));
    }
    document.getElementById('cdm-badges').innerHTML = badges.join('');
  }

  function badge(text, color, bg) {
    return '<span class="cdm-badge" style="color:' + color + ';background:' + bg + ';border-color:' + color + '55;">' + esc(text) + '</span>';
  }

  function buildParticles(t) {
    var container = document.getElementById('cdm-particles');
    container.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var size  = 3 + Math.random() * 8;
      var dur   = (2.5 + Math.random() * 2).toFixed(1) + 's';
      var del   = (Math.random() * 2).toFixed(2) + 's';
      var x     = (Math.random() * 100).toFixed(1) + '%';
      var y     = (Math.random() * 100).toFixed(1) + '%';
      var tx    = ((Math.random() - 0.5) * 30).toFixed(0) + 'px';
      var ty    = ((Math.random() - 0.5) * 24).toFixed(0) + 'px';
      var opa   = (0.2 + Math.random() * 0.5).toFixed(2);
      var p     = document.createElement('div');
      p.className = 'cdm-particle';
      p.style.cssText = 'width:' + size + 'px;height:' + size + 'px;background:' + t.glow +
        ';left:' + x + ';top:' + y +
        ';--dur:' + dur + ';--del:' + del + ';--tx:' + tx + ';--ty:' + ty + ';--opa:' + opa + ';';
      container.appendChild(p);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     OVERVIEW TAB
  ══════════════════════════════════════════════════════════════════ */
  function populateOverview(char) {
    var t = _theme;
    var html = '';

    // Physical description grid
    var physFields = [
      { l:'Height', v: char.height }, { l:'Weight', v: char.weight },
      { l:'Build',  v: char.build  }, { l:'Eyes',   v: char.eyes  },
      { l:'Hair',   v: char.hair   }, { l:'Skin',   v: char.skin  }
    ].filter(function (f) { return !!f.v; });

    if (physFields.length) {
      html += sectionLabel('🧬', 'Physical Description');
      html += '<div class="cdm-stat-grid">';
      physFields.forEach(function (f) {
        html += '<div class="cdm-stat-pill">' +
          '<div class="cdm-stat-pill-lbl">' + esc(f.l) + '</div>' +
          '<div class="cdm-stat-pill-val" style="font-size:0.85rem;">' + esc(cap(f.v)) + '</div>' +
        '</div>';
      });
      html += '</div>';
      if (char.appearanceNotes) {
        html += '<div class="cdm-block" style="margin-top:8px;font-size:0.81rem;color:rgba(255,255,255,0.55);line-height:1.7;">' + esc(char.appearanceNotes) + '</div>';
      }
    }

    // Specialties
    if (char.specialties && char.specialties.length) {
      html += sectionLabel('⚡', 'Specialties');
      html += '<div class="cdm-tags">';
      char.specialties.forEach(function (sp) {
        html += '<span class="cdm-chip" style="color:' + t.primary + ';background:' + t.primary + '1a;border-color:' + t.primary + '44;">' + esc(sp) + '</span>';
      });
      html += '</div>';
    }

    // Companion
    var petCat = char.petCat || char.petcat || 'none';
    if (char.pet && petCat !== 'none') {
      html += sectionLabel('🐾', 'Companion');
      html += '<div class="cdm-block" style="display:flex;align-items:center;gap:14px;">' +
        '<div style="width:52px;height:52px;border-radius:14px;background:rgba(232,182,50,0.15);border:1px solid rgba(232,182,50,0.3);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0;">🐾</div>' +
        '<div>' +
          '<div style="font-weight:800;font-size:0.95rem;color:#fff;">' + esc(char.pet) + '</div>' +
          '<div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:3px;">' + cap(petCat) + (char.bond ? ' · Bond: ' + cap(char.bond) : '') + '</div>' +
        '</div>' +
      '</div>';
    }

    // Personality top 5 preview bars
    var pers = char.personality || {};
    var persKeys = Object.keys(pers).filter(function(k){ return (pers[k]||0) > 0; });
    if (persKeys.length) {
      // Show top 5 by value
      var top5 = persKeys.slice().sort(function(a,b){ return (pers[b]||0)-(pers[a]||0); }).slice(0,5);
      html += sectionLabel('🧠', 'Dominant Traits');
      html += '<div class="cdm-block">';
      top5.forEach(function(k, i) {
        html += buildBar(k, pers[k] || 0, t.primary, i);
      });
      html += '</div>';
    }

    // Flaws
    if (char.flaws && char.flaws.length) {
      html += sectionLabel('⚠️', 'Known Flaws');
      html += '<div class="cdm-tags">';
      char.flaws.forEach(function (fl) {
        var label = fl.replace(/-/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
        html += '<span class="cdm-chip" style="color:#e04848;background:rgba(224,72,72,0.1);border-color:rgba(224,72,72,0.3);">' + esc(label) + '</span>';
      });
      html += '</div>';
    }

    if (!html) html = emptyState('No overview data yet. Fill in the character form to see it here.');
    document.getElementById('cdm-panel-overview').innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     STATS TAB
  ══════════════════════════════════════════════════════════════════ */
  function populateStats(char) {
    var t = _theme;
    var html = '';

    // Radar — personality
    var pers = char.personality || {};
    var persKeys = Object.keys(pers);
    if (persKeys.length >= 3) {
      var radarTraits = persKeys.slice(0, 8);
      html += sectionLabel('🌀', 'Personality Radar');
      html += '<div id="cdm-radar-wrap">' + buildRadarSVG(radarTraits, pers, t.primary, t.glow) + '</div>';
    }

    // All personality bars
    if (persKeys.length) {
      html += sectionLabel('🧬', 'Personality Breakdown');
      html += '<div class="cdm-block">';
      persKeys.forEach(function(k, i) { html += buildBar(k, pers[k]||0, t.primary, i); });
      html += '</div>';
    }

    // Physical
    var phys = char.physical || {};
    var physKeys = Object.keys(phys);
    if (physKeys.length) {
      html += sectionLabel('💪', 'Physical Attributes');
      html += '<div class="cdm-block">';
      physKeys.forEach(function(k, i) { html += buildBar(k, phys[k]||0, '#e8b632', i, 10); });
      html += '</div>';
    }

    // Mental
    var mental = char.mental || {};
    var mentalKeys = Object.keys(mental);
    if (mentalKeys.length) {
      html += sectionLabel('🧠', 'Mental Attributes');
      html += '<div class="cdm-block">';
      mentalKeys.forEach(function(k, i) { html += buildBar(k, mental[k]||0, '#4a7dff', i, 20); });
      html += '</div>';
    }

    if (!html) html = emptyState('No stats available yet.');
    document.getElementById('cdm-panel-stats').innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     COMBAT TAB
  ══════════════════════════════════════════════════════════════════ */
  function populateCombat(char) {
    var t = _theme;
    var html = '';

    // Quickstrike traits
    var hasTraits = char.strike || char.advantage || char.ally;
    if (hasTraits) {
      html += sectionLabel('⚡', 'Quickstrike Profile');
      html += '<div class="cdm-trait-grid">';
      ['strike','advantage','ally'].forEach(function (key) {
        var meta  = TRAIT_META[key];
        var val   = char[key];
        var icon  = val && TRAIT_ICONS[val] ? TRAIT_ICONS[val] : null;
        var emoji = val ? (meta.vals[val] || '❓') : null;
        var color = val ? meta.border : 'rgba(255,255,255,0.1)';
        var glow  = val ? 'box-shadow:0 0 20px ' + meta.border + '33;' : '';

        html += '<div class="cdm-trait-card" style="border-color:' + color + ';' + glow + '">';
        if (icon) {
          html += '<img src="' + icon + '" alt="' + esc(val) + '" style="background:' + meta.border + '22;">';
        } else if (emoji) {
          html += '<span class="cdm-trait-card-emoji">' + emoji + '</span>';
        } else {
          html += '<span class="cdm-trait-card-emoji" style="opacity:0.2;">—</span>';
        }
        html += '<div class="cdm-trait-card-label">' + esc(meta.label) + '</div>';
        html += '<div class="cdm-trait-card-val" style="color:' + (val ? meta.border : 'rgba(255,255,255,0.2)') + ';">' + (val ? cap(val) : '—') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Combat profile pills
    var combatFields = [
      { l:'Range',       v: char.range ? cap(char.range.replace(/-/g,' ')) : null },
      { l:'Temperament', v: char.temperament ? cap(char.temperament) : null },
      { l:'Mastery',     v: char.mastery     ? cap(char.mastery)     : null },
      { l:'Life Path',   v: char.lifepath === 'open-palm' ? 'Open Palm' : char.lifepath === 'closed-fist' ? 'Closed Fist' : null }
    ].filter(function(f){ return !!f.v; });

    if (combatFields.length) {
      html += sectionLabel('⚔️', 'Combat Profile');
      html += '<div class="cdm-stat-grid">';
      combatFields.forEach(function(f) {
        html += '<div class="cdm-stat-pill">' +
          '<div class="cdm-stat-pill-lbl">' + esc(f.l) + '</div>' +
          '<div class="cdm-stat-pill-val" style="font-size:0.8rem;color:' + t.primary + ';">' + esc(f.v) + '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    // Derived combat ratings
    var phys   = char.physical   || {};
    var mental = char.mental     || {};
    var pers   = char.personality || {};
    var physVals   = Object.values(phys).filter(Number.isFinite);
    var mentalVals = Object.values(mental).filter(Number.isFinite);
    var avgPhys    = physVals.length   ? avg(physVals)   : 50;
    var avgMental  = mentalVals.length ? avg(mentalVals) : 50;
    var aggr = pers['Aggression'] || 50;
    var disc = pers['Discipline'] || 50;
    var resi = pers['Resilience'] || 50;
    var combatScore = Math.round((aggr * 0.35) + (disc * 0.3) + (resi * 0.35));
    combatScore = Math.max(0, Math.min(100, combatScore));

    html += sectionLabel('📊', 'Derived Ratings');
    html += '<div class="cdm-block">';
    html += buildBar('Physical Power',   Math.round(avgPhys),   '#e8b632', 0, 0);
    html += buildBar('Mental Acuity',    Math.round(avgMental), '#4a7dff', 1, 0);
    html += buildBar('Combat Drive',     combatScore,           t.primary, 2, 0);
    html += '</div>';

    // Specialties in combat context
    if (char.specialties && char.specialties.length) {
      html += sectionLabel('🌀', 'Bending Specialties');
      html += '<div class="cdm-tags">';
      char.specialties.forEach(function(sp) {
        html += '<span class="cdm-chip" style="color:' + t.primary + ';background:' + t.primary + '18;border-color:' + t.primary + '44;">' + esc(sp) + '</span>';
      });
      html += '</div>';
    }

    if (!html) html = emptyState('No combat data yet.');
    document.getElementById('cdm-panel-combat').innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     BACKSTORY TAB
  ══════════════════════════════════════════════════════════════════ */
  function populateBackstory(char) {
    var t = _theme;
    var html = '';

    var freeText = (char.backstoryFree || '').trim();
    if (freeText) {
      html += sectionLabel('📜', 'Backstory');
      html += '<div class="cdm-block cdm-backstory-text">' + esc(freeText) + '</div>';
    }

    var templateRows = [
      { icon:'🏯', label:'Nation of Origin',  val: char.bsNation   },
      { icon:'⚔️', label:'Early Training',    val: char.bsTraining },
      { icon:'💥', label:'Defining Moment',   val: char.bsTrauma   },
      { icon:'🧙', label:'Mentor',            val: char.bsMentor   },
      { icon:'⚡', label:'Rival',             val: char.bsRival    },
      { icon:'🎯', label:'Goal',              val: char.bsGoal     },
      { icon:'🔒', label:'Secret',            val: char.bsSecret   }
    ].filter(function(r){ return !!(r.val && r.val.trim()); });

    if (templateRows.length) {
      html += sectionLabel('🗺️', 'Character Dossier');
      templateRows.forEach(function(r) {
        html += '<div class="cdm-bs-row">' +
          '<div class="cdm-bs-icon">' + r.icon + '</div>' +
          '<div><div class="cdm-bs-lbl">' + esc(r.label) + '</div><div class="cdm-bs-body">' + esc(r.val) + '</div></div>' +
        '</div>';
      });
    }

    // Narrative tone badge (bsTone)
    var tone = char.bsTone || char.bstone || '';
    if (tone) {
      var toneColors = { hopeful:'#3db86c', dark:'#8b5cf6', epic:'#e8532e', political:'#2e8ce8', tragic:'#e04848' };
      var tc = toneColors[tone] || 'rgba(255,255,255,0.5)';
      html += sectionLabel('🎭', 'Narrative Tone');
      html += '<div class="cdm-tags"><span class="cdm-chip" style="color:' + tc + ';background:' + tc + '1a;border-color:' + tc + '44;">' + cap(tone) + '</span></div>';
    }

    if (!html) html = emptyState('No backstory written yet. Use the Create tab to add one.');
    document.getElementById('cdm-panel-backstory').innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     BUILDERS
  ══════════════════════════════════════════════════════════════════ */
  function buildBar(trait, val, color, index, baseDelay) {
    baseDelay = baseDelay || 0;
    var pct = Math.max(0, Math.min(100, val || 0));
    var label = trait.replace(/-/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
    // color-grade by value
    var barColor = pct >= 80 ? '#3db86c' : pct >= 60 ? color : pct >= 40 ? color : pct >= 20 ? '#e8b632' : '#e04848';
    return '<div class="cdm-bar-row">' +
      '<div class="cdm-bar-meta">' +
        '<span class="cdm-bar-lbl">' + esc(label) + '</span>' +
        '<span class="cdm-bar-val" style="color:' + barColor + ';">' + pct + '</span>' +
      '</div>' +
      '<div class="cdm-bar-track">' +
        '<div class="cdm-bar-fill" data-w="' + pct + '%" ' +
          'style="background:linear-gradient(90deg,' + barColor + ',' + barColor + 'aa);' +
          'box-shadow:0 0 8px ' + barColor + '55;' +
          'transition-delay:' + (baseDelay + index * 45) + 'ms;"></div>' +
      '</div>' +
    '</div>';
  }

  function buildRadarSVG(traits, values, primary, glow) {
    var n = traits.length;
    var SIZE = 240, C = SIZE / 2, R = 85;
    var step = (2 * Math.PI) / n;
    var start = -Math.PI / 2;

    // Grid
    var gridSVG = '';
    for (var ring = 1; ring <= 4; ring++) {
      var rr = R * (ring / 4);
      var pts = [];
      for (var i = 0; i < n; i++) {
        var a = start + i * step;
        pts.push((C + Math.cos(a)*rr).toFixed(1) + ',' + (C + Math.sin(a)*rr).toFixed(1));
      }
      gridSVG += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    }
    // Axes
    for (var i = 0; i < n; i++) {
      var a = start + i * step;
      gridSVG += '<line x1="' + C + '" y1="' + C + '" x2="' + (C+Math.cos(a)*R).toFixed(1) + '" y2="' + (C+Math.sin(a)*R).toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
    }

    // Data
    var dataPts = [];
    for (var i = 0; i < n; i++) {
      var a = start + i * step;
      var v = Math.max(0, Math.min(100, values[traits[i]] || 0));
      var dr = R * (v / 100);
      dataPts.push((C + Math.cos(a)*dr).toFixed(1) + ',' + (C + Math.sin(a)*dr).toFixed(1));
    }
    var dataSVG = '<polygon points="' + dataPts.join(' ') + '" fill="' + primary + '" fill-opacity="0.18" stroke="' + primary + '" stroke-width="2.5" stroke-linejoin="round" filter="url(#cdm-glow)"/>';

    // Dots
    var dotSVG = dataPts.map(function(p) {
      return '<circle cx="' + p.split(',')[0] + '" cy="' + p.split(',')[1] + '" r="3.5" fill="' + glow + '" filter="url(#cdm-glow)"/>';
    }).join('');

    // Labels
    var labelSVG = '';
    for (var i = 0; i < n; i++) {
      var a = start + i * step;
      var lx = (C + Math.cos(a) * (R + 20)).toFixed(1);
      var ly = (C + Math.sin(a) * (R + 20)).toFixed(1);
      var anchor = Math.cos(a) > 0.15 ? 'start' : Math.cos(a) < -0.15 ? 'end' : 'middle';
      var short = traits[i].split(/\s+/).map(function(w){ return w.slice(0,5); }).join(' ');
      labelSVG += '<text x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '" dominant-baseline="middle" font-size="7.5" font-family="Cinzel,serif" font-weight="700" fill="rgba(255,255,255,0.45)" letter-spacing="0.05em">' + esc(short.toUpperCase()) + '</text>';
    }

    return '<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" width="' + SIZE + '" height="' + SIZE + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><filter id="cdm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      gridSVG + dataSVG + dotSVG + labelSVG +
    '</svg>';
  }

  function sectionLabel(emoji, text) {
    return '<div class="cdm-section-label">' + emoji + ' ' + esc(text) + '</div>';
  }

  function emptyState(msg) {
    return '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.25);font-size:0.82rem;line-height:1.6;">' + esc(msg) + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function avg(arr) { return arr.reduce(function(a,b){return a+b;},0) / arr.length; }

  /* ══════════════════════════════════════════════════════════════════
     NORMALIZE — backfill fields saved under the wrong key name
  ══════════════════════════════════════════════════════════════════ */
  function normalizeChar(char) {
    var c = Object.assign({}, char); // shallow clone — don't mutate the stored object
    // petCat vs petcat: HTML pill uses data-group="petcat" (lowercase) so older saves
    // may have written c.petcat instead of c.petCat (camelCase).
    if ((!c.petCat || c.petCat === 'none') && c.petcat && c.petcat !== 'none') {
      c.petCat = c.petcat;
    }
    // bsTone vs bstone: same pattern with the backstory-tone pill.
    if (!c.bsTone && c.bstone) {
      c.bsTone = c.bstone;
    }
    // bond: ensure it's a string
    if (c.bond == null) c.bond = '';
    return c;
  }

  function getChars() {
    try { return JSON.parse(localStorage.getItem('aqst_characters')||'[]'); } catch(e) { return []; }
  }

  /* ══════════════════════════════════════════════════════════════════
     ROSTER HOOK — delegated click on #cc-roster-list
  ══════════════════════════════════════════════════════════════════ */
  function hookRoster() {
    var list = document.getElementById('cc-roster-list');
    if (!list) { setTimeout(hookRoster, 400); return; }

    list.addEventListener('click', function (e) {
      if (e.target.closest('.cc-char-action')) return; // edit/delete buttons
      var card = e.target.closest('.cc-char-card');
      if (!card) return;
      var id   = card.dataset.id;
      var char = getChars().find(function(c){ return String(c.id) === String(id); });
      if (char) openModal(normalizeChar(char));
    });

    // Also watch for Supabase-pulled characters synced after page load
    new MutationObserver(function() {
      // Nothing extra needed — delegation handles dynamic cards
    }).observe(list, { childList: true, subtree: true });
  }

  /* ── ESC to close ── */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var ov = document.getElementById('cdm-overlay');
    if (ov && ov.classList.contains('active')) { e.stopPropagation(); closeModal(); }
  }, true);

  /* ── Public API ── */
  window.openCharDetailModal = openModal;

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookRoster);
  } else {
    hookRoster();
  }

  console.log('[character-modal.js] loaded ✓');
})();
