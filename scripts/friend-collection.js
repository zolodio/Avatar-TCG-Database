/* ================================================================
   Avatar TCG — Friend Collection Viewer  (friend-collection.js)

   FIXES:
     • progression.js renderCardsInCommon queried a non-existent
       `user_cards` table; actual data lives in `collections`
       (physical JSON + digital JSON), written by auth.js.

   ADDS:
     • viewFriendCollection(userId, username) — full-screen modal
       showing the friend's cards with a Physical / Digital toggle.
     • Patches renderCardsInCommon to read from `collections`.
     • Adds a "👁 View Collection" button on every friend card
       rendered by social.js (via event delegation).

   USAGE:
     Add ONE script tag AFTER social.js:
       <script src="scripts/friend-collection.js"></script>
   ================================================================ */
(function () {
  'use strict';

  // ── tiny helpers ──────────────────────────────────────────────
  function sb()   { return window.sb; }
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function cards() { return window.allCards || []; }

  var rarityColor = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };

  // ── fetch friend data from `collections` table ────────────────
  async function fetchFriendCollections(userId) {
    if (!sb() || !userId) return { physical: {}, digital: {} };
    try {
      var res = await sb()
        .from('collections')
        .select('physical, digital')
        .eq('user_id', userId)
        .maybeSingle();
      if (res.error) throw res.error;
      return {
        physical: (res.data && res.data.physical)  || {},
        digital:  (res.data && res.data.digital)   || {}
      };
    } catch (e) {
      console.warn('[friend-collection] fetch failed:', e.message || e);
      return { physical: {}, digital: {} };
    }
  }

  // ── fetch friend's shared characters from `shared_characters` ────
  async function fetchFriendSharedCharacters(userId) {
    if (!sb() || !userId) return [];
    try {
      var res = await sb()
        .from('shared_characters')
        .select('data, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data || []).map(function (r) { return r.data; }).filter(Boolean);
    } catch (e) {
      console.warn('[friend-collection] fetchFriendSharedCharacters failed:', e.message || e);
      return [];
    }
  }


  // Override the broken version that queried user_cards.
  window.renderCardsInCommon = async function (friendUserId) {
    var myCol   = window.collection || {};
    var myOwned = Object.keys(myCol).filter(function (n) { return (myCol[n] || 0) > 0; });

    if (!myOwned.length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'Add cards to your collection to see what you have in common.</div>';
    }
    if (!sb()) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);">Not available offline.</div>';
    }

    var data = await fetchFriendCollections(friendUserId);
    var friendCol = data.physical;

    if (!Object.keys(friendCol).length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'This Bender hasn\'t synced their collection yet.</div>';
    }

    var commonNums  = myOwned.filter(function (n) { return !!friendCol[n]; });
    var onlyMeNums  = myOwned.filter(function (n) { return !friendCol[n]; });
    var onlyThem    = Object.keys(friendCol).filter(function (n) { return !(myCol[n] > 0); });

    if (!commonNums.length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'No cards in common yet — maybe a trade could help! 🤝</div>';
    }

    var AC = cards();
    function cardGrid(nums, borderColor) {
      var filtered = AC.filter(function (c) { return nums.indexOf(c.number) !== -1; });
      filtered.sort(function (a, b) {
        var ro = { common:1, uncommon:2, rare:3, zenemental:4, promo:5 };
        return (ro[a.rarity]||0) - (ro[b.rarity]||0) ||
               (parseInt(a.number,10)||0) - (parseInt(b.number,10)||0);
      });
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px;margin-bottom:14px;">' +
        filtered.map(function (c) {
          return '<div title="#' + esc(c.number) + ' ' + esc(c.name) + '" ' +
            'style="background:var(--bg-card);border:1px solid ' + borderColor + ';border-radius:7px;overflow:hidden;">' +
            (c.imageLink
              ? '<img src="' + esc(c.imageLink) + '" alt="' + esc(c.name) + '" loading="lazy" style="width:100%;display:block;">'
              : '<div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:var(--text-muted);padding:4px;text-align:center;">' + esc(c.name) + '</div>') +
            '<div style="padding:2px 4px;font-size:0.5rem;color:' + (rarityColor[c.rarity]||'var(--text-muted)') + ';font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(c.rarity) + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return '<div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">' +
        '<div style="background:rgba(46,140,232,0.08);border:1px solid rgba(46,140,232,0.25);border-radius:8px;padding:10px;text-align:center;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1.2rem;font-weight:700;color:var(--water);">' + commonNums.length + '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">In Common</div>' +
        '</div>' +
        '<div style="background:rgba(61,184,108,0.08);border:1px solid rgba(61,184,108,0.2);border-radius:8px;padding:10px;text-align:center;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1.2rem;font-weight:700;color:var(--success);">' + onlyMeNums.length + '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Only You</div>' +
        '</div>' +
        '<div style="background:rgba(240,201,70,0.08);border:1px solid rgba(240,201,70,0.2);border-radius:8px;padding:10px;text-align:center;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1.2rem;font-weight:700;color:var(--air);">' + onlyThem.length + '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Only Them</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--water);font-weight:700;margin-bottom:8px;">' +
        '<i class="fas fa-people-arrows" style="margin-right:5px;"></i>Cards you both own' +
      '</div>' +
      cardGrid(commonNums, 'rgba(46,140,232,0.35)') +
    '</div>';
  };

  // ════════════════════════════════════════════════════════════════
  //  FULL COLLECTION VIEWER MODAL
  // ════════════════════════════════════════════════════════════════

  var _modal   = null;   // DOM element
  var _overlay = null;
  var _state   = { userId: null, username: '', mode: 'physical', data: null, search: '', rarity: 'all',
                   charData: null /* shared_characters rows for this friend */ };

  function ensureModal() {
    if (_modal) return;

    // Overlay backdrop
    _overlay = document.createElement('div');
    _overlay.id = 'fcv-overlay';
    _overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:150;',
      'display:none;align-items:center;justify-content:center;',
      'padding:16px;backdrop-filter:blur(4px);',
    ].join('');
    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) closeModal();
    });

    // Modal box
    _modal = document.createElement('div');
    _modal.id = 'fcv-modal';
    _modal.style.cssText = [
      'background:var(--bg-secondary);border:1px solid var(--border);',
      'border-radius:var(--radius-lg);max-width:700px;width:100%;',
      'max-height:90vh;display:flex;flex-direction:column;',
      'box-shadow:0 16px 56px rgba(0,0,0,0.7);',
      'animation:fcvSlide 0.28s cubic-bezier(0.34,1.1,0.64,1);',
    ].join('');

    _overlay.appendChild(_modal);
    document.body.appendChild(_overlay);

    // keyframe
    if (!document.getElementById('fcv-kf')) {
      var s = document.createElement('style');
      s.id = 'fcv-kf';
      s.textContent = '@keyframes fcvSlide{from{transform:translateY(22px);opacity:0}to{transform:translateY(0);opacity:1}}';
      document.head.appendChild(s);
    }
  }

  function closeModal() {
    if (_overlay) _overlay.style.display = 'none';
  }

  // ── open entry point ─────────────────────────────────────────
  window.viewFriendCollection = async function (userId, username, startMode) {
    ensureModal();
    _state.userId   = userId;
    _state.username = username || 'Friend';
    _state.mode     = startMode || 'physical';
    _state.data     = null;
    _state.charData = null;
    _state.search   = '';
    _state.rarity   = 'all';

    _overlay.style.display = 'flex';
    renderModal('<div style="text-align:center;padding:40px;color:var(--text-muted);">' +
      '<i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;margin-bottom:12px;display:block;"></i>' +
      'Loading ' + esc(username) + '\'s profile…</div>');

    // Fetch cards and characters in parallel
    var results = await Promise.all([
      fetchFriendCollections(userId),
      fetchFriendSharedCharacters(userId)
    ]);
    _state.data     = results[0];
    _state.charData = results[1];
    renderModalContent();
  };

  // ── open directly to Characters tab (called from character-sharing.js) ─
  window.viewFriendCharacters = async function (userId, highlightChar) {
    // highlightChar may be a full character object passed from the shared list
    var username = 'Friend';
    // Try to get a name from the character itself
    if (highlightChar && highlightChar.givenName) {
      username = 'a Friend'; // we don't have the username at this point
    }
    ensureModal();
    _state.userId   = userId;
    _state.username = username;
    _state.mode     = 'characters';
    _state.data     = { physical: {}, digital: {} };
    _state.charData = null;
    _state.search   = '';
    _state.rarity   = 'all';

    _overlay.style.display = 'flex';
    renderModal('<div style="text-align:center;padding:40px;color:var(--text-muted);">' +
      '<i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;margin-bottom:12px;display:block;"></i>' +
      'Loading characters…</div>');

    _state.charData = await fetchFriendSharedCharacters(userId);
    // If we got a name from the characters, use the first one's owner label
    renderModalContent();
  };

  function renderModal(bodyHtml) {
    _modal.innerHTML =
      // Header
      '<div style="display:flex;justify-content:space-between;align-items:center;' +
        'padding:15px 18px;border-bottom:1px solid var(--border);flex-shrink:0;">' +
        '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;color:var(--text-primary);">' +
          '<i class="fas fa-user" style="color:var(--zen);margin-right:8px;font-size:0.85rem;"></i>' +
          esc(_state.username) + '\'s Collection' +
        '</div>' +
        '<button id="fcv-close" style="background:none;border:none;color:var(--text-muted);font-size:1.2rem;' +
          'cursor:pointer;padding:4px;line-height:1;transition:color 0.2s;">' +
          '<i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div id="fcv-body" style="flex:1;overflow-y:auto;min-height:0;">' + bodyHtml + '</div>';

    var closeBtn = document.getElementById('fcv-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }

  function renderModalContent() {
    // ── Characters mode ──────────────────────────────────────────
    if (_state.mode === 'characters') {
      renderCharactersContent();
      return;
    }

    var data     = _state.data || { physical: {}, digital: {} };
    var col      = _state.mode === 'physical' ? data.physical : data.digital;
    var allC     = cards();
    var owned    = Object.keys(col).filter(function (n) { return (col[n] || 0) > 0; });

    // Filter pool
    var pool = allC.filter(function (c) {
      if (!owned.includes(c.number)) return false;
      if (_state.rarity !== 'all' && c.rarity !== _state.rarity) return false;
      if (_state.search) {
        var q = _state.search.toLowerCase();
        if (c.name.toLowerCase().indexOf(q) === -1 && c.number.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });

    // Sort by number
    pool.sort(function (a, b) {
      return (parseInt(a.number,10)||0) - (parseInt(b.number,10)||0);
    });

    var physCount = Object.keys(data.physical).filter(function (n) { return (data.physical[n]||0)>0; }).length;
    var digCount  = Object.keys(data.digital).filter(function (n) { return (data.digital[n]||0)>0; }).length;

    var modePhys  = _state.mode === 'physical';

    var html =
      // Sticky controls
      '<div style="position:sticky;top:0;z-index:10;background:var(--bg-secondary);' +
        'padding:12px 18px 10px;border-bottom:1px solid var(--border);">' +

        // Physical / Digital / Characters toggle
        '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
          makeToggleBtn('physical', modePhys,
            '<i class="fas fa-clone" style="transform:scale(.75,1.175)"></i> Physical',
            physCount + ' cards') +
          makeToggleBtn('digital', !modePhys,
            '<i class="fas fa-cloud-download-alt"></i> Digital',
            digCount + ' cards') +
          makeToggleBtn('characters', false,
            '<i class="fas fa-users"></i> Characters',
            (_state.charData ? _state.charData.length : '…') + ' shared') +
        '</div>' +

        // Search
        '<div style="position:relative;margin-bottom:8px;">' +
          '<i class="fas fa-search" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:0.8rem;pointer-events:none;"></i>' +
          '<input id="fcv-search" type="text" placeholder="Search cards…" value="' + esc(_state.search) + '" ' +
            'style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);' +
            'padding:9px 9px 9px 33px;color:var(--text-primary);font-size:16px;' +
            'font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
        '</div>' +

        // Rarity pills
        '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' +
          ['all','common','uncommon','rare','zenemental','promo'].map(function (r) {
            var active = _state.rarity === r;
            return '<button class="fcv-rfil" data-r="' + r + '" style="' + rarPillStyle(active, r) + '">' +
              (r==='all' ? 'All' : r==='zenemental' ? 'Zen' : r.charAt(0).toUpperCase()+r.slice(1)) +
            '</button>';
          }).join('') +
          '<span style="margin-left:auto;font-size:0.7rem;color:var(--text-muted);">' + pool.length + ' shown</span>' +
        '</div>' +
      '</div>' +

      // Card grid or empty
      '<div style="padding:14px 18px 20px;">' +
        (pool.length === 0
          ? emptyState(owned.length, _state.mode)
          : renderGrid(pool, col)) +
      '</div>';

    renderModal(html);

    // Wire controls
    var searchEl = document.getElementById('fcv-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        _state.search = this.value;
        renderModalContent();
      });
      searchEl.addEventListener('focus', function () { this.style.borderColor='var(--zen)'; });
      searchEl.addEventListener('blur',  function () { this.style.borderColor='var(--border)'; });
    }

    document.querySelectorAll('.fcv-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var newMode = this.dataset.mode;
        _state.search = '';
        _state.rarity = 'all';

        if (newMode === 'characters') {
          _state.mode = 'characters';
          // Load char data if not yet fetched
          if (_state.charData === null) {
            _state.charData = [];
            fetchFriendSharedCharacters(_state.userId).then(function (chars) {
              _state.charData = chars;
              renderModalContent();
            });
          }
          renderModalContent();
        } else {
          _state.mode = newMode;
          renderModalContent();
        }
      });
    });

    document.querySelectorAll('.fcv-rfil').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.rarity = this.dataset.r;
        renderModalContent();
      });
    });

    // Card click → open detail modal
    var body = document.getElementById('fcv-body');
    if (body) {
      body.addEventListener('click', function (e) {
        var tile = e.target.closest('[data-fcv-num]');
        if (tile && typeof window.openModal === 'function') {
          window.openModal(tile.dataset.fcvNum);
        }
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  CHARACTERS TAB — renders shared characters for this friend
  // ════════════════════════════════════════════════════════════════

  function fcvEsc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fcvEmoji(el) {
    var m = { water:'💧', earth:'🪨', fire:'🔥', air:'🌬️', 'non-bender':'⚔️', spirit:'✨' };
    return m[el] || '🌀';
  }

  function renderCharactersContent() {
    var chars = _state.charData || [];

    // Toggle row — Characters tab is active
    var data      = _state.data || { physical: {}, digital: {} };
    var physCount = Object.keys(data.physical).filter(function (n) { return (data.physical[n]||0)>0; }).length;
    var digCount  = Object.keys(data.digital).filter(function (n) { return (data.digital[n]||0)>0; }).length;

    var html =
      '<div style="position:sticky;top:0;z-index:10;background:var(--bg-secondary);' +
        'padding:12px 18px 10px;border-bottom:1px solid var(--border);">' +
        '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
          makeToggleBtn('physical', false,
            '<i class="fas fa-clone" style="transform:scale(.75,1.175)"></i> Physical',
            physCount + ' cards') +
          makeToggleBtn('digital', false,
            '<i class="fas fa-cloud-download-alt"></i> Digital',
            digCount + ' cards') +
          makeToggleBtn('characters', true,
            '<i class="fas fa-users"></i> Characters',
            chars.length + ' shared') +
        '</div>' +
      '</div>';

    if (!chars.length) {
      html +=
        '<div style="text-align:center;padding:50px 20px;color:var(--text-muted);">' +
        '<i class="fas fa-users" style="font-size:2.5rem;opacity:0.2;display:block;margin-bottom:14px;"></i>' +
        '<p style="font-size:0.85rem;">' + fcvEsc(_state.username) + ' hasn\'t shared any characters yet.</p>' +
        '</div>';
    } else {
      html += '<div style="padding:14px 18px 20px;display:flex;flex-direction:column;gap:10px;">';
      chars.forEach(function (char) {
        if (!char) return;
        var imgHtml = char.imageData
          ? '<img src="data:' + char.imageMime + ';base64,' + char.imageData + '"' +
            ' alt="' + fcvEsc(char.givenName) + '"' +
            ' style="width:52px;height:52px;border-radius:8px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">'
          : '<div style="width:52px;height:52px;border-radius:8px;background:var(--bg-surface);' +
            'border:1px solid var(--border);display:flex;align-items:center;justify-content:center;' +
            'font-size:1.4rem;flex-shrink:0;">' + fcvEmoji(char.bending) + '</div>';

        var bend = char.bending
          ? (char.bending.charAt(0).toUpperCase() + char.bending.slice(1))
          : 'Non-Bender';
        var sub = [bend, char.mastery || '', char.strike || '', char.advantage || '', char.ally || '']
          .filter(Boolean).join(' · ');

        // Personality highlights (top 3 non-empty sliders)
        var persLines = [];
        if (char.personality) {
          Object.keys(char.personality).forEach(function (k) {
            var v = char.personality[k];
            if (v !== '' && v !== undefined) persLines.push({ k: k, v: Number(v) });
          });
          persLines.sort(function (a, b) { return b.v - a.v; });
          persLines = persLines.slice(0, 3);
        }

        var persHtml = persLines.length
          ? '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;">' +
            persLines.map(function (p) {
              return '<span style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:99px;' +
                'background:rgba(180,77,223,0.1);border:1px solid rgba(180,77,223,0.25);color:var(--zen);">' +
                fcvEsc(p.k) + ' ' + p.v +
                '</span>';
            }).join('') +
            '</div>'
          : '';

        var backstory = char.backstoryFree
          ? '<div style="margin-top:8px;font-size:0.73rem;color:var(--text-muted);line-height:1.5;' +
            'border-left:2px solid var(--border);padding-left:9px;font-style:italic;">' +
            fcvEsc((char.backstoryFree || '').slice(0, 200)) +
            (char.backstoryFree.length > 200 ? '…' : '') +
            '</div>'
          : '';

        html +=
          '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);' +
            'padding:12px 14px;display:flex;gap:12px;align-items:flex-start;">' +
            imgHtml +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.88rem;">' +
                fcvEsc(char.givenName || 'Unnamed') +
                (char.nickName ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">"' + fcvEsc(char.nickName) + '"</span>' : '') +
              '</div>' +
              '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + fcvEsc(sub) + '</div>' +
              persHtml +
              backstory +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    renderModal(html);

    // Wire the toggle buttons in this mode too
    document.querySelectorAll('.fcv-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var newMode = this.dataset.mode;
        _state.search = '';
        _state.rarity = 'all';
        _state.mode   = newMode;
        renderModalContent();
      });
    });
  }

  function makeToggleBtn(mode, active, label, sub) {
    var bg     = active ? 'var(--zen)' : 'var(--bg-card)';
    var border = active ? 'var(--zen)' : 'var(--border)';
    var clr    = active ? '#fff'       : 'var(--text-secondary)';
    var shadow = active ? ';box-shadow:0 4px 12px rgba(180,77,223,0.3)' : '';
    return '<button class="fcv-mode-btn" data-mode="' + mode + '" style="' +
      'flex:1;padding:10px 14px;border-radius:var(--radius);border:1px solid ' + border + ';' +
      'background:' + bg + ';color:' + clr + ';' +
      'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.82rem;cursor:pointer;' +
      'transition:all 0.2s;text-align:left' + shadow + ';">' +
      '<div style="display:flex;align-items:center;gap:7px;">' +
        '<span>' + label + '</span>' +
        '<span style="margin-left:auto;font-size:0.65rem;opacity:0.75;">' + sub + '</span>' +
      '</div>' +
    '</button>';
  }

  function rarPillStyle(active, r) {
    var colors = {
      all:        'var(--zen)',
      common:     'var(--text-secondary)',
      uncommon:   'var(--earth)',
      rare:       'var(--water)',
      zenemental: 'var(--zen)',
      promo:      'var(--promo)'
    };
    var clr = colors[r] || 'var(--text-secondary)';
    return 'padding:5px 10px;border-radius:99px;font-size:0.65rem;font-weight:700;cursor:pointer;' +
      'font-family:\'Nunito Sans\',sans-serif;white-space:nowrap;transition:all 0.18s;text-transform:capitalize;' +
      'border:1px solid ' + (active ? 'white' : 'var(--border)') + ';' +
      'background:' + (active ? clr : 'var(--bg-card)') + ';' +
      'color:' + (active ? '#fff' : 'var(--text-secondary)') + ';';
  }

  function emptyState(totalOwned, mode) {
    if (totalOwned === 0) {
      return '<div style="text-align:center;padding:50px 20px;color:var(--text-muted);">' +
        '<i class="fas fa-inbox" style="font-size:2.5rem;opacity:0.25;display:block;margin-bottom:14px;"></i>' +
        '<p style="font-size:0.85rem;">This Bender hasn\'t synced their ' + mode + ' collection yet.</p></div>';
    }
    return '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">' +
      '<i class="fas fa-filter" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:12px;"></i>' +
      '<p style="font-size:0.82rem;">No cards match your filters.</p></div>';
  }

  function renderGrid(pool, col) {
    var myCol    = window.collection || {};
    var iHaveIt  = function (num) { return (myCol[num] || 0) > 0; };

    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">' +
      pool.map(function (card) {
        var qty     = col[card.number] || 0;
        var both    = iHaveIt(card.number);
        var rcColor = rarityColor[card.rarity] || 'var(--text-secondary)';

        return '<div data-fcv-num="' + esc(card.number) + '" style="' +
          'background:var(--bg-card);border:1px solid ' + (both ? 'rgba(46,140,232,0.45)' : 'var(--border)') + ';' +
          'border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:all 0.22s;' +
          (both ? 'box-shadow:0 0 0 1px rgba(46,140,232,0.15);' : '') + '"' +
          ' onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.borderColor=\'' +
            (both ? 'rgba(46,140,232,0.7)' : 'var(--border-light)') + '\';" ' +
          ' onmouseleave="this.style.transform=\'\';this.style.borderColor=\'' +
            (both ? 'rgba(46,140,232,0.45)' : 'var(--border)') + '\';">' +

          '<div style="position:relative;aspect-ratio:3/4;background:var(--bg-primary);">' +
            (card.imageLink
              ? '<img src="' + esc(card.imageLink) + '" alt="' + esc(card.name) + '" loading="lazy" ' +
                'style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">'
              : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">' +
                '<i class="fas fa-hat-wizard" style="opacity:0.2;font-size:1.8rem;color:var(--text-muted);"></i></div>') +
            '<span style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.72);' +
              'color:#fff;font-size:0.5rem;font-weight:700;padding:1px 5px;border-radius:99px;">#' + esc(card.number) + '</span>' +
            (qty > 1
              ? '<span style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.72);' +
                'color:var(--air);font-size:0.56rem;font-weight:700;padding:1px 6px;border-radius:99px;">×' + qty + '</span>'
              : '') +
            (both
              ? '<span style="position:absolute;bottom:4px;right:4px;' +
                'background:rgba(46,140,232,0.85);color:#fff;font-size:0.5rem;font-weight:700;' +
                'padding:1px 6px;border-radius:99px;" title="You own this too">' +
                '<i class="fas fa-people-arrows"></i></span>'
              : '') +
          '</div>' +

          '<div style="padding:5px 7px 7px;">' +
            '<div style="font-size:0.63rem;font-weight:700;white-space:nowrap;overflow:hidden;' +
              'text-overflow:ellipsis;color:var(--text-primary);margin-bottom:2px;" title="' + esc(card.name) + '">' +
              esc(card.name) + '</div>' +
            '<div style="font-size:0.5rem;font-weight:700;text-transform:uppercase;' +
              'letter-spacing:0.04em;color:' + rcColor + ';">' + esc(card.rarity) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // ════════════════════════════════════════════════════════════════
  //  INJECT "View Collection" BUTTON via event delegation
  //  Works regardless of when social.js renders friend cards.
  // ════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-view-collection]');
    if (!btn) return;
    e.stopPropagation();
    var userId   = btn.getAttribute('data-view-collection');
    var username = btn.getAttribute('data-username') || 'Friend';
    window.viewFriendCollection(userId, username);
  });

  // ── Patch: add "View Collection" button after friend cards render ─
  // We override the MutationObserver approach so social.js friend
  // cards automatically get the button injected once per render.
  var _patchedFriendList = false;
  function patchFriendList() {
    var friendListEl = document.getElementById('friendList');
    if (!friendListEl || _patchedFriendList) return;
    _patchedFriendList = true;

    var observer = new MutationObserver(function () {
      friendListEl.querySelectorAll('.friend-card').forEach(function (card) {
        if (card.querySelector('[data-view-collection]')) return; // already patched
        // Try to extract userId from existing buttons' data or from a hidden attr
        var userId   = card.getAttribute('data-user-id') || card.dataset.userId;
        var username = card.querySelector('.friend-name');
        username     = username ? username.textContent.trim() : 'Friend';
        if (!userId) return;

        var actionsDiv = card.querySelector('.friend-actions');
        if (!actionsDiv) return;

        var viewBtn = document.createElement('button');
        viewBtn.className = 'friend-btn';
        viewBtn.setAttribute('data-view-collection', userId);
        viewBtn.setAttribute('data-username', username);
        viewBtn.title = 'View ' + username + '\'s collection';
        viewBtn.innerHTML = '<i class="fas fa-layer-group"></i>';
        actionsDiv.appendChild(viewBtn);
      });
    });

    observer.observe(friendListEl, { childList: true, subtree: true });
  }

  // Also expose as global so social.js can call it directly
  window.openFriendCollectionViewer = window.viewFriendCollection;

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchFriendList);
  } else {
    patchFriendList();
  }

  // Re-attempt patch when the Friends tab becomes visible
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-nested-tab="friends"]');
    if (btn) setTimeout(patchFriendList, 120);
  });

  console.log('[friend-collection.js] loaded — renderCardsInCommon patched ✓');

})();
