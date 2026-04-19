// ================================================================
//  AVATAR TCG — Social Features + Profile Editor  (social.js v2)
//  Requires: window.sb (Supabase client, set by auth.js)
//
//  New profile columns needed (run schema_update.sql):
//    display_name, avatar_card_number, bio,
//    preferred_traits text[], favorite_chamber, is_pro
// ================================================================
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────
  var currentUser    = null;
  var currentProfile = null;
  var chatSub        = null;
  var forumReplySub  = null;
  var currentRoom    = 'global';
  var currentCat     = 'all';
  var currentPostId  = null;
  var tbOffer        = [];
  var tbRequest      = [];

  // Profile editor state
  var peSelectedAvatar = null;
  var peSelectedTraits = [];
  var peUsernameValid  = true;
  var peAvatarFilter   = '';
  var peAvatarPage     = 0;
  var PE_PAGE_SIZE     = 48;
  var FREE_CARD_MAX    = 165;

  var TRAIT_KEYS = ['bull','fox','lion','mind','body','spirit','light','shadow','dark','water','earth','fire','air'];

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

  // ── Avatar rendering ──────────────────────────────────────────
  // profile: { username, avatar_card_number?, is_pro? }
  // size: pixels
  function avatarHtml(profile, size) {
    size = size||42;
    var fs = Math.round(size*0.38)+'px';
    if (profile && profile.avatar_card_number) {
      var card = findCard(profile.avatar_card_number);
      if (card && card.imageLink) {
        return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;overflow:hidden;position:relative;flex-shrink:0;background:var(--bg-primary);">' +
          '<img src="'+esc(card.imageLink)+'" alt="" loading="lazy" ' +
          'style="position:absolute;width:185%;height:auto;top:-6%;left:-42%;pointer-events:none;">' +
          '</div>';
      }
    }
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:linear-gradient(135deg,var(--water),var(--zen));display:flex;align-items:center;justify-content:center;font-family:\'Cinzel\',serif;font-weight:700;font-size:'+fs+';color:#fff;flex-shrink:0;">'+esc(initials(profile?profile.username:'?'))+'</div>';
  }

  function proBadge() {
    return '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(232,182,50,0.12);color:var(--promo);border:1px solid rgba(232,182,50,0.3);border-radius:99px;padding:2px 8px;font-size:0.58rem;font-weight:700;letter-spacing:0.08em;vertical-align:middle;margin-left:6px;">✦ PRO</span>';
  }

  // ── Persistent header profile indicator ─────────────────────────
  function updateHeaderProfile() {
    if (!currentProfile) return;
    var hdr=$('headerProfileIndicator');
    if (!hdr) return;
    hdr.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;">' +
        avatarHtml(currentProfile, 36) +
        '<div style="flex:1;min-width:0;text-align:right;">' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.82rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(currentProfile.display_name||currentProfile.username) + '</div>' +
          '<div style="font-size:0.62rem;color:var(--text-muted);">Profile</div>' +
        '</div>' +
      '</div>';
    hdr.style.display='block';
    hdr.onclick=function(){ document.querySelector('[data-tab="profile"]').click(); };
  }

  function hideHeaderProfile() {
    var hdr=$('headerProfileIndicator'); if (hdr) { hdr.style.display='none'; hdr.innerHTML=''; }
  }

  // ── Social tab switcher ───────────────────────────────────────
  function initSocialTabs() {
    var sec=$('socialSection'); if (!sec) return;
    sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function(btn){
      if (btn.getAttribute('data-trade-tab')) return;
      btn.addEventListener('click', function(){
        var name=this.getAttribute('data-nested-tab')||this.getAttribute('data-social-tab');
        sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function(b){
          if (!b.getAttribute('data-trade-tab')) b.classList.remove('active');
        });
        this.classList.add('active');
        sec.querySelectorAll('.social-pane').forEach(function(p){ p.style.display='none'; });
        var pane=$('social-'+name); if (pane) pane.style.display='';
        if (name==='chat')    { loadChat(); }
        if (name==='trades')  { loadTrades(); }
        if (name==='forum')   { loadForum(); }
        if (name==='friends') { loadFriends(); }
        // 'edit-profile' pane is always populated — no special action needed
      });
    });
    sec.querySelectorAll('[data-trade-tab]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var n=this.getAttribute('data-trade-tab');
        sec.querySelectorAll('[data-trade-tab]').forEach(function(b){ b.classList.remove('active'); });
        this.classList.add('active');
        $('tradeIncoming').style.display=n==='incoming'?'':'none';
        $('tradeOutgoing').style.display=n==='outgoing'?'':'none';
        $('tradeHistory').style.display =n==='history' ?'':'none';
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE SETUP & DISPLAY
  // ══════════════════════════════════════════════════════════════
  async function setupProfileSection(user) {
    if (!sb()) return;
    var res=await sb().from('profiles').select('*').eq('user_id',user.id).maybeSingle();
    var profile=res.error?null:res.data;
    if (!profile) {
      $('socialSetup').style.display  ='block';
      $('socialSection').style.display='none';
      wireUsernameForm(user);
    } else {
      currentProfile=profile;
      $('socialSetup').style.display  ='none';
      activateSocialSection(profile);
    }
  }

  function wireUsernameForm(user) {
    var btn=$('setupSubmitBtn'), inp=$('setupUsername'), err=$('setupErr');
    if (!btn) return;
    btn.onclick=async function(){
      err.textContent='';
      var name=inp.value.trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) { err.textContent='Username: 3–24 chars, letters/numbers/_ only.'; return; }
      btn.disabled=true; btn.textContent='Saving…';
      var taken=await sb().from('profiles').select('id').eq('username',name).maybeSingle();
      if (taken.data) { err.textContent='That username is taken.'; btn.disabled=false; btn.textContent='Save Username'; return; }
      var res=await sb().from('profiles').insert({ user_id:user.id, username:name, email:user.email });
      btn.disabled=false; btn.textContent='Save Username';
      if (res.error) { err.textContent=res.error.message; return; }
      currentProfile={ user_id:user.id, username:name };
      $('socialSetup').style.display='none';
      activateSocialSection(currentProfile);
    };
  }

  function activateSocialSection(profile) {
    $('socialSection').style.display='block';
    refreshProfileDisplay(profile);
    updateHeaderProfile();
    initSocialTabs();
    loadFriends();
  }

  // ── Renders the profile card inside the "Profile" tab pane ────
  function refreshProfileDisplay(profile) {
    var wrap=$('profileDisplayCard');
    if (!wrap) return;

    var displayName=profile.display_name||profile.username;
    var bio=profile.bio||'';
    var isPro=profile.is_pro;

    // Traits row
    var traitsHtml='';
    if (profile.preferred_traits && profile.preferred_traits.length) {
      var tmap=window.traitIconMap||{};
      traitsHtml=
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center;">' +
        '<span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;margin-right:2px;">Traits</span>' +
        profile.preferred_traits.slice(0,3).map(function(t){
          return tmap[t]
            ? '<img src="'+esc(tmap[t])+'" title="'+esc(t)+'" style="width:20px;height:20px;opacity:0.9;" loading="lazy">'
            : '<span style="font-size:0.68rem;color:var(--text-muted);text-transform:capitalize;">'+esc(t)+'</span>';
        }).join('')+
        '</div>';
    }

    var chamberHtml=profile.favorite_chamber
      ? '<div style="display:flex;align-items:center;gap:5px;margin-top:8px;">' +
          '<i class="fas fa-window-maximize" style="font-size:0.6rem;color:var(--air);transform:scale(.9,1.7);"></i>' +
          '<span style="font-size:0.72rem;color:var(--air);font-weight:600;">'+esc(profile.favorite_chamber)+'</span>' +
        '</div>'
      : '';

    wrap.innerHTML =
      /* ── Avatar + name block ── */
      '<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;">' +
        /* Avatar */
        '<div style="flex-shrink:0;position:relative;">' +
          '<div style="width:72px;height:72px;border-radius:50%;overflow:hidden;border:3px solid var(--border-light);">' +
            avatarHtml(profile, 72) +
          '</div>' +
          (isPro ? '<div style="position:absolute;bottom:-2px;right:-2px;background:var(--promo);border-radius:99px;padding:2px 6px;font-size:0.52rem;font-weight:700;letter-spacing:0.06em;color:#000;border:2px solid var(--bg-card);">PRO</div>' : '') +
        '</div>' +
        /* Name / username / bio */
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:1rem;line-height:1.3;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">' +
            esc(displayName) +
          '</div>' +
          (displayName!==profile.username
            ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">@'+esc(profile.username)+'</div>'
            : '') +
          (bio
            ? '<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:6px;line-height:1.55;word-break:break-word;">'+esc(bio)+'</div>'
            : '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;font-style:italic;">No bio yet.</div>') +
          traitsHtml +
          chamberHtml +
        '</div>' +
      '</div>' +

      /* ── Divider ── */
      '<div style="height:1px;background:var(--border);margin-bottom:14px;"></div>' +

      /* ── Edit button ── */
      '<button id="editProfileBtn" type="button" ' +
        'style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);' +
        'color:var(--text-secondary);font-size:0.78rem;font-family:\'Nunito Sans\',sans-serif;font-weight:700;' +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:all 0.2s;">' +
        '<i class="fas fa-pen" style="font-size:0.72rem;"></i> Edit Profile' +
      '</button>';

    var editBtn=$('editProfileBtn');
    if (editBtn) {
      editBtn.addEventListener('mouseenter', function(){ this.style.borderColor='var(--zen)'; this.style.color='var(--zen)'; this.style.background='rgba(180,77,223,0.06)'; });
      editBtn.addEventListener('mouseleave', function(){ this.style.borderColor='var(--border)'; this.style.color='var(--text-secondary)'; this.style.background='var(--bg-primary)'; });
      editBtn.addEventListener('click', openProfileEditor);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE EDITOR MODAL
  // ══════════════════════════════════════════════════════════════
  function injectProfileEditorModal() {
    if ($('profileEditorOverlay')) return;

    var tmap=window.traitIconMap||{};
    var traitsHtml=TRAIT_KEYS.map(function(t){
      var icon=tmap[t]
        ? '<img src="'+esc(tmap[t])+'" alt="'+esc(t)+'" style="width:20px;height:20px;" loading="lazy">'
        : '<span style="font-size:0.68rem;text-transform:capitalize;">'+esc(t)+'</span>';
      return '<button type="button" class="pe-trait-btn" data-trait="'+t+'" title="'+esc(t)+'" ' +
        'style="width:44px;height:44px;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);cursor:pointer;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:all 0.18s;padding:4px;">' +
        icon +
        '<span style="font-size:0.48rem;color:var(--text-muted);text-transform:capitalize;line-height:1;">'+esc(t)+'</span>' +
      '</button>';
    }).join('');

    var html=
      '<div id="profileEditorOverlay" class="social-modal-overlay" style="z-index:120;">' +
        '<div class="social-modal" style="max-width:600px;">' +
          '<div class="social-modal-header">' +
            '<div class="social-modal-title"><i class="fas fa-user-edit" style="color:var(--zen);margin-right:8px;"></i>Edit Profile</div>' +
            '<button class="modal-close" id="peClose" type="button"><i class="fas fa-times"></i></button>' +
          '</div>' +

          '<div id="peBody" class="social-modal-body" style="padding:0;overflow-y:auto;">' +

            /* ── Avatar section ── */
            '<div style="padding:18px 18px 14px;border-bottom:1px solid var(--border);background:var(--bg-card);">' +
              '<div style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;margin-bottom:12px;">Profile Picture</div>' +
              '<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">' +
                '<div id="peAvatarPreview" style="width:64px;height:64px;border-radius:50%;overflow:hidden;position:relative;background:var(--bg-primary);flex-shrink:0;border:3px solid var(--border-light);"></div>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;margin-bottom:8px;">' +
                    'Choose artwork from cards <strong style="color:var(--text-primary);">#1–#165</strong> (free accounts). '+
                    'All card art unlocked with <strong style="color:var(--promo);">✦ Pro</strong>.' +
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

            /* ── Fields section ── */
            '<div style="padding:18px;">' +

              /* Display Name */
              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">' +
                  'Display Name <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.65rem;">— shown instead of username (optional)</span>' +
                '</label>' +
                '<input id="peDisplayName" type="text" maxlength="40" placeholder="Your display name" ' +
                  'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text-primary);font-size:0.88rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
              '</div>' +

              /* Username */
              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">Username</label>' +
                '<div style="position:relative;">' +
                  '<input id="peUsername" type="text" maxlength="24" placeholder="Username" ' +
                    'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 36px 11px 13px;color:var(--text-primary);font-size:0.88rem;font-family:\'Nunito Sans\',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.2s;">' +
                  '<span id="peUsernameIcon" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.9rem;"></span>' +
                '</div>' +
                '<div id="peUsernameHint" style="font-size:0.68rem;margin-top:4px;min-height:16px;color:var(--text-muted);"></div>' +
              '</div>' +

              /* Bio */
              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:6px;">Bio</label>' +
                '<textarea id="peBio" maxlength="200" placeholder="Tell the community about yourself…" ' +
                  'style="width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text-primary);font-size:0.85rem;font-family:\'Nunito Sans\',sans-serif;outline:none;resize:none;min-height:72px;box-sizing:border-box;transition:border-color 0.2s;"></textarea>' +
                '<div id="peBioCount" style="font-size:0.63rem;color:var(--text-muted);text-align:right;margin-top:3px;">0 / 200</div>' +
              '</div>' +

              /* Preferred Traits */
              '<div style="margin-bottom:16px;">' +
                '<label style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:8px;">' +
                  'Preferred Traits <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.65rem;">— pick up to 3</span>' +
                '</label>' +
                '<div id="peTraits" style="display:flex;flex-wrap:wrap;gap:6px;">'+traitsHtml+'</div>' +
                '<div id="peTraitsHint" style="font-size:0.67rem;color:var(--text-muted);margin-top:6px;min-height:16px;"></div>' +
              '</div>' +

              /* Favorite Chamber */
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
    var overlay=$('profileEditorOverlay'); if (!overlay) return;

    var p=currentProfile||{};
    peSelectedAvatar=p.avatar_card_number||null;
    peSelectedTraits=Array.isArray(p.preferred_traits)?p.preferred_traits.slice():[];
    peAvatarFilter=''; peAvatarPage=0; peUsernameValid=true;

    $('peDisplayName').value=p.display_name||'';
    $('peUsername').value   =p.username||'';
    $('peBio').value        =p.bio||'';
    $('peUsernameIcon').textContent='';
    $('peUsernameHint').textContent='';
    $('peError').textContent='';
    $('peAvatarSearch').value='';
    updateBioCount();
    populateChamberSelect(p.favorite_chamber||'');
    renderPeAvatarPreview();
    renderAvatarGrid();

    // Sync trait buttons
    TRAIT_KEYS.forEach(function(t){
      var btn=overlay.querySelector('.pe-trait-btn[data-trait="'+t+'"]');
      if (btn) applyTraitStyle(btn, peSelectedTraits.indexOf(t)!==-1);
    });
    updateTraitsHint();

    overlay.classList.add('active');
    document.body.style.overflow='hidden';
  }

  function closeProfileEditor() {
    var o=$('profileEditorOverlay'); if(o) o.classList.remove('active');
    document.body.style.overflow='';
  }

  function populateChamberSelect(current) {
    var sel=$('peChamber'); if (!sel) return;
    sel.innerHTML='<option value="">— None selected —</option>';
    (window.allCards||[]).filter(function(c){ return c.type==='chamber'; }).forEach(function(c){
      var opt=document.createElement('option');
      opt.value=c.name;
      opt.textContent='#'+c.number+' — '+c.name;
      if (c.name===current) opt.selected=true;
      sel.appendChild(opt);
    });
  }

  // ── Avatar grid ───────────────────────────────────────────────
  function getAvatarCards() {
    var all=(window.allCards||[]).filter(function(c){
      var n=parseInt(c.number,10); return !isNaN(n)&&n>=1&&c.imageLink;
    });
    if (peAvatarFilter) {
      var q=peAvatarFilter.toLowerCase();
      all=all.filter(function(c){ return c.name.toLowerCase().indexOf(q)!==-1||c.number.indexOf(q)!==-1; });
    }
    return all;
  }

  function renderAvatarGrid() {
    var grid=$('peAvatarGrid'), moreWrap=$('peLoadMore'); if (!grid) return;
    var cards=getAvatarCards(), isPro=currentProfile&&currentProfile.is_pro;
    var end=Math.min(PE_PAGE_SIZE*(peAvatarPage+1), cards.length);
    var visible=cards.slice(0, end);

    grid.innerHTML=visible.map(function(c){
      var num=parseInt(c.number,10);
      var locked=!isPro&&!isNaN(num)&&num>FREE_CARD_MAX;
      var sel=peSelectedAvatar===c.number;
      return '<div class="pe-card-thumb" data-cn="'+esc(c.number)+'" ' +
        'title="'+(locked?'✦ Pro — ':'')+'#'+esc(c.number)+' '+esc(c.name)+'" ' +
        'style="position:relative;cursor:'+(locked?'not-allowed':'pointer')+';border-radius:6px;overflow:hidden;' +
        'aspect-ratio:3/4;border:2px solid '+(sel?'var(--zen)':'var(--border)')+';background:var(--bg-primary);' +
        'transition:border-color 0.15s,transform 0.12s;'+(sel?'box-shadow:0 0 10px rgba(180,77,223,0.45);':'')+'">'+
        '<img src="'+esc(c.imageLink)+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">'+
        (sel?'<div style="position:absolute;bottom:3px;right:3px;width:16px;height:16px;border-radius:50%;background:var(--zen);display:flex;align-items:center;justify-content:center;"><i class="fas fa-check" style="font-size:0.5rem;color:#fff;"></i></div>':'')+
        (locked?'<div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;"><i class="fas fa-lock" style="color:var(--promo);font-size:0.72rem;"></i><span style="color:var(--promo);font-size:0.45rem;font-weight:700;letter-spacing:0.05em;">PRO</span></div>':'')+
        '<div style="position:absolute;bottom:0;left:0;right:0;padding:2px 3px;background:rgba(0,0,0,0.68);font-size:0.45rem;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">#'+esc(c.number)+'</div>'+
      '</div>';
    }).join('');

    if (moreWrap) {
      moreWrap.innerHTML='';
      if (end<cards.length) {
        var btn=document.createElement('button');
        btn.type='button';
        btn.style.cssText='background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px 16px;color:var(--text-secondary);font-size:0.72rem;font-family:\'Nunito Sans\',sans-serif;font-weight:600;cursor:pointer;';
        btn.textContent='Load more ('+(cards.length-end)+' remaining)';
        btn.addEventListener('click', function(){ peAvatarPage++; renderAvatarGrid(); });
        moreWrap.appendChild(btn);
      }
    }
  }

  function renderPeAvatarPreview() {
    var el=$('peAvatarPreview'); if (!el) return;
    if (peSelectedAvatar) {
      var card=findCard(peSelectedAvatar);
      if (card&&card.imageLink) {
        el.innerHTML='<img src="'+esc(card.imageLink)+'" alt="" style="position:absolute;width:185%;height:auto;top:-6%;left:-42%;pointer-events:none;" loading="lazy">';
        return;
      }
    }
    var p=currentProfile||{};
    el.innerHTML='<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--water),var(--zen));display:flex;align-items:center;justify-content:center;font-family:\'Cinzel\',serif;font-weight:700;font-size:1.3rem;color:#fff;">'+esc(initials(p.username||'?'))+'</div>';
  }

  // ── Username availability debounced check ─────────────────────
  var checkUsername=debounce(async function(){
    var inp=$('peUsername'), icon=$('peUsernameIcon'), hint=$('peUsernameHint');
    if (!inp||!sb()) return;
    var val=inp.value.trim();
    if (!val||val===(currentProfile&&currentProfile.username)) {
      icon.textContent=''; hint.textContent=''; peUsernameValid=true; inp.style.borderColor=''; return;
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(val)) {
      icon.innerHTML='<i class="fas fa-times" style="color:var(--danger);"></i>';
      hint.innerHTML='<span style="color:var(--danger);">3–24 characters, letters/numbers/_ only.</span>';
      peUsernameValid=false; inp.style.borderColor='var(--danger)'; return;
    }
    icon.innerHTML='<i class="fas fa-circle-notch fa-spin" style="color:var(--text-muted);"></i>';
    hint.textContent='Checking…'; peUsernameValid=false;
    var res=await sb().from('profiles').select('id').eq('username',val).neq('user_id',currentUser.id).maybeSingle();
    if (res.data) {
      icon.innerHTML='<i class="fas fa-times" style="color:var(--danger);"></i>';
      hint.innerHTML='<span style="color:var(--danger);">Username taken — try another.</span>';
      peUsernameValid=false; inp.style.borderColor='var(--danger)';
    } else {
      icon.innerHTML='<i class="fas fa-check" style="color:var(--success);"></i>';
      hint.innerHTML='<span style="color:var(--success);">Available!</span>';
      peUsernameValid=true; inp.style.borderColor='var(--success)';
    }
  }, 600);

  // ── Trait helpers ─────────────────────────────────────────────
  function applyTraitStyle(btn, active) {
    btn.style.borderColor=active?'var(--zen)':'var(--border)';
    btn.style.background =active?'rgba(180,77,223,0.15)':'var(--bg-primary)';
    btn.style.transform  =active?'scale(1.1)':'scale(1)';
    btn.style.boxShadow  =active?'0 0 0 2px rgba(180,77,223,0.35)':'none';
  }
  function updateTraitsHint() {
    var hint=$('peTraitsHint'); if (!hint) return;
    var n=peSelectedTraits.length;
    hint.textContent=n===0?'No traits selected.':n+'/3 selected'+(n===3?' (maximum)':'');
    hint.style.color=n===3?'var(--air)':'var(--text-muted)';
  }
  function updateBioCount() {
    var bio=$('peBio'), cnt=$('peBioCount');
    if (bio&&cnt) cnt.textContent=bio.value.length+' / 200';
  }

  // ── Save ──────────────────────────────────────────────────────
  async function saveProfileChanges() {
    var errEl=$('peError'); if (errEl) errEl.textContent='';
    if (!peUsernameValid) { if(errEl) errEl.textContent='Fix the username before saving.'; return; }

    var displayName=($('peDisplayName').value||'').trim();
    var username   =($('peUsername').value||'').trim()||(currentProfile&&currentProfile.username)||'';
    var bio        =($('peBio').value||'').trim();
    var chamber    =($('peChamber').value||'');

    if (!username.match(/^[a-zA-Z0-9_]{3,24}$/)) { if(errEl) errEl.textContent='Invalid username.'; return; }

    var saveBtn=$('peSave');
    if (saveBtn) { saveBtn.disabled=true; saveBtn.textContent='Saving…'; }

    var updates={
      display_name:      displayName||null,
      username:          username,
      bio:               bio||null,
      preferred_traits:  peSelectedTraits,
      favorite_chamber:  chamber||null,
      avatar_card_number:peSelectedAvatar||null   // ← avatar card saved to Supabase
    };

    var res=await sb().from('profiles').update(updates).eq('user_id',currentUser.id);
    if (saveBtn) { saveBtn.disabled=false; saveBtn.textContent='Save Changes'; }
    if (res.error) { if(errEl) errEl.textContent=res.error.message; return; }

    // Merge updates into local currentProfile state
    currentProfile=Object.assign({},currentProfile,updates);
    closeProfileEditor();
    // Refresh the profile display card and the header indicator
    refreshProfileDisplay(currentProfile);
    updateHeaderProfile();
    toast('Profile updated! ✨');
  }

  // ── Wire profile editor events ────────────────────────────────
  function initProfileEditorEvents() {
    var overlay=$('profileEditorOverlay'); if (!overlay) return;

    [$('peClose'),$('peCancel')].forEach(function(b){ if(b) b.addEventListener('click', closeProfileEditor); });
    overlay.addEventListener('click', function(e){ if(e.target===this) closeProfileEditor(); });

    var saveBtn=$('peSave'); if(saveBtn) saveBtn.addEventListener('click', saveProfileChanges);

    // Avatar grid clicks
    var grid=$('peAvatarGrid');
    if (grid) grid.addEventListener('click', function(e){
      var thumb=e.target.closest('.pe-card-thumb'); if (!thumb) return;
      var num=thumb.getAttribute('data-cn'), parsed=parseInt(num,10);
      var isPro=currentProfile&&currentProfile.is_pro;
      if (!isPro&&!isNaN(parsed)&&parsed>FREE_CARD_MAX) {
        toast('✦ Unlock all card artwork with a Pro account!'); return;
      }
      peSelectedAvatar=peSelectedAvatar===num?null:num;
      renderAvatarGrid(); renderPeAvatarPreview();
    });

    // Hover effects for card thumbs
    grid&&grid.addEventListener('mouseover', function(e){
      var t=e.target.closest('.pe-card-thumb');
      if (t&&t.getAttribute('data-cn')!==peSelectedAvatar) t.style.transform='scale(1.06)';
    });
    grid&&grid.addEventListener('mouseout', function(e){
      var t=e.target.closest('.pe-card-thumb');
      if (t&&t.getAttribute('data-cn')!==peSelectedAvatar) t.style.transform='';
    });

    var clearBtn=$('peClearAvatar');
    if (clearBtn) clearBtn.addEventListener('click', function(){
      peSelectedAvatar=null; renderAvatarGrid(); renderPeAvatarPreview();
    });

    var searchInp=$('peAvatarSearch');
    if (searchInp) searchInp.addEventListener('input', debounce(function(){
      peAvatarFilter=searchInp.value.trim(); peAvatarPage=0; renderAvatarGrid();
    },250));

    var unameInp=$('peUsername');
    if (unameInp) unameInp.addEventListener('input', checkUsername);

    var bioInp=$('peBio');
    if (bioInp) bioInp.addEventListener('input', updateBioCount);

    // Input focus highlight
    ['peDisplayName','peUsername','peBio'].forEach(function(id){
      var el=$(id); if (!el) return;
      el.addEventListener('focus', function(){ if (!this.style.borderColor||this.style.borderColor.indexOf('rgb(37')===-1) this.style.borderColor='var(--accent)'; });
      el.addEventListener('blur',  function(){ if (this.style.borderColor==='var(--accent)') this.style.borderColor=''; });
    });

    // Trait buttons
    var traitsWrap=$('peTraits');
    if (traitsWrap) traitsWrap.addEventListener('click', function(e){
      var btn=e.target.closest('.pe-trait-btn'); if (!btn) return;
      var trait=btn.getAttribute('data-trait'), idx=peSelectedTraits.indexOf(trait);
      if (idx!==-1) {
        peSelectedTraits.splice(idx,1); applyTraitStyle(btn,false);
      } else {
        if (peSelectedTraits.length>=3) {
          toast('Max 3 preferred traits.');
          btn.animate([{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:180});
          return;
        }
        peSelectedTraits.push(trait); applyTraitStyle(btn,true);
      }
      updateTraitsHint();
    });

    // Pro upgrade
    var proBtn=$('peProceedUpgrade');
    if (proBtn) proBtn.addEventListener('click', function(){
      toast('✦ Pro accounts — coming soon! Follow us for updates.');
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  FRIENDS
  // ══════════════════════════════════════════════════════════════
  async function loadFriends() {
    if (!currentUser||!sb()) return;

    var pendRes=await sb().from('friendships')
      .select('id, user_id, profiles!friendships_user_id_fkey(username,avatar_card_number)')
      .eq('friend_id',currentUser.id).eq('status','pending');
    var pendSec=$('friendPendingSection'), pendList=$('friendPendingList'), pending=pendRes.data||[];
    if (pending.length) {
      pendSec.style.display='';
      pendList.innerHTML=pending.map(function(f){
        var p2=f.profiles||{};
        return '<div class="friend-card">'+avatarHtml(p2,38)+
          '<div class="friend-info"><div class="friend-name">'+esc(p2.username||'Unknown')+'</div>'+
          '<div class="friend-sub"><span class="pending-badge"><i class="fas fa-clock"></i> Pending</span></div></div>'+
          '<div class="friend-actions">'+
          '<button class="friend-btn accept" data-accept="'+f.id+'">Accept</button>'+
          '<button class="friend-btn danger" data-decline="'+f.id+'">Decline</button>'+
          '</div></div>';
      }).join('');
    } else pendSec.style.display='none';

    var frRes=await sb().from('friendships')
      .select('id, user_id, friend_id, fp:profiles!friendships_friend_id_fkey(username,avatar_card_number,is_pro), sp:profiles!friendships_user_id_fkey(username,avatar_card_number,is_pro)')
      .or('user_id.eq.'+currentUser.id+',friend_id.eq.'+currentUser.id).eq('status','accepted');
    var friendList=$('friendList'), friends=frRes.data||[];
    if (!friends.length) {
      friendList.innerHTML='<div class="empty-state" style="padding:30px 0;"><p>No friends yet — search above!</p></div>'; return;
    }
    friendList.innerHTML=friends.map(function(f){
      var isInit=f.user_id===currentUser.id, other=isInit?f.fp:f.sp; if (!other) other={};
      return '<div class="friend-card">'+avatarHtml(other,38)+
        '<div class="friend-info"><div class="friend-name">'+esc(other.username||'?')+(other.is_pro?proBadge():'')+'</div></div>'+
        '<div class="friend-actions">'+
        '<button class="friend-btn chat-btn"  data-dm="'+esc(other.username||'')+'">Chat</button>'+
        '<button class="friend-btn trade-btn" data-trade-with="'+esc(other.username||'')+'">Trade</button>'+
        '<button class="friend-btn danger"    data-remove="'+f.id+'">Remove</button>'+
        '</div></div>';
    }).join('');
  }

  async function doFriendSearch() {
    var q=($('friendSearchInput').value||'').trim(), wrap=$('friendSearchResults');
    if (!q) { wrap.innerHTML=''; return; }
    var res=await sb().from('profiles').select('username,user_id,avatar_card_number,is_pro').ilike('username',q+'%').neq('user_id',currentUser.id).limit(6);
    if (!res.data||!res.data.length) { wrap.innerHTML='<div style="font-size:0.78rem;color:var(--text-muted);padding:8px 4px;">No users found.</div>'; return; }
    wrap.innerHTML=res.data.map(function(p2){
      return '<div class="friend-card">'+avatarHtml(p2,38)+
        '<div class="friend-info"><div class="friend-name">'+esc(p2.username)+(p2.is_pro?proBadge():'')+'</div></div>'+
        '<div class="friend-actions"><button class="friend-btn" data-add="'+esc(p2.user_id)+'">Add Friend</button></div>'+
        '</div>';
    }).join('');
  }

  async function sendFriendReq(uid) {
    var res=await sb().from('friendships').insert({ user_id:currentUser.id, friend_id:uid, status:'pending' });
    if (res.error) { toast('Error: '+res.error.message); return; }
    $('friendSearchResults').innerHTML=''; $('friendSearchInput').value='';
    toast('Friend request sent! 🤝');
  }
  async function respondRequest(id, status) {
    await sb().from('friendships').update({ status:status }).eq('id',id);
    loadFriends(); toast(status==='accepted'?'Friend added! 🎉':'Request declined.');
  }
  async function removeFriend(id) {
    await sb().from('friendships').delete().eq('id',id); loadFriends(); toast('Friend removed.');
  }

  function initFriendEvents() {
    var btn=$('friendSearchBtn'), inp=$('friendSearchInput');
    if (btn) btn.addEventListener('click', doFriendSearch);
    if (inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter') doFriendSearch(); });
    document.addEventListener('click', function(e){
      if (!currentUser) return;
      var el;
      el=e.target.closest('[data-accept]');    if(el){ respondRequest(el.getAttribute('data-accept'),'accepted');       return; }
      el=e.target.closest('[data-decline]');   if(el){ respondRequest(el.getAttribute('data-decline'),'declined');      return; }
      el=e.target.closest('[data-add]');       if(el){ sendFriendReq(el.getAttribute('data-add'));                      return; }
      el=e.target.closest('[data-remove]');    if(el){ removeFriend(el.getAttribute('data-remove'));                    return; }
      el=e.target.closest('[data-dm]');        if(el){ openDM(el.getAttribute('data-dm'));                              return; }
      el=e.target.closest('[data-trade-with]');if(el){ openTradeBuilderFor(el.getAttribute('data-trade-with'));         return; }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  CHAT
  // ══════════════════════════════════════════════════════════════
  function loadChat() { fetchMessages(currentRoom); subscribeRoom(currentRoom); }

  async function fetchMessages(room) {
    if (!sb()) return;
    var res=await sb().from('messages').select('*').eq('room',room).order('created_at',{ascending:true}).limit(100);
    renderMessages(res.data||[]);
  }

  function renderMessages(msgs) {
    var el=$('chatMessages'); if (!el) return;
    if (!msgs.length) { el.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.8rem;">No messages yet — say hi! 👋</div>'; return; }
    el.innerHTML=msgs.map(function(m){
      var mine=currentProfile&&m.username===currentProfile.username;
      var mp={ username:m.username, avatar_card_number:m.avatar_card_number||null };
      return '<div class="chat-msg'+(mine?' mine':'')+'">' +
        avatarHtml(mp,28) +
        '<div class="chat-msg-content">' +
          '<div class="chat-msg-name">'+esc(m.username||'Unknown')+'</div>' +
          '<div class="chat-bubble">'+esc(m.content)+'</div>' +
          '<div class="chat-ts">'+fmtTime(m.created_at)+'</div>' +
        '</div></div>';
    }).join('');
    el.scrollTop=el.scrollHeight;
  }

  function subscribeRoom(room) {
    if (chatSub) { try { chatSub.unsubscribe(); } catch(e){} }
    if (!sb()) return;
    chatSub=sb().channel('chat:'+room)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'room=eq.'+room}, function(payload){ appendMessage(payload.new); })
      .subscribe();
  }

  function appendMessage(m) {
    var el=$('chatMessages'); if (!el) return;
    var ph=el.querySelector('[style*="say hi"]'); if(ph) ph.remove();
    var mine=currentProfile&&m.username===currentProfile.username;
    var mp={ username:m.username, avatar_card_number:m.avatar_card_number||null };
    var div=document.createElement('div');
    div.className='chat-msg'+(mine?' mine':'');
    div.innerHTML=avatarHtml(mp,28)+'<div class="chat-msg-content"><div class="chat-msg-name">'+esc(m.username||'Unknown')+'</div><div class="chat-bubble">'+esc(m.content)+'</div><div class="chat-ts">just now</div></div>';
    el.appendChild(div); el.scrollTop=el.scrollHeight;
  }

  function switchRoom(label, roomId) {
    currentRoom=roomId;
    document.querySelectorAll('.chat-room-btn').forEach(function(b){ b.classList.remove('active'); });
    var btn=document.querySelector('[data-room="'+roomId+'"]'); if(btn) btn.classList.add('active');
    var hdr=$('chatHeaderLabel');
    if (hdr) hdr.innerHTML='<i class="fas fa-hashtag" style="color:var(--zen);font-size:0.78rem;"></i> '+esc(label);
    fetchMessages(roomId); subscribeRoom(roomId);
  }

  function addRoomBtn(label, roomId) {
    var s=$('chatSidebar'); if (!s||s.querySelector('[data-room="'+roomId+'"]')) return;
    var btn=document.createElement('button');
    btn.className='chat-room-btn'; btn.setAttribute('data-room',roomId);
    btn.innerHTML='<span class="chat-room-dot"></span>'+esc(label);
    btn.addEventListener('click', function(){ switchRoom(label,roomId); });
    s.appendChild(btn);
  }

  function openDM(username) {
    var tab=document.querySelector('[data-nested-tab="chat"]'); if(tab) tab.click();
    var roomId=[currentProfile.username,username].sort().join('__dm__');
    addRoomBtn(username+' (DM)',roomId);
    setTimeout(function(){ switchRoom(username+' (DM)',roomId); },50);
  }

  async function sendMessage() {
    if (!currentProfile||!sb()) return;
    var inp=$('chatInput'), content=(inp.value||'').trim(); if (!content) return;
    inp.value='';
    await sb().from('messages').insert({
      room:currentRoom, user_id:currentUser.id,
      username:currentProfile.username,
      avatar_card_number:currentProfile.avatar_card_number||null,
      content:content
    });
  }

  function initChatEvents() {
    var s=$('chatSendBtn'), i=$('chatInput');
    if (s) s.addEventListener('click', sendMessage);
    if (i) i.addEventListener('keydown', function(e){ if(e.key==='Enter') sendMessage(); });
    document.querySelectorAll('.chat-room-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var room=this.getAttribute('data-room');
        switchRoom(room==='global'?'Global Chat':room, room);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  TRADES
  // ══════════════════════════════════════════════════════════════
  async function loadTrades() {
    if (!currentUser||!sb()) return;
    await Promise.all([loadTradePane('incoming'),loadTradePane('outgoing'),loadTradePane('history')]);
    populateTradeBuilder();
  }

  async function loadTradePane(pane) {
    var el=$(pane==='incoming'?'tradeIncoming':pane==='outgoing'?'tradeOutgoing':'tradeHistory'); if (!el) return;
    var q=sb().from('trades').select('*').order('created_at',{ascending:false});
    if (pane==='incoming')     q=q.eq('receiver_id',currentUser.id).eq('status','pending');
    else if (pane==='outgoing')q=q.eq('sender_id',currentUser.id).eq('status','pending');
    else q=q.or('sender_id.eq.'+currentUser.id+',receiver_id.eq.'+currentUser.id).neq('status','pending').limit(20);
    var res=await q, rows=res.data||[];
    if (!rows.length) { el.innerHTML='<div class="empty-state" style="padding:30px 0;"><p>Nothing here yet.</p></div>'; return; }
    el.innerHTML=rows.map(renderTradeCard).join('');
  }

  function renderTradeCard(t) {
    var incoming=t.receiver_id===currentUser.id, partner=incoming?t.sender_username:t.receiver_username;
    var offer=t.offer_cards||[], request=t.request_cards||[];
    var actions='';
    if (t.status==='pending'&&incoming) actions='<button class="trade-action-btn accept" data-trade-accept="'+t.id+'">Accept</button><button class="trade-action-btn reject" data-trade-reject="'+t.id+'">Decline</button>';
    else if (t.status==='pending')      actions='<button class="trade-action-btn" data-trade-cancel="'+t.id+'">Cancel</button>';
    return '<div class="trade-card"><div class="trade-card-header"><div><div class="trade-partner">'+(incoming?'From: ':'To: ')+esc(partner||'–')+'</div><div class="trade-date">'+fmtTime(t.created_at)+'</div></div><span class="trade-status-badge '+esc(t.status)+'">'+esc(t.status)+'</span></div>'+(t.note?'<div class="trade-note">"'+esc(t.note)+'"</div>':'')+'<div class="trade-columns"><div><div class="trade-col-label">Offering</div><div class="trade-chips">'+offer.map(function(c){ return '<span class="trade-chip">'+esc(c)+'</span>'; }).join('')+'</div></div><div><div class="trade-col-label">Requesting</div><div class="trade-chips">'+request.map(function(c){ return '<span class="trade-chip">'+esc(c)+'</span>'; }).join('')+'</div></div></div>'+(actions?'<div class="trade-actions">'+actions+'</div>':'')+'</div>';
  }

  async function respondTrade(id, status) {
    await sb().from('trades').update({ status:status }).eq('id',id);
    loadTrades(); toast({accepted:'Trade accepted! ✅',rejected:'Trade declined.',cancelled:'Trade cancelled.'}[status]||'Done.');
  }

  async function populateTradeBuilder() {
    if (!currentUser||!sb()) return;
    var sel=$('tbReceiver'); if (!sel) return;
    sel.innerHTML='<option value="">— Select a friend —</option>';
    var fr=await sb().from('friendships')
      .select('user_id,friend_id,fp:profiles!friendships_friend_id_fkey(username,user_id),sp:profiles!friendships_user_id_fkey(username,user_id)')
      .or('user_id.eq.'+currentUser.id+',friend_id.eq.'+currentUser.id).eq('status','accepted');
    (fr.data||[]).forEach(function(f){
      var isInit=f.user_id===currentUser.id, other=isInit?f.fp:f.sp; if (!other) return;
      var opt=document.createElement('option'); opt.value=other.user_id+'|'+other.username; opt.textContent=other.username; sel.appendChild(opt);
    });
    var ac=window.allCards||[], col=window.collection||{};
    buildCardGrid($('tbOfferGrid'),ac.filter(function(c){ return (col[c.number]||0)>0; }),'offer');
    buildCardGrid($('tbRequestGrid'),ac,'request');
  }

  function buildCardGrid(el, cards, mode) {
    if (!el) return;
    el.innerHTML=cards.slice(0,120).map(function(c){
      var short=c.name.length>18?c.name.slice(0,16)+'…':c.name;
      return '<div class="tb-chip" data-tb-num="'+esc(c.number)+'" data-tb-name="'+esc(c.name)+'" data-tb-mode="'+mode+'" title="#'+esc(c.number)+' '+esc(c.name)+'"><div style="font-size:0.55rem;color:var(--text-muted);">#'+esc(c.number)+'</div>'+esc(short)+'</div>';
    }).join('');
  }

  function updateTbChips() {
    var ofs=$('tbOfferSelected'), reqs=$('tbRequestSelected');
    if (ofs)  ofs.innerHTML =tbOffer.map(function(n){ return '<span class="tb-sel-chip">'+esc(n)+' <span class="rm" data-rm="'+esc(n)+'" data-rm-mode="offer">&times;</span></span>'; }).join('');
    if (reqs) reqs.innerHTML=tbRequest.map(function(n){ return '<span class="tb-sel-chip">'+esc(n)+' <span class="rm" data-rm="'+esc(n)+'" data-rm-mode="request">&times;</span></span>'; }).join('');
  }

  function openTradeBuilder() {
    tbOffer=[]; tbRequest=[]; updateTbChips(); populateTradeBuilder();
    if ($('tradeBuilderError')) $('tradeBuilderError').textContent='';
    if ($('tbNote')) $('tbNote').value='';
    $('tradeBuilderOverlay').classList.add('active');
  }
  function openTradeBuilderFor(username) {
    openTradeBuilder();
    setTimeout(function(){
      var sel=$('tbReceiver'); if (!sel) return;
      for (var i=0;i<sel.options.length;i++) { if (sel.options[i].text===username) { sel.selectedIndex=i; break; } }
    },250);
  }
  function closeTradeBuilder() { $('tradeBuilderOverlay').classList.remove('active'); }

  async function submitTrade() {
    var errEl=$('tradeBuilderError'), recv=($('tbReceiver').value||'').split('|');
    if (!recv[0])      { errEl.textContent='Select a friend.'; return; }
    if (!tbOffer.length)   { errEl.textContent='Choose at least one card to offer.'; return; }
    if (!tbRequest.length) { errEl.textContent='Choose at least one card to request.'; return; }
    var note=($('tbNote').value||'').trim();
    var res=await sb().from('trades').insert({ sender_id:currentUser.id, sender_username:currentProfile.username, receiver_id:recv[0], receiver_username:recv[1], offer_cards:tbOffer, request_cards:tbRequest, note:note||null, status:'pending' });
    if (res.error) { errEl.textContent=res.error.message; return; }
    closeTradeBuilder(); toast('Trade offer sent! 🤝'); loadTrades();
  }

  function initTradeEvents() {
    var newBtn=$('tradeNewBtn'); if(newBtn) newBtn.addEventListener('click', openTradeBuilder);
    [$('tradeBuilderClose'),$('tradeBuilderCancel')].forEach(function(b){ if(b) b.addEventListener('click', closeTradeBuilder); });
    var overlay=$('tradeBuilderOverlay');
    if (overlay) {
      overlay.addEventListener('click', function(e){ if(e.target===this) closeTradeBuilder(); });
      overlay.addEventListener('click', function(e){
        var chip=e.target.closest('.tb-chip[data-tb-num]');
        if (chip) {
          var mode=chip.getAttribute('data-tb-mode'), name=chip.getAttribute('data-tb-name'), arr=mode==='offer'?tbOffer:tbRequest, idx=arr.indexOf(name);
          if (idx===-1){ arr.push(name); chip.classList.add('selected'); } else { arr.splice(idx,1); chip.classList.remove('selected'); }
          updateTbChips(); return;
        }
        var rm=e.target.closest('[data-rm]');
        if (rm) {
          var n=rm.getAttribute('data-rm'), rmode=rm.getAttribute('data-rm-mode');
          if (rmode==='offer') tbOffer=tbOffer.filter(function(x){ return x!==n; });
          else                 tbRequest=tbRequest.filter(function(x){ return x!==n; });
          updateTbChips();
        }
      });
    }
    var sb2=$('tradeBuilderSubmit'); if(sb2) sb2.addEventListener('click', submitTrade);
    ['tradeIncoming','tradeOutgoing','tradeHistory'].forEach(function(id){
      var el=$(id); if (!el) return;
      el.addEventListener('click', function(e){
        var a=e.target.closest('[data-trade-accept]'); if(a){ respondTrade(a.getAttribute('data-trade-accept'),'accepted'); return; }
        var r=e.target.closest('[data-trade-reject]'); if(r){ respondTrade(r.getAttribute('data-trade-reject'),'rejected'); return; }
        var c=e.target.closest('[data-trade-cancel]'); if(c){ respondTrade(c.getAttribute('data-trade-cancel'),'cancelled'); return; }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  FORUM
  // ══════════════════════════════════════════════════════════════
  async function loadForum() {
    if (!sb()) return;
    var q=sb().from('forum_posts').select('*').order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(40);
    if (currentCat!=='all') q=q.eq('category',currentCat);
    var res=await q, rows=res.data||[], el=$('forumPostList');
    if (!rows.length) { el.innerHTML='<div class="empty-state" style="padding:30px 0;"><p>No posts yet — start the conversation!</p></div>'; return; }
    el.innerHTML=rows.map(function(p){
      return '<div class="forum-post-card'+(p.pinned?' pinned':'')+'" data-post-id="'+p.id+'">' +
        '<div class="forum-post-title">'+esc(p.title)+'</div>' +
        '<div class="forum-post-preview">'+esc((p.body||'').slice(0,130))+'</div>' +
        '<div class="forum-post-meta"><span class="forum-post-author">by '+esc(p.username)+' · '+fmtTime(p.created_at)+'</span><span class="forum-post-cat">'+esc(p.category)+'</span><span class="forum-reply-count"><i class="fas fa-comment-alt"></i> '+(p.reply_count||0)+'</span></div>' +
      '</div>';
    }).join('');
  }

  async function openForumPost(postId) {
    currentPostId=postId; $('forumDetailOverlay').classList.add('active');
    var pRes=await sb().from('forum_posts').select('*').eq('id',postId).single();
    var post=pRes.data;
    if (post) {
      $('forumDetailTitle').textContent=post.title;
      var pp={ username:post.username, avatar_card_number:post.avatar_card_number||null };
      $('forumDetailBody').innerHTML=
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'+avatarHtml(pp,26)+'<div><span class="forum-reply-author">'+esc(post.username)+'</span><div class="forum-reply-ts">'+fmtTime(post.created_at)+'</div></div></div>' +
          '<div style="font-size:0.88rem;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;word-break:break-word;">'+esc(post.body)+'</div>' +
        '</div><div id="forumRepliesContainer"><div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">Loading replies…</div></div>';
    }
    loadForumReplies(postId);
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} }
    forumReplySub=sb().channel('forum:'+postId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'forum_replies',filter:'post_id=eq.'+postId}, function(payload){ appendReply(payload.new); })
      .subscribe();
  }

  async function loadForumReplies(postId) {
    var res=await sb().from('forum_replies').select('*').eq('post_id',postId).order('created_at',{ascending:true});
    var container=$('forumRepliesContainer'); if (!container) return;
    var rows=res.data||[];
    if (!rows.length) { container.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">No replies yet — be first!</div>'; return; }
    container.innerHTML=rows.map(renderReply).join('');
    var body=$('forumDetailBody'); if(body) body.scrollTop=body.scrollHeight;
  }

  function renderReply(r) {
    var rp={ username:r.username, avatar_card_number:r.avatar_card_number||null };
    return '<div class="forum-reply-card">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+avatarHtml(rp,24)+'<div><span class="forum-reply-author">'+esc(r.username)+'</span><div class="forum-reply-ts">'+fmtTime(r.created_at)+'</div></div></div>'+
      '<div class="forum-reply-body">'+esc(r.body)+'</div></div>';
  }

  function appendReply(r) {
    var c=$('forumRepliesContainer'); if (!c) return;
    var ph=c.querySelector('[style*="No replies"]'); if(ph) ph.remove();
    var div=document.createElement('div'); div.innerHTML=renderReply(r); c.appendChild(div.firstChild);
    var body=$('forumDetailBody'); if(body) body.scrollTop=body.scrollHeight;
  }

  function closeForumDetail() {
    $('forumDetailOverlay').classList.remove('active'); currentPostId=null;
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} forumReplySub=null; }
  }

  async function submitForumPost() {
    var title=($('forumNewTitle').value||'').trim(), body=($('forumNewBody').value||'').trim();
    var cat=$('forumNewCat').value, errEl=$('forumNewError');
    if (!title) { errEl.textContent='Please enter a title.'; return; }
    if (!body)  { errEl.textContent='Please enter some content.'; return; }
    var res=await sb().from('forum_posts').insert({ user_id:currentUser.id, username:currentProfile.username, avatar_card_number:currentProfile.avatar_card_number||null, category:cat, title:title, body:body, pinned:false, reply_count:0 });
    if (res.error) { errEl.textContent=res.error.message; return; }
    $('forumNewOverlay').classList.remove('active');
    $('forumNewTitle').value=''; $('forumNewBody').value=''; errEl.textContent='';
    loadForum(); toast('Post published! ✍️');
  }

  async function sendForumReply() {
    if (!currentPostId||!currentProfile||!sb()) return;
    var inp=$('forumReplyInput'), body=(inp.value||'').trim(); if (!body) return;
    inp.value=''; inp.style.height='40px';
    var res=await sb().from('forum_replies').insert({ post_id:currentPostId, user_id:currentUser.id, username:currentProfile.username, avatar_card_number:currentProfile.avatar_card_number||null, body:body });
    if (!res.error) sb().rpc('increment_reply_count',{ p_post_id:currentPostId }).catch(function(){});
  }

  function initForumEvents() {
    var catRow=$('forumCatRow');
    if (catRow) catRow.addEventListener('click', function(e){
      var pill=e.target.closest('.forum-cat-pill'); if (!pill) return;
      catRow.querySelectorAll('.forum-cat-pill').forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active'); currentCat=pill.getAttribute('data-cat'); loadForum();
    });
    var nb=$('forumNewBtn');
    if (nb) nb.addEventListener('click', function(){ if (!currentProfile){ toast('Sign in to post.'); return; } $('forumNewOverlay').classList.add('active'); });
    [$('forumNewClose'),$('forumNewCancel')].forEach(function(b){ if(b) b.addEventListener('click', function(){ $('forumNewOverlay').classList.remove('active'); }); });
    var fno=$('forumNewOverlay'); if(fno) fno.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('active'); });
    var sub=$('forumNewSubmit'); if(sub) sub.addEventListener('click', submitForumPost);
    var pl=$('forumPostList'); if(pl) pl.addEventListener('click', function(e){ var c=e.target.closest('[data-post-id]'); if(c) openForumPost(c.getAttribute('data-post-id')); });
    var dc=$('forumDetailClose'); if(dc) dc.addEventListener('click', closeForumDetail);
    var fdo=$('forumDetailOverlay'); if(fdo) fdo.addEventListener('click', function(e){ if(e.target===this) closeForumDetail(); });
    var rb=$('forumReplySendBtn'); if(rb) rb.addEventListener('click', sendForumReply);
    var ri=$('forumReplyInput'); if(ri) ri.addEventListener('keydown', function(e){ if(e.ctrlKey&&e.key==='Enter') sendForumReply(); });
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC HOOKS (called by auth.js)
  // ══════════════════════════════════════════════════════════════
  window.socialOnLogin = function(user) {
    currentUser=user; if (!sb()) return; setupProfileSection(user);
  };
  window.socialOnLogout = function() {
    currentUser=null; currentProfile=null;
    if (chatSub)       { try { chatSub.unsubscribe();       } catch(e){} chatSub=null; }
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch(e){} forumReplySub=null; }
    hideHeaderProfile();
    // Reset profile display card to loading state
    var card=$('profileDisplayCard');
    if (card) card.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.8rem;">Sign in to view your profile.</div>';
    if ($('socialSetup'))   $('socialSetup').style.display  ='none';
    if ($('socialSection')) $('socialSection').style.display='none';
    closeProfileEditor();
  };

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    initFriendEvents(); initChatEvents(); initTradeEvents(); initForumEvents();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
