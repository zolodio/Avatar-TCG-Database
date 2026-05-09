// music-autoplay.js — Avatar TCG floating music player + profile toggle
(function () {
  'use strict';

  var PREF_KEY  = 'aqst_autoplay_music';
  var PLAYLIST  = 'PLVdzXINk9vjd3uCgmwiTej4NfN-4U1ZRp';
  var SEED_VID  = 'yBXbGHfs0kE';

  var ytPlayer     = null;
  var ytApiLoaded  = false;
  var ytApiReady   = false;
  var isPlaying    = false;

  // ── Preference ────────────────────────────────────────────────────
  function getPref()    { try { return localStorage.getItem(PREF_KEY) === 'true'; } catch(e) { return false; } }
  function setPref(val) { try { localStorage.setItem(PREF_KEY, val ? 'true' : 'false'); } catch(e) {} }

  // ── Bar elements (populated after DOMContentLoaded) ───────────────
  var bar, playBtn, statusEl, trackEl;

  function getBar()    { return bar    || (bar    = document.getElementById('musicPlayerBar')); }
  function getPlay()   { return playBtn || (playBtn = document.getElementById('mpPlayBtn')); }
  function getStatus() { return statusEl || (statusEl = document.getElementById('mpStatus')); }
  function getTrack()  { return trackEl  || (trackEl  = document.getElementById('mpTrackName')); }

  // ── Show / hide bar ───────────────────────────────────────────────
  function showBar() {
    var b = getBar(); if (!b) return;
    b.style.display = 'flex';
    document.body.classList.add('music-bar-active');
  }

  function hideBar() {
    var b = getBar(); if (!b) return;
    b.style.display = 'none';
    document.body.classList.remove('music-bar-active');
  }

  // ── UI helpers ────────────────────────────────────────────────────
  function setPlayIcon(playing) {
    isPlaying = playing;
    var btn = getPlay(); if (!btn) return;
    btn.innerHTML = playing
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
  }

  function setStatus(msg) {
    var el = getStatus(); if (el) el.textContent = msg || '';
  }

  function setTrack(title) {
    var el = getTrack(); if (el && title) el.textContent = title;
  }

  // ── YouTube IFrame API ────────────────────────────────────────────
  // Chain with any existing onYouTubeIframeAPIReady (e.g. from media-player.js)
  var _prevYTReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (typeof _prevYTReady === 'function') _prevYTReady();
    onYTReady();
  };

  function loadYTApi() {
    if (ytApiLoaded || document.getElementById('yt-music-api')) return;
    ytApiLoaded = true;
    var s = document.createElement('script');
    s.id  = 'yt-music-api';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  function onYTReady() {
    if (ytPlayer) { ytPlayer.playVideo(); return; }
    var container = document.getElementById('ytMusicOffscreen');
    if (!container) return;

    var div = document.createElement('div');
    div.id = 'ytMusicHolder';
    container.appendChild(div);

    ytPlayer = new YT.Player('ytMusicHolder', {
      width: 1, height: 1,
      videoId: SEED_VID,
      playerVars: {
        listType:       'playlist',
        list:           PLAYLIST,
        autoplay:       1,
        controls:       0,
        rel:            0,
        modestbranding: 1,
        iv_load_policy: 3,
        playsinline:    1,
        origin:         (location.origin && location.origin !== 'null') ? location.origin : location.href
      },
      events: {
        onReady: function (e) {
          setStatus('');
          e.target.playVideo();
        },
        onStateChange: onStateChange,
        onError: function (e) {
          setStatus('Error ' + e.data);
        }
      }
    });
  }

  function onStateChange(e) {
    var S = (typeof YT !== 'undefined') ? YT.PlayerState : {};
    switch (e.data) {
      case S.PLAYING:
        setPlayIcon(true);
        setStatus('');
        try {
          var data = ytPlayer.getVideoData();
          if (data && data.title) setTrack(data.title);
        } catch (_) {}
        break;
      case S.PAUSED:
        setPlayIcon(false);
        break;
      case S.ENDED:
        // Playlist should auto-advance; force it as a safety net
        try { ytPlayer.nextVideo(); } catch (_) {}
        break;
      case S.BUFFERING:
        setStatus('Buffering…');
        break;
    }
  }

  // ── Start playback ────────────────────────────────────────────────
  function startMusic() {
    showBar();
    if (ytPlayer) {
      try { ytPlayer.playVideo(); } catch (_) {}
      return;
    }
    setStatus('Loading…');
    setPlayIcon(false);
    if (ytApiReady) { onYTReady(); }
    else            { loadYTApi(); }
  }

  function stopMusic() {
    if (ytPlayer) { try { ytPlayer.pauseVideo(); } catch (_) {} }
  }

  // ── Button wiring (called after DOM ready) ────────────────────────
  function wireControls() {
    var playBtnEl = document.getElementById('mpPlayBtn');
    var prevBtnEl = document.getElementById('mpPrevBtn');
    var nextBtnEl = document.getElementById('mpNextBtn');
    var closeBtnEl = document.getElementById('mpCloseBtn');

    if (playBtnEl) {
      playBtnEl.addEventListener('click', function () {
        if (!ytPlayer) { startMusic(); return; }
        try {
          if (isPlaying) ytPlayer.pauseVideo();
          else           ytPlayer.playVideo();
        } catch (_) {}
      });
    }

    if (prevBtnEl) {
      prevBtnEl.addEventListener('click', function () {
        if (ytPlayer) { try { ytPlayer.previousVideo(); } catch (_) {} }
      });
    }

    if (nextBtnEl) {
      nextBtnEl.addEventListener('click', function () {
        if (ytPlayer) { try { ytPlayer.nextVideo(); } catch (_) {} }
      });
    }

    if (closeBtnEl) {
      closeBtnEl.addEventListener('click', function () {
        setPref(false);
        stopMusic();
        hideBar();
        refreshEditorToggle(false);
      });
    }
  }

  // ── Profile editor toggle injection ──────────────────────────────
  function refreshEditorToggle(checked) {
    var tog = document.getElementById('peAutoplayToggleEl');
    if (!tog) return;
    tog.classList.toggle('on', !!checked);
    var inp = tog.querySelector('input[type=checkbox]');
    if (inp) inp.checked = !!checked;
  }

  function injectEditorToggle() {
    var overlay = document.getElementById('profileEditorOverlay');
    if (!overlay) return;
    if (document.getElementById('peAutoplayToggleEl')) {
      refreshEditorToggle(getPref());
      return;
    }

    // Find the chamber <select>'s parent wrapper div
    var chamberSel = document.getElementById('peChamber');
    if (!chamberSel) return;

    // Walk up to the div that directly wraps the label+select pair
    var chamberSection = chamberSel.parentNode;
    while (chamberSection && chamberSection.tagName !== 'DIV') {
      chamberSection = chamberSection.parentNode;
    }
    if (!chamberSection) return;

    var wrap = document.createElement('div');
    wrap.style.marginBottom = '16px';
    wrap.innerHTML =
      '<label style="' +
        'font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;' +
        'color:var(--text-muted);font-weight:700;' +
        'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
        'cursor:default;' +
      '">' +
        '<div>' +
          '<div>Auto-play Music</div>' +
          '<div style="' +
            'font-weight:400;text-transform:none;letter-spacing:0;' +
            'font-size:0.65rem;color:var(--text-muted);margin-top:3px;' +
          '">Stream Avatar OST while you browse</div>' +
        '</div>' +
        '<span id="peAutoplayToggleEl" ' +
          'class="pe-music-toggle' + (getPref() ? ' on' : '') + '" ' +
          'role="switch" aria-checked="' + getPref() + '" ' +
          'tabindex="0" ' +
          'title="Toggle music autoplay">' +
          '<input type="checkbox" id="peAutoplayMusic"' + (getPref() ? ' checked' : '') + ' ' +
            'style="position:absolute;opacity:0;width:0;height:0;">' +
          '<span class="pe-toggle-track"></span>' +
          '<span class="pe-toggle-knob"></span>' +
        '</span>' +
      '</label>';

    // Insert after the chamber section
    chamberSection.after(wrap);

    var toggleEl = document.getElementById('peAutoplayToggleEl');
    function doToggle() {
      var now = !toggleEl.classList.contains('on');
      toggleEl.classList.toggle('on', now);
      toggleEl.setAttribute('aria-checked', now);
      var inp = toggleEl.querySelector('input');
      if (inp) inp.checked = now;
    }
    toggleEl.addEventListener('click', doToggle);
    toggleEl.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doToggle(); }
    });
  }

  // Watch for the profile editor being injected/activated
  var editorObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      // New node injected — check if it's the overlay
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (node.id === 'profileEditorOverlay') {
          setTimeout(injectEditorToggle, 60);
        }
      }
      // Class change on the overlay — it just opened
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var overlay = document.getElementById('profileEditorOverlay');
        if (overlay && overlay.classList.contains('active')) {
          setTimeout(injectEditorToggle, 60);
        }
      }
    }
  });
  editorObserver.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['class']
  });

  // Intercept the Save button in the profile editor
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#peSave');
    if (!btn) return;
    var tog = document.getElementById('peAutoplayToggleEl');
    if (!tog) return;
    var wantsMusic = tog.classList.contains('on');
    setPref(wantsMusic);
    if (wantsMusic) {
      startMusic();
    } else {
      stopMusic();
      hideBar();
    }
  });

  // ── Fix the Media-tab embed to auto-advance the playlist ──────────
  // The iframe needs listType+list params. Update lazily once the panel
  // is shown so the iframe actually exists in the DOM.
  function patchMusicTabEmbed() {
    var frame = document.querySelector('#mediapanel-music iframe');
    if (!frame) return;
    var correctSrc =
      'https://www.youtube.com/embed/' + SEED_VID +
      '?list=' + PLAYLIST +
      '&listType=playlist' +
      '&rel=0' +
      '&modestbranding=1' +
      '&iv_load_policy=3' +
      '&autoplay=0';
    if (frame.src !== correctSrc) frame.src = correctSrc;
  }

  // Patch when the music tab button is clicked
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-panel="music"]');
    if (btn) setTimeout(patchMusicTabEmbed, 200);
  });

  // ── Boot ──────────────────────────────────────────────────────────
  function boot() {
    wireControls();
    patchMusicTabEmbed();

    if (getPref()) {
      showBar();
      setStatus('Click ▶ to play');
      // Load API in background; autoplay may be blocked until first click
      loadYTApi();
      // After a short grace period, attempt true autoplay
      setTimeout(function () {
        if (ytApiReady) onYTReady();
      }, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('[music-autoplay.js] loaded ✓');
})();
