/* ═══════════════════════════════════════════════════════════════
   Avatar TCG — Persistent Media Control Bar
   Attach as <script src="scripts/media-player.js"></script>
   just before </body>, after the existing EPB script block.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CSS ────────────────────────────────────────────────────── */
  var s = document.createElement('style');
  s.textContent = `
    :root { --mb-h: 58px; --mb-h-mob: 50px; }

    /* Shift floating buttons up when bar is active */
    body.has-media-bar .epb-main-btn        { bottom: calc(var(--mb-h) + 14px) !important; }
    body.has-media-bar #scrollTopBtn        { bottom: calc(var(--mb-h) + 14px) !important; }
    body.has-media-bar .epb-chat-panel      { bottom: calc(var(--mb-h) + 14px + 54px) !important; }
    body.has-media-bar .how-to-popup        { bottom: calc(var(--mb-h) + 14px + 64px) !important; }
    body.has-media-bar .app-container       { padding-bottom: calc(var(--mb-h) + 90px) !important; }
    body.has-media-bar .epb-sub-btn         { bottom: calc(var(--mb-h) + 14px + var(--epb-sub-offset, 0px)) !important; }

    /* EPB sub-button Y offsets — recalculate each button's base offset */
    body.has-media-bar #epbSub-chat   { bottom: calc(var(--mb-h) + 14px + 90px)  !important; }
    body.has-media-bar #epbLabel-chat { bottom: calc(var(--mb-h) + 14px + 90px)  !important; }
    body.has-media-bar #epbSub-help   { bottom: calc(var(--mb-h) + 14px + 54px)  !important; }
    body.has-media-bar #epbLabel-help { bottom: calc(var(--mb-h) + 14px + 54px)  !important; }
    body.has-media-bar #epbSub-play   { bottom: calc(var(--mb-h) + 14px + 20px)  !important; }
    body.has-media-bar #epbLabel-play { bottom: calc(var(--mb-h) + 14px + 20px)  !important; }

    /* ── Media bar shell ── */
    .mb-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 51;
      height: var(--mb-h);
      background: rgba(8,10,18,0.97);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-top: 1px solid #252a42;
      display: flex;
      align-items: center;
      padding: 0 24px 0 10px;
      gap: 4px;
      transform: translateY(calc(100% + 2px));
      transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 -6px 28px rgba(0,0,0,0.55);
      overflow: visible;
    }
    .mb-bar.mb-show { transform: translateY(0); }

    /* ── Seek track (sits above bar border) ── */
    .mb-seek {
      position: absolute;
      top: -4px; left: 0; right: 0;
      height: 4px;
      cursor: pointer;
      background: #1e2541;
    }
    .mb-seek-fill {
      height: 100%;
      background: linear-gradient(90deg, #2e8ce8, #b44ddf);
      pointer-events: none;
      width: 0%;
      border-radius: 0 2px 2px 0;
    }
    .mb-seek-thumb {
      position: absolute;
      top: 50%; transform: translate(-50%,-50%);
      width: 10px; height: 10px; border-radius: 50%;
      background: #b44ddf;
      border: 2px solid #0a0c14;
      pointer-events: none;
      left: 0%;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .mb-seek:hover .mb-seek-thumb { opacity: 1; }

    /* ── Track info ── */
    .mb-info {
      display: flex; align-items: center; gap: 8px;
      flex: 0 0 auto; width: 180px; min-width: 0;
      overflow: hidden;
    }
    .mb-thumb {
      width: 36px; height: 36px; border-radius: 5px;
      object-fit: cover; flex-shrink: 0;
      background: #171c30;
      border: 1px solid #252a42;
      display: block;
    }
    .mb-track-text { min-width: 0; }
    .mb-track-name {
      font-size: 0.7rem; font-weight: 700;
      color: #e8e6f0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      line-height: 1.2;
    }
    .mb-track-time {
      font-size: 0.6rem; color: #5a5e78;
      margin-top: 2px; font-family: 'Courier New', monospace;
    }

    /* ── Controls ── */
    .mb-controls {
      display: flex; align-items: center; gap: 1px;
      flex: 1; justify-content: center;
    }
    .mb-btn {
      width: 32px; height: 32px; border-radius: 7px;
      background: none; border: none;
      color: #5a5e78; font-size: 0.8rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, background 0.15s;
      flex-shrink: 0; position: relative;
    }
    .mb-btn:hover         { color: #e8e6f0; background: #171c30; }
    .mb-btn.mb-on         { color: #b44ddf; }
    .mb-btn.mb-on:hover   { color: #d16bff; }

    /* Play/pause — larger pill */
    .mb-playpause {
      width: 38px; height: 38px; border-radius: 50%;
      background: #b44ddf; color: #fff; font-size: 0.88rem;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
      flex-shrink: 0;
      box-shadow: 0 2px 10px rgba(180,77,223,0.35);
      margin: 0 3px;
    }
    .mb-playpause:hover   { background: #c85ff0; transform: scale(1.07); }
    .mb-playpause.mb-pp-pause { background: #4a7dff; box-shadow: 0 2px 10px rgba(74,125,255,0.35); }
    .mb-playpause.mb-pp-pause:hover { background: #5d8cff; }

    /* Repeat badge */
    .mb-rep-num {
      position: absolute; bottom: 1px; right: 1px;
      font-size: 0.48rem; font-weight: 900; color: #b44ddf;
      line-height: 1; pointer-events: none;
      display: none;
    }

    /* ── Volume ── */
    .mb-vol {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: 5px;
      width: 115px;
    }
    .mb-vol-track {
      flex: 1; -webkit-appearance: none; appearance: none;
      height: 3px; border-radius: 99px;
      outline: none; cursor: pointer;
      background: #252a42;
    }
    .mb-vol-track::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 11px; height: 11px; border-radius: 50%;
      background: #b44ddf; cursor: pointer;
      box-shadow: 0 0 4px rgba(180,77,223,0.5);
    }
    .mb-vol-track::-moz-range-thumb {
      width: 11px; height: 11px; border-radius: 50%;
      background: #b44ddf; cursor: pointer; border: none;
    }

    /* ── Mobile ── */
    @media (max-width: 520px) {
      :root { --mb-h: var(--mb-h-mob); }
      .mb-info { display: none; }
      .mb-bar  { padding: 0 6px; gap: 0; }
      .mb-btn  { width: 28px; height: 28px; font-size: 0.72rem; }
      .mb-playpause { width: 34px; height: 34px; font-size: 0.8rem; margin: 0 2px; }
      .mb-vol  { width: 90px; gap: 3px; }
      .mb-vol-track { height: 3px; }
    }
  `;
  document.head.appendChild(s);

  /* ── Build bar HTML ─────────────────────────────────────────── */
  var bar = document.createElement('div');
  bar.id = 'mbBar';
  bar.className = 'mb-bar';
  bar.innerHTML = `
    <div class="mb-seek" id="mbSeek">
      <div class="mb-seek-fill" id="mbFill"></div>
      <div class="mb-seek-thumb" id="mbThumb"></div>
    </div>

    <div class="mb-info">
      <img class="mb-thumb" id="mbArt" src="" alt="">
      <div class="mb-track-text">
        <div class="mb-track-name" id="mbName">Avatar Soundtrack</div>
        <div class="mb-track-time" id="mbTime">0:00 / 0:00</div>
      </div>
    </div>

    <div class="mb-controls">
      <button class="mb-btn" id="mbShuffle" title="Shuffle"><i class="fas fa-random"></i></button>
      <button class="mb-btn" id="mbPrev"    title="Previous track"><i class="fas fa-step-backward"></i></button>
      <button class="mb-btn" id="mbRew"     title="Rewind 10 s"><i class="fas fa-fast-backward"></i></button>

      <button class="mb-playpause" id="mbPP" title="Play / Pause">
        <i class="fas fa-play" id="mbPPIcon"></i>
      </button>

      <button class="mb-btn" id="mbStop"    title="Stop &amp; dismiss"><i class="fas fa-stop"></i></button>
      <button class="mb-btn" id="mbFwd"     title="Forward 10 s"><i class="fas fa-fast-forward"></i></button>
      <button class="mb-btn" id="mbNext"    title="Next track"><i class="fas fa-step-forward"></i></button>
      <button class="mb-btn" id="mbRepeat"  title="Repeat (off → all → one)">
        <i class="fas fa-redo"></i>
        <span class="mb-rep-num" id="mbRepNum">1</span>
      </button>
    </div>

    <div class="mb-vol">
      <button class="mb-btn" id="mbMute" title="Mute / Unmute" style="width:26px;flex-shrink:0;">
        <i class="fas fa-volume-up" id="mbVolIco"></i>
      </button>
      <input class="mb-vol-track" id="mbVol" type="range" min="0" max="100" value="80" step="1">
    </div>
  `;
  document.body.appendChild(bar);

  /* ── State ──────────────────────────────────────────────────── */
  var ytp        = null;   // YT.Player instance
  var ready      = false;
  var playing    = false;
  var muted      = false;
  var shuffle    = false;
  var repeat     = 'none'; // 'none' | 'all' | 'one'
  var seekDrag   = false;
  var tickId     = null;
  var lastVol    = 80;

  var PLAYLIST   = 'PLVdzXINk9vjd3uCgmwiTej4NfN-4U1ZRp';
  var FIRST_VID  = 'yBXbGHfs0kE';

  /* ── Helpers ────────────────────────────────────────────────── */
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function showBar()  { bar.classList.add('mb-show');    document.body.classList.add('has-media-bar'); }
  function hideBar()  { bar.classList.remove('mb-show'); document.body.classList.remove('has-media-bar'); }

  function setPP(isPlaying) {
    var pp  = document.getElementById('mbPP');
    var ico = document.getElementById('mbPPIcon');
    if (isPlaying) {
      pp.classList.add('mb-pp-pause');
      ico.className = 'fas fa-pause';
      pp.title = 'Pause';
    } else {
      pp.classList.remove('mb-pp-pause');
      ico.className = 'fas fa-play';
      pp.title = 'Play';
    }
  }

  function setVolIcon(vol, isMuted) {
    var ico = document.getElementById('mbVolIco');
    if (isMuted || vol === 0)  ico.className = 'fas fa-volume-mute';
    else if (vol < 40)         ico.className = 'fas fa-volume-down';
    else                       ico.className = 'fas fa-volume-up';
  }

  function setRepeatUI() {
    var btn   = document.getElementById('mbRepeat');
    var badge = document.getElementById('mbRepNum');
    if (repeat === 'none') {
      btn.classList.remove('mb-on');
      badge.style.display = 'none';
    } else if (repeat === 'all') {
      btn.classList.add('mb-on');
      badge.style.display = 'none';
      btn.title = 'Repeat all — click for repeat one';
    } else {
      btn.classList.add('mb-on');
      badge.style.display = 'block';
      btn.title = 'Repeat one — click to turn off';
    }
  }

  /* ── Seek / progress ────────────────────────────────────────── */
  function tick() {
    if (!ready || !ytp || seekDrag) return;
    try {
      var cur = ytp.getCurrentTime() || 0;
      var dur = ytp.getDuration()    || 0;
      var pct = dur > 0 ? (cur / dur * 100) : 0;
      document.getElementById('mbFill').style.width  = pct + '%';
      document.getElementById('mbThumb').style.left  = pct + '%';
      document.getElementById('mbTime').textContent  = fmtTime(cur) + ' / ' + fmtTime(dur);
    } catch (e) {}
  }

  function startTick() { if (!tickId) tickId = setInterval(tick, 800); }
  function stopTick()  { clearInterval(tickId); tickId = null; }

  /* ── Seek bar drag ──────────────────────────────────────────── */
  function seekPct(pct) {
    pct = Math.max(0, Math.min(1, pct));
    document.getElementById('mbFill').style.width = (pct * 100) + '%';
    document.getElementById('mbThumb').style.left = (pct * 100) + '%';
    if (ready && ytp) {
      try { ytp.seekTo(pct * (ytp.getDuration() || 0), true); } catch (e) {}
    }
  }

  var seekEl = document.getElementById('mbSeek');
  seekEl.addEventListener('mousedown',  startSeek);
  seekEl.addEventListener('touchstart', startSeek, { passive: true });

  function startSeek(e) {
    seekDrag = true;
    doSeek(e);
    document.addEventListener('mousemove', doSeek);
    document.addEventListener('touchmove', doSeek, { passive: true });
    document.addEventListener('mouseup',  endSeek);
    document.addEventListener('touchend', endSeek);
  }
  function doSeek(e) {
    var t = e.touches ? e.touches[0] : e;
    var r = seekEl.getBoundingClientRect();
    seekPct((t.clientX - r.left) / r.width);
  }
  function endSeek() {
    seekDrag = false;
    document.removeEventListener('mousemove', doSeek);
    document.removeEventListener('touchmove', doSeek);
    document.removeEventListener('mouseup',  endSeek);
    document.removeEventListener('touchend', endSeek);
  }

  /* ── Track info ─────────────────────────────────────────────── */
  function refreshTrack() {
    if (!ready || !ytp) return;
    try {
      var d = ytp.getVideoData();
      if (d && d.title) document.getElementById('mbName').textContent = d.title;
      if (d && d.video_id)
        document.getElementById('mbArt').src =
          'https://img.youtube.com/vi/' + d.video_id + '/default.jpg';
    } catch (e) {}
  }

  /* ── YT Player init ─────────────────────────────────────────── */
  function setupPlayer() {
    var wrap = document.querySelector('.music-playlist-wrap');
    if (!wrap || document.getElementById('ytmp')) return;

    var div = document.createElement('div');
    div.id = 'ytmp';
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    wrap.innerHTML = '';
    wrap.appendChild(div);

    if (window.YT && window.YT.Player) { buildPlayer(); return; }
    window._mbYtCb = buildPlayer;
    if (!document.getElementById('ytApiSrc')) {
      var sc = document.createElement('script');
      sc.id  = 'ytApiSrc';
      sc.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(sc);
    }
  }

  /* Chain with any existing onYouTubeIframeAPIReady */
  var _prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    if (typeof _prev === 'function') _prev();
    if (typeof window._mbYtCb === 'function') { window._mbYtCb(); window._mbYtCb = null; }
  };

  function buildPlayer() {
    if (!document.getElementById('ytmp')) return;
    ytp = new YT.Player('ytmp', {
      videoId: FIRST_VID,
      playerVars: {
        list:           PLAYLIST,
        listType:       'playlist',
        rel:            0,
        playsinline:    1,
        controls:       1,
        modestbranding: 1
      },
      events: {
        onReady:       onReady,
        onStateChange: onState
      }
    });
  }

  function onReady(e) {
    ready = true;
    var vol = parseInt(document.getElementById('mbVol').value, 10);
    try { e.target.setVolume(vol); } catch (_) {}
  }

  function onState(e) {
    var S = e.data;
    if (S === YT.PlayerState.PLAYING) {
      playing = true;
      setPP(true);
      showBar();
      startTick();
      refreshTrack();
    } else if (S === YT.PlayerState.PAUSED) {
      playing = false;
      setPP(false);
      stopTick();
    } else if (S === YT.PlayerState.ENDED) {
      playing = false;
      setPP(false);
      stopTick();
      document.getElementById('mbFill').style.width = '100%';
      if (repeat === 'one') {
        try { ytp.seekTo(0); ytp.playVideo(); } catch (_) {}
      }
    } else if (S === YT.PlayerState.BUFFERING) {
      refreshTrack();
    }
  }

  /* ── Button wiring ──────────────────────────────────────────── */
  function safeCall(fn) {
    if (ready && ytp) { try { fn(ytp); } catch (_) {} }
  }

  document.getElementById('mbPP').addEventListener('click', function () {
    safeCall(function (p) { playing ? p.pauseVideo() : p.playVideo(); });
  });

  document.getElementById('mbStop').addEventListener('click', function () {
    safeCall(function (p) { p.stopVideo(); });
    playing = false;
    setPP(false);
    stopTick();
    document.getElementById('mbFill').style.width  = '0%';
    document.getElementById('mbThumb').style.left  = '0%';
    document.getElementById('mbTime').textContent  = '0:00 / 0:00';
    hideBar();
  });

  document.getElementById('mbPrev').addEventListener('click', function () {
    safeCall(function (p) { p.previousVideo(); });
  });

  document.getElementById('mbNext').addEventListener('click', function () {
    safeCall(function (p) { p.nextVideo(); });
  });

  document.getElementById('mbRew').addEventListener('click', function () {
    safeCall(function (p) { p.seekTo(Math.max(0, (p.getCurrentTime() || 0) - 10), true); });
  });

  document.getElementById('mbFwd').addEventListener('click', function () {
    safeCall(function (p) {
      var d = p.getDuration() || 0;
      p.seekTo(Math.min(d, (p.getCurrentTime() || 0) + 10), true);
    });
  });

  document.getElementById('mbShuffle').addEventListener('click', function () {
    shuffle = !shuffle;
    this.classList.toggle('mb-on', shuffle);
    this.title = shuffle ? 'Shuffle on — click to turn off' : 'Shuffle';
    safeCall(function (p) { p.setShuffle(shuffle); });
  });

  document.getElementById('mbRepeat').addEventListener('click', function () {
    repeat = repeat === 'none' ? 'all' : repeat === 'all' ? 'one' : 'none';
    setRepeatUI();
    safeCall(function (p) { p.setLoop(repeat !== 'none'); });
  });

  document.getElementById('mbMute').addEventListener('click', function () {
    muted = !muted;
    this.classList.toggle('mb-on', muted);
    safeCall(function (p) { muted ? p.mute() : p.unMute(); });
    var vol = parseInt(document.getElementById('mbVol').value, 10);
    setVolIcon(vol, muted);
  });

  document.getElementById('mbVol').addEventListener('input', function () {
    var vol = parseInt(this.value, 10);
    safeCall(function (p) {
      p.setVolume(vol);
      if (vol > 0 && muted) { p.unMute(); muted = false; document.getElementById('mbMute').classList.remove('mb-on'); }
    });
    setVolIcon(vol, muted && vol === 0);
    lastVol = vol;
  });

  /* ── Observe music panel → lazy-init player ─────────────────── */
  var musicPanel = document.getElementById('mediapanel-music');
  if (musicPanel) {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target === musicPanel && musicPanel.style.display !== 'none')
          setupPlayer();
      });
    }).observe(musicPanel, { attributes: true, attributeFilter: ['style'] });
  }

  /* Intercept click on the Music category button too */
  var nav = document.getElementById('mediaCatNav');
  if (nav) {
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-panel]');
      if (btn && btn.getAttribute('data-panel') === 'music')
        setTimeout(setupPlayer, 80);
    }, true);
  }

})();
