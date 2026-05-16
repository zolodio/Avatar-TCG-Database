/* ════════════════════════════════════════════════════════════════════
   Avatar Quick Strike TCG — Animated Splash Screen
   Place this <script src="scripts/splash.js"></script> as the VERY FIRST
   element inside <body> (before all other content).
════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── CONFIG ─────────────────────────────────────────────────── */
  var MIN_MS   = 2800;   // minimum display time in ms
  var HARD_MAX = 8000;   // absolute max before force-dismiss

  var NATIONS = [
    { t: 'Fire Nation',   c: '#e8532e' },
    { t: 'Water Tribe',   c: '#2e8ce8' },
    { t: 'Earth Kingdom', c: '#5cb85c' },
    { t: 'Air Nomads',    c: '#f0c946' },
    { t: 'Spirit World',  c: '#b44ddf' },
  ];

  var PARTICLE_COLORS = [
    [232, 83,  46 ],
    [46,  140, 232],
    [92,  184, 92 ],
    [240, 201, 70 ],
    [180, 77,  223],
  ];

  var LOGO_SM = 'https://raw.githubusercontent.com/zolodio/Avatar-TCG-Database/Current-Development/SMLOGO.png';
  var LOGO_LG = 'https://raw.githubusercontent.com/zolodio/Avatar-TCG-Database/Current-Development/LGLOGO.png';

  /* ─── CSS ────────────────────────────────────────────────────── */
  var CSS = [
    '#aqsSplash{',
      'position:fixed;inset:0;z-index:99999;',
      'background:#0a0c14;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'overflow:hidden;',
      'opacity:1;transition:opacity 0.9s cubic-bezier(0.4,0,0.2,1);',
      'font-family:"Nunito Sans",sans-serif;',
    '}',
    '#aqsSplash.aqs-gone{opacity:0;pointer-events:none;}',

    '#aqsCanvas{position:absolute;inset:0;pointer-events:none;}',

    /* ── Corners ── */
    '.aqs-corner{position:absolute;width:64px;height:64px;',
      'opacity:0;animation:aqsIn 0.9s ease 0.1s both;}',
    '.aqs-tl{top:18px;left:18px;}',
    '.aqs-tr{top:18px;right:18px;}',
    '.aqs-bl{bottom:18px;left:18px;}',
    '.aqs-br{bottom:18px;right:18px;}',

    /* ── Central content block ── */
    '.aqs-sc{',
      'position:relative;z-index:2;',
      'display:flex;flex-direction:column;align-items:center;',
      'gap:0;text-align:center;padding:0 24px;',
    '}',

    /* ── Logos ── */
    '.aqs-logos{',
      'display:flex;flex-direction: column;align-items:center;justify-content:center;gap:8px;',
      'opacity:0;animation:aqsUp 0.7s ease 0.45s both;',
      'margin-bottom:26px;',
    '}',
    '.aqs-logos img{height:38px;width:auto;',
      'filter:drop-shadow(0 0 10px rgba(255,255,255,0.55));}',

    /* ── Orbital ring wrapper ── */
    '.aqs-orb-wrap{',
      'position:relative;width:250px;height:250px;flex-shrink:0;',
      'opacity:0;animation:aqsIn 0.7s ease 0.1s both;',
      'margin-bottom:30px;',
    '}',
    '.aqs-orb-track{',
      'position:absolute;inset:0;border-radius:50%;',
      'border:1px solid rgba(255,255,255,0.06);',
    '}',
    '.aqs-orb-track-2{',
      'position:absolute;',
      'top:18%;left:18%;right:18%;bottom:18%;',
      'border-radius:50%;',
      'border:1px solid rgba(255,255,255,0.04);',
    '}',

    /* ── Pulse rings ── */
    '.aqs-pulse{',
      'position:absolute;top:50%;left:50%;',
      'width:68px;height:68px;margin:-34px 0 0 -34px;',
      'border-radius:50%;',
      'border:1.5px solid rgba(180,77,223,0.5);',
      'animation:aqsPulse 2.8s ease-out infinite;',
    '}',
    '.aqs-p2{animation-delay:-0.93s;border-color:rgba(46,140,232,0.4);}',
    '.aqs-p3{animation-delay:-1.87s;border-color:rgba(240,201,70,0.3);}',
    '@keyframes aqsPulse{',
      '0%{transform:scale(1);opacity:0.8;}',
      '100%{transform:scale(3.2);opacity:0;}',
    '}',

    /* ── Chakra center dot ── */
    '.aqs-center{',
      'position:absolute;top:50%;left:50%;',
      'transform:translate(-50%,-50%);',
      'width:38px;height:38px;border-radius:50%;',
      'background:conic-gradient(#e8532e,#f0c946,#5cb85c,#2e8ce8,#b44ddf,#e8532e);',
      'opacity:0.9;',
      'animation:aqsChakra 4s linear infinite;',
    '}',
    '.aqs-center::after{',
      'content:"";position:absolute;inset:4px;',
      'border-radius:50%;background:#0a0c14;',
    '}',
    '@keyframes aqsChakra{',
      'from{transform:translate(-50%,-50%) rotate(0deg);}',
      'to  {transform:translate(-50%,-50%) rotate(360deg);}',
    '}',

    /* ── Orbiting element orbs ── */
    '.aqs-orb{',
      'position:absolute;top:50%;left:50%;',
      'width:14px;height:14px;border-radius:50%;',
      'margin:-7px 0 0 -7px;',
    '}',
    '.aqs-fire {background:#e8532e;',
      'box-shadow:0 0 0 3px rgba(232,83,46,0.25),0 0 16px 4px rgba(232,83,46,0.5);',
      'animation:aqsOrbit 9s linear infinite 0s;}',
    '.aqs-water{background:#2e8ce8;',
      'box-shadow:0 0 0 3px rgba(46,140,232,0.25),0 0 16px 4px rgba(46,140,232,0.5);',
      'animation:aqsOrbit 9s linear infinite -2.25s;}',
    '.aqs-earth{background:#5cb85c;',
      'box-shadow:0 0 0 3px rgba(92,184,92,0.25),0 0 16px 4px rgba(92,184,92,0.5);',
      'animation:aqsOrbit 9s linear infinite -4.5s;}',
    '.aqs-air  {background:#f0c946;',
      'box-shadow:0 0 0 3px rgba(240,201,70,0.25),0 0 16px 4px rgba(240,201,70,0.5);',
      'animation:aqsOrbit 9s linear infinite -6.75s;}',
    '@keyframes aqsOrbit{',
      '0%  {transform:rotate(0deg)   translateX(104px) rotate(0deg);}',
      '100%{transform:rotate(360deg) translateX(104px) rotate(-360deg);}',
    '}',

    /* ── Title ── */
    '.aqs-title{',
      'font-family:"Cinzel",Georgia,serif;font-weight:900;',
      'font-size:clamp(1rem,3.5vw,1.45rem);',
      'background:linear-gradient(135deg,#f0c946 0%,#e8532e 30%,#b44ddf 60%,#2e8ce8 85%,#5cb85c 100%);',
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;',
      'letter-spacing:0.08em;',
      'opacity:0;animation:aqsUp 0.7s ease 0.85s both;',
      'margin-bottom:5px;',
    '}',
    '.aqs-sub{',
      'font-size:0.6rem;letter-spacing:0.28em;text-transform:uppercase;',
      'color:rgba(255,255,255,0.3);',
      'opacity:0;animation:aqsUp 0.6s ease 1.05s both;',
      'margin-bottom:22px;',
    '}',

    /* ── Nation cycling text ── */
    '.aqs-nation{',
      'font-size:0.67rem;letter-spacing:0.24em;text-transform:uppercase;font-weight:700;',
      'color:#f0c946;min-height:18px;',
      'opacity:0;animation:aqsUp 0.5s ease 1.35s both;',
      'margin-bottom:13px;',
      'transition:color 0.4s ease,opacity 0.3s ease;',
    '}',

    /* ── Loading bar ── */
    '.aqs-bar-wrap{',
      'width:min(210px,58vw);height:2px;',
      'background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden;',
      'opacity:0;animation:aqsUp 0.5s ease 1.5s both;',
    '}',
    '.aqs-bar{',
      'height:100%;border-radius:99px;width:0%;',
      'background:linear-gradient(90deg,#2e8ce8,#b44ddf,#e8532e,#f0c946);',
      'transition:width 0.25s ease;',
    '}',

    /* ── Keyframes ── */
    '@keyframes aqsIn{',
      'from{opacity:0;transform:scale(0.88);}',
      'to  {opacity:1;transform:scale(1);}',
    '}',
    '@keyframes aqsUp{',
      'from{opacity:0;transform:translateY(14px);}',
      'to  {opacity:1;transform:translateY(0);}',
    '}',

    /* ── Responsive ── */
    '@media(max-height:520px){',
      '.aqs-logos img{height:26px;}',
      '.aqs-orb-wrap{width:160px;height:160px;margin-bottom:18px;}',
      '.aqs-title{font-size:0.9rem;}',
      '@keyframes aqsOrbit{',
        '0%  {transform:rotate(0deg)   translateX(65px) rotate(0deg);}',
        '100%{transform:rotate(360deg) translateX(65px) rotate(-360deg);}',
      '}',
    '}',
  ].join('');

  /* ─── HTML ───────────────────────────────────────────────────── */
  var HTML = [
    '<canvas id="aqsCanvas"></canvas>',

    /* Corners — four nation colors */
    '<svg class="aqs-corner aqs-tl" viewBox="0 0 64 64" fill="none" aria-hidden="true">',
      '<path d="M0 0H64V9H9V64H0Z" fill="#e8532e" opacity=".5"/>',
      '<path d="M0 0H26V5H5V26H0Z" fill="#e8532e"/>',
    '</svg>',
    '<svg class="aqs-corner aqs-tr" viewBox="0 0 64 64" fill="none" aria-hidden="true">',
      '<path d="M64 0H0V9H55V64H64Z" fill="#2e8ce8" opacity=".5"/>',
      '<path d="M64 0H38V5H59V26H64Z" fill="#2e8ce8"/>',
    '</svg>',
    '<svg class="aqs-corner aqs-bl" viewBox="0 0 64 64" fill="none" aria-hidden="true">',
      '<path d="M0 64H64V55H9V0H0Z" fill="#5cb85c" opacity=".5"/>',
      '<path d="M0 64H26V59H5V38H0Z" fill="#5cb85c"/>',
    '</svg>',
    '<svg class="aqs-corner aqs-br" viewBox="0 0 64 64" fill="none" aria-hidden="true">',
      '<path d="M64 64H0V55H55V0H64Z" fill="#f0c946" opacity=".5"/>',
      '<path d="M64 64H38V59H59V38H64Z" fill="#f0c946"/>',
    '</svg>',

    /* Central content */
    '<div class="aqs-sc" role="status" aria-label="Loading Avatar Quick Strike TCG">',

      /* Logos */
      '<div class="aqs-logos">',
        '<img src="' + LOGO_SM + '" alt="Avatar Quick Strike" onerror="this.style.display=\'none\'">',
        '<img src="' + LOGO_LG + '" alt="Avatar Quick Strike TCG" onerror="this.style.display=\'none\'">',
      '</div>',

      /* Orbital ring */
      '<div class="aqs-orb-wrap" aria-hidden="true">',
        '<div class="aqs-orb-track"></div>',
        '<div class="aqs-orb-track-2"></div>',
        '<div class="aqs-pulse"></div>',
        '<div class="aqs-pulse aqs-p2"></div>',
        '<div class="aqs-pulse aqs-p3"></div>',
        '<div class="aqs-center"></div>',
        '<div class="aqs-orb aqs-fire"></div>',
        '<div class="aqs-orb aqs-water"></div>',
        '<div class="aqs-orb aqs-earth"></div>',
        '<div class="aqs-orb aqs-air"></div>',
      '</div>',

      '<div class="aqs-title">Avatar Quick Strike</div>',
      '<div class="aqs-sub">Trading Card Game &middot; Collection Database</div>',
      '<div class="aqs-nation" id="aqsNation">Fire Nation</div>',
      '<div class="aqs-bar-wrap"><div class="aqs-bar" id="aqsBar"></div></div>',

    '</div>',
  ].join('');

  /* ─── INJECT ─────────────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.id  = 'aqsSplashCSS';
  styleEl.textContent = CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  var splashEl = document.createElement('div');
  splashEl.id  = 'aqsSplash';
  splashEl.setAttribute('aria-live', 'polite');
  splashEl.innerHTML = HTML;

  var bodyTarget = document.body || document.documentElement;
  bodyTarget.insertBefore(splashEl, bodyTarget.firstChild);

  /* ─── CANVAS PARTICLE SYSTEM ─────────────────────────────────── */
  var canvas = document.getElementById('aqsCanvas');
  var ctx    = canvas.getContext('2d');
  var W = 0, H = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function mkParticle() {
    var col   = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    var angle = Math.random() * 6.283;
    var dist  = W * 0.2 + Math.random() * W * 0.45;
    var cx = W / 2, cy = H / 2;
    var sx = cx + Math.cos(angle) * dist;
    var sy = cy + Math.sin(angle) * dist;
    var toC  = Math.atan2(cy - sy, cx - sx);
    var spd  = 0.12 + Math.random() * 0.32;
    var spread = (Math.random() - 0.5) * 1.1;
    return {
      x: sx, y: sy,
      vx: Math.cos(toC + spread) * spd,
      vy: Math.sin(toC + spread) * spd,
      r: col[0], g: col[1], b: col[2],
      sz: 0.7 + Math.random() * 2.4,
      a: 0, maxA: 0.12 + Math.random() * 0.42,
      life: 0, maxL: 240 + Math.random() * 380
    };
  }

  var particles = [];
  for (var i = 0; i < 200; i++) {
    var p = mkParticle();
    p.life = Math.random() * p.maxL;
    p.a    = p.maxA * Math.sin(Math.PI * p.life / p.maxL);
    particles.push(p);
  }

  var alive = true;
  var raf;

  function frame() {
    if (!alive) return;
    ctx.clearRect(0, 0, W, H);

    /* Faint dark overlay for motion blur effect */
    ctx.fillStyle = 'rgba(10,12,20,0.22)';
    ctx.fillRect(0, 0, W, H);

    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      p.x += p.vx; p.y += p.vy; p.life++;

      var t = p.life / p.maxL;
      p.a = p.maxA * Math.sin(Math.PI * t);

      if (p.life >= p.maxL) { particles[j] = mkParticle(); continue; }

      /* Main dot */
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, 6.283);
      ctx.fillStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + p.a + ')';
      ctx.fill();

      /* Streak trail for larger, more visible particles */
      if (p.sz > 1.8 && p.a > 0.22) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 14, p.y - p.vy * 14);
        ctx.strokeStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (p.a * 0.28) + ')';
        ctx.lineWidth = p.sz * 0.55;
        ctx.stroke();
      }
    }

    raf = requestAnimationFrame(frame);
  }

  frame();

  /* ─── LOADING BAR ────────────────────────────────────────────── */
  var bar  = document.getElementById('aqsBar');
  var prog = 0, tgt = 0;

  function stepBar() {
    if (!alive) return;
    if (tgt < 87) tgt += Math.random() * 6 + 1.5;
    if (tgt > 87) tgt = 87;
    prog += (tgt - prog) * 0.13;
    if (bar) bar.style.width = prog.toFixed(1) + '%';
  }
  var barTimer = setInterval(stepBar, 145);

  /* ─── NATION TEXT CYCLE ──────────────────────────────────────── */
  var ni  = 0;
  var nEl = document.getElementById('aqsNation');

  function cycleNation() {
    if (!nEl || !alive) return;
    nEl.style.opacity = '0';
    setTimeout(function () {
      ni = (ni + 1) % NATIONS.length;
      nEl.textContent  = NATIONS[ni].t;
      nEl.style.color  = NATIONS[ni].c;
      nEl.style.opacity = '1';
    }, 360);
  }
  var natTimer = setInterval(cycleNation, 1400);

  /* ─── DISMISS LOGIC ──────────────────────────────────────────── */
  var t0     = Date.now();
  var loaded = false;
  var gone   = false;

  function dismiss() {
    if (gone) return;
    gone = true;

    clearInterval(barTimer);
    clearInterval(natTimer);

    /* Complete the bar */
    if (bar) {
      bar.style.transition = 'width 0.35s ease';
      bar.style.width = '100%';
    }

    /* Short pause, then fade out */
    setTimeout(function () {
      var el = document.getElementById('aqsSplash');
      if (el) el.classList.add('aqs-gone');

      setTimeout(function () {
        var el2 = document.getElementById('aqsSplash');
        if (el2) el2.remove();
        var sty = document.getElementById('aqsSplashCSS');
        if (sty) sty.remove();
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      }, 950);
    }, 350);
  }

  function check() {
    if (gone) return;
    if (loaded && (Date.now() - t0) >= MIN_MS) dismiss();
    else setTimeout(check, 90);
  }

  function onLoad() {
    loaded = true;
    check();
  }

  if (document.readyState === 'complete') {
    onLoad();
  } else {
    window.addEventListener('load', onLoad);
  }

  /* Hard timeout — never stay longer than HARD_MAX */
  setTimeout(onLoad, HARD_MAX);

})();