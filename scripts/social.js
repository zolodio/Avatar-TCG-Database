// ================================================================
//  AVATAR TCG — Social Features (social.js)
//  Drop-in after auth.js. Requires window.sb (Supabase client).
//
//  Supabase tables needed:
//    profiles      (id, user_id uuid unique, username text unique, created_at)
//    friendships   (id, user_id uuid, friend_id uuid, status text, created_at)
//    messages      (id, room text, user_id uuid, username text, content text, created_at)
//    trades        (id, sender_id uuid, sender_username text,
//                   receiver_id uuid, receiver_username text,
//                   offer_cards text[], request_cards text[],
//                   note text, status text, created_at)
//    forum_posts   (id, user_id uuid, username text, category text,
//                   title text, body text, pinned bool default false,
//                   reply_count int default 0, created_at)
//    forum_replies (id, post_id uuid, user_id uuid, username text,
//                   body text, created_at)
//
//  RLS policies: users can read all rows, write only their own.
//  Optional: create a Postgres function increment_reply_count(post_id uuid)
//    that does UPDATE forum_posts SET reply_count = reply_count + 1 WHERE id = post_id
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
 
  // ── Tiny helpers ──────────────────────────────────────────────
  function sb()  { return window.sb; }
  function $(id) { return document.getElementById(id); }
 
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
 
  function initials(name) { return String(name || '?').charAt(0).toUpperCase(); }
 
  function fmtTime(iso) {
    if (!iso) return '';
    var d    = new Date(iso);
    var diff = Date.now() - d;
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString();
  }
 
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
 
  // ── Social tab switcher (for elements inside #socialSection) ──
  function initSocialTabs() {
    var sec = $('socialSection');
    if (!sec) return;
 
    // Main social tabs (friends / chat / trades / forum)
    sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function (btn) {
      // Skip trade sub-tabs — handled separately
      if (btn.getAttribute('data-trade-tab')) return;
 
      btn.addEventListener('click', function () {
        var name = this.getAttribute('data-nested-tab') || this.getAttribute('data-social-tab');
        sec.querySelectorAll('[data-nested-tab],[data-social-tab]').forEach(function (b) {
          if (!b.getAttribute('data-trade-tab')) b.classList.remove('active');
        });
        this.classList.add('active');
        sec.querySelectorAll('.social-pane').forEach(function (p) { p.style.display = 'none'; });
        var pane = $('social-' + name);
        if (pane) pane.style.display = '';
 
        if (name === 'chat')   { loadChat(); }
        if (name === 'trades') { loadTrades(); }
        if (name === 'forum')  { loadForum(); }
        if (name === 'friends'){ loadFriends(); }
      });
    });
 
    // Trade sub-tabs
    sec.querySelectorAll('[data-trade-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = this.getAttribute('data-trade-tab');
        sec.querySelectorAll('[data-trade-tab]').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        $('tradeIncoming').style.display = name === 'incoming' ? '' : 'none';
        $('tradeOutgoing').style.display = name === 'outgoing' ? '' : 'none';
        $('tradeHistory').style.display  = name === 'history'  ? '' : 'none';
      });
    });
  }
 
  // ══════════════════════════════════════════════════════════════
  //  PROFILE / USERNAME SETUP
  // ══════════════════════════════════════════════════════════════
  async function setupProfileSection(user) {
    if (!sb()) return;
    var res = await sb().from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    var profile = res.error ? null : res.data;
 
    if (!profile) {
      $('socialSetup').style.display  = 'block';
      $('socialSection').style.display = 'none';
      wireUsernameForm(user);
    } else {
      currentProfile = profile;
      $('socialSetup').style.display  = 'none';
      activateSocialSection(profile);
    }
  }
 
  function wireUsernameForm(user) {
    var btn = $('setupSubmitBtn');
    var inp = $('setupUsername');
    var err = $('setupErr');
    if (!btn) return;
 
    btn.onclick = async function () {
      err.textContent = '';
      var name = inp.value.trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) {
        err.textContent = 'Username: 3–24 chars, letters / numbers / _ only.';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
 
      var taken = await sb().from('profiles').select('id').eq('username', name).maybeSingle();
      if (taken.data) {
        err.textContent = 'That username is taken — try another.';
        btn.disabled = false; btn.textContent = 'Save Username';
        return;
      }
 
      var res = await sb().from('profiles').insert({ user_id: user.id, username: name, email: user.email });
      btn.disabled = false; btn.textContent = 'Save Username';
      if (res.error) { err.textContent = res.error.message; return; }
 
      currentProfile = { user_id: user.id, username: name };
      $('socialSetup').style.display  = 'none';
      activateSocialSection(currentProfile);
    };
  }
 
  function activateSocialSection(profile) {
    $('socialSection').style.display = 'block';
    $('socialAvatarInitial').textContent = initials(profile.username);
    $('socialUsername').textContent = profile.username;
    $('socialUserSub').textContent  = 'Community member';
    initSocialTabs();
    loadFriends();
  }
 
  // ══════════════════════════════════════════════════════════════
  //  FRIENDS
  // ══════════════════════════════════════════════════════════════
  async function loadFriends() {
    if (!currentUser || !sb()) return;
 
    // ── Pending incoming ──────────────────────────────────────
    var pendRes = await sb()
      .from('friendships')
      .select('id, user_id, profiles!friendships_user_id_fkey(username)')
      .eq('friend_id', currentUser.id)
      .eq('status', 'pending');
 
    var pendSec  = $('friendPendingSection');
    var pendList = $('friendPendingList');
    var pending  = (pendRes.data || []);
 
    if (pending.length) {
      pendSec.style.display = '';
      pendList.innerHTML = pending.map(function (f) {
        var uname = f.profiles ? f.profiles.username : 'Unknown';
        return '<div class="friend-card">' +
          '<div class="friend-avatar">' + esc(initials(uname)) + '</div>' +
          '<div class="friend-info">' +
            '<div class="friend-name">' + esc(uname) + '</div>' +
            '<div class="friend-sub"><span class="pending-badge"><i class="fas fa-clock"></i> Pending</span></div>' +
          '</div>' +
          '<div class="friend-actions">' +
            '<button class="friend-btn accept" data-accept="' + f.id + '">Accept</button>' +
            '<button class="friend-btn danger" data-decline="' + f.id + '">Decline</button>' +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      pendSec.style.display = 'none';
    }
 
    // ── Accepted friends ──────────────────────────────────────
    var frRes = await sb()
      .from('friendships')
      .select('id, user_id, friend_id, ' +
              'fp:profiles!friendships_friend_id_fkey(username,user_id), ' +
              'sp:profiles!friendships_user_id_fkey(username,user_id)')
      .or('user_id.eq.' + currentUser.id + ',friend_id.eq.' + currentUser.id)
      .eq('status', 'accepted');
 
    var friendList = $('friendList');
    var friends    = (frRes.data || []);
 
    if (!friends.length) {
      friendList.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>No friends yet — search above!</p></div>';
      return;
    }
 
    friendList.innerHTML = friends.map(function (f) {
      var isInit = f.user_id === currentUser.id;
      var other  = isInit ? f.fp : f.sp;
      var uname  = other ? other.username : 'Unknown';
      return '<div class="friend-card">' +
        '<div class="friend-avatar">' + esc(initials(uname)) + '</div>' +
        '<div class="friend-info"><div class="friend-name">' + esc(uname) + '</div></div>' +
        '<div class="friend-actions">' +
          '<button class="friend-btn chat-btn"  data-dm="'   + esc(uname) + '">Chat</button>' +
          '<button class="friend-btn trade-btn" data-trade-with="' + esc(uname) + '">Trade</button>' +
          '<button class="friend-btn danger"    data-remove="' + f.id + '">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
 
  async function doFriendSearch() {
    var q    = ($('friendSearchInput').value || '').trim();
    var wrap = $('friendSearchResults');
    if (!q) { wrap.innerHTML = ''; return; }
 
    var res = await sb()
      .from('profiles')
      .select('username, user_id')
      .ilike('username', q + '%')
      .neq('user_id', currentUser.id)
      .limit(6);
 
    if (!res.data || !res.data.length) {
      wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:8px 4px;">No users found.</div>';
      return;
    }
 
    wrap.innerHTML = res.data.map(function (p) {
      return '<div class="friend-card">' +
        '<div class="friend-avatar">' + esc(initials(p.username)) + '</div>' +
        '<div class="friend-info"><div class="friend-name">' + esc(p.username) + '</div></div>' +
        '<div class="friend-actions">' +
          '<button class="friend-btn" data-add="' + esc(p.user_id) + '">Add Friend</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
 
  async function sendFriendReq(uid) {
    var res = await sb().from('friendships').insert({ user_id: currentUser.id, friend_id: uid, status: 'pending' });
    if (res.error) { toast('Could not send request: ' + res.error.message); return; }
    $('friendSearchResults').innerHTML = '';
    $('friendSearchInput').value = '';
    toast('Friend request sent!');
  }
 
  async function respondRequest(id, status) {
    await sb().from('friendships').update({ status: status }).eq('id', id);
    loadFriends();
    toast(status === 'accepted' ? 'Friend added!' : 'Request declined.');
  }
 
  async function removeFriend(id) {
    await sb().from('friendships').delete().eq('id', id);
    loadFriends();
    toast('Friend removed.');
  }
 
  function initFriendEvents() {
    var searchBtn = $('friendSearchBtn');
    var searchInp = $('friendSearchInput');
    if (searchBtn) searchBtn.addEventListener('click', doFriendSearch);
    if (searchInp) searchInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doFriendSearch(); });
 
    // Delegated clicks for dynamic friend cards
    document.addEventListener('click', function (e) {
      if (!currentUser) return;
      var el;
 
      el = e.target.closest('[data-accept]');
      if (el) { respondRequest(el.getAttribute('data-accept'), 'accepted'); return; }
 
      el = e.target.closest('[data-decline]');
      if (el) { respondRequest(el.getAttribute('data-decline'), 'declined'); return; }
 
      el = e.target.closest('[data-add]');
      if (el) { sendFriendReq(el.getAttribute('data-add')); return; }
 
      el = e.target.closest('[data-remove]');
      if (el) { removeFriend(el.getAttribute('data-remove')); return; }
 
      el = e.target.closest('[data-dm]');
      if (el) { openDM(el.getAttribute('data-dm')); return; }
 
      el = e.target.closest('[data-trade-with]');
      if (el) { openTradeBuilderFor(el.getAttribute('data-trade-with')); return; }
    });
  }
 
  // ══════════════════════════════════════════════════════════════
  //  CHAT
  // ══════════════════════════════════════════════════════════════
  function loadChat() {
    fetchMessages(currentRoom);
    subscribeRoom(currentRoom);
  }
 
  async function fetchMessages(room) {
    if (!sb()) return;
    var res = await sb().from('messages').select('*').eq('room', room)
      .order('created_at', { ascending: true }).limit(100);
    renderMessages(res.data || []);
  }
 
  function renderMessages(msgs) {
    var el = $('chatMessages');
    if (!el) return;
    if (!msgs.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.8rem;">No messages yet — say hi! 👋</div>';
      return;
    }
    el.innerHTML = msgs.map(function (m) {
      var mine = currentProfile && m.username === currentProfile.username;
      return '<div class="chat-msg' + (mine ? ' mine' : '') + '">' +
        '<div class="chat-msg-avatar">' + esc(initials(m.username)) + '</div>' +
        '<div class="chat-msg-content">' +
          '<div class="chat-msg-name">' + esc(m.username || 'Unknown') + '</div>' +
          '<div class="chat-bubble">' + esc(m.content) + '</div>' +
          '<div class="chat-ts">' + fmtTime(m.created_at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }
 
  function subscribeRoom(room) {
    if (chatSub) { try { chatSub.unsubscribe(); } catch (e) {} }
    if (!sb()) return;
    chatSub = sb().channel('chat:' + room)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.' + room },
          function (payload) { appendMessage(payload.new); })
      .subscribe();
  }
 
  function appendMessage(m) {
    var el = $('chatMessages');
    if (!el) return;
    var placeholder = el.querySelector('[style*="say hi"]');
    if (placeholder) placeholder.remove();
    var mine = currentProfile && m.username === currentProfile.username;
    var div  = document.createElement('div');
    div.className = 'chat-msg' + (mine ? ' mine' : '');
    div.innerHTML =
      '<div class="chat-msg-avatar">' + esc(initials(m.username)) + '</div>' +
      '<div class="chat-msg-content">' +
        '<div class="chat-msg-name">' + esc(m.username || 'Unknown') + '</div>' +
        '<div class="chat-bubble">' + esc(m.content) + '</div>' +
        '<div class="chat-ts">just now</div>' +
      '</div>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
 
  function switchRoom(label, roomId) {
    currentRoom = roomId;
    document.querySelectorAll('.chat-room-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-room="' + roomId + '"]');
    if (btn) btn.classList.add('active');
    var hdr = $('chatHeaderLabel');
    if (hdr) hdr.innerHTML = '<i class="fas fa-hashtag" style="color:var(--zen);font-size:0.78rem;"></i> ' + esc(label);
    fetchMessages(roomId);
    subscribeRoom(roomId);
  }
 
  function addRoomSidebarBtn(label, roomId) {
    var sidebar = $('chatSidebar');
    if (!sidebar || sidebar.querySelector('[data-room="' + roomId + '"]')) return;
    var btn = document.createElement('button');
    btn.className = 'chat-room-btn';
    btn.setAttribute('data-room', roomId);
    btn.innerHTML = '<span class="chat-room-dot"></span>' + esc(label);
    btn.addEventListener('click', function () { switchRoom(label, roomId); });
    sidebar.appendChild(btn);
  }
 
  function openDM(username) {
    var tab = document.querySelector('[data-nested-tab="chat"]');
    if (tab) tab.click();
    var roomId = [currentProfile.username, username].sort().join('__dm__');
    addRoomSidebarBtn(username + ' (DM)', roomId);
    setTimeout(function () { switchRoom(username + ' (DM)', roomId); }, 50);
  }
 
  async function sendMessage() {
    if (!currentProfile || !sb()) return;
    var inp = $('chatInput');
    var content = (inp.value || '').trim();
    if (!content) return;
    inp.value = '';
    await sb().from('messages').insert({
      room: currentRoom,
      user_id: currentUser.id,
      username: currentProfile.username,
      content: content
    });
  }
 
  function initChatEvents() {
    var sendBtn = $('chatSendBtn');
    var inp     = $('chatInput');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (inp)     inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(); });
 
    document.querySelectorAll('.chat-room-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var room  = this.getAttribute('data-room');
        var label = room === 'global' ? 'Global Chat' : room;
        switchRoom(label, room);
      });
    });
  }
 
  // ══════════════════════════════════════════════════════════════
  //  TRADES
  // ══════════════════════════════════════════════════════════════
  async function loadTrades() {
    if (!currentUser || !sb()) return;
    await Promise.all([loadTradePane('incoming'), loadTradePane('outgoing'), loadTradePane('history')]);
    await populateTradeBuilder();
  }
 
  async function loadTradePane(pane) {
    var el = $(pane === 'incoming' ? 'tradeIncoming' : pane === 'outgoing' ? 'tradeOutgoing' : 'tradeHistory');
    if (!el) return;
 
    var query = sb().from('trades').select('*').order('created_at', { ascending: false });
 
    if (pane === 'incoming') query = query.eq('receiver_id', currentUser.id).eq('status', 'pending');
    else if (pane === 'outgoing') query = query.eq('sender_id', currentUser.id).eq('status', 'pending');
    else query = query
      .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
      .neq('status', 'pending').limit(20);
 
    var res  = await query;
    var rows = res.data || [];
 
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>Nothing here yet.</p></div>';
      return;
    }
    el.innerHTML = rows.map(function (t) { return renderTradeCard(t, pane); }).join('');
  }
 
  function renderTradeCard(t, pane) {
    var incoming = t.receiver_id === currentUser.id;
    var partner  = incoming ? t.sender_username : t.receiver_username;
    var offer    = t.offer_cards   || [];
    var request  = t.request_cards || [];
 
    var actions = '';
    if (t.status === 'pending' && incoming) {
      actions = '<button class="trade-action-btn accept" data-trade-accept="' + t.id + '">Accept</button>' +
                '<button class="trade-action-btn reject" data-trade-reject="' + t.id + '">Decline</button>';
    } else if (t.status === 'pending' && !incoming) {
      actions = '<button class="trade-action-btn" data-trade-cancel="' + t.id + '">Cancel</button>';
    }
 
    return '<div class="trade-card">' +
      '<div class="trade-card-header">' +
        '<div><div class="trade-partner">' + (incoming ? 'From: ' : 'To: ') + esc(partner || '–') + '</div>' +
        '<div class="trade-date">' + fmtTime(t.created_at) + '</div></div>' +
        '<span class="trade-status-badge ' + esc(t.status) + '">' + esc(t.status) + '</span>' +
      '</div>' +
      (t.note ? '<div class="trade-note">"' + esc(t.note) + '"</div>' : '') +
      '<div class="trade-columns">' +
        '<div><div class="trade-col-label">Offering</div><div class="trade-chips">' +
          offer.map(function (c) { return '<span class="trade-chip">' + esc(c) + '</span>'; }).join('') +
        '</div></div>' +
        '<div><div class="trade-col-label">Requesting</div><div class="trade-chips">' +
          request.map(function (c) { return '<span class="trade-chip">' + esc(c) + '</span>'; }).join('') +
        '</div></div>' +
      '</div>' +
      (actions ? '<div class="trade-actions">' + actions + '</div>' : '') +
    '</div>';
  }
 
  async function respondTrade(id, status) {
    await sb().from('trades').update({ status: status }).eq('id', id);
    loadTrades();
    var labels = { accepted: 'Trade accepted! ✅', rejected: 'Trade declined.', cancelled: 'Trade cancelled.' };
    toast(labels[status] || 'Done.');
  }
 
  // ── Trade builder ─────────────────────────────────────────────
  async function populateTradeBuilder() {
    if (!currentUser || !sb()) return;
 
    // Friends dropdown
    var sel = $('tbReceiver');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select a friend —</option>';
 
    var fr = await sb().from('friendships')
      .select('user_id, friend_id, fp:profiles!friendships_friend_id_fkey(username,user_id), sp:profiles!friendships_user_id_fkey(username,user_id)')
      .or('user_id.eq.' + currentUser.id + ',friend_id.eq.' + currentUser.id)
      .eq('status', 'accepted');
 
    (fr.data || []).forEach(function (f) {
      var isInit = f.user_id === currentUser.id;
      var other  = isInit ? f.fp : f.sp;
      if (!other) return;
      var opt    = document.createElement('option');
      opt.value  = other.user_id + '|' + other.username;
      opt.textContent = other.username;
      sel.appendChild(opt);
    });
 
    // Card grids
    var allCards   = window.allCards || [];
    var collection = window.collection || {};
    var myCards    = allCards.filter(function (c) { return (collection[c.number] || 0) > 0; });
 
    buildCardGrid($('tbOfferGrid'),   myCards,  'offer');
    buildCardGrid($('tbRequestGrid'), allCards, 'request');
  }
 
  function buildCardGrid(el, cards, mode) {
    if (!el) return;
    el.innerHTML = cards.slice(0, 120).map(function (c) {
      var short = c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name;
      return '<div class="tb-chip" data-tb-num="' + esc(c.number) + '" data-tb-name="' + esc(c.name) + '" data-tb-mode="' + mode + '">' +
        '<div style="font-size:0.55rem;color:var(--text-muted);">#' + esc(c.number) + '</div>' +
        esc(short) +
      '</div>';
    }).join('');
  }
 
  function updateTbChips() {
    function chips(arr) {
      return arr.map(function (n) {
        return '<span class="tb-sel-chip">' + esc(n) +
          ' <span class="rm" data-rm="' + esc(n) + '" data-rm-mode="' + (arr === tbOffer ? 'offer' : 'request') + '">&times;</span></span>';
      }).join('');
    }
    var ofs  = $('tbOfferSelected');
    var reqs = $('tbRequestSelected');
    if (ofs)  ofs.innerHTML  = tbOffer.map(function (n) {
      return '<span class="tb-sel-chip">' + esc(n) + ' <span class="rm" data-rm="' + esc(n) + '" data-rm-mode="offer">&times;</span></span>';
    }).join('');
    if (reqs) reqs.innerHTML = tbRequest.map(function (n) {
      return '<span class="tb-sel-chip">' + esc(n) + ' <span class="rm" data-rm="' + esc(n) + '" data-rm-mode="request">&times;</span></span>';
    }).join('');
  }
 
  function openTradeBuilder() {
    tbOffer = []; tbRequest = [];
    populateTradeBuilder();
    updateTbChips();
    if ($('tradeBuilderError')) $('tradeBuilderError').textContent = '';
    if ($('tbNote')) $('tbNote').value = '';
    $('tradeBuilderOverlay').classList.add('active');
  }
 
  function openTradeBuilderFor(username) {
    openTradeBuilder();
    setTimeout(function () {
      var sel = $('tbReceiver');
      if (!sel) return;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === username) { sel.selectedIndex = i; break; }
      }
    }, 200);
  }
 
  function closeTradeBuilder() {
    $('tradeBuilderOverlay').classList.remove('active');
  }
 
  async function submitTrade() {
    var errEl = $('tradeBuilderError');
    var recv  = ($('tbReceiver').value || '').split('|');
    if (!recv[0]) { errEl.textContent = 'Select a friend.'; return; }
    if (!tbOffer.length)   { errEl.textContent = 'Choose at least one card to offer.'; return; }
    if (!tbRequest.length) { errEl.textContent = 'Choose at least one card to request.'; return; }
 
    var note = ($('tbNote').value || '').trim();
    var res  = await sb().from('trades').insert({
      sender_id: currentUser.id,
      sender_username: currentProfile.username,
      receiver_id: recv[0],
      receiver_username: recv[1],
      offer_cards: tbOffer,
      request_cards: tbRequest,
      note: note || null,
      status: 'pending'
    });
 
    if (res.error) { errEl.textContent = res.error.message; return; }
    closeTradeBuilder();
    toast('Trade offer sent! 🤝');
    loadTrades();
  }
 
  function initTradeEvents() {
    var newBtn = $('tradeNewBtn');
    if (newBtn) newBtn.addEventListener('click', openTradeBuilder);
 
    [$('tradeBuilderClose'), $('tradeBuilderCancel')].forEach(function (b) {
      if (b) b.addEventListener('click', closeTradeBuilder);
    });
 
    var overlay = $('tradeBuilderOverlay');
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === this) closeTradeBuilder(); });
 
    var submitBtn = $('tradeBuilderSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submitTrade);
 
    // Trade builder chip selection (delegated)
    if (overlay) overlay.addEventListener('click', function (e) {
      var chip = e.target.closest('.tb-chip[data-tb-num]');
      if (chip) {
        var mode = chip.getAttribute('data-tb-mode');
        var name = chip.getAttribute('data-tb-name');
        var arr  = mode === 'offer' ? tbOffer : tbRequest;
        var idx  = arr.indexOf(name);
        if (idx === -1) { arr.push(name); chip.classList.add('selected'); }
        else            { arr.splice(idx, 1); chip.classList.remove('selected'); }
        updateTbChips();
        return;
      }
      var rm = e.target.closest('[data-rm]');
      if (rm) {
        var n    = rm.getAttribute('data-rm');
        var rmode = rm.getAttribute('data-rm-mode');
        if (rmode === 'offer')   tbOffer   = tbOffer.filter(function (x) { return x !== n; });
        else                     tbRequest = tbRequest.filter(function (x) { return x !== n; });
        updateTbChips();
      }
    });
 
    // Action buttons in trade lists (delegated)
    ['tradeIncoming', 'tradeOutgoing', 'tradeHistory'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-trade-accept]');
        if (a) { respondTrade(a.getAttribute('data-trade-accept'), 'accepted'); return; }
        var r = e.target.closest('[data-trade-reject]');
        if (r) { respondTrade(r.getAttribute('data-trade-reject'), 'rejected'); return; }
        var c = e.target.closest('[data-trade-cancel]');
        if (c) { respondTrade(c.getAttribute('data-trade-cancel'), 'cancelled'); return; }
      });
    });
  }
 
  // ══════════════════════════════════════════════════════════════
  //  FORUM
  // ══════════════════════════════════════════════════════════════
  async function loadForum() {
    if (!sb()) return;
    var q = sb().from('forum_posts').select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40);
    if (currentCat !== 'all') q = q.eq('category', currentCat);
 
    var res  = await q;
    var el   = $('forumPostList');
    var rows = res.data || [];
 
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p>No posts yet — start the conversation!</p></div>';
      return;
    }
    el.innerHTML = rows.map(function (p) {
      return '<div class="forum-post-card' + (p.pinned ? ' pinned' : '') + '" data-post-id="' + p.id + '">' +
        '<div class="forum-post-title">' + esc(p.title) + '</div>' +
        '<div class="forum-post-preview">' + esc((p.body || '').slice(0, 130)) + '</div>' +
        '<div class="forum-post-meta">' +
          '<span class="forum-post-author">by ' + esc(p.username) + ' · ' + fmtTime(p.created_at) + '</span>' +
          '<span class="forum-post-cat">' + esc(p.category) + '</span>' +
          '<span class="forum-reply-count"><i class="fas fa-comment-alt"></i> ' + (p.reply_count || 0) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }
 
  async function openForumPost(postId) {
    currentPostId = postId;
    $('forumDetailOverlay').classList.add('active');
 
    var pRes = await sb().from('forum_posts').select('*').eq('id', postId).single();
    var post = pRes.data;
    if (post) {
      $('forumDetailTitle').textContent = post.title;
      $('forumDetailBody').innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;">' +
          '<div class="forum-reply-author-row">' +
            '<span class="forum-reply-author">' + esc(post.username) + '</span>' +
            '<span class="forum-reply-ts">' + fmtTime(post.created_at) + '</span>' +
          '</div>' +
          '<div style="font-size:0.88rem;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;word-break:break-word;margin-top:8px;">' +
            esc(post.body) +
          '</div>' +
        '</div>' +
        '<div id="forumRepliesContainer"><div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">Loading replies…</div></div>';
    }
 
    loadForumReplies(postId);
 
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch (e) {} }
    forumReplySub = sb().channel('forum:' + postId)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'forum_replies', filter: 'post_id=eq.' + postId },
          function (payload) { appendReply(payload.new); })
      .subscribe();
  }
 
  async function loadForumReplies(postId) {
    var res = await sb().from('forum_replies').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    var container = $('forumRepliesContainer');
    if (!container) return;
    var rows = res.data || [];
    if (!rows.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">No replies yet — be first!</div>';
      return;
    }
    container.innerHTML = rows.map(renderReply).join('');
    var body = $('forumDetailBody');
    if (body) body.scrollTop = body.scrollHeight;
  }
 
  function renderReply(r) {
    return '<div class="forum-reply-card">' +
      '<div class="forum-reply-author-row">' +
        '<span class="forum-reply-author">' + esc(r.username) + '</span>' +
        '<span class="forum-reply-ts">' + fmtTime(r.created_at) + '</span>' +
      '</div>' +
      '<div class="forum-reply-body">' + esc(r.body) + '</div>' +
    '</div>';
  }
 
  function appendReply(r) {
    var container = $('forumRepliesContainer');
    if (!container) return;
    var placeholder = container.querySelector('[style*="No replies"]');
    if (placeholder) placeholder.remove();
    var div = document.createElement('div');
    div.innerHTML = renderReply(r);
    container.appendChild(div.firstChild);
    var body = $('forumDetailBody');
    if (body) body.scrollTop = body.scrollHeight;
  }
 
  function closeForumDetail() {
    $('forumDetailOverlay').classList.remove('active');
    currentPostId = null;
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch (e) {} forumReplySub = null; }
  }
 
  async function submitForumPost() {
    var title = ($('forumNewTitle').value || '').trim();
    var body  = ($('forumNewBody').value  || '').trim();
    var cat   = $('forumNewCat').value;
    var errEl = $('forumNewError');
 
    if (!title) { errEl.textContent = 'Please enter a title.'; return; }
    if (!body)  { errEl.textContent = 'Please enter some content.'; return; }
 
    var res = await sb().from('forum_posts').insert({
      user_id: currentUser.id,
      username: currentProfile.username,
      category: cat,
      title: title,
      body: body,
      pinned: false,
      reply_count: 0
    });
 
    if (res.error) { errEl.textContent = res.error.message; return; }
    $('forumNewOverlay').classList.remove('active');
    $('forumNewTitle').value = '';
    $('forumNewBody').value  = '';
    errEl.textContent = '';
    loadForum();
    toast('Post published! ✍️');
  }
 
  async function sendForumReply() {
    if (!currentPostId || !currentProfile || !sb()) return;
    var inp  = $('forumReplyInput');
    var body = (inp.value || '').trim();
    if (!body) return;
    inp.value = '';
    inp.style.height = '40px';
 
    var res = await sb().from('forum_replies').insert({
      post_id: currentPostId,
      user_id: currentUser.id,
      username: currentProfile.username,
      body: body
    });
 
    if (!res.error) {
      // Best-effort increment reply count via RPC if you have it
      sb().rpc('increment_reply_count', { p_post_id: currentPostId }).catch(function () {});
    }
  }
 
  function initForumEvents() {
    // Category filter
    var catRow = $('forumCatRow');
    if (catRow) catRow.addEventListener('click', function (e) {
      var pill = e.target.closest('.forum-cat-pill');
      if (!pill) return;
      catRow.querySelectorAll('.forum-cat-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      currentCat = pill.getAttribute('data-cat');
      loadForum();
    });
 
    // New post
    var newBtn = $('forumNewBtn');
    if (newBtn) newBtn.addEventListener('click', function () {
      if (!currentProfile) { toast('Sign in and set a username to post.'); return; }
      $('forumNewOverlay').classList.add('active');
    });
 
    [$('forumNewClose'), $('forumNewCancel')].forEach(function (b) {
      if (b) b.addEventListener('click', function () { $('forumNewOverlay').classList.remove('active'); });
    });
    var fno = $('forumNewOverlay');
    if (fno) fno.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });
 
    var submitBtn = $('forumNewSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submitForumPost);
 
    // Post click
    var postList = $('forumPostList');
    if (postList) postList.addEventListener('click', function (e) {
      var card = e.target.closest('[data-post-id]');
      if (card) openForumPost(card.getAttribute('data-post-id'));
    });
 
    // Detail close
    var detClose = $('forumDetailClose');
    if (detClose) detClose.addEventListener('click', closeForumDetail);
    var fdo = $('forumDetailOverlay');
    if (fdo) fdo.addEventListener('click', function (e) { if (e.target === this) closeForumDetail(); });
 
    // Reply
    var replyBtn = $('forumReplySendBtn');
    if (replyBtn) replyBtn.addEventListener('click', sendForumReply);
    var replyInp = $('forumReplyInput');
    if (replyInp) replyInp.addEventListener('keydown', function (e) { if (e.ctrlKey && e.key === 'Enter') sendForumReply(); });
  }
 
  // ══════════════════════════════════════════════════════════════
  //  PUBLIC HOOKS (called by auth.js)
  // ══════════════════════════════════════════════════════════════
  window.socialOnLogin = function (user) {
    currentUser = user;
    if (!sb()) return;
    setupProfileSection(user);
  };
 
  window.socialOnLogout = function () {
    currentUser = null;
    currentProfile = null;
    if (chatSub)       { try { chatSub.unsubscribe(); }       catch (e) {} chatSub = null; }
    if (forumReplySub) { try { forumReplySub.unsubscribe(); } catch (e) {} forumReplySub = null; }
    if ($('socialSetup'))  $('socialSetup').style.display  = 'none';
    if ($('socialSection')) $('socialSection').style.display = 'none';
  };
 
  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    initFriendEvents();
    initChatEvents();
    initTradeEvents();
    initForumEvents();
  }
 
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
 
})();
