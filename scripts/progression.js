// ================================================================
//  AVATAR TCG — Progression & Discovery Module  (progression.js v1)
//  Requires: window.sb (Supabase), window.allCards, window.collection
//
//  Features:
//   1. Daily login streaks with pack rewards
//   2. Achievements / badges displayed on profiles
//   3. Bender level (XP from collecting, trading, posting)
//   4. "Cards in Common" when viewing a friend's collection
//   5. Price / scarcity index based on how many users own each card
//   6. Set completion leaderboard
// ================================================================
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────
  var XP_PER_LEVEL = 100;
  var TOTAL_CORE_CARDS = 248;

  var ACHIEVEMENTS = [
    { key: 'first_card',    name: 'First Card',        icon: '🃏', desc: 'Add your first card to your collection',        xp: 10  },
    { key: 'collector_10',  name: 'Budding Collector',  icon: '📦', desc: 'Own 10 unique cards',                           xp: 25  },
    { key: 'collector_50',  name: 'Dedicated Bender',  icon: '⭐', desc: 'Own 50 unique cards',                           xp: 75  },
    { key: 'collector_100', name: 'Card Master',        icon: '💎', desc: 'Own 100 unique cards',                          xp: 150 },
    { key: 'collector_248', name: 'Fully Realized Avatar',    icon: '🏆', desc: 'Complete the core set (248 cards)',              xp: 500 },
    { key: 'first_trade',   name: 'First Trade',        icon: '🤝', desc: 'Complete your first trade',                     xp: 50  },
    { key: 'first_friend',  name: 'Bending Buddy',   icon: '🦋', desc: 'Add your first friend',                         xp: 25  },
    { key: 'streak_7',      name: 'Weekly Warrior',       icon: '🔥', desc: 'Maintain a 7-day login streak',                 xp: 50  },
    { key: 'streak_30',     name: 'Blazing Bender',    icon: '⚡', desc: 'Maintain a 30-day login streak',                xp: 200 },
    { key: 'forum_post',    name: 'Voice of the Arena', icon: '📣', desc: 'Write your first forum post',                   xp: 15  },
    { key: 'set_common',    name: 'Common Sense',       icon: '📋', desc: 'Complete all Common cards in the core set',     xp: 100 },
    { key: 'set_uncommon',  name: 'Uncommon Feat',      icon: '🌿', desc: 'Complete all Uncommon cards in the core set',   xp: 150 },
    { key: 'set_rare',      name: 'Rare Breed',         icon: '💧', desc: 'Complete all Rare cards in the core set',       xp: 200 },
    { key: 'set_zen',       name: 'Zen Master',         icon: '🌸', desc: 'Complete all Zenemental cards in the core set', xp: 300 },
  ];

  var LEVEL_TITLES = [
    [1,  'Novice Bender'],
    [5,  'Junior Bender'],
    [10, 'Senior Bender'],
    [20, 'Expert Bender'],
    [35, 'Elite Bender'],
    [50, 'Master Bender'],
    [75, 'Grandmaster Bender'],
  ];

  // ── State ──────────────────────────────────────────────────────
  var _userId        = null;
  var _userProfile   = null;
  var _scarcityMap   = {};   // card_number → owner_count
  var _totalUsers    = 1;
  var _scarcityReady = false;

  // ── Tiny helpers ───────────────────────────────────────────────
  function sb()  { return window.sb; }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2500);
  }

  function calcLevel(xp)      { return Math.floor((xp || 0) / XP_PER_LEVEL) + 1; }
  function xpInLevel(xp)      { return (xp || 0) % XP_PER_LEVEL; }
  function levelTitle(level) {
    var title = 'Novice Bender';
    LEVEL_TITLES.forEach(function (t) { if (level >= t[0]) title = t[1]; });
    return title;
  }
  function earnedKeys(profile) {
    return (profile.achievements || []).map(function (a) {
      return typeof a === 'string' ? a : (a.key || a);
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  1. DAILY LOGIN STREAKS
  // ══════════════════════════════════════════════════════════════
  async function handleDailyLogin(userId) {
    if (!sb() || !userId) return;
    try {
      var res = await sb().rpc('handle_daily_login', { p_user_id: userId });
      if (res.error) { console.warn('[progression] daily login RPC:', res.error.message); return; }
      var d = res.data;
      if (!d || d.already_claimed) return;

      // Show streak toast
      var msg = '🔥 ' + d.streak + '-day streak! +' + d.xp_gained + ' XP';
      if (d.pack_reward > 0) msg += ' · 🎁 +' + d.pack_reward + ' pack credit' + (d.pack_reward > 1 ? 's' : '') + '!';
      toast(msg);

      // Milestone banner
      if (d.streak === 7 || d.streak === 14 || d.streak === 30 || (d.streak > 30 && d.streak % 30 === 0)) {
        setTimeout(function () { showStreakBanner(d); }, 800);
      }

      // Refresh profile XP/level in the page cache
      if (_userProfile) {
        _userProfile.login_streak   = d.streak;
        _userProfile.total_xp       = d.new_xp;
        _userProfile.trainer_level  = d.level;
        _userProfile.pack_credits   = d.pack_credits;
      }
    } catch (e) { console.warn('[progression] handleDailyLogin error:', e); }
  }

  function showStreakBanner(data) {
    injectKeyframes();
    var banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed;top:50%;left:50%;z-index:9999;',
      'background:var(--bg-secondary);',
      'border:2px solid var(--fire);border-radius:var(--radius-lg);',
      'padding:24px 28px;text-align:center;max-width:300px;width:90%;',
      'box-shadow:0 0 40px rgba(232,83,46,0.4),var(--shadow-lg);',
      'animation:progBounce 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;',
    ].join('');
    banner.innerHTML =
      '<div style="font-size:3rem;margin-bottom:8px;">🔥</div>' +
      '<div style="font-family:\'Cinzel\',serif;font-size:1.15rem;font-weight:900;color:var(--fire);margin-bottom:6px;">' + data.streak + '-Day Streak!</div>' +
      '<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px;">' +
        'Keep it up, Bender!' +
        (data.pack_reward > 0
          ? '<br><span style="color:var(--air);font-weight:700;">🎁 +' + data.pack_reward + ' pack credit' + (data.pack_reward > 1 ? 's' : '') + ' earned!</span>'
          : '') +
      '</div>' +
      '<button style="background:var(--fire);color:#fff;border:none;border-radius:99px;padding:9px 24px;' +
        'font-family:\'Nunito Sans\',sans-serif;font-weight:700;font-size:0.82rem;cursor:pointer;">Awesome!</button>';
    document.body.appendChild(banner);
    banner.querySelector('button').addEventListener('click', function () { dismissBanner(banner); });
    setTimeout(function () { if (banner.parentNode) dismissBanner(banner); }, 5000);
  }

  function dismissBanner(el) {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.remove(); }, 320);
  }

  // ══════════════════════════════════════════════════════════════
  //  2 & 3. ACHIEVEMENTS + Bender LEVEL — rendering & checking
  // ══════════════════════════════════════════════════════════════

  /** Returns HTML string for the progression card embedded in the profile */
  function renderProgressionCard(profile) {
    if (!profile) return '';
    var xp      = profile.total_xp     || 0;
    var level   = profile.Bender_level || calcLevel(xp);
    var streak  = profile.login_streak  || 0;
    var credits = profile.pack_credits  || 0;
    var pct     = Math.round((xpInLevel(xp) / XP_PER_LEVEL) * 100);
    var title   = levelTitle(level);
    var earned  = earnedKeys(profile);
    var earnedDefs = ACHIEVEMENTS.filter(function (a) { return earned.indexOf(a.key) !== -1; });

    var achieveHtml = earnedDefs.length
      ? '<div style="margin-top:14px;">' +
          '<div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;margin-bottom:8px;">' +
            '<i class="fas fa-medal" style="color:var(--promo);margin-right:5px;"></i>Achievements (' + earnedDefs.length + ')' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;">' +
            earnedDefs.slice(0, 9).map(function (a) {
              return '<div title="' + esc(a.desc) + '" style="display:inline-flex;align-items:center;gap:4px;' +
                'background:rgba(232,182,50,0.08);border:1px solid rgba(232,182,50,0.2);' +
                'border-radius:99px;padding:4px 10px;font-size:0.65rem;color:var(--promo);font-weight:600;">' +
                esc(a.icon) + ' ' + esc(a.name) + '</div>';
            }).join('') +
            (earnedDefs.length > 9
              ? '<div style="font-size:0.65rem;color:var(--text-muted);padding:4px 6px;">+' + (earnedDefs.length - 9) + ' more</div>'
              : '') +
          '</div>' +
        '</div>'
      : '';

    return '<div style="margin-top:14px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;">' +

      /* Level + streak row */
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:9px;">' +
          '<div style="width:34px;height:34px;border-radius:9px;' +
            'background:linear-gradient(135deg,var(--water),var(--zen));' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-family:\'Cinzel\',serif;font-weight:900;font-size:0.9rem;color:#fff;">' + level + '</div>' +
          '<div>' +
            '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.82rem;color:var(--text-primary);">Level ' + level + '</div>' +
            '<div style="font-size:0.62rem;color:var(--text-muted);">' + esc(title) + '</div>' +
          '</div>' +
        '</div>' +
        (streak > 0
          ? '<div style="display:flex;align-items:center;gap:5px;background:rgba(232,83,46,0.1);' +
              'border:1px solid rgba(232,83,46,0.25);border-radius:99px;padding:4px 11px;">' +
              '<i class="fas fa-fire" style="color:var(--fire);font-size:0.72rem;"></i>' +
              '<span style="font-size:0.72rem;font-weight:700;color:var(--fire);">' + streak + 'd</span>' +
            '</div>'
          : '') +
      '</div>' +

      /* XP bar */
      '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
          '<span style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700;">XP to Level ' + (level + 1) + '</span>' +
          '<span style="font-size:0.62rem;color:var(--text-secondary);">' + xpInLevel(xp) + ' / ' + XP_PER_LEVEL + '</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--bg-card);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--water),var(--zen));width:' + pct + '%;transition:width 0.4s;"></div>' +
        '</div>' +
      '</div>' +

      /* Stats pills */
      '<div style="display:flex;gap:6px;">' +
        '<div style="flex:1;text-align:center;padding:6px 4px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:0.85rem;font-weight:700;color:var(--accent);">' + xp + '</div>' +
          '<div style="font-size:0.52rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Total XP</div>' +
        '</div>' +
        '<div style="flex:1;text-align:center;padding:6px 4px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:0.85rem;font-weight:700;color:var(--fire);">' + streak + '</div>' +
          '<div style="font-size:0.52rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Day Streak</div>' +
        '</div>' +
        (credits > 0
          ? '<div style="flex:1;text-align:center;padding:6px 4px;background:rgba(240,201,70,0.06);border:1px solid rgba(240,201,70,0.2);border-radius:6px;">' +
              '<div style="font-family:\'Cinzel\',serif;font-size:0.85rem;font-weight:700;color:var(--air);">' + credits + '</div>' +
              '<div style="font-size:0.52rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Pack Credits</div>' +
            '</div>'
          : '') +
      '</div>' +

      achieveHtml +
    '</div>';
  }

  /** Check which achievements the user has earned and grant any new ones */
  async function checkAndGrantAchievements(userId, profile) {
    if (!sb() || !userId || !profile) return;
    var owned   = earnedKeys(profile);
    var col     = window.collection || {};
    var allCards = window.allCards || [];

    var ownedUnique = allCards.filter(function (c) { return (col[c.number] || 0) > 0; }).length;

    var checks = [
      { key: 'first_card',    cond: ownedUnique >= 1   },
      { key: 'collector_10',  cond: ownedUnique >= 10  },
      { key: 'collector_50',  cond: ownedUnique >= 50  },
      { key: 'collector_100', cond: ownedUnique >= 100 },
      { key: 'collector_248', cond: ownedUnique >= TOTAL_CORE_CARDS },
      { key: 'streak_7',      cond: (profile.login_streak || 0) >= 7  },
      { key: 'streak_30',     cond: (profile.login_streak || 0) >= 30 },
    ];

    // Rarity set completions
    [['common','set_common'],['uncommon','set_uncommon'],['rare','set_rare'],['zenemental','set_zen']].forEach(function (r) {
      var pool  = allCards.filter(function (c) { return c.rarity === r[0]; });
      var ownedR = pool.filter(function (c) { return (col[c.number] || 0) > 0; }).length;
      checks.push({ key: r[1], cond: pool.length > 0 && ownedR >= pool.length });
    });

    // Social checks (async)
    try {
      var frRes = await sb().from('friendships').select('id', { count: 'exact' })
        .or('user_id.eq.' + userId + ',friend_id.eq.' + userId).eq('status','accepted');
      if ((frRes.count || 0) >= 1) checks.push({ key: 'first_friend', cond: true });

      var trRes = await sb().from('trades').select('id', { count: 'exact' })
        .or('sender_id.eq.' + userId + ',receiver_id.eq.' + userId).eq('status','accepted');
      if ((trRes.count || 0) >= 1) checks.push({ key: 'first_trade', cond: true });

      var fpRes = await sb().from('forum_posts').select('id', { count: 'exact' }).eq('user_id', userId);
      if ((fpRes.count || 0) >= 1) checks.push({ key: 'forum_post', cond: true });
    } catch (e) { /* non-fatal */ }

    // Grant new ones
    var newlyGranted = [];
    for (var i = 0; i < checks.length; i++) {
      var chk = checks[i];
      if (!chk.cond || owned.indexOf(chk.key) !== -1) continue;
      var def = ACHIEVEMENTS.find(function (a) { return a.key === chk.key; });
      if (!def) continue;
      try {
        var gRes = await sb().rpc('grant_achievement', {
          p_user_id:        userId,
          p_achievement_key: chk.key,
          p_achievement_name: def.name,
          p_icon:            def.icon
        });
        if (!gRes.error && gRes.data && !gRes.data.already_had) {
          newlyGranted.push(def);
          await sb().rpc('award_xp', { p_user_id: userId, p_xp: def.xp });
          if (_userProfile) {
            (_userProfile.achievements = _userProfile.achievements || []).push({ key: chk.key, name: def.name, icon: def.icon });
          }
        }
      } catch (e) { /* non-fatal */ }
    }

    // Show unlock toasts
    newlyGranted.forEach(function (a, idx) {
      setTimeout(function () { showAchievementUnlock(a); }, idx * 1800);
    });
  }

  function showAchievementUnlock(achievement) {
    injectKeyframes();
    var el = document.createElement('div');
    el.style.cssText = [
      'position:fixed;bottom:90px;left:50%;z-index:9998;',
      'transform:translateX(-50%) translateY(80px);opacity:0;',
      'background:var(--bg-secondary);',
      'border:1px solid rgba(232,182,50,0.45);border-radius:var(--radius-lg);',
      'padding:12px 18px;display:flex;align-items:center;gap:12px;',
      'box-shadow:0 0 24px rgba(232,182,50,0.2),var(--shadow-lg);',
      'transition:transform 0.38s cubic-bezier(0.34,1.2,0.64,1),opacity 0.35s;',
      'max-width:320px;width:90%;',
    ].join('');
    el.innerHTML =
      '<div style="font-size:1.9rem;flex-shrink:0;">' + esc(achievement.icon) + '</div>' +
      '<div>' +
        '<div style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--promo);font-weight:700;margin-bottom:2px;">Achievement Unlocked!</div>' +
        '<div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);">' + esc(achievement.name) + '</div>' +
        '<div style="font-size:0.7rem;color:var(--text-muted);">' + esc(achievement.desc) + ' · <span style="color:var(--accent);">+' + achievement.xp + ' XP</span></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.style.transform = 'translateX(-50%) translateY(0)';
      el.style.opacity   = '1';
    });
    setTimeout(function () {
      el.style.transform = 'translateX(-50%) translateY(80px)';
      el.style.opacity   = '0';
      setTimeout(function () { if (el.parentNode) el.remove(); }, 380);
    }, 3800);
  }

  // ══════════════════════════════════════════════════════════════
  //  4. CARDS IN COMMON
  // ══════════════════════════════════════════════════════════════
  async function renderCardsInCommon(friendUserId) {
    var myCol   = window.collection || {};
    var myOwned = Object.keys(myCol).filter(function (n) { return (myCol[n] || 0) > 0; });

    if (!myOwned.length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'Add cards to your collection to see what you have in common.</div>';
    }
    if (!sb()) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);">Not available.</div>';
    }

    var res = await sb().from('user_cards').select('card_number, quantity').eq('user_id', friendUserId);
    var friendRows = res.data || [];
    if (!friendRows.length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'This Bender hasn\'t synced their collection yet.</div>';
    }

    var friendOwned = {};
    friendRows.forEach(function (r) { friendOwned[r.card_number] = r.quantity || 1; });

    var commonNums = myOwned.filter(function (n) { return !!friendOwned[n]; });
    var onlyMeNums = myOwned.filter(function (n) { return !friendOwned[n]; });
    var onlyThemNums = Object.keys(friendOwned).filter(function (n) { return !myCol[n] || myCol[n] <= 0; });

    if (!commonNums.length) {
      return '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.82rem;">' +
        'No cards in common yet — maybe a trade could help! 🤝</div>';
    }

    var allCards = window.allCards || [];
    var RC = { common:'var(--text-muted)', uncommon:'var(--earth)', rare:'var(--accent)', zenemental:'var(--zen)', promo:'var(--promo)' };

    function cardGrid(nums, borderColor) {
      var cards = allCards.filter(function (c) { return nums.indexOf(c.number) !== -1; });
      cards.sort(function (a,b) {
        var ro = { common:1, uncommon:2, rare:3, zenemental:4, promo:5 };
        return (ro[a.rarity]||0)-(ro[b.rarity]||0) || (parseInt(a.number)||0)-(parseInt(b.number)||0);
      });
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px;margin-bottom:14px;">' +
        cards.map(function (c) {
          return '<div title="#' + esc(c.number) + ' ' + esc(c.name) + '" ' +
            'style="background:var(--bg-card);border:1px solid ' + borderColor + ';border-radius:7px;overflow:hidden;position:relative;">' +
            (c.imageLink
              ? '<img src="' + esc(c.imageLink) + '" alt="' + esc(c.name) + '" loading="lazy" style="width:100%;display:block;">'
              : '<div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:var(--text-muted);text-align:center;padding:4px;">' + esc(c.name) + '</div>') +
            '<div style="padding:2px 4px;font-size:0.5rem;color:' + RC[c.rarity] + ';font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(c.rarity) + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return '<div>' +
      /* Summary stats */
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
          '<div style="font-family:\'Cinzel\',serif;font-size:1.2rem;font-weight:700;color:var(--air);">' + onlyThemNums.length + '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Only Them</div>' +
        '</div>' +
      '</div>' +
      /* Common cards grid */
      '<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--water);font-weight:700;margin-bottom:8px;">' +
        '<i class="fas fa-people-arrows" style="margin-right:5px;"></i>Cards you both own' +
      '</div>' +
      cardGrid(commonNums, 'rgba(46,140,232,0.35)') +
    '</div>';
  }

  window.renderCardsInCommon = renderCardsInCommon;

  // ══════════════════════════════════════════════════════════════
  //  5. SCARCITY INDEX
  // ══════════════════════════════════════════════════════════════
  async function loadScarcityData() {
    if (_scarcityReady || !sb()) return;
    try {
      var [scRes, countRes] = await Promise.all([
        sb().from('card_scarcity').select('card_number, owner_count'),
        sb().from('profiles').select('user_id', { count: 'exact' })
      ]);
      if (!scRes.error && scRes.data) {
        scRes.data.forEach(function (r) { _scarcityMap[r.card_number] = r.owner_count; });
      }
      _totalUsers = Math.max(1, countRes.count || 1);
      _scarcityReady = true;
    } catch (e) { /* non-fatal */ }
  }

  function getScarcityInfo(cardNumber) {
    if (!_scarcityReady) return null;
    var cnt = _scarcityMap[cardNumber] || 0;
    var pct = Math.round((cnt / _totalUsers) * 100);
    var label, color, bg;
    if (cnt === 0)   { label = 'Unclaimed';  color = 'var(--text-muted)'; bg = 'rgba(90,94,120,0.1)'; }
    else if (pct < 5)  { label = 'Ultra Rare'; color = 'var(--promo)';     bg = 'rgba(232,182,50,0.1)'; }
    else if (pct < 15) { label = 'Scarce';     color = 'var(--zen)';       bg = 'rgba(180,77,223,0.1)'; }
    else if (pct < 35) { label = 'Uncommon';   color = 'var(--water)';     bg = 'rgba(46,140,232,0.1)'; }
    else if (pct < 65) { label = 'Common';     color = 'var(--earth)';     bg = 'rgba(92,184,92,0.1)';  }
    else               { label = 'Widespread'; color = 'var(--text-secondary)'; bg = 'rgba(138,142,168,0.1)'; }
    return { ownerCount: cnt, pct: pct, label: label, color: color, bg: bg };
  }

  // Render scarcity pill HTML (for modal injection)
  function scarcityPillHtml(cardNumber) {
    var info = getScarcityInfo(cardNumber);
    if (!info) return '';
    return '<span style="display:inline-flex;align-items:center;gap:5px;' +
      'background:' + info.bg + ';border:1px solid ' + info.color + ';' +
      'border-radius:99px;padding:4px 10px;font-size:0.65rem;font-weight:700;color:' + info.color + ';">' +
      '<i class="fas fa-users" style="font-size:0.55rem;"></i>' +
      info.label + ' — ' + info.pct + '% own this' +
    '</span>';
  }

  window.getCardScarcity    = getScarcityInfo;
  window.scarcityPillHtml   = scarcityPillHtml;

  // Inject scarcity pill into card modal when it opens
  function injectScarcityOnModal() {
    // Hook into the existing openModal to append scarcity info
    var _origOpen = window.openModal;
    if (!_origOpen) return;
    window.openModal = function (cardNumber, opts) {
      _origOpen.call(this, cardNumber, opts);
      if (!_scarcityReady) return;
      var tagsEl = document.getElementById('modalTags');
      if (tagsEl && !tagsEl.querySelector('.scarcity-tag')) {
        var pill = document.createElement('span');
        pill.className = 'scarcity-tag';
        var info = getScarcityInfo(cardNumber);
        if (info) {
          pill.innerHTML = '<span class="modal-tag" style="background:' + info.bg + ';border-color:' + info.color + ';color:' + info.color + ';">' +
            '<i class="fas fa-users" style="font-size:0.6rem;margin-right:4px;"></i>' + info.label + ' — ' + info.pct + '% own this</span>';
          tagsEl.appendChild(pill);
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  6. SET COMPLETION LEADERBOARD
  // ══════════════════════════════════════════════════════════════
  var _lbFilter = 'all';

  async function loadLeaderboard() {
    var el = document.getElementById('leaderboardContent');
    if (!el || !sb()) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-circle-notch fa-spin" style="margin-right:6px;"></i>Loading leaderboard…</div>';
    try {
      var res = await sb().from('set_completion_leaderboard').select('*').limit(50);
      if (res.error) throw res.error;
      renderLeaderboard(el, res.data || []);
    } catch (e) {
      el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.82rem;">Could not load leaderboard. Check your database view.</div>';
    }
  }

  function renderLeaderboard(el, rows) {
    if (!rows.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No benders yet — start collecting!</div>';
      return;
    }

    var filters = [
      { key:'all',        label:'All Cards',   total: TOTAL_CORE_CARDS, col: 'cards_owned' },
      { key:'common',     label:'Common',      total: null,             col: 'common_owned' },
      { key:'uncommon',   label:'Uncommon',    total: null,             col: 'uncommon_owned' },
      { key:'rare',       label:'Rare',        total: null,             col: 'rare_owned' },
      { key:'zenemental', label:'Zenemental',  total: null,             col: 'zenemental_owned' },
    ];

    // Calculate per-rarity totals from allCards
    var allCards = window.allCards || [];
    filters.forEach(function (f) {
      if (f.key !== 'all') {
        f.total = allCards.filter(function (c) { return c.rarity === f.key; }).length || 1;
      }
    });

    el.innerHTML =
      /* Filter pills */
      '<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;">' +
        filters.map(function (f, i) {
          var isActive = (i === 0 && _lbFilter === 'all') || _lbFilter === f.key;
          return '<button class="lb-pill" data-lb="' + f.key + '" ' +
            'style="flex-shrink:0;background:' + (isActive ? 'var(--zen)' : 'var(--bg-card)') + ';' +
            'border:1px solid ' + (isActive ? 'var(--zen)' : 'var(--border)') + ';' +
            'border-radius:99px;padding:6px 14px;font-size:0.72rem;' +
            'font-family:\'Nunito Sans\',sans-serif;font-weight:600;' +
            'color:' + (isActive ? '#fff' : 'var(--text-secondary)') + ';cursor:pointer;white-space:nowrap;">' +
            esc(f.label) + '</button>';
        }).join('') +
      '</div>' +
      '<div id="lbTable">' + buildLbTable(rows, filters.find(function(f){ return f.key===_lbFilter; }) || filters[0]) + '</div>';

    el.querySelectorAll('.lb-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _lbFilter = this.getAttribute('data-lb');
        el.querySelectorAll('.lb-pill').forEach(function (b) {
          b.style.background  = 'var(--bg-card)'; b.style.borderColor = 'var(--border)';
          b.style.color       = 'var(--text-secondary)';
        });
        this.style.background  = 'var(--zen)';
        this.style.borderColor = 'var(--zen)';
        this.style.color       = '#fff';
        var filterDef = filters.find(function (f) { return f.key === _lbFilter; }) || filters[0];
        var tbl = el.querySelector('#lbTable');
        if (tbl) tbl.innerHTML = buildLbTable(rows, filterDef);
      });
    });
  }

  function buildLbTable(rows, filterDef) {
    var medals = ['🥇','🥈','🥉'];
    var allCards = window.allCards || [];

    // Sort by chosen column
    var col   = filterDef.col;
    var total = filterDef.total;
    var sorted = rows.slice().sort(function (a, b) { return (b[col] || 0) - (a[col] || 0); });

    return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">' +
      /* Header */
      '<div style="display:grid;grid-template-columns:40px 1fr 90px 64px;gap:6px;padding:8px 12px;' +
        'background:var(--bg-primary);border-bottom:1px solid var(--border);">' +
        '<span style="font-size:0.58rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;">#</span>' +
        '<span style="font-size:0.58rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Bender</span>' +
        '<span style="font-size:0.58rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;text-align:center;">Progress</span>' +
        '<span style="font-size:0.58rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;text-align:right;">Cards</span>' +
      '</div>' +

      /* Rows */
      sorted.slice(0, 25).map(function (row, i) {
        var count = row[col] || 0;
        var pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        var isMe  = _userId && row.user_id === _userId;
        var rank  = i < 3 ? medals[i] : (i + 1);

        // Tiny avatar
        var avatarCard = row.avatar_card_number
          ? (allCards.find(function (c) { return c.number === String(row.avatar_card_number); }) || null)
          : null;
        var avatar = avatarCard && avatarCard.imageLink
          ? '<div style="width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-primary);position:relative;">' +
              '<img src="' + esc(avatarCard.imageLink) + '" style="position:absolute;width:185%;height:auto;' +
                'left:' + (row.avatar_offset_x || -42) + '%;top:' + (row.avatar_offset_y || -6) + '%;pointer-events:none;" alt="">' +
            '</div>'
          : '<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--water),var(--zen));' +
              'display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:#fff;flex-shrink:0;">' +
              esc((row.username || '?').charAt(0).toUpperCase()) + '</div>';

        return '<div style="display:grid;grid-template-columns:40px 1fr 90px 64px;gap:6px;padding:10px 12px;' +
          'border-bottom:1px solid var(--border);align-items:center;' +
          (isMe ? 'background:rgba(74,125,255,0.06);' : '') + '">' +
          '<span style="text-align:center;font-family:\'Cinzel\',serif;font-size:' + (i < 3 ? '1rem' : '0.72rem') + ';font-weight:700;color:' + (i < 3 ? 'var(--promo)' : 'var(--text-muted)') + ';">' + rank + '</span>' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
            avatar +
            '<div style="min-width:0;">' +
              '<div style="font-size:0.78rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (isMe ? 'color:var(--accent);' : '') + '">' +
                esc(row.display_name || row.username) + (isMe ? ' <span style="font-size:0.6rem;color:var(--accent);">(you)</span>' : '') +
              '</div>' +
              (row.trainer_level ? '<div style="font-size:0.58rem;color:var(--text-muted);">Lv.' + row.trainer_level + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:center;">' +
            '<div style="height:4px;background:var(--bg-primary);border-radius:99px;overflow:hidden;margin-bottom:2px;">' +
              '<div style="height:100%;border-radius:99px;background:linear-gradient(90deg,var(--water),var(--zen));width:' + pct + '%;"></div>' +
            '</div>' +
            '<div style="font-size:0.56rem;color:var(--text-muted);">' + pct + '%</div>' +
          '</div>' +
          '<div style="text-align:right;font-family:\'Cinzel\',serif;font-size:0.78rem;font-weight:700;color:var(--text-primary);">' + count + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  window.loadLeaderboard = loadLeaderboard;

  // ── Keyframe injection ─────────────────────────────────────────
  function injectKeyframes() {
    if (document.getElementById('progKeyframes')) return;
    var s = document.createElement('style');
    s.id = 'progKeyframes';
    s.textContent = [
      '@keyframes progBounce{from{transform:translate(-50%,-50%) scale(0.45);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC HOOKS
  // ══════════════════════════════════════════════════════════════

  /** Called by modified socialOnLogin (in social.js) */
  window.progressionOnLogin = function (userId, profile) {
    _userId      = userId;
    _userProfile = profile;
    handleDailyLogin(userId);
    loadScarcityData().then(function () { injectScarcityOnModal(); });
    if (profile) checkAndGrantAchievements(userId, profile);
    window._currentLbUserId = userId;
  };

  /** Exposed so social.js refreshProfileDisplay can call it */
  window.progressionRenderCard = renderProgressionCard;

  /** For leaderboard tab click (wired in HTML) */
  window.progressionLoadLeaderboard = loadLeaderboard;

  // ── Auto-load scarcity on page start (works for anonymous users too) ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadScarcityData(); });
  } else {
    loadScarcityData();
  }

  // Click delegation for leaderboard tab
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-nested-tab="leaderboard"]');
    if (btn) setTimeout(loadLeaderboard, 60);
  });

})();
