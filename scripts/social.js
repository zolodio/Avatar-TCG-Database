// ================================================================
//  AVATAR TCG — Social Features + Profile Editor  (social.js v6)
//  Trait selection: radio-within-group — one pick from each of
//  the three sets (bull|fox|lion) (mind|body|spirit) (light|dark|shadow)
//
//  DM rooms persisted via dm_rooms table.
//  Read receipts via dm_reads table (✓ sent, ✓✓ read, blue).
//
//  Requires: window.sb (Supabase client, set by auth.js)
// ================================================================
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────
  var currentUser    = null;
  var currentProfile = null;
  var chatSub        = null;
  var dmReadSub      = null;
  var forumReplySub  = null;
  var friendReqSub   = null;
  var currentRoom    = 'global';
  var currentCat     = 'all';
  var currentPostId  = null;
  var tbOffer        = [];
  var tbRequest      = [];

  // DM read-receipt state
  var currentDmOtherReadAt = null;

  // Profile editor state
  var peSelectedAvatar = null;
  var peSelectedTraits = [];
  var peUsernameValid  = true;
  var peAvatarFilter   = '';
  var peAvatarPage     = 0;
  var PE_PAGE_SIZE     = 48;
  var FREE_CARD_MAX    = 165;
  var PE_PREVIEW_SIZE  = 96;

  // Avatar crop offset state
  var peOffsetX = -42;
  var peOffsetY = -6;

  // Drag state
  var _dragBound  = false;
  var _dragging   = false;
  var _dragStartX = 0;
  var _dragStartY = 0;
  var _dragInitOX = 0;
  var _dragInitOY = 0;

  // ── Trait Groups ──────────────────────────────────────────────
  var TRAIT_GROUPS = [
   { key: 'elemental', label: 'Element', traits: ['water', 'earth', 'fire', 'air'] },
   { key: 'strike',  label: 'Strike',  traits: ['bull',  'fox',   'lion']          },
   { key: 'advantage',   label: 'Advantage',   traits: ['mind',  'body',  'spirit']},
   { key: 'ally',    label: 'Ally',    traits: ['light',  'dark',  'shadow']       }
];
  var TRAIT_KEYS = TRAIT_GROUPS.reduce(function (a, g) { return a.concat(g.traits); }, []);

  function traitGroup(traitName) {
    for (var i = 0; i < TRAIT_GROUPS.length; i++) {
      if (TRAIT_GROUPS[i].traits.indexOf(traitName) !== -1) return TRAIT_GROUPS[i];
    }
    return null;
  }

  // ── Rarity constants ──────────────────────────────────────────
  var RARITY_COLORS = {
    common:     'var(--text-secondary)',
    uncommon:   'var(--earth)',
    rare:       'var(--water)',
    zenemental: 'var(--zen)',
    promo:      'var(--promo)'
  };
  var RARITY_LABELS = {
    common:'Common', uncommon:'Uncommon', rare:'Rare',
    zenemental:'Zen', promo:'Promo'
  };
  var PACK_RARITIES = ['common','uncommon','rare','zenemental'];

  // ── Tiny helpers ──────────────────────────────────────────────
  function sb()  { return window.sb; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function initials(name) { return String(name||'?').charAt(0).toUpperCase(); }
  function fmtTime(iso) {
    if (!iso) return '';
    var d=new Date(iso), diff=Date.now()-d;
    if (diff<60000)    return 'just now';
    if (diff<3600000)  return Math.floor(diff/60000)+'m ago';
    if (diff<86400000) return Math.floor(diff/3600000)+'h ago';
    return d.toLocaleDateString();
  }
  function toast(msg) {
    if (typeof window.showToast==='function') { window.showToast(msg); return; }
    var t=$('toast'); if (!t) return;
    t.textContent=msg; t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }
  function findCard(num) {
    return (window.allCards||[]).find(function(c){ return c.number===String(num); });
  }
  function debounce(fn, ms) {
    var t; return function(){ clearTimeout(t); t=setTimeout(fn,ms); };
  }
  function allCards() { return window.allCards || []; }

  function isPackCard(num) {
    var n = parseInt(num, 10);
    return /^\d+$/.test(String(num)) && !isNaN(n) && n >= 1 && n <= 235;
  }

  function isCoreCard(num) {
    var s = String(num).trim();
    if (/^ABK00[1-8]$/i.test(s) || /^APR00[1-2]$/i.test(s) || /^FPR00[1-3]$/i.test(s)) return true;
    var n = parseInt(s, 10);
    return /^\d+$/.test(s) && !isNaN(n) && n >= 1 && n <= 235;
  }

  // ── Avatar crop clamp helper ──────────────────────────────────
  function clampOffset(ox, oy, containerPx) {
    containerPx = containerPx || PE_PREVIEW_SIZE;
    var imgW = containerPx * 1.85;
    var imgH = imgW * (4 / 3);
    var minLeft = ((containerPx - imgW) / containerPx) * 100;
    var minTop  = ((containerPx - imgH) / containerPx) * 100;
    return {
      x: Math.max(minLeft, Math.min(0, ox)),
      y: Math.max(minTop,  Math.min(0, oy))
    };
  }

  // ── Avatar rendering ──────────────────────────────────────────
  function avatarHtml(profile, size) {
    size = size || 42;
    var fs = Math.round(size * 0.38) + 'px';
    if (profile && profile.avatar_card_number) {
      var card = findCard(profile.avatar_card_number);
      if (card && card.imageLink) {
        var ox = (profile.avatar_offset_x != null) ? profile.avatar_offset_x : -42;
        var oy = (profile.avatar_offset_y != null) ? profile.avatar_offset_y : -6;
        return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;overflow:hidden;position:relative;flex-shrink:0;background:var(--bg-primary);">' +
          '<img src="'+esc(card.imageLink)+'" alt="" loading="lazy" ' +
          'style="position:absolute;width:185%;height:auto;top:'+oy+'%;left:'+ox+'%;pointer-events:none;">' +
          '</div>';
      }
    }
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:linear-gradient(135deg,var(--water),var(--zen));display:flex;align-items:center;justify-content:center;font-family:\'Cinzel\',serif;font-weight:700;font-size:'+fs+';color:#fff;flex-shrink:0;">'+esc(initials(profile?profile.username:'?'))+'</div>';
  }

  function proBadge() {
    return '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(232,182,50,0.12);color:var(--promo);border:1px solid rgba(232,182,50,0.3);border-radius:99px;padding:2px 8px;font-size:0.58rem;font-weight:700;letter-spacing:0.08em;vertical-align:middle;margin-left:6px;">✦ PRO</span>';
  }

  // ── Persistent header profile indicator ──────────────────────
  function updateHeaderProfile() {
    if (!currentProfile) return;
    var hdr = $('headerProfileIndicator');
    if (!hdr) return;
    hdr.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;">' +
        avatarHtml(currentProfile, 34) +
        '<div class="hpi-text" style="flex:1;min-width:0;text-align:right;">' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.82rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            esc(currentProfile.display_name || currentProfile.username) +
          '</div>' +
          '<div style="font-size:0.62rem;color:var(--text-muted);">Profile</div>' +
        '</div>' +
      '</div>';
    hdr.style.display = 'block';
    hdr.onclick = function () {
      var btn = document.querySelector('[data-tab="profile"]');
      if (btn) btn.click();
    };
  }

  function hideHeaderProfile() {
    var hdr = $('headerProfileIndicator');
    if (hdr) { hdr.style.display = 'none'; hdr.innerHTML = ''; }
  }

  // ── Social tab switcher ───────────────────────────────────────
  function initSocialTabs() {
    var sec = $('socialSection'); if (!sec) return;
    sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function (btn) {
      if (btn.getAttribute('data-trade-tab')) return;
      btn.addEventListener('click', function () {
        var name = this.getAttribute('data-nested-tab') || this.getAttribute('data-social-tab');
        sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function (b) {
          if (!b.getAttribute('data-trade-tab')) b.classList.remove('active');
        });
        this.classList.add('active');
        sec.querySelectorAll('.social-pane').forEach(function (p) { p.style.display = 'none'; });
        var pane = $('social-' + name); if (pane) pane.style.display = '';
        if (name === 'chat')        loadChat();
        if (name === 'trades')      loadTrades();
        if (name === 'forum')       loadForum();
        if (name === 'friends')     loadFriends();
        if (name === 'leaderboard' && typeof window.progressionLoadLeaderboard === 'function') {
          window.progressionLoadLeaderboard();
        }
      });
    });
    sec.querySelectorAll('[data-trade-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = this.getAttribute('data-trade-tab');
        sec.querySelectorAll('[data-trade-tab]').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        $('tradeIncoming').style.display = n === 'incoming' ? '' : 'none';
        $('tradeOutgoing').style.display = n === 'outgoing' ? '' : 'none';
        $('tradeHistory').style.display  = n === 'history'  ? '' : 'none';
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE SETUP & DISPLAY
  // ══════════════════════════════════════════════════════════════
  async function setupProfileSection(user) {
    if (!sb()) return;
    var res = await sb().from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    var profile = res.error ? null : res.data;
    if (!profile) {
      $('socialSetup').style.display   = 'block';
      $('socialSection').style.display = 'none';
      wireUsernameForm(user);
    } else {
      currentProfile = profile;
      $('socialSetup').style.display   = 'none';
      activateSocialSection(profile);
    }
  }

  function wireUsernameForm(user) {
    var btn = $('setupSubmitBtn'), inp = $('setupUsername'), err = $('setupErr');
    if (!btn) return;
    btn.onclick = async function () {
      err.textContent = '';
      var name = inp.value.trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) { err.textContent = 'Username: 3–24 chars, letters/numbers/_ only.'; return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      var taken = await sb().from('profiles').select('id').eq('username', name).maybeSingle();
      if (taken.data) { err.textContent = 'That username is taken.'; btn.disabled = false; btn.textContent = 'Save Username'; return; }
      var res = await sb().from('profiles').insert({ user_id: user.id, username: name, email: user.email });
      btn.disabled = false; btn.textContent = 'Save Username';
      if (res.error) { err.textContent = res.error.message; return; }
      currentProfile = { user_id: user.id, username: name };
      $('socialSetup').style.display = 'none';
      activateSocialSection(currentProfile);
    };
  }

  function activateSocialSection(profile) {
    $('socialSection').style.display = 'block';
    refreshProfileDisplay(profile);
    updateHeaderProfile();
    initSocialTabs();
    loadFriends();

    if (typeof window.progressionOnLogin === 'function' && currentUser) {
      window.progressionOnLogin(currentUser.id, profile);
    }

    if (friendReqSub) { try { friendReqSub.unsubscribe(); } catch(e){} friendReqSub = null; }

    friendReqSub = sb().channel('friend-requests:' + currentUser.id)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'friendships',
        filter: 'friend_id=eq.' + currentUser.id
      }, function () {
        loadFriends();
        toast('📬 You have a new friend request!');
      })
      .subscribe();
  }

  function refreshProfileDisplay(profile) {
    var wrap = $('profileDisplayCard');
    if (!wrap) return;

    var displayName = profile.display_name || profile.username;
    var bio         = profile.bio || '';
    var isPro       = profile.is_pro;

    var traitsHtml = '';
    if (profile.preferred_traits && profile.preferred_traits.length) {
      var tmap = window.traitIconMap || {};
      traitsHtml =
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center;">' +
        '<span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;margin-right:2px;">Traits</span>' +
        profile.preferred_traits.slice(0, 4).map(function (t) {
          return tmap[t]
            ? '<div class="modal-trait-badge">' +
                '<img src="'+esc(tmap[t])+'" title="'+esc(t)+'" loading="lazy">' +
              '</div>'
            : '<span style="font-size:0.68rem;color:var(--text-muted);text-transform:capitalize;">'+esc(t)+'</span>';
        }).join('') + '</div>';
    }

    var chamberHtml = profile.favorite_chamber
      ? '<div style="display:flex;align-items:center;gap:5px;margin-top:8px;">' +
          '<i class="fas fa-window-maximize" style="font-size:0.6rem;color:var(--air);transform:scale(.9,1.7);"></i>' +
          '<span style="font-size:0.72rem;color:var(--air);font-weight:600;">'+esc(profile.favorite_chamber)+'</span>' +
        '</div>'
      : '';

    wrap.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;">' +
        '<div style="flex-shrink:0;position:relative;">' +
          '<div style="width:72px;height:72px;border-radius:50%;overflow:hidden;border:3px solid var(--border-light);">' +
            avatarHtml(profile, 72) +
          '</div>' +
          (isPro ? '<div style="position:absolute;bottom:-2px;right:-2px;background:var(--promo);border-radius:99px;padding:2px 6px;font-size:0.52rem;font-weight:700;letter-spacing:0.06em;color:#000;border:2px solid var(--bg-card);">PRO</div>' : '') +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;line-height:1.3;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">' +
            esc(displayName) +
          '</div>' +
          (displayName !== profile.username
            ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">@'+esc(profile.username)+'</div>'
            : '') +
          (bio
            ? '<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:6px;line-height:1.55;word-break:break-word;">'+esc(bio)+'</div>'
            : '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;font-style:italic;">No bio yet.</div>') +
          traitsHtml +
          chamberHtml +
        '</div>' +
      '</div>' +
      '<div style="height:1px;background:var(--border);margin-bottom:14px;"></div>' +
      '<button id="editProfileBtn" type="button" ' +
        'style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);' +
        'color:var(--text-secondary);font-size:0.78rem;font-family:\'Nunito Sans\',sans-serif;font-weight:700;' +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:all 0.2s;">' +
        '<i class="fas fa-pen" style="font-size:0.72rem;"></i> Edit Profile' +
      '</button>';

    var editBtn = $('editProfileBtn');
    if (editBtn) {
      editBtn.addEventListener('mouseenter', function () { this.style.borderColor='var(--zen)'; this.style.color='var(--zen)'; this.style.background='rgba(180,77,223,0.06)'; });
      editBtn.addEventListener('mouseleave', function () { this.style.borderColor='var(--border)'; this.style.color='var(--text-secondary)'; this.style.background='var(--bg-primary)'; });
      editBtn.addEventListener('click', openProfileEditor);
    }

    var progContainer = $('progressionCardContainer');
    if (!progContainer) {
      progContainer = document.createElement('div');
      progContainer.id = 'progressionCardContainer';
      progContainer.style.marginTop = '12px';
      if (wrap.parentNode) wrap.parentNode.insertBefore(progContainer, wrap.nextSibling);
    }
    if (typeof window.progressionRenderCard === 'function') {
      progContainer.innerHTML = window.progressionRenderCard(profile);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE EDITOR MODAL
  // ══════════════════════════════════════════════════════════════
  function buildTraitsHtml() {
    var tmap = window.traitIconMap || {};
    return TRAIT_GROUPS.map(function (group) {
      var btnHtml = group.traits.map(function (t) {
        var icon = tmap[t]
          ? '<img src="'+esc(tmap[t])+'" alt="'+esc(t)+'" style="width:20px;height:20px;" loading="lazy">'
          : '<span style="font-size:0.68rem;text-transform:capitalize;">'+esc(t)+'</span>';
        return '<button type="button" class="pe-trait-btn" ' +
          'data-trait="'+esc(t)+'" data-group="'+esc(group.key)+'" title="'+esc(t)+'" ' +
          'style="flex:1;min-width:0;height:52px;border-radius:10px;border:2px solid var(--border);' +
          'background:var(--bg-primary);cursor:pointer;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'gap:3px;transition:all 0.18s;padding:4px;">' +
          icon +
          '<span style="font-size:0.5rem;color:var(--text-muted);text-transform:capitalize;line-height:1;">'+esc(t)+'</span>' +
        '</button>';
      }).join('');

      return '<div style="margin-bottom:10px;">' +
        '<div style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.12em;' +
          'color:var(--text-muted);font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:6px;">' +
          esc(group.label) +
          '<span style="flex:1;height:1px;background:var(--border);display:block;"></span>' +
          '<span style="font-weight:400;font-size:0.52rem;letter-spacing:0;text-transform:none;' +
            'color:var(--text-muted);">pick one</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' + btnHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function injectProfileEditorModal() {
    if ($('profileEditorOverlay')) return;

    var html =
      '<div id="profileEditorOverlay" class="social-modal-overlay" style="z-index:120;">' +
        '<div class="social-modal" style="max-width:600px;">' +
          '<div class="social-modal-header">' +
            '<div class="social-modal-title"><i class="fas fa-user-edit" style="color:var(--zen);margin-right:8px;"></i>Edit Profile</div>' +
            '<button class="modal-close" id="peClose" type="button"><i class="fas fa-times"></i></button>' +
          '</div>' +

          '<div id="peBody" class="social-modal-body" style="padding:0;overflow-y:auto;">' +

            '<div style="padding:18px 18px 14px;border-bottom:1px solid var(--border);background:var(--bg-card);">' +
              '<div style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;margin-bottom:12px;">Profile Picture</div>' +
              '<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">' +
                '<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px;">' +
                  '<div id="peAvatarPreview" ' +
                    'style="width:'+PE_PREVIEW_SIZE+'px;height:'+PE_PREVIEW_SIZE+'px;border-radius:50%;overflow:hidden;position:relative;' +
                    'background:var(--bg-primary);border:3px solid var(--border-light);cursor:default;user-select:none;-webkit-user-select:none;touch-action:none;"></div>' +
                  '<div id="peDragHint" style="font-size:0.55rem;color:var(--text-muted);text-align:center;letter-spacing:0.04em;opacity:0;transition:opacity 0.25s;">drag to reposition</div>' +
                '</div>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin-bottom:8px;">' +
                    'Choose artwork from cards <strong style="color:var(--text-primary);">#1–#165</strong> (free). ' +
                    'All art unlocked with <strong style="color:var(--promo);">✦ Pro</strong>. ' +
                    '<span style="color:var(--text-muted);">Once selected, drag the preview to frame the shot.</span>' +
                  '</div>' +
                  '<button id="peClearAvatar" type="button" style="background:none;border:none;color:var(--text-muted);font-size:0.72rem;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;padding:0;text-decoration:underline;">Remove picture</button>' +
                '</div>' +
              '</div>' +
              '<div style="position:relative;margin-bottom:10px;">' +
                '<i class="fas fa-search" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:0.78rem;pointer-events:none;"></i>' +
                '<input id="peAvatarSearch" type="text" placeholder="Search cards by name or number…" ' +
                  'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:8px 10px 8px 32px;color:var(--text-primary);font-size:0.82rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;">' +
              '</div>' +
              '<div id="peAvatarGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:5px;max-height:220px;overflow-y:auto;padding:2px;"></div>' +
              '<div id="peLoadMore" style="text-align:center;margin-top:8px;"></div>' +
            '</div>' +

            '<div style="padding:18px;">' +
              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">' +
                  'Display Name <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.65rem;">— shown instead of username (optional)</span>' +
                '</label>' +
                '<input id="peDisplayName" type="text" maxlength="40" placeholder="Your display name" ' +
                  'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text-primary);font-size:0.88rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
              '</div>' +

              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">Username</label>' +
                '<div style="position:relative;">' +
                  '<input id="peUsername" type="text" maxlength="24" placeholder="Username" ' +
                    'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 36px 11px 13px;color:var(--text-primary);font-size:0.88rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
                  '<span id="peUsernameIcon" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.9rem;"></span>' +
                '</div>' +
                '<div id="peUsernameHint" style="font-size:0.68rem;margin-top:4px;min-height:16px;color:var(--text-muted);"></div>' +
              '</div>' +

              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">Bio</label>' +
                '<textarea id="peBio" maxlength="200" placeholder="Tell the community about yourself…" ' +
                  'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text-primary);font-size:0.85rem;font-family:\'Nunito Sans\',sans-serif;outline:none;resize:none;min-height:72px;box-sizing:border-box;transition:border-color 0.2s;"></textarea>' +
                '<div id="peBioCount" style="font-size:0.63rem;color:var(--text-muted);text-align:right;margin-top:3px;">0 / 200</div>' +
              '</div>' +

              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:10px;">' +
                  'Preferred Traits' +
                  '<span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.65rem;"> — one from each category (optional)</span>' +
                '</label>' +
                '<div id="peTraits">' + buildTraitsHtml() + '</div>' +
                '<div id="peTraitsHint" style="font-size:0.67rem;color:var(--text-muted);margin-top:6px;min-height:16px;"></div>' +
              '</div>' +

              '<div style="margin-bottom:6px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">Favorite Chamber</label>' +
                '<select id="peChamber" style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:11px 12px;color:var(--text-primary);font-size:0.88rem;font-family:\'Nunito Sans\',sans-serif;outline:none;cursor:pointer;">' +
                  '<option value="">— None selected —</option>' +
                '</select>' +
              '</div>' +

              '<div id="peError" style="font-size:0.75rem;color:var(--danger);padding:6px 0;min-height:20px;"></div>' +
            '</div>' +
          '</div>' +

          '<div class="social-modal-footer" style="justify-content:space-between;align-items:center;">' +
            '<button id="peProceedUpgrade" type="button" style="background:none;border:1px solid rgba(232,182,50,0.3);border-radius:8px;color:var(--promo);font-size:0.72rem;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;font-weight:700;padding:7px 13px;transition:all 0.2s;">✦ Upgrade to Pro</button>' +
            '<div style="display:flex;gap:8px;">' +
              '<button class="confirm-btn confirm-cancel" id="peCancel" type="button">Cancel</button>' +
              '<button class="confirm-btn confirm-ok" id="peSave" type="button" style="background:var(--zen);border-color:var(--zen);">Save Changes</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    initProfileEditorEvents();
  }

  function openProfileEditor() {
    injectProfileEditorModal();
    var overlay = $('profileEditorOverlay'); if (!overlay) return;

    var p = currentProfile || {};
    peSelectedAvatar = p.avatar_card_number || null;
    peSelectedTraits = Array.isArray(p.preferred_traits) ? p.preferred_traits.slice() : [];
    peOffsetX        = (p.avatar_offset_x != null) ? p.avatar_offset_x : -42;
    peOffsetY        = (p.avatar_offset_y != null) ? p.avatar_offset_y : -6;
    peAvatarFilter   = '';
    peAvatarPage     = 0;
    peUsernameValid  = true;

    $('peDisplayName').value  = p.display_name || '';
    $('peUsername').value     = p.username || '';
    $('peBio').value          = p.bio || '';
    $('peUsernameIcon').textContent = '';
    $('peUsernameHint').textContent = '';
    $('peError').textContent        = '';
    $('peAvatarSearch').value       = '';
    updateBioCount();
    populateChamberSelect(p.favorite_chamber || '');
    renderPeAvatarPreview();
    renderAvatarGrid();

    TRAIT_KEYS.forEach(function (t) {
      var btn = overlay.querySelector('.pe-trait-btn[data-trait="'+t+'"]');
      if (btn) applyTraitStyle(btn, peSelectedTraits.indexOf(t) !== -1);
    });
    updateTraitsHint();

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeProfileEditor() {
    var o = $('profileEditorOverlay'); if (o) o.classList.remove('active');
    document.body.style.overflow = '';
  }

  function populateChamberSelect(current) {
    var sel = $('peChamber'); if (!sel) return;
    sel.innerHTML = '<option value="">— None selected —</option>';
    (window.allCards || []).filter(function (c) { return c.type === 'chamber'; }).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = '#' + c.number + ' — ' + c.name;
      if (c.name === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function getAvatarCards() {
    var all = (window.allCards || []).filter(function (c) {
      var n = parseInt(c.number, 10); return !isNaN(n) && n >= 1 && c.imageLink;
    });
    if (peAvatarFilter) {
      var q = peAvatarFilter.toLowerCase();
      all = all.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1 || c.number.indexOf(q) !== -1; });
    }
    return all;
  }

  function renderAvatarGrid() {
    var grid = $('peAvatarGrid'), moreWrap = $('peLoadMore'); if (!grid) return;
    var cards = getAvatarCards(), isPro = currentProfile && currentProfile.is_pro;
    var end = Math.min(PE_PAGE_SIZE * (peAvatarPage + 1), cards.length);
    var visible = cards.slice(0, end);

    grid.innerHTML = visible.map(function (c) {
      var num = parseInt(c.number, 10);
      var locked = !isPro && !isNaN(num) && num > FREE_CARD_MAX;
      var sel = peSelectedAvatar === c.number;
      return '<div class="pe-card-thumb" data-cn="'+esc(c.number)+'" ' +
        'title="'+(locked ? '✦ Pro — ' : '')+'#'+esc(c.number)+' '+esc(c.name)+'" ' +
        'style="position:relative;cursor:'+(locked?'not-allowed':'pointer')+';border-radius:6px;overflow:hidden;' +
        'aspect-ratio:3/4;border:2px solid '+(sel?'var(--zen)':'var(--border)')+';background:var(--bg-primary);' +
        'transition:border-color 0.15s,transform 0.12s;'+(sel?'box-shadow:0 0 10px rgba(180,77,223,0.45);':'')+'">'+
        '<img src="'+esc(c.imageLink)+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">'+
        (sel ? '<div style="position:absolute;bottom:3px;right:3px;width:16px;height:16px;border-radius:50%;background:var(--zen);display:flex;align-items:center;justify-content:center;"><i class="fas fa-check" style="font-size:0.5rem;color:#fff;"></i></div>' : '')+
        (locked ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;"><i class="fas fa-lock" style="color:var(--promo);font-size:0.72rem;"></i><span style="color:var(--promo);font-size:0.45rem;font-weight:700;letter-spacing:0.05em;">PRO</span></div>' : '')+
        '<div style="position:absolute;bottom:0;left:0;right:0;padding:2px 3px;background:rgba(0,0,0,0.68);font-size:0.45rem;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">#'+esc(c.number)+'</div>'+
      '</div>';
    }).join('');

    if (moreWrap) {
      moreWrap.innerHTML = '';
      if (end < cards.length) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px 16px;color:var(--text-secondary);font-size:0.72rem;font-family:\'Nunito Sans\',sans-serif;font-weight:600;cursor:pointer;';
        btn.textContent = 'Load more (' + (cards.length - end) + ' remaining)';
        btn.addEventListener('click', function () { peAvatarPage++; renderAvatarGrid(); });
        moreWrap.appendChild(btn);
      }
    }
  }

  function renderPeAvatarPreview() {
    var el = $('peAvatarPreview');
    var hint = $('peDragHint');
    if (!el) return;

    if (peSelectedAvatar) {
      var card = findCard(peSelectedAvatar);
      if (card && card.imageLink) {
        el.style.cursor = 'grab';
        el.innerHTML =
          '<img src="'+esc(card.imageLink)+'" alt="" loading="lazy" ' +
          'style="position:absolute;width:185%;height:auto;top:'+peOffsetY+'%;left:'+peOffsetX+'%;pointer-events:none;user-select:none;-webkit-user-select:none;">' +
          '<div style="position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(180,77,223,0.45);pointer-events:none;"></div>';
        if (hint) hint.style.opacity = '1';
        return;
      }
    }

    el.style.cursor = 'default';
    if (hint) hint.style.opacity = '0';
    var p = currentProfile || {};
    el.innerHTML =
      '<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--water),var(--zen));' +
      'display:flex;align-items:center;justify-content:center;font-family:\'Cinzel\',serif;font-weight:700;font-size:1.5rem;color:#fff;">'+
      esc(initials(p.username || '?'))+'</div>';
  }

  function initAvatarDrag() {
    if (_dragBound) return;
    _dragBound = true;

    function getEl() { return $('peAvatarPreview'); }

    function applyDrag(clientX, clientY) {
      var dx = clientX - _dragStartX;
      var dy = clientY - _dragStartY;
      var clamped = clampOffset(
        _dragInitOX + (dx / PE_PREVIEW_SIZE) * 100,
        _dragInitOY + (dy / PE_PREVIEW_SIZE) * 100
      );
      peOffsetX = clamped.x;
      peOffsetY = clamped.y;
      var el = getEl(); if (!el) return;
      var img = el.querySelector('img');
      if (img) { img.style.left = peOffsetX + '%'; img.style.top = peOffsetY + '%'; }
    }

    document.addEventListener('mousedown', function (e) {
      var el = getEl();
      if (!el || !peSelectedAvatar) return;
      if (!el.contains(e.target) && e.target !== el) return;
      _dragging   = true;
      _dragStartX = e.clientX; _dragStartY = e.clientY;
      _dragInitOX = peOffsetX;  _dragInitOY = peOffsetY;
      el.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!_dragging) return;
      applyDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', function () {
      if (!_dragging) return;
      _dragging = false;
      var el = getEl(); if (el && peSelectedAvatar) el.style.cursor = 'grab';
    });

    document.addEventListener('touchstart', function (e) {
      var el = getEl();
      if (!el || !peSelectedAvatar) return;
      if (!el.contains(e.target) && e.target !== el) return;
      _dragging   = true;
      _dragStartX = e.touches[0].clientX; _dragStartY = e.touches[0].clientY;
      _dragInitOX = peOffsetX;             _dragInitOY = peOffsetY;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!_dragging) return;
      applyDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    document.addEventListener('touchend', function () { _dragging = false; });
    document.addEventListener('touchcancel', function () { _dragging = false; });
  }

  var checkUsername = debounce(async function () {
    var inp=$('peUsername'), icon=$('peUsernameIcon'), hint=$('peUsernameHint');
    if (!inp || !sb()) return;
    var val = inp.value.trim();
    if (!val || val === (currentProfile && currentProfile.username)) {
      icon.textContent = ''; hint.textContent = ''; peUsernameValid = true; inp.style.borderColor = ''; return;
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(val)) {
      icon.innerHTML = '<i class="fas fa-times" style="color:var(--danger);"></i>';
      hint.innerHTML = '<span style="color:var(--danger);">3–24 characters, letters/numbers/_ only.</span>';
      peUsernameValid = false; inp.style.borderColor = 'var(--danger)'; return;
    }
    icon.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="color:var(--text-muted);"></i>';
    hint.textContent = 'Checking…'; peUsernameValid = false;
    var res = await sb().from('profiles').select('id').eq('username', val).neq('user_id', currentUser.id).maybeSingle();
    if (res.data) {
      icon.innerHTML = '<i class="fas fa-times" style="color:var(--danger);"></i>';
      hint.innerHTML = '<span style="color:var(--danger);">Username taken — try another.</span>';
      peUsernameValid = false; inp.style.borderColor = 'var(--danger)';
    } else {
      icon.innerHTML = '<i class="fas fa-check" style="color:var(--success);"></i>';
      hint.innerHTML = '<span style="color:var(--success);">Available!</span>';
      peUsernameValid = true; inp.style.borderColor = 'var(--success)';
    }
  }, 600);

  function applyTraitStyle(btn, active) {
    btn.style.borderColor = active ? 'var(--zen)' : 'var(--border)';
    btn.style.background  = active ? 'rgba(180,77,223,0.15)' : 'var(--bg-primary)';
    btn.style.transform   = active ? 'scale(1.08)' : 'scale(1)';
    btn.style.boxShadow   = active ? '0 0 0 2px rgba(180,77,223,0.35)' : 'none';
  }

  function updateTraitsHint() {
    var hint = $('peTraitsHint'); if (!hint) return;
    if (!peSelectedTraits.length) {
      hint.textContent = 'Nothing selected yet — one pick per row, all optional.';
      hint.style.color = 'var(--text-muted)';
      return;
    }
    var parts = TRAIT_GROUPS.map(function (g) {
      var sel = g.traits.find(function (t) { return peSelectedTraits.indexOf(t) !== -1; });
      return sel
        ? '<span style="color:var(--zen);font-weight:700;text-transform:capitalize;">' + sel + '</span>'
        : '<span style="color:var(--text-muted);font-style:italic;">none</span>';
    });
    hint.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    hint.style.color = '';
  }

  function updateBioCount() {
    var bio = $('peBio'), cnt = $('peBioCount');
    if (bio && cnt) cnt.textContent = bio.value.length + ' / 200';
  }

  async function saveProfileChanges() {
    var errEl = $('peError'); if (errEl) errEl.textContent = '';
    if (!peUsernameValid) { if (errEl) errEl.textContent = 'Fix the username before saving.'; return; }

    var displayName = ($('peDisplayName').value || '').trim();
    var username    = ($('peUsername').value || '').trim() || (currentProfile && currentProfile.username) || '';
    var bio         = ($('peBio').value || '').trim();
    var chamber     = ($('peChamber').value || '');

    if (!username.match(/^[a-zA-Z0-9_]{3,24}$/)) { if (errEl) errEl.textContent = 'Invalid username.'; return; }

    var saveBtn = $('peSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    var updates = {
      display_name:       displayName || null,
      username:           username,
      bio:                bio || null,
      preferred_traits:   peSelectedTraits,
      favorite_chamber:   chamber || null,
      avatar_card_number: peSelectedAvatar || null,
      avatar_offset_x:    peSelectedAvatar ? peOffsetX : null,
      avatar_offset_y:    peSelectedAvatar ? peOffsetY : null
    };

    var res = await sb().from('profiles').update(updates).eq('user_id', currentUser.id);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    if (res.error) { if (errEl) errEl.textContent = res.error.message; return; }

    currentProfile = Object.assign({}, currentProfile, updates);
    closeProfileEditor();
    refreshProfileDisplay(currentProfile);
    updateHeaderProfile();
    toast('Profile updated! ✨');
  }

  function initProfileEditorEvents() {
    var overlay = $('profileEditorOverlay'); if (!overlay) return;

    [$('peClose'), $('peCancel')].forEach(function (b) { if (b) b.addEventListener('click', closeProfileEditor); });
    overlay.addEventListener('click', function (e) { if (e.target === this) closeProfileEditor(); });

    var saveBtn = $('peSave'); if (saveBtn) saveBtn.addEventListener('click', saveProfileChanges);

    var grid = $('peAvatarGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var thumb = e.target.closest('.pe-card-thumb'); if (!thumb) return;
        var num = thumb.getAttribute('data-cn'), parsed = parseInt(num, 10);
        var isPro = currentProfile && currentProfile.is_pro;
        if (!isPro && !isNaN(parsed) && parsed > FREE_CARD_MAX) {
          toast('✦ Unlock all card artwork with a Pro account!'); return;
        }
        if (peSelectedAvatar === num) {
          peSelectedAvatar = null;
        } else {
          peSelectedAvatar = num;
          peOffsetX = -42;
          peOffsetY = -6;
        }
        renderAvatarGrid();
        renderPeAvatarPreview();
      });

      grid.addEventListener('mouseover', function (e) {
        var t = e.target.closest('.pe-card-thumb');
        if (t && t.getAttribute('data-cn') !== peSelectedAvatar) t.style.transform = 'scale(1.06)';
      });
      grid.addEventListener('mouseout', function (e) {
        var t = e.target.closest('.pe-card-thumb');
        if (t && t.getAttribute('data-cn') !== peSelectedAvatar) t.style.transform = '';
      });
    }

    var clearBtn = $('peClearAvatar');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      peSelectedAvatar = null;
      peOffsetX = -42; peOffsetY = -6;
      renderAvatarGrid();
      renderPeAvatarPreview();
    });

    var searchInp = $('peAvatarSearch');
    if (searchInp) searchInp.addEventListener('input', debounce(function () {
      peAvatarFilter = searchInp.value.trim(); peAvatarPage = 0; renderAvatarGrid();
    }, 250));

    var unameInp = $('peUsername');
    if (unameInp) unameInp.addEventListener('input', checkUsername);

    var bioInp = $('peBio');
    if (bioInp) bioInp.addEventListener('input', updateBioCount);

    ['peDisplayName', 'peUsername', 'peBio'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.addEventListener('focus', function () { if (!this.style.borderColor || this.style.borderColor.indexOf('success') === -1) this.style.borderColor = 'var(--accent)'; });
      el.addEventListener('blur',  function () { if (this.style.borderColor === 'var(--accent)') this.style.borderColor = ''; });
    });

    var traitsWrap = $('peTraits');
    if (traitsWrap) {
      traitsWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('.pe-trait-btn'); if (!btn) return;
        var trait     = btn.getAttribute('data-trait');
        var groupKey  = btn.getAttribute('data-group');
        var group     = TRAIT_GROUPS.find(function (g) { return g.key === groupKey; });
        var idx       = peSelectedTraits.indexOf(trait);

        if (idx !== -1) {
          peSelectedTraits.splice(idx, 1);
          applyTraitStyle(btn, false);
        } else {
          if (group) {
            group.traits.forEach(function (gt) {
              var gi = peSelectedTraits.indexOf(gt);
              if (gi !== -1) {
                peSelectedTraits.splice(gi, 1);
                var gb = traitsWrap.querySelector('.pe-trait-btn[data-trait="'+gt+'"]');
                if (gb) applyTraitStyle(gb, false);
              }
            });
          }
          peSelectedTraits.push(trait);
          applyTraitStyle(btn, true);
        }
        updateTraitsHint();
      });
    }

    var proBtn = $('peProceedUpgrade');
    if (proBtn) proBtn.addEventListener('click', function () {
      toast('✦ Pro accounts — coming soon! Follow us for updates.');
    });

    initAvatarDrag();
  }

  // ══════════════════════════════════════════════════════════════
  //  FRIENDS
  // ══════════════════════════════════════════════════════════════
  async function loadFriends() {
    if (!currentUser || !sb()) return;

    var pendRes  = await sb().rpc('get_pending_friend_requests');
    var incoming = pendRes.data || [];

    var outRes  = await sb().from('friendships')
      .select('id, friend:profiles!friendships_friend_id_fkey(username,avatar_card_number,avatar_offset_x,avatar_offset_y,is_pro)')
      .eq('user_id', currentUser.id)
      .eq('status', 'pending');
    var outgoing = outRes.data || [];

    var pendSec  = $('friendPendingSection');
    var pendList = $('friendPendingList');
    var total    = incoming.length + outgoing.length;

    if (total > 0) {
      if (pendSec) pendSec.style.display = '';

      var inHtml = incoming.length
        ? incoming.map(function (f) {
            var p2 = { username: f.sender_username, avatar_card_number: f.avatar_card_number, avatar_offset_x: f.avatar_offset_x, avatar_offset_y: f.avatar_offset_y };
            return '<div class="friend-card">' + avatarHtml(p2, 38) +
              '<div class="friend-info">' +
                '<div class="friend-name">' + esc(p2.username || 'Unknown') + '</div>' +
                '<div class="friend-sub" style="color:var(--air);"><i class="fas fa-user-plus" style="margin-right:3px;"></i>Wants to be friends</div>' +
              '</div>' +
              '<div class="friend-actions">' +
                '<button class="friend-btn accept" data-accept="' + f.friendship_id + '">Accept</button>' +
                '<button class="friend-btn danger"  data-decline="' + f.friendship_id + '">Decline</button>' +
              '</div></div>';
          }).join('')
        : '<div style="text-align:center;padding:18px 0;color:var(--text-muted);font-size:0.8rem;">No incoming requests.</div>';

      var outHtml = outgoing.length
        ? outgoing.map(function (f) {
            var p2 = f.friend || {};
            return '<div class="friend-card">' + avatarHtml(p2, 38) +
              '<div class="friend-info">' +
                '<div class="friend-name">' + esc(p2.username || 'Unknown') + (p2.is_pro ? proBadge() : '') + '</div>' +
                '<div class="friend-sub"><i class="fas fa-paper-plane" style="margin-right:3px;"></i>Request pending…</div>' +
              '</div>' +
              '<div class="friend-actions">' +
                '<button class="friend-btn danger" data-cancel-req="' + f.id + '">Cancel</button>' +
              '</div></div>';
          }).join('')
        : '<div style="text-align:center;padding:18px 0;color:var(--text-muted);font-size:0.8rem;">No sent requests.</div>';

      var inBadge  = incoming.length ? ' <span style="background:var(--air);color:#000;border-radius:99px;padding:1px 7px;font-size:0.6rem;font-weight:700;margin-left:4px;">' + incoming.length + '</span>' : '';
      var outBadge = outgoing.length ? ' <span style="background:var(--border-light);color:var(--text-secondary);border-radius:99px;padding:1px 7px;font-size:0.6rem;font-weight:700;margin-left:4px;">' + outgoing.length + '</span>' : '';

      var activeStyle   = 'background:none;border:none;border-bottom:2px solid var(--air);color:var(--air);padding:8px 14px;font-family:\'Nunito Sans\',sans-serif;font-size:0.78rem;font-weight:700;cursor:pointer;flex-shrink:0;transition:all 0.15s;';
      var inactiveStyle = 'background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);padding:8px 14px;font-family:\'Nunito Sans\',sans-serif;font-size:0.78rem;font-weight:700;cursor:pointer;flex-shrink:0;transition:all 0.15s;';

      if (pendList) {
        pendList.innerHTML =
          '<div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:10px;">' +
            '<button id="pendTabIn"  style="' + activeStyle   + '"><i class="fas fa-inbox" style="margin-right:5px;opacity:0.7;"></i>Incoming'  + inBadge  + '</button>' +
            '<button id="pendTabOut" style="' + inactiveStyle + '"><i class="fas fa-paper-plane" style="margin-right:5px;opacity:0.7;"></i>Sent' + outBadge + '</button>' +
          '</div>' +
          '<div id="pendContentIn">'                       + inHtml  + '</div>' +
          '<div id="pendContentOut" style="display:none;">' + outHtml + '</div>';

        var tabIn   = document.getElementById('pendTabIn');
        var tabOut  = document.getElementById('pendTabOut');
        var contIn  = document.getElementById('pendContentIn');
        var contOut = document.getElementById('pendContentOut');

        if (tabIn) tabIn.addEventListener('click', function () {
          tabIn.style.cssText  = activeStyle;
          tabOut.style.cssText = inactiveStyle;
          contIn.style.display  = '';
          contOut.style.display = 'none';
        });
        if (tabOut) tabOut.addEventListener('click', function () {
          tabOut.style.cssText = activeStyle.replace('var(--air)', 'var(--text-secondary)');
          tabIn.style.cssText  = inactiveStyle;
          contOut.style.display = '';
          contIn.style.display  = 'none';
        });
      }
    } else {
      if (pendSec) pendSec.style.display = 'none';
    }

    var asUserRes   = await sb().from('friendships').select('id, user_id, friend_id').eq('user_id',   currentUser.id).eq('status', 'accepted');
    var asFriendRes = await sb().from('friendships').select('id, user_id, friend_id').eq('friend_id', currentUser.id).eq('status', 'accepted');
    var allShips    = (asUserRes.data || []).concat(asFriendRes.data || []);

    var seen = {}; allShips = allShips.filter(function(f){ if (seen[f.id]) return false; seen[f.id]=true; return true; });

    var friendListEl = $('friendList');
    if (!allShips.length) {
      friendListEl.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>No friends yet — search above!</p></div>'; return;
    }

    var otherIds = allShips.map(function(f){ return f.user_id === currentUser.id ? f.friend_id : f.user_id; });
    var profRes  = await sb().from('profiles').select('user_id,username,display_name,avatar_card_number,avatar_offset_x,avatar_offset_y,is_pro').in('user_id', otherIds);
    var profMap  = {};
    (profRes.data || []).forEach(function(p){ profMap[p.user_id] = p; });

    friendListEl.innerHTML = allShips.map(function(f) {
      var otherId = f.user_id === currentUser.id ? f.friend_id : f.user_id;
      var p = profMap[otherId] || { username: '?' };
      return '<div class="friend-card">' + avatarHtml(p, 38) +
        '<div class="friend-info">' +
          '<div class="friend-name">' + esc(p.display_name || p.username || '?') + (p.is_pro ? proBadge() : '') + '</div>' +
          '<div class="friend-sub" style="font-size:0.68rem;color:var(--text-muted);">@' + esc(p.username || '?') + '</div>' +
        '</div>' +
        '<div class="friend-actions" style="flex-wrap:wrap;gap:5px;">' +
          '<button class="friend-btn" data-view-friend="' + esc(otherId) + '" data-friend-name="' + esc(p.username || '?') + '" style="background:rgba(74,125,255,0.1);border-color:rgba(74,125,255,0.3);color:var(--accent);">Profile</button>' +
          '<button class="friend-btn chat-btn"  data-dm="' + esc(p.username || '') + '">Chat</button>' +
          '<button class="friend-btn trade-btn" data-trade-with="' + esc(p.username || '') + '">Trade</button>' +
          '<button class="friend-btn danger"    data-remove="' + f.id + '">Remove</button>' +
        '</div></div>';
    }).join('');
  }

  async function doFriendSearch() {
    var q = ($('friendSearchInput').value || '').trim(), wrap = $('friendSearchResults');
    if (!q) { wrap.innerHTML = ''; return; }
    var res = await sb().from('profiles').select('username,user_id,avatar_card_number,avatar_offset_x,avatar_offset_y,is_pro').ilike('username', q + '%').neq('user_id', currentUser.id).limit(6);
    if (!res.data || !res.data.length) { wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:8px 4px;">No users found.</div>'; return; }
    wrap.innerHTML = res.data.map(function (p2) {
      return '<div class="friend-card">'+avatarHtml(p2, 38)+
        '<div class="friend-info"><div class="friend-name">'+esc(p2.username)+(p2.is_pro?proBadge():'')+'</div></div>'+
        '<div class="friend-actions"><button class="friend-btn" data-add="'+esc(p2.user_id)+'">Add Friend</button></div>'+
        '</div>';
    }).join('');
  }

  async function sendFriendReq(uid) {
    var res = await sb().from('friendships').insert({ user_id: currentUser.id, friend_id: uid, status: 'pending' });
    if (res.error) { toast('Error: '+res.error.message); return; }
    $('friendSearchResults').innerHTML = ''; $('friendSearchInput').value = '';
    toast('Friend request sent! 🤝');
  }
  async function respondRequest(id, status) {
    await sb().from('friendships').update({ status: status }).eq('id', id);
    loadFriends(); toast(status === 'accepted' ? 'Friend added! 🎉' : 'Request declined.');
  }
  async function removeFriend(id) {
    await sb().from('friendships').delete().eq('id', id); loadFriends(); toast('Friend removed.');
  }
  // ══════════════════════════════════════════════════════════════
  //  FETCH FRIEND COLLECTIONS
  // ══════════════════════════════════════════════════════════════
  async function fetchFriendCollectionData(userId) {
    if (!sb() || !userId) return { physical: {}, digital: {} };
    try {
      var res = await sb()
        .from('collections')
        .select('physical, digital')
        .eq('user_id', userId)
        .maybeSingle();
      if (res.error) throw res.error;
      var dig = (res.data && res.data.digital) || {};
      if (Array.isArray(dig)) {
        var map = {};
        dig.forEach(function(item) {
          if (item && item.number) map[String(item.number)] = (map[String(item.number)] || 0) + 1;
        });
        dig = map;
      }
      return {
        physical: (res.data && res.data.physical) || {},
        digital:  dig
      };
    } catch (e) {
      console.warn('[social] fetchFriendCollectionData error:', e.message || e);
      return { physical: {}, digital: {} };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PROGRESS BAR BUILDERS
  // ══════════════════════════════════════════════════════════════
  function buildPhysicalStats(physCol) {
    var ac = allCards();
    var coreTotal = ac.filter(function(c) { return isCoreCard(c.number); }).length || 248;
    var coreOwned = ac.filter(function(c) { return isCoreCard(c.number) && (physCol[c.number] || 0) > 0; }).length;
    var corePct   = Math.round((coreOwned / coreTotal) * 100);

    var overallHtml =
      '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">Physical · All Cards</span>' +
          '<span style="font-family:\'Cinzel\',serif;font-size:0.82rem;font-weight:700;color:white;">' + coreOwned + ' / ' + coreTotal + ' &nbsp;(' + corePct + '%)</span>' +
        '</div>' +
        '<div style="height:7px;background:var(--bg-primary);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--water),var(--accent),var(--zen));width:' + corePct + '%;transition:width 0.5s;"></div>' +
        '</div>' +
      '</div>';

    var rarityBarsHtml = PACK_RARITIES.map(function(r) {
      var pool  = ac.filter(function(c) { return isPackCard(c.number) && c.rarity === r; });
      var total = pool.length || 1;
      var owned = pool.filter(function(c) { return (physCol[c.number] || 0) > 0; }).length;
      var pct   = Math.round((owned / total) * 100);
      var clr   = RARITY_COLORS[r];
      return '<div style="margin-bottom:9px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
          '<span style="font-size:0.6rem;text-transform:capitalize;color:' + clr + ';font-weight:700;">' + RARITY_LABELS[r] + '</span>' +
          '<span style="font-size:0.6rem;color:var(--text-muted);">' + owned + ' / ' + total + ' (' + pct + '%)</span>' +
        '</div>' +
        '<div style="height:4px;background:var(--bg-primary);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:99px;background:' + clr + ';width:' + pct + '%;"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    return overallHtml +
      '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">' +
        '<div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;margin-bottom:10px;">Rarity Breakdown (pack cards)</div>' +
        rarityBarsHtml +
      '</div>';
  }

  function buildDigitalStats(digCol) {
    var ac = allCards();
    var digAll = Object.keys(digCol).filter(function(n) { return (digCol[n] || 0) > 0; }).length;
    var countsByRarity = {};
    PACK_RARITIES.forEach(function(r) { countsByRarity[r] = 0; });
    ac.forEach(function(c) {
      if ((digCol[c.number] || 0) > 0 && countsByRarity[c.rarity] !== undefined) {
        countsByRarity[c.rarity]++;
      }
    });
    var rarityChips = PACK_RARITIES.map(function(r) {
      return '<div style="text-align:center;padding:6px 4px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;">' +
        '<div style="font-family:\'Cinzel\',serif;font-size:0.78rem;font-weight:700;color:' + RARITY_COLORS[r] + ';">' + countsByRarity[r] + '</div>' +
        '<div style="font-size:0.5rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-top:2px;">' + RARITY_LABELS[r] + '</div>' +
      '</div>';
    }).join('');
    return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-top:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">Digital · All Cards</span>' +
        '<span style="font-family:\'Cinzel\',serif;font-size:0.82rem;font-weight:700;color:var(--zen);">' + digAll + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(' + PACK_RARITIES.length + ',1fr);gap:5px;">' +
        rarityChips +
      '</div>' +
    '</div>';
  }

  async function appendEnhancedStats(pane, userId) {
    if (!pane || !userId) return;
    try {
      var data     = await fetchFriendCollectionData(userId);
      var physHtml = buildPhysicalStats(data.physical);
      var digHtml  = buildDigitalStats(data.digital);
      var old = pane.querySelector('#fp-enhanced-stats');
      if (old) old.remove();
      if (!document.body.contains(pane)) return;
      var wrapper = document.createElement('div');
      wrapper.id = 'fp-enhanced-stats';
      wrapper.style.marginTop = '14px';
      wrapper.innerHTML = physHtml + digHtml;
      pane.appendChild(wrapper);
    } catch (e) {
      console.warn('[social] appendEnhancedStats error:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FRIEND PROFILE MODAL
  // ══════════════════════════════════════════════════════════════
  function injectFriendProfileModal() {
    if ($('friendProfileOverlay')) return;
    var el = document.createElement('div');
    el.id = 'friendProfileOverlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto;';
    el.innerHTML =
      '<div id="friendProfileModal" style="width:100%;max-width:520px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden;margin:auto;">' +
        '<div id="friendProfileHeader" style="display:flex;align-items:center;gap:14px;padding:18px 18px 14px;border-bottom:1px solid var(--border);position:relative;"></div>' +
        '<div style="display:flex;border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none;">' +
          '<button class="fpTab" data-fp-tab="profile"    style="flex:1;padding:11px 0;border:none;background:none;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;color:var(--zen);border-bottom:2px solid var(--zen);transition:all 0.15s;white-space:nowrap;"><i class="fas fa-user" style="margin-right:5px;"></i>Profile</button>' +
          '<button class="fpTab" data-fp-tab="collection" style="flex:1;padding:11px 0;border:none;background:none;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap;"><i class="fas fa-layer-group" style="margin-right:5px;"></i>Collection</button>' +
          '<button class="fpTab" data-fp-tab="friends"    style="flex:1;padding:11px 0;border:none;background:none;cursor:pointer;font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap;"><i class="fas fa-users" style="margin-right:5px;"></i>Friends</button>' +
        '</div>' +
        '<div id="friendProfilePane" style="padding:16px;min-height:180px;max-height:55vh;overflow-y:auto;"></div>' +
        '<div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);background:var(--bg-card);">' +
          '<button id="fpChatBtn"    style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-secondary);font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;"><i class="fas fa-comment" style="margin-right:5px;"></i>Chat</button>' +
          '<button id="fpCompareBtn" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(46,140,232,0.35);background:rgba(46,140,232,0.08);color:var(--water);font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:5px;"><i class="fas fa-people-arrows"></i>Compare</button>' +
          '<button id="fpTradeBtn"   style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(74,125,255,0.3);background:rgba(74,125,255,0.08);color:var(--accent);font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;"><i class="fas fa-exchange-alt" style="margin-right:5px;"></i>Offer Trade</button>' +
          '<button id="fpCloseBtn"   style="padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text-muted);font-family:\'Nunito Sans\',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;"><i class="fas fa-times"></i></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelectorAll('.fpTab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        el.querySelectorAll('.fpTab').forEach(function(b) {
          b.style.color = 'var(--text-muted)'; b.style.borderBottomColor = 'transparent';
        });
        this.style.color = 'var(--zen)'; this.style.borderBottomColor = 'var(--zen)';
        var tab   = this.getAttribute('data-fp-tab');
        var uid   = el.getAttribute('data-fp-uid');
        var uname = el.getAttribute('data-fp-uname');
        loadFriendModalTab(tab, uid, uname);
      });
    });

    el.addEventListener('click', function(e) { if (e.target === el) closeFriendProfileModal(); });
    $('fpCloseBtn').addEventListener('click', closeFriendProfileModal);
  }

  function openFriendProfileModal(friendUserId, friendUsername) {
    injectFriendProfileModal();
    var overlay = $('friendProfileOverlay');
    overlay.setAttribute('data-fp-uid',   friendUserId);
    overlay.setAttribute('data-fp-uname', friendUsername);
    overlay.style.display = 'flex';

    overlay.querySelectorAll('.fpTab').forEach(function(b) {
      b.style.color = 'var(--text-muted)'; b.style.borderBottomColor = 'transparent';
    });
    var first = overlay.querySelector('[data-fp-tab="profile"]');
    if (first) { first.style.color = 'var(--zen)'; first.style.borderBottomColor = 'var(--zen)'; }

    var hdr = $('friendProfileHeader');
    hdr.innerHTML = '<div style="font-family:\'Cinzel\',serif;font-size:1rem;font-weight:700;color:var(--text-primary);">Loading…</div>';

    $('fpChatBtn').onclick    = function() { closeFriendProfileModal(); openDM(friendUsername); };
    $('fpTradeBtn').onclick   = function() { closeFriendProfileModal(); openTradeBuilderFor(friendUsername); };
    $('fpCompareBtn').onclick = function() {
      if (typeof window.loadAndCompare === 'function') {
        window.loadAndCompare(friendUserId, friendUsername, 'physical');
      }
    };

    loadFriendModalTab('profile', friendUserId, friendUsername);
  }

  function closeFriendProfileModal() {
    var o = $('friendProfileOverlay'); if (o) o.style.display = 'none';
  }

  async function loadFriendModalTab(tab, userId, username) {
    var pane = $('friendProfilePane');
    if (!pane) return;
    pane.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-muted);font-size:0.8rem;"><i class="fas fa-circle-notch fa-spin" style="margin-right:6px;"></i>Loading…</div>';

    if (tab === 'profile')    await renderFriendProfile(userId, username);
    if (tab === 'collection') await renderFriendCollection(userId, username);
    if (tab === 'friends')    await renderFriendFriends(userId, username);
  }

  async function renderFriendProfile(userId, username) {
    if (!sb()) return;
    var res = await sb().from('profiles').select('*').eq('user_id', userId).maybeSingle();
    var p = res.data;
    var pane = $('friendProfilePane'), hdr = $('friendProfileHeader');
    if (!p) {
      if (pane) pane.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-muted);">Profile not found.</div>';
      return;
    }

    if (hdr) {
      hdr.innerHTML =
        avatarHtml(p, 52) +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1rem;font-weight:700;line-height:1.3;">' + esc(p.display_name || p.username) + (p.is_pro ? proBadge() : '') + '</div>' +
          (p.display_name ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">@' + esc(p.username) + '</div>' : '') +
        '</div>' +
        '<button onclick="document.getElementById(\'friendProfileOverlay\').style.display=\'none\'" style="background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:4px 8px;position:absolute;top:12px;right:12px;">&times;</button>';
    }

    var tmap = window.traitIconMap || {};
    var traitsHtml = '';
    if (p.preferred_traits && p.preferred_traits.length) {
      traitsHtml = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px;">' +
        '<span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">Traits</span>' +
        p.preferred_traits.map(function(t) {
          return tmap[t]
            ? '<div class="modal-trait-badge">' +
                '<img src="'+esc(tmap[t])+'" title="'+esc(t)+'" style="width:20px;height:20px;" loading="lazy">' +
              '</div>'
            : '<span style="font-size:0.72rem;color:var(--text-muted);text-transform:capitalize;">'+esc(t)+'</span>';
        }).join('') + '</div>';
    }

    var statsHtml = '';
    try {
      var colData   = await fetchFriendCollectionData(userId);
      var ac        = allCards();
      var coreTotal = ac.filter(function(c) { return isCoreCard(c.number); }).length || 248;
      var coreOwned = ac.filter(function(c) { return isCoreCard(c.number) && (colData.physical[c.number] || 0) > 0; }).length;
      var digOwned  = Object.keys(colData.digital).filter(function(n) { return (colData.digital[n] || 0) > 0; }).length;

      statsHtml =
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;">' +
          '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:10px;text-align:center;">' +
            '<div style="font-family:\'Cinzel\',serif;font-size:1.1rem;font-weight:700;color:var(--accent);">' + coreOwned + '</div>' +
            '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Physical</div>' +
          '</div>' +
          '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:10px;text-align:center;">' +
            '<div style="font-family:\'Cinzel\',serif;font-size:1.1rem;font-weight:700;color:var(--zen);">' + Math.round((coreOwned / coreTotal) * 100) + '%</div>' +
            '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Complete</div>' +
          '</div>' +
          '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:10px;text-align:center;">' +
            '<div style="font-family:\'Cinzel\',serif;font-size:1.1rem;font-weight:700;color:var(--water);">' + digOwned + '</div>' +
            '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Digital</div>' +
          '</div>' +
        '</div>';
    } catch (e) { /* non-fatal */ }

    if (pane) {
      pane.innerHTML =
        '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.65;word-break:break-word;">' + (p.bio ? esc(p.bio) : '<em style="color:var(--text-muted);">No bio yet.</em>') + '</div>' +
        (p.favorite_chamber ? '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;"><i class="fas fa-window-maximize" style="color:var(--air);font-size:0.7rem;"></i><span style="font-size:0.78rem;color:var(--air);font-weight:600;">'+esc(p.favorite_chamber)+'</span></div>' : '') +
        traitsHtml + statsHtml;

      appendEnhancedStats(pane, userId);
    }
  }

  async function renderFriendCollection(userId, username) {
    var pane = $('friendProfilePane'); if (!pane) return;
    if (!sb()) {
      pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Not available offline.</div>';
      return;
    }

    pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.8rem;"><i class="fas fa-circle-notch fa-spin" style="margin-right:6px;"></i>Loading collection…</div>';

    var data     = await fetchFriendCollectionData(userId);
    var physical = data.physical;
    var digital  = data.digital;

    var physCount = Object.keys(physical).filter(function(n){ return (physical[n]||0) > 0; }).length;
    var digCount  = Object.keys(digital).filter(function(n){  return (digital[n]||0)  > 0; }).length;

    var mode = (physCount === 0 && digCount > 0) ? 'digital' : 'physical';

    function buildPane(activeMode) {
      var col       = activeMode === 'physical' ? physical : digital;
      var ownedNums = Object.keys(col).filter(function(n){ return (col[n]||0) > 0; });
      var ac        = allCards();
      var cards     = ac.filter(function(c){ return ownedNums.indexOf(c.number) !== -1; });

      cards.sort(function(a,b){
        var ro = { common:1, uncommon:2, rare:3, zenemental:4, promo:5 };
        return (ro[a.rarity]||0) - (ro[b.rarity]||0) || (parseInt(a.number,10)||0) - (parseInt(b.number,10)||0);
      });

      var RC = { common:'var(--text-muted)', uncommon:'var(--earth)', rare:'var(--accent)', zenemental:'var(--zen)', promo:'var(--promo)' };
      var myCol = window.collection || {};

      function toggleBtn(btnMode, btnLabel, btnIcon, count) {
        var isActive = btnMode === activeMode;
        return '<button data-fp-col-mode="' + btnMode + '" style="' +
          'flex:1;padding:9px 10px;border-radius:8px;border:1px solid ' + (isActive ? 'var(--zen)' : 'var(--border)') + ';' +
          'background:' + (isActive ? 'rgba(180,77,223,0.12)' : 'var(--bg-primary)') + ';' +
          'color:' + (isActive ? 'var(--zen)' : 'var(--text-secondary)') + ';' +
          'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.76rem;cursor:pointer;' +
          'display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;" ' +
          (isActive ? 'disabled' : '') + '>' +
          btnIcon + ' ' + btnLabel +
          ' <span style="font-size:0.62rem;opacity:0.75;font-weight:400;">(' + count + ')</span>' +
        '</button>';
      }

      var toggleHtml =
        '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
          toggleBtn('physical', 'Physical',
            '<i class="fas fa-clone" style="transform:scale(.75,1.175);font-size:0.7rem;"></i>',
            physCount) +
          toggleBtn('digital', 'Digital',
            '<i class="fas fa-cloud-download-alt" style="font-size:0.7rem;"></i>',
            digCount) +
        '</div>';

      var cardsHtml;
      if (cards.length === 0) {
        cardsHtml =
          '<div style="text-align:center;padding:30px 0;color:var(--text-muted);font-size:0.82rem;">' +
            '<i class="fas fa-inbox" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:10px;"></i>' +
            esc(username) + ' hasn\'t synced their ' + activeMode + ' collection yet.' +
          '</div>';
      } else {
        cardsHtml =
          '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">' +
            '<strong style="color:var(--text-primary);">' + esc(username) + '</strong> owns ' +
            '<strong style="color:var(--text-primary);">' + cards.length + '</strong> ' + activeMode + ' card' + (cards.length !== 1 ? 's' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;">' +
          cards.map(function(c) {
            var qty   = col[c.number] || 0;
            var iHave = (myCol[c.number] || 0) > 0;
            return '<div title="#'+esc(c.number)+' '+esc(c.name)+'" style="' +
              'background:var(--bg-card);border:1px solid ' + (iHave ? 'rgba(46,140,232,0.45)' : 'var(--border)') + ';' +
              'border-radius:8px;overflow:hidden;position:relative;cursor:default;' +
              (iHave ? 'box-shadow:0 0 0 1px rgba(46,140,232,0.15);' : '') + '">' +
              (c.imageLink
                ? '<img src="'+esc(c.imageLink)+'" alt="'+esc(c.name)+'" loading="lazy" style="width:100%;display:block;">'
                : '<div style="height:90px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted);padding:4px;text-align:center;">'+esc(c.name)+'</div>') +
              '<div style="padding:3px 4px;font-size:0.55rem;color:'+RC[c.rarity]+';font-weight:700;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(c.rarity)+'</div>' +
              (qty > 1 ? '<div style="position:absolute;top:4px;right:4px;background:var(--zen);color:#fff;border-radius:99px;font-size:0.55rem;font-weight:700;padding:1px 5px;">×'+qty+'</div>' : '') +
              (iHave ? '<div style="position:absolute;bottom:4px;right:4px;background:rgba(46,140,232,0.85);color:#fff;border-radius:99px;font-size:0.45rem;font-weight:700;padding:1px 4px;" title="You own this too"><i class="fas fa-people-arrows"></i></div>' : '') +
            '</div>';
          }).join('') + '</div>';
      }

      return toggleHtml + cardsHtml;
    }

    pane.innerHTML = buildPane(mode);

    pane.addEventListener('click', function onColClick(e) {
      var btn = e.target.closest('[data-fp-col-mode]');
      if (!btn || btn.disabled) return;
      mode = btn.getAttribute('data-fp-col-mode');
      pane.innerHTML = buildPane(mode);
      pane.addEventListener('click', onColClick);
    });
  }

  async function renderFriendFriends(userId, username) {
    var pane = $('friendProfilePane'); if (!pane) return;
    if (!sb()) { pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Not available.</div>'; return; }

    var fA = await sb().from('friendships').select('user_id,friend_id').eq('user_id',   userId).eq('status','accepted');
    var fB = await sb().from('friendships').select('user_id,friend_id').eq('friend_id', userId).eq('status','accepted');
    var all = (fA.data||[]).concat(fB.data||[]);
    if (!all.length) { pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.82rem;">'+esc(username)+' has no friends yet.</div>'; return; }

    var ids = all.map(function(f){ return f.user_id === userId ? f.friend_id : f.user_id; });
    var pr = await sb().from('profiles').select('user_id,username,display_name,avatar_card_number,avatar_offset_x,avatar_offset_y,is_pro').in('user_id', ids);
    var profs = pr.data || [];
    if (!profs.length) { pane.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Could not load friends.</div>'; return; }

    pane.innerHTML =
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">' + esc(username) + ' is friends with <strong style="color:var(--text-primary);">' + profs.length + '</strong> benders</div>' +
      profs.map(function(p) {
        var isMe = p.user_id === currentUser.id;
        return '<div class="friend-card" style="margin-bottom:8px;">' +
          avatarHtml(p, 36) +
          '<div class="friend-info"><div class="friend-name">' + esc(p.display_name || p.username) + (p.is_pro ? proBadge() : '') + (isMe ? ' <span style="font-size:0.62rem;color:var(--success);font-weight:700;">(You)</span>' : '') + '</div><div class="friend-sub">@' + esc(p.username) + '</div></div>' +
          (!isMe ? '<div class="friend-actions"><button class="friend-btn" data-view-friend="' + esc(p.user_id) + '" data-friend-name="' + esc(p.username) + '" style="font-size:0.72rem;padding:5px 10px;">View</button></div>' : '') +
        '</div>';
      }).join('');
  }

  function initFriendEvents() {
    var btn = $('friendSearchBtn'), inp = $('friendSearchInput');
    if (btn) btn.addEventListener('click', doFriendSearch);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doFriendSearch(); });
    document.addEventListener('click', function (e) {
      if (!currentUser) return;
      var el;
      el = e.target.closest('[data-view-friend]'); if (el) { openFriendProfileModal(el.getAttribute('data-view-friend'), el.getAttribute('data-friend-name')); return; }
      el = e.target.closest('[data-accept]');     if (el) { respondRequest(el.getAttribute('data-accept'), 'accepted');       return; }
      el = e.target.closest('[data-decline]');    if (el) { respondRequest(el.getAttribute('data-decline'), 'declined');      return; }
      el = e.target.closest('[data-add]');        if (el) { sendFriendReq(el.getAttribute('data-add'));                       return; }
      el = e.target.closest('[data-remove]');     if (el) { removeFriend(el.getAttribute('data-remove'));                     return; }
      el = e.target.closest('[data-dm]');         if (el) { openDM(el.getAttribute('data-dm'));                              return; }
      el = e.target.closest('[data-trade-with]'); if (el) { openTradeBuilderFor(el.getAttribute('data-trade-with'));          return; }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  CHAT — DM HELPERS
  // ══════════════════════════════════════════════════════════════

  function isDmRoom(room) {
    return !!(room && room.indexOf('__dm__') !== -1);
  }

  // Render ✓ (grey, sent) or ✓✓ (blue, read) on the sender's own messages.
  // Uses currentDmOtherReadAt — the timestamp of when the other person last
  // read this room — to decide which state to show.
  function dmTickHtml(m) {
    if (!isDmRoom(currentRoom)) return '';
    if (!currentProfile || m.username !== currentProfile.username) return '';
    var isRead = !!(
      currentDmOtherReadAt && m.created_at &&
      new Date(currentDmOtherReadAt) >= new Date(m.created_at)
    );
    return '<span class="dm-tick' + (isRead ? ' dm-tick--read' : '') + '"' +
      ' data-msg-ts="' + esc(m.created_at || '') + '">' +
      (isRead ? '✓✓' : '✓') +
      '</span>';
  }

  // Walk all tick spans and flip any that are now read.
  function refreshDmTicks() {
    if (!currentDmOtherReadAt) return;
    var readTime = new Date(currentDmOtherReadAt);
    document.querySelectorAll('.dm-tick[data-msg-ts]').forEach(function (span) {
      var ts = span.getAttribute('data-msg-ts');
      if (ts && readTime >= new Date(ts)) {
        span.textContent = '✓✓';
        span.classList.add('dm-tick--read');
      }
    });
  }

  // Fetch the other participant's last_read_at for this DM room.
  async function getOtherUserReadAt(room) {
    if (!isDmRoom(room) || !currentUser || !sb()) return null;
    var res = await sb()
      .from('dm_reads')
      .select('last_read_at')
      .eq('room', room)
      .neq('user_id', currentUser.id)
      .maybeSingle();
    return (res.data && res.data.last_read_at) || null;
  }

  // Upsert my own read position for this room (called when I view or receive).
  async function markDmRead(room) {
    if (!isDmRoom(room) || !currentUser || !sb()) return;
    await sb().from('dm_reads').upsert(
      { user_id: currentUser.id, room: room, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,room' }
    );
  }

  // Load all persisted DM rooms for the current user and add them to the sidebar.
  async function populateDmSidebar() {
    if (!currentUser || !sb()) return;
    var res = await sb()
      .from('dm_rooms')
      .select('*')
      .or('user1_id.eq.' + currentUser.id + ',user2_id.eq.' + currentUser.id)
      .order('last_message_at', { ascending: false });
    (res.data || []).forEach(function (r) {
      var other = r.user1_id === currentUser.id ? r.user2_username : r.user1_username;
      addRoomBtn(other + ' (DM)', r.room_id);
    });
  }

  // Inject the CSS for tick marks once.
  function injectDmTickStyles() {
    if (document.getElementById('dmTickStyles')) return;
    var s = document.createElement('style');
    s.id = 'dmTickStyles';
    s.textContent =
      '.dm-tick{font-size:0.6rem;color:var(--text-muted);margin-left:4px;' +
      'letter-spacing:-1px;vertical-align:middle;transition:color 0.25s;}' +
      '.dm-tick--read{color:#4ab3f4;}';
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════════════
  //  CHAT
  // ══════════════════════════════════════════════════════════════

  async function loadChat() {
    await populateDmSidebar();
    fetchMessages(currentRoom);
    subscribeRoom(currentRoom);
  }

  async function fetchMessages(room) {
    if (!sb()) return;
    // For DM rooms: get the other person's read position before rendering
    // so ticks are correct on the first paint.
    if (isDmRoom(room)) {
      currentDmOtherReadAt = await getOtherUserReadAt(room);
      markDmRead(room); // fire-and-forget: record that I've now read this room
    } else {
      currentDmOtherReadAt = null;
    }
    var res = await sb()
      .from('messages')
      .select('*')
      .eq('room', room)
      .order('created_at', { ascending: true })
      .limit(100);
    renderMessages(res.data || []);
  }

  function renderMessages(msgs) {
    var el = $('chatMessages'); if (!el) return;
    if (!msgs.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.8rem;">No messages yet — say hi! 👋</div>';
      return;
    }
    el.innerHTML = msgs.map(function (m) {
      var mine = currentProfile && m.username === currentProfile.username;
      var mp = {
        username:           m.username,
        avatar_card_number: m.avatar_card_number || null,
        avatar_offset_x:    m.avatar_offset_x    || null,
        avatar_offset_y:    m.avatar_offset_y    || null
      };
      return '<div class="chat-msg' + (mine ? ' mine' : '') + '">' +
        avatarHtml(mp, 28) +
        '<div class="chat-msg-content">' +
          '<div class="chat-msg-name">' + esc(m.username || 'Unknown') + '</div>' +
          '<div class="chat-bubble">' + esc(m.content) + '</div>' +
          '<div class="chat-ts" style="display:flex;align-items:center;gap:3px;">' +
            fmtTime(m.created_at) + dmTickHtml(m) +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function subscribeRoom(room) {
    // Tear down existing subs
    if (chatSub)   { try { chatSub.unsubscribe();   } catch(e){} chatSub   = null; }
    if (dmReadSub) { try { dmReadSub.unsubscribe(); } catch(e){} dmReadSub = null; }
    if (!sb()) return;

    // Always subscribe to new messages
    chatSub = sb().channel('chat:' + room)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.' + room },
        function (payload) { appendMessage(payload.new); })
      .subscribe();

    // For DM rooms: watch the other person's dm_reads row so ✓ → ✓✓ in real-time
    if (isDmRoom(room)) {
      dmReadSub = sb().channel('dm_reads:' + room)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'dm_reads', filter: 'room=eq.' + room },
          function (payload) {
            if (!payload.new || payload.new.user_id === currentUser.id) return;
            // The other person just read — update our cached time and refresh all ticks
            currentDmOtherReadAt = payload.new.last_read_at;
            refreshDmTicks();
          })
        .subscribe();
    }
  }

  function appendMessage(m) {
    var el = $('chatMessages'); if (!el) return;
    var ph = el.querySelector('[style*="say hi"]'); if (ph) ph.remove();
    var mine = currentProfile && m.username === currentProfile.username;

    // If I'm watching a DM and the other person sends a message, mark the room read
    if (isDmRoom(currentRoom) && !mine) {
      markDmRead(currentRoom);
    }

    var mp = {
      username:           m.username,
      avatar_card_number: m.avatar_card_number || null,
      avatar_offset_x:    m.avatar_offset_x    || null,
      avatar_offset_y:    m.avatar_offset_y    || null
    };
    var div = document.createElement('div');
    div.className = 'chat-msg' + (mine ? ' mine' : '');
    div.innerHTML =
      avatarHtml(mp, 28) +
      '<div class="chat-msg-content">' +
        '<div class="chat-msg-name">' + esc(m.username || 'Unknown') + '</div>' +
        '<div class="chat-bubble">' + esc(m.content) + '</div>' +
        '<div class="chat-ts" style="display:flex;align-items:center;gap:3px;">' +
          'just now' + dmTickHtml(m) +
        '</div>' +
      '</div>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function switchRoom(label, roomId) {
    currentRoom = roomId;
    document.querySelectorAll('.chat-room-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-room="' + roomId + '"]'); if (btn) btn.classList.add('active');
    var hdr = $('chatHeaderLabel');
    if (hdr) hdr.innerHTML = '<i class="fas fa-hashtag" style="color:var(--zen);font-size:0.78rem;"></i> ' + esc(label);
    fetchMessages(roomId);
    subscribeRoom(roomId);
  }

  function addRoomBtn(label, roomId) {
    var s = $('chatSidebar'); if (!s || s.querySelector('[data-room="' + roomId + '"]')) return;
    var btn = document.createElement('button');
    btn.className = 'chat-room-btn';
    btn.setAttribute('data-room', roomId);
    btn.innerHTML = '<span class="chat-room-dot"></span>' + esc(label);
    btn.addEventListener('click', function () { switchRoom(label, roomId); });
    s.appendChild(btn);
  }

  // Open (or resume) a DM with another user.
  // Upserts a dm_rooms row so both users see the thread in their sidebar.
  async function openDM(username) {
    if (!currentProfile || !sb()) return;

    // Look up the other user's ID
    var profRes = await sb().from('profiles').select('user_id').eq('username', username).maybeSingle();
    if (!profRes.data) { toast('Could not open DM — user not found.'); return; }
    var otherId = profRes.data.user_id;

    var roomId = [currentProfile.username, username].sort().join('__dm__');

    // Sort so user1 < user2 alphabetically (stable regardless of who initiates)
    var pair = [
      { id: currentUser.id, username: currentProfile.username },
      { id: otherId,        username: username }
    ].sort(function (a, b) { return a.username.localeCompare(b.username); });

    // Persist the room — ignoreDuplicates so a race doesn't throw
    await sb().from('dm_rooms').upsert({
      room_id:         roomId,
      user1_id:        pair[0].id,
      user2_id:        pair[1].id,
      user1_username:  pair[0].username,
      user2_username:  pair[1].username,
      last_message_at: new Date().toISOString()
    }, { onConflict: 'room_id', ignoreDuplicates: true });

    currentRoom = roomId;
    addRoomBtn(username + ' (DM)', roomId); // addRoomBtn dedupes by data-room

    var tab = document.querySelector('[data-nested-tab="chat"]');
    if (tab) tab.click();

    setTimeout(function () { switchRoom(username + ' (DM)', roomId); }, 60);
  }

  async function sendMessage() {
    if (!currentProfile || !sb()) return;
    var inp = $('chatInput'), content = (inp.value || '').trim(); if (!content) return;
    inp.value = '';
    await sb().from('messages').insert({
      room:               currentRoom,
      user_id:            currentUser.id,
      username:           currentProfile.username,
      avatar_card_number: currentProfile.avatar_card_number || null,
      avatar_offset_x:    currentProfile.avatar_offset_x    || null,
      avatar_offset_y:    currentProfile.avatar_offset_y    || null,
      content:            content
    });
    // Keep dm_rooms sorted by most-recent so the sidebar stays fresh
    if (isDmRoom(currentRoom)) {
      sb().from('dm_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('room_id', currentRoom)
        .then(function () {});
    }
  }

  function initChatEvents() {
    var s = $('chatSendBtn'), i = $('chatInput');
    if (s) s.addEventListener('click', sendMessage);
    if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(); });
    document.querySelectorAll('.chat-room-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var room = this.getAttribute('data-room');
        switchRoom(room === 'global' ? 'Global Chat' : room, room);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  TRADES
  // ══════════════════════════════════════════════════════════════
  async function loadTrades() {
    if (!currentUser || !sb()) return;
    await Promise.all([loadTradePane('incoming'), loadTradePane('outgoing'), loadTradePane('history')]);
    populateTradeBuilder();
  }

  async function loadTradePane(pane) {
    var el = $(pane === 'incoming' ? 'tradeIncoming' : pane === 'outgoing' ? 'tradeOutgoing' : 'tradeHistory'); if (!el) return;
    var q = sb().from('trades').select('*').order('created_at', {ascending:false});
    if (pane === 'incoming')      q = q.eq('receiver_id', currentUser.id).eq('status', 'pending');
    else if (pane === 'outgoing') q = q.eq('sender_id', currentUser.id).eq('status', 'pending');
    else q = q.or('sender_id.eq.'+currentUser.id+',receiver_id.eq.'+currentUser.id).neq('status', 'pending').limit(20);
    var res = await q, rows = res.data || [];
    if (!rows.length) { el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>Nothing here yet.</p></div>'; return; }
    el.innerHTML = rows.map(renderTradeCard).join('');
  }

  function renderTradeCard(t) {
    var incoming = t.receiver_id === currentUser.id, partner = incoming ? t.sender_username : t.receiver_username;
    var offer = t.offer_cards || [], request = t.request_cards || [];
    var actions = '';
    if (t.status === 'pending' && incoming) actions = '<button class="trade-action-btn accept" data-trade-accept="'+t.id+'">Accept</button><button class="trade-action-btn reject" data-trade-reject="'+t.id+'">Decline</button>';
    else if (t.status === 'pending')        actions = '<button class="trade-action-btn" data-trade-cancel="'+t.id+'">Cancel</button>';
    return '<div class="trade-card"><div class="trade-card-header"><div><div class="trade-partner">'+(incoming?'From: ':'To: ')+esc(partner||'–')+'</div><div class="trade-date">'+fmtTime(t.created_at)+'</div></div><span class="trade-status-badge '+esc(t.status)+'">'+esc(t.status)+'</span></div>'+(t.note?'<div class="trade-note">"'+esc(t.note)+'"</div>':'')+'<div class="trade-columns"><div><div class="trade-col-label">Offering</div><div class="trade-chips">'+offer.map(function(c){ return '<span class="trade-chip">'+esc(c)+'</span>'; }).join('')+'</div></div><div><div class="trade-col-label">Requesting</div><div class="trade-chips">'+request.map(function(c){ return '<span class="trade-chip">'+esc(c)+'</span>'; }).join('')+'</div></div></div>'+(actions?'<div class="trade-actions">'+actions+'</div>':'')+'</div>';
  }

  async function respondTrade(id, status) {
    await sb().from('trades').update({ status: status }).eq('id', id);
    loadTrades(); toast({accepted:'Trade accepted! ✅',rejected:'Trade declined.',cancelled:'Trade cancelled.'}[status] || 'Done.');
  }

  async function populateTradeBuilder() {
    if (!currentUser || !sb()) return;
    var sel = $('tbReceiver'); if (!sel) return;
    sel.innerHTML = '<option value="">— Select a friend —</option>';
    var frA = await sb().from('friendships').select('user_id,friend_id').eq('user_id',   currentUser.id).eq('status', 'accepted');
    var frB = await sb().from('friendships').select('user_id,friend_id').eq('friend_id', currentUser.id).eq('status', 'accepted');
    var frAll = (frA.data || []).concat(frB.data || []);
    var frIds = frAll.map(function(f){ return f.user_id === currentUser.id ? f.friend_id : f.user_id; });
    if (frIds.length) {
      var frProf = await sb().from('profiles').select('user_id,username').in('user_id', frIds);
      (frProf.data || []).forEach(function(p) {
        var opt = document.createElement('option'); opt.value = p.user_id + '|' + p.username; opt.textContent = p.username; sel.appendChild(opt);
      });
    }
    var ac = window.allCards || [], col = window.collection || {};
    buildCardGrid($('tbOfferGrid'), ac.filter(function (c) { return (col[c.number] || 0) > 0; }), 'offer');
    buildCardGrid($('tbRequestGrid'), ac, 'request');
  }

  function buildCardGrid(el, cards, mode) {
    if (!el) return;
    el.innerHTML = cards.slice(0, 120).map(function (c) {
      var short = c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name;
      return '<div class="tb-chip" data-tb-num="'+esc(c.number)+'" data-tb-name="'+esc(c.name)+'" data-tb-mode="'+mode+'" title="#'+esc(c.number)+' '+esc(c.name)+'"><div style="font-size:0.55rem;color:var(--text-muted);">#'+esc(c.number)+'</div>'+esc(short)+'</div>';
    }).join('');
  }

  function updateTbChips() {
    var ofs = $('tbOfferSelected'), reqs = $('tbRequestSelected');
    if (ofs)  ofs.innerHTML  = tbOffer.map(function (n) { return '<span class="tb-sel-chip">'+esc(n)+' <span class="rm" data-rm="'+esc(n)+'" data-rm-mode="offer">&times;</span></span>'; }).join('');
    if (reqs) reqs.innerHTML = tbRequest.map(function (n) { return '<span class="tb-sel-chip">'+esc(n)+' <span class="rm" data-rm="'+esc(n)+'" data-rm-mode="request">&times;</span></span>'; }).join('');
  }

  function openTradeBuilder() {
    tbOffer = []; tbRequest = []; updateTbChips(); populateTradeBuilder();
    if ($('tradeBuilderError')) $('tradeBuilderError').textContent = '';
    if ($('tbNote')) $('tbNote').value = '';
    $('tradeBuilderOverlay').classList.add('active');
  }
  function openTradeBuilderFor(username) {
    openTradeBuilder();
    setTimeout(function () {
      var sel = $('tbReceiver'); if (!sel) return;
      for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].text === username) { sel.selectedIndex = i; break; } }
    }, 250);
  }
  function closeTradeBuilder() { $('tradeBuilderOverlay').classList.remove('active'); }

  async function submitTrade() {
    var errEl = $('tradeBuilderError'), recv = ($('tbReceiver').value || '').split('|');
    if (!recv[0])        { errEl.textContent = 'Select a friend.';                          return; }
    if (!tbOffer.length)   { errEl.textContent = 'Choose at least one card to offer.';      return; }
    if (!tbRequest.length) { errEl.textContent = 'Choose at least one card to request.';    return; }
    var note = ($('tbNote').value || '').trim();
    var res = await sb().from('trades').insert({ sender_id: currentUser.id, sender_username: currentProfile.username, receiver_id: recv[0], receiver_username: recv[1], offer_cards: tbOffer, request_cards: tbRequest, note: note || null, status: 'pending' });
    if (res.error) { errEl.textContent = res.error.message; return; }
    closeTradeBuilder(); toast('Trade offer sent! 🤝'); loadTrades();
  }

  function initTradeEvents() {
    var newBtn = $('tradeNewBtn'); if (newBtn) newBtn.addEventListener('click', openTradeBuilder);
    [$('tradeBuilderClose'), $('tradeBuilderCancel')].forEach(function (b) { if (b) b.addEventListener('click', closeTradeBuilder); });
    var overlay = $('tradeBuilderOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) { if (e.target === this) closeTradeBuilder(); });
      overlay.addEventListener('click', function (e) {
        var chip = e.target.closest('.tb-chip[data-tb-num]');
        if (chip) {
          var mode = chip.getAttribute('data-tb-mode'), name = chip.getAttribute('data-tb-name'), arr = mode === 'offer' ? tbOffer : tbRequest, idx = arr.indexOf(name);
          if (idx === -1) { arr.push(name); chip.classList.add('selected'); } else { arr.splice(idx, 1); chip.classList.remove('selected'); }
          updateTbChips(); return;
        }
        var rm = e.target.closest('[data-rm]');
        if (rm) {
          var n = rm.getAttribute('data-rm'), rmode = rm.getAttribute('data-rm-mode');
          if (rmode === 'offer') tbOffer   = tbOffer.filter(function (x) { return x !== n; });
          else                   tbRequest = tbRequest.filter(function (x) { return x !== n; });
          updateTbChips();
        }
      });
    }
    var sb2 = $('tradeBuilderSubmit'); if (sb2) sb2.addEventListener('click', submitTrade);
    ['tradeIncoming', 'tradeOutgoing', 'tradeHistory'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-trade-accept]'); if (a) { respondTrade(a.getAttribute('data-trade-accept'), 'accepted'); return; }
        var r = e.target.closest('[data-trade-reject]'); if (r) { respondTrade(r.getAttribute('data-trade-reject'), 'rejected'); return; }
        var c = e.target.closest('[data-trade-cancel]'); if (c) { respondTrade(c.getAttribute('data-trade-cancel'), 'cancelled'); return; }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  FORUM
  // ══════════════════════════════════════════════════════════════
  async function loadForum() {
    if (!sb()) return;
    var q = sb().from('forum_posts').select('*').order('pinned', {ascending:false}).order('created_at', {ascending:false}).limit(40);
    if (currentCat !== 'all') q = q.eq('category', currentCat);
    var res = await q, rows = res.data || [], el = $('forumPostList');
    if (!rows.length) { el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>No posts yet — start the conversation!</p></div>'; return; }
    el.innerHTML = rows.map(function (p) {
      return '<div class="forum-post-card'+(p.pinned?' pinned':'')+'" data-post-id="'+p.id+'">' +
        '<div class="forum-post-title">'+esc(p.title)+'</div>' +
        '<div class="forum-post-preview">'+esc((p.body||'').slice(0,130))+'</div>' +
        '<div class="forum-post-meta"><span class="forum-post-author">by '+esc(p.username)+' · '+fmtTime(p.created_at)+'</span><span class="forum-post-cat">'+esc(p.category)+'</span><span class="forum-reply-count"><i class="fas fa-comment-alt"></i> '+(p.reply_count||0)+'</span></div>' +
      '</div>';
    }).join('');
  }

  async function openForumPost(postId) {
    currentPostId = postId; $('forumDetailOverlay').classList.add('active');
    var pRes = await sb().from('forum_posts').select('*').eq('id', postId).single();
    var post = pRes.data;
    if (post) {
      $('forumDetailTitle').textContent = post.title;
      var pp = { username: post.username, avatar_card_number: post.avatar_card_number || null, avatar_offset_x: post.avatar_offset_x || null, avatar_offset_y: post.avatar_offset_y || null };
      $('forumDetailBody').innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'+avatarHtml(pp, 26)+'<div><span class="forum-reply-author">'+esc(post.username)+'</span><div class="forum-reply-ts">'+fmtTime(post.created_at)+'</div></div></div>' +
          '<div style="font-size:0.88rem;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;word-break:break-word;">'+esc(post.body)+'</div>' +
        '</div><div id="forumRepliesContainer"><div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">Loading replies…</div></div>';
    }
    loadForumReplies(postId);
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} }
    forumReplySub = sb().channel('forum:'+postId)
      .on('postgres_changes', {event:'INSERT',schema:'public',table:'forum_replies',filter:'post_id=eq.'+postId}, function (payload) { appendReply(payload.new); })
      .subscribe();
  }

  async function loadForumReplies(postId) {
    var res = await sb().from('forum_replies').select('*').eq('post_id', postId).order('created_at', {ascending:true});
    var container = $('forumRepliesContainer'); if (!container) return;
    var rows = res.data || [];
    if (!rows.length) { container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">No replies yet — be first!</div>'; return; }
    container.innerHTML = rows.map(renderReply).join('');
    var body = $('forumDetailBody'); if (body) body.scrollTop = body.scrollHeight;
  }

  function renderReply(r) {
    var rp = { username: r.username, avatar_card_number: r.avatar_card_number || null, avatar_offset_x: r.avatar_offset_x || null, avatar_offset_y: r.avatar_offset_y || null };
    return '<div class="forum-reply-card">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+avatarHtml(rp, 24)+'<div><span class="forum-reply-author">'+esc(r.username)+'</span><div class="forum-reply-ts">'+fmtTime(r.created_at)+'</div></div></div>'+
      '<div class="forum-reply-body">'+esc(r.body)+'</div></div>';
  }

  function appendReply(r) {
    var c = $('forumRepliesContainer'); if (!c) return;
    var ph = c.querySelector('[style*="No replies"]'); if (ph) ph.remove();
    var div = document.createElement('div'); div.innerHTML = renderReply(r); c.appendChild(div.firstChild);
    var body = $('forumDetailBody'); if (body) body.scrollTop = body.scrollHeight;
  }

  function closeForumDetail() {
    $('forumDetailOverlay').classList.remove('active'); currentPostId = null;
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} forumReplySub = null; }
  }

  async function submitForumPost() {
    var title = ($('forumNewTitle').value || '').trim(), body = ($('forumNewBody').value || '').trim();
    var cat = $('forumNewCat').value, errEl = $('forumNewError');
    if (!title) { errEl.textContent = 'Please enter a title.'; return; }
    if (!body)  { errEl.textContent = 'Please enter some content.'; return; }
    var res = await sb().from('forum_posts').insert({ user_id: currentUser.id, username: currentProfile.username, avatar_card_number: currentProfile.avatar_card_number || null, avatar_offset_x: currentProfile.avatar_offset_x || null, avatar_offset_y: currentProfile.avatar_offset_y || null, category: cat, title: title, body: body, pinned: false, reply_count: 0 });
    if (res.error) { errEl.textContent = res.error.message; return; }
    $('forumNewOverlay').classList.remove('active');
    $('forumNewTitle').value = ''; $('forumNewBody').value = ''; errEl.textContent = '';
    loadForum(); toast('Post published! ✍️');
  }

  async function sendForumReply() {
    if (!currentPostId || !currentProfile || !sb()) return;
    var inp = $('forumReplyInput'), body = (inp.value || '').trim(); if (!body) return;
    inp.value = ''; inp.style.height = '40px';
    var res = await sb().from('forum_replies').insert({ post_id: currentPostId, user_id: currentUser.id, username: currentProfile.username, avatar_card_number: currentProfile.avatar_card_number || null, avatar_offset_x: currentProfile.avatar_offset_x || null, avatar_offset_y: currentProfile.avatar_offset_y || null, body: body });
    if (!res.error) sb().rpc('increment_reply_count', { p_post_id: currentPostId }).catch(function(){});
  }

  function initForumEvents() {
    var catRow = $('forumCatRow');
    if (catRow) catRow.addEventListener('click', function (e) {
      var pill = e.target.closest('.forum-cat-pill'); if (!pill) return;
      catRow.querySelectorAll('.forum-cat-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active'); currentCat = pill.getAttribute('data-cat'); loadForum();
    });
    var nb = $('forumNewBtn');
    if (nb) nb.addEventListener('click', function () { if (!currentProfile) { toast('Sign in to post.'); return; } $('forumNewOverlay').classList.add('active'); });
    [$('forumNewClose'), $('forumNewCancel')].forEach(function (b) { if (b) b.addEventListener('click', function () { $('forumNewOverlay').classList.remove('active'); }); });
    var fno = $('forumNewOverlay'); if (fno) fno.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });
    var sub = $('forumNewSubmit'); if (sub) sub.addEventListener('click', submitForumPost);
    var pl = $('forumPostList'); if (pl) pl.addEventListener('click', function (e) { var c = e.target.closest('[data-post-id]'); if (c) openForumPost(c.getAttribute('data-post-id')); });
    var dc = $('forumDetailClose'); if (dc) dc.addEventListener('click', closeForumDetail);
    var fdo = $('forumDetailOverlay'); if (fdo) fdo.addEventListener('click', function (e) { if (e.target === this) closeForumDetail(); });
    var rb = $('forumReplySendBtn'); if (rb) rb.addEventListener('click', sendForumReply);
    var ri = $('forumReplyInput'); if (ri) ri.addEventListener('keydown', function (e) { if (e.ctrlKey && e.key === 'Enter') sendForumReply(); });
  }

  // ══════════════════════════════════════════════════════════════
  //  LOAD & COMPARE
  // ══════════════════════════════════════════════════════════════
  window.loadAndCompare = async function (friendUserId, friendUsername, mode) {
    mode = mode || 'physical';
    if (!friendUserId) { toast('No friend selected to compare.'); return; }
    closeFriendProfileModal();
    toast('Loading ' + friendUsername + '\'s collection…');
    try {
      var data = await fetchFriendCollectionData(friendUserId);
      var col  = (mode === 'digital') ? data.digital : data.physical;
      if (!col || !Object.keys(col).length) {
        toast(friendUsername + ' hasn\'t synced their ' + mode + ' collection yet.');
        return;
      }
      if (typeof window.applyCompareCollection === 'function') {
        window.applyCompareCollection(col);
      } else {
        window.compareCollection = col;
        if (typeof window.buildFilters    === 'function') window.buildFilters();
        if (typeof window.renderCards     === 'function') window.renderCards();
        if (typeof window.updateCompareBtn === 'function') window.updateCompareBtn();
      }
      var homeTabBtn = document.querySelector('.tab-btn[data-tab="home"]');
      if (homeTabBtn) homeTabBtn.click();
      toast('Comparing with ' + friendUsername + ' — ' + Object.keys(col).length + ' cards loaded!');
    } catch (e) {
      console.error('[social] loadAndCompare error:', e);
      toast('Could not load ' + friendUsername + '\'s collection. Try again.');
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC HOOKS
  // ══════════════════════════════════════════════════════════════
  window.socialOnLogin = function (user) {
    currentUser = user; if (!sb()) return; setupProfileSection(user);
  };

  window.socialOnLogout = function () {
    currentUser = null; currentProfile = null; currentDmOtherReadAt = null;
    if (chatSub)       { try { chatSub.unsubscribe();       } catch(e){} chatSub       = null; }
    if (dmReadSub)     { try { dmReadSub.unsubscribe();     } catch(e){} dmReadSub     = null; }
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} forumReplySub = null; }
    if (friendReqSub)  { try { friendReqSub.unsubscribe();  } catch(e){} friendReqSub  = null; }
    hideHeaderProfile();
    var card = $('profileDisplayCard');
    if (card) card.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.8rem;">Sign in to view your profile.</div>';
    if ($('socialSetup'))   $('socialSetup').style.display   = 'none';
    if ($('socialSection')) $('socialSection').style.display = 'none';
    closeProfileEditor();
  };
  window.socialPopulateDmSidebar = populateDmSidebar;

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    injectDmTickStyles();
    initFriendEvents();
    initChatEvents();
    initTradeEvents();
    initForumEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  console.log('[social.js] v6 loaded ✓ (dm_rooms persistence + dm_reads receipts)');

})();
