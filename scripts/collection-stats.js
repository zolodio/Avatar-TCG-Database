/* ═══════════════════════════════════════════════════════════════════════
   collection-stats.js  —  Avatar Quick Strike TCG Database
   Rich statistics dashboard for Physical and Digital collection tabs.
   Renders into: #phys-stats-dashboard  and  #digital-stats-dashboard
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Color palette matching the site's CSS variables ── */
  var C = {
    common:     '#8b8fa8',
    uncommon:   '#5cb85c',
    rare:       '#2e8ce8',
    zenemental: '#b44ddf',
    promo:      '#e8b632',
    fire:       '#e8532e',
    water:      '#2e8ce8',
    earth:      '#5cb85c',
    air:        '#f0c946',
    bg:         '#171c30',
    bgDark:     '#0a0c14',
    border:     '#252a42',
    text:       '#e8e6f0',
    muted:      '#5a5e78',
    accent:     '#4a7dff',
    zen:        '#b44ddf',
  };

  var RARITY_ORDER = ['common','uncommon','rare','zenemental','promo'];
  var RARITY_LABELS = { common:'Common', uncommon:'Uncommon', rare:'Rare', zenemental:'Zenemental', promo:'Promo' };
  var TYPE_ICONS = { strike:'⚔️', advantage:'🌟', ally:'🤝', chamber:'🔮', location:'🗺️', event:'⚡' };

  /* ─────────────────────────────────────────────────────────────
     PUBLIC: called by updateStats / updateDigitalStats whenever
     the collection changes. Mode = 'physical' | 'digital'
  ───────────────────────────────────────────────────────────── */
  window.refreshCollectionStatsDashboard = function (mode) {
    var dashId = mode === 'digital' ? 'digital-stats-dashboard' : 'phys-stats-dashboard';
    var dash   = document.getElementById(dashId);
    if (!dash) return;

    // Only fully render if this subtab is currently visible
    var tabId  = mode === 'digital' ? 'nested-digital-stats' : 'nested-phys-stats';
    var tabEl  = document.getElementById(tabId);
    if (!tabEl || tabEl.style.display === 'none') {
      dash.dataset.dirty = '1'; // mark as needing refresh when opened
      return;
    }

    renderDashboard(mode, dash);
  };

  /* Also render when a stats subtab is clicked (catch tab switch) */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-nested-tab]');
    if (!btn) return;
    var t = btn.getAttribute('data-nested-tab');
    if (t === 'phys-stats' || t === 'digital-stats') {
      var mode   = (t === 'digital-stats') ? 'digital' : 'physical';
      var dashId = mode === 'digital' ? 'digital-stats-dashboard' : 'phys-stats-dashboard';
      var dash   = document.getElementById(dashId);
      if (dash) {
        // Small delay so display:none is lifted first
        setTimeout(function () { renderDashboard(mode, dash); }, 40);
      }
    }
  });

  /* ─────────────────────────────────────────────────────────────
     DATA HELPERS
  ───────────────────────────────────────────────────────────── */
  function getPhysData() {
    var allCards   = window.allCards || [];
    var collection = window.collection || {};
    var timestamps = window.collectionTimestamps || {};
    var prices     = window.cardPrices || {};

    var ownedNums  = Object.keys(collection).filter(function (n) { return (collection[n] || 0) > 0; });

    // Rarity breakdown
    var byRarity = {};
    RARITY_ORDER.forEach(function (r) { byRarity[r] = { total:0, owned:0 }; });
    allCards.forEach(function (c) {
      if (byRarity[c.rarity]) {
        byRarity[c.rarity].total++;
        if ((collection[c.number] || 0) > 0) byRarity[c.rarity].owned++;
      }
    });

    // Type breakdown (owned only)
    var byType = {};
    allCards.forEach(function (c) {
      if ((collection[c.number] || 0) > 0) {
        byType[c.type] = (byType[c.type] || 0) + 1;
      }
    });

    // Quantity distribution (how many copies of each owned)
    var qtyDist = { 1:0, 2:0, 3:0, '4+':0 };
    ownedNums.forEach(function (n) {
      var q = collection[n] || 0;
      if (q === 1) qtyDist[1]++;
      else if (q === 2) qtyDist[2]++;
      else if (q === 3) qtyDist[3]++;
      else qtyDist['4+']++;
    });

    // Acquisition timeline (cards added per week)
    var timeline = buildTimeline(Object.keys(timestamps).map(function (n) {
      return { num: n, ts: new Date(timestamps[n]).getTime() };
    }));

    // Estimated collection value
    var totalValue = 0;
    ownedNums.forEach(function (n) {
      var p = prices[n];
      if (p && p.avg) totalValue += p.avg * (collection[n] || 0);
    });

    // Duplicates
    var totalCopies = 0;
    var totalUnique = 0;
    ownedNums.forEach(function (n) { totalCopies += (collection[n] || 0); totalUnique++; });
    var duplicates  = totalCopies - totalUnique;

    // Most duplicated cards
    var topDups = ownedNums
      .filter(function (n) { return (collection[n] || 0) > 1; })
      .sort(function (a, b) { return (collection[b] || 0) - (collection[a] || 0); })
      .slice(0, 5)
      .map(function (n) {
        var c = allCards.find(function (x) { return x.number === n; });
        return { name: c ? c.name : '#'+n, qty: collection[n], rarity: c ? c.rarity : 'common' };
      });

    // Completion projection
    var coreOwned   = ownedNums.filter(function (n) { var nn = parseInt(n,10); return nn >= 1 && nn <= 248; }).length;
    var coreTotal   = 248;
    var projection  = projectCompletion(timeline, coreOwned, coreTotal);

    // Per-element breakdown (fire/water/earth/air based on card name or type clues)
    // We use rarity-weighted score for "power" index
    var powerIndex  = coreOwned > 0 ? Math.round((byRarity.zenemental.owned * 4 + byRarity.rare.owned * 2 + byRarity.uncommon.owned * 1.2 + byRarity.common.owned) / (coreOwned || 1) * 25) : 0;

    return {
      byRarity, byType, qtyDist, timeline, totalValue,
      totalCopies, totalUnique, duplicates, topDups,
      coreOwned, coreTotal, projection, powerIndex,
      allCards, collection
    };
  }

  function getDigiData() {
    var allCards = window.allCards || [];
    var dc       = window.aqstDigitalCollection || {};

    var ownedNums = Object.keys(dc).filter(function (n) { return dc[n] && dc[n].qty > 0; });

    // Rarity breakdown
    var byRarity = {};
    RARITY_ORDER.forEach(function (r) { byRarity[r] = { total:0, owned:0, totalQty:0 }; });
    allCards.forEach(function (c) {
      if (byRarity[c.rarity]) {
        byRarity[c.rarity].total++;
        if (dc[c.number] && dc[c.number].qty > 0) {
          byRarity[c.rarity].owned++;
          byRarity[c.rarity].totalQty += dc[c.number].qty;
        }
      }
    });

    // Type breakdown
    var byType = {};
    allCards.forEach(function (c) {
      if (dc[c.number] && dc[c.number].qty > 0) {
        byType[c.type] = (byType[c.type] || 0) + dc[c.number].qty;
      }
    });

    // Qty distribution
    var qtyDist = { 1:0, 2:0, 3:0, '4+':0 };
    ownedNums.forEach(function (n) {
      var q = dc[n].qty || 0;
      if (q === 1) qtyDist[1]++;
      else if (q === 2) qtyDist[2]++;
      else if (q === 3) qtyDist[3]++;
      else qtyDist['4+']++;
    });

    // Acquisition timeline
    var tsPairs = ownedNums.map(function (n) {
      return { num: n, ts: dc[n].firstAcquired || dc[n].lastAcquired || 0 };
    }).filter(function (x) { return x.ts > 0; });
    var timeline = buildTimeline(tsPairs);

    // Totals
    var totalCopies = 0;
    ownedNums.forEach(function (n) { totalCopies += (dc[n].qty || 0); });
    var totalUnique = ownedNums.length;
    var duplicates  = totalCopies - totalUnique;

    var coreOwned   = ownedNums.filter(function (n) { var nn = parseInt(n,10); return nn >= 1 && nn <= 248; }).length;
    var coreTotal   = 248;
    var projection  = projectCompletion(timeline, coreOwned, coreTotal);

    // Most collected
    var topCards = ownedNums
      .sort(function (a, b) { return (dc[b].qty||0) - (dc[a].qty||0); })
      .slice(0, 5)
      .map(function (n) {
        var c = allCards.find(function (x) { return x.number === n; });
        return { name: c ? c.name : '#'+n, qty: dc[n].qty, rarity: c ? c.rarity : 'common' };
      });

    return {
      byRarity, byType, qtyDist, timeline, totalCopies, totalUnique,
      duplicates, topCards, coreOwned, coreTotal, projection, dc, allCards
    };
  }

  /* Build weekly acquisition timeline */
  function buildTimeline(tsPairs) {
    if (!tsPairs.length) return [];
    var sorted = tsPairs.slice().sort(function (a, b) { return a.ts - b.ts; });
    var first  = sorted[0].ts;
    var last   = Date.now();
    var weeks  = [];
    var cursor = startOfWeek(first);
    while (cursor <= last + 7 * 86400000) {
      weeks.push({ week: cursor, count: 0, cumulative: 0 });
      cursor += 7 * 86400000;
    }
    sorted.forEach(function (p) {
      var wi = Math.floor((startOfWeek(p.ts) - startOfWeek(first)) / (7 * 86400000));
      if (weeks[wi]) weeks[wi].count++;
    });
    var cum = 0;
    weeks.forEach(function (w) { cum += w.count; w.cumulative = cum; });
    return weeks;
  }

  function startOfWeek(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  }

  /* Linear regression projection to completion */
  function projectCompletion(timeline, owned, total) {
    if (!timeline.length || owned >= total) return null;
    if (timeline.length < 2) return null;
    var n  = timeline.length;
    var xs = timeline.map(function (_, i) { return i; });
    var ys = timeline.map(function (w) { return w.cumulative; });
    var xm = xs.reduce(function (a, b) { return a + b; }, 0) / n;
    var ym = ys.reduce(function (a, b) { return a + b; }, 0) / n;
    var num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (xs[i] - xm) * (ys[i] - ym); den += (xs[i] - xm) * (xs[i] - xm); }
    if (!den) return null;
    var slope = num / den; // cards per week
    if (slope <= 0) return null;
    var remaining   = total - owned;
    var weeksLeft   = remaining / slope;
    var targetDate  = new Date(Date.now() + weeksLeft * 7 * 86400000);
    return { weeksLeft: Math.round(weeksLeft), targetDate: targetDate, ratePerWeek: Math.round(slope * 10) / 10 };
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────── */
  function renderDashboard(mode, dash) {
    var d = mode === 'digital' ? getDigiData() : getPhysData();
    var isDigital = mode === 'digital';

    var html = '';

    /* ── Section 1: Hero metrics row ── */
    html += section('📊 Overview', renderHeroMetrics(d, isDigital));

    /* ── Section 2: Rarity breakdown bar + donut ── */
    html += section('💎 Rarity Breakdown', renderRaritySection(d));

    /* ── Section 3: Type distribution ── */
    if (Object.keys(d.byType).length) {
      html += section('🃏 Card Types', renderTypeChart(d.byType));
    }

    /* ── Section 4: Acquisition timeline ── */
    if (d.timeline && d.timeline.length > 1) {
      html += section('📅 Acquisition Timeline', renderTimeline(d.timeline));
    }

    /* ── Section 5: Quantity distribution ── */
    html += section('📦 Copy Distribution', renderQtyDist(d.qtyDist));

    /* ── Section 6: Completion projection ── */
    html += section('🎯 Completion Projection', renderProjection(d, isDigital));

    /* ── Section 7: Physical-only: estimated value ── */
    if (!isDigital && d.totalValue > 0) {
      html += section('💰 Estimated Value', renderValue(d));
    }

    /* ── Section 8: Top duplicated / most-collected cards ── */
    var topList = isDigital ? d.topCards : d.topDups;
    if (topList && topList.length) {
      var topTitle = isDigital ? '⭐ Most Collected' : '♻️ Most Duplicated';
      html += section(topTitle, renderTopCards(topList, isDigital));
    }

    /* ── Section 9: Power / Rarity score ── */
    if (!isDigital) {
      html += section('⚡ Collection Power Index', renderPowerIndex(d));
    }

    /* ── Section 10: Missing rarity checklist ── */
    html += section('🔍 What\'s Missing?', renderMissingByRarity(d, isDigital));

    dash.innerHTML = html;
    // Wire any chart canvases
    requestAnimationFrame(function () { drawAllCharts(dash, d); });
  }

  /* ─────────────────────────────────────────────────────────────
     SECTION WRAPPER
  ───────────────────────────────────────────────────────────── */
  function section(title, content) {
    return (
      '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:14px;">' +
        '<div style="font-family:\'Cinzel\',serif;font-weight:700;font-size:0.88rem;color:var(--text-primary);margin-bottom:14px;display:flex;align-items:center;gap:8px;">' +
          title +
        '</div>' +
        content +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────────────────────
     HERO METRICS
  ───────────────────────────────────────────────────────────── */
  function renderHeroMetrics(d, isDigital) {
    var pct = d.coreTotal > 0 ? Math.round((d.coreOwned / d.coreTotal) * 100) : 0;
    var metrics = [
      { val: d.coreOwned + ' / ' + d.coreTotal, label: 'Core Owned', color: 'var(--zen)' },
      { val: pct + '%',                          label: 'Complete',   color: pct >= 75 ? 'var(--earth)' : pct >= 40 ? 'var(--water)' : 'var(--fire)' },
      { val: d.totalUnique,                      label: 'Unique',     color: 'var(--accent)' },
      { val: d.totalCopies,                      label: 'Total Copies', color: 'var(--promo)' },
      { val: d.duplicates,                       label: 'Extras',     color: 'var(--text-secondary)' },
    ];

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;">';
    metrics.forEach(function (m) {
      html +=
        '<div style="background:var(--bg-surface);border:1px solid var(--border-light);border-radius:10px;padding:14px 10px;text-align:center;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1.3rem;font-weight:700;color:' + m.color + ';line-height:1.1;">' + m.val + '</div>' +
          '<div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.09em;color:var(--text-muted);margin-top:5px;">' + m.label + '</div>' +
        '</div>';
    });
    html += '</div>';

    // Master progress bar
    var fillColor = pct >= 75 ? C.earth : pct >= 40 ? C.water : C.zen;
    html +=
      '<div style="margin-top:14px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-bottom:5px;">' +
          '<span>Core Set Progress</span><span style="color:' + fillColor + ';font-weight:700;">' + pct + '% complete</span>' +
        '</div>' +
        '<div style="background:var(--bg-surface);border-radius:99px;height:10px;overflow:hidden;border:1px solid var(--border);">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + fillColor + ',' + fillColor + 'cc);border-radius:99px;transition:width 0.6s ease;"></div>' +
        '</div>' +
      '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     RARITY BREAKDOWN
  ───────────────────────────────────────────────────────────── */
  function renderRaritySection(d) {
    var html = '<canvas id="cs-rarity-canvas" height="180" style="width:100%;display:block;"></canvas>';

    // Segmented bar beneath
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:14px;">';
    RARITY_ORDER.forEach(function (r) {
      var br   = d.byRarity[r];
      var pct  = br.total > 0 ? Math.round((br.owned / br.total) * 100) : 0;
      var col  = C[r] || C.common;
      html +=
        '<div style="text-align:center;">' +
          '<div style="background:var(--bg-surface);border-radius:8px;overflow:hidden;height:6px;margin-bottom:5px;border:1px solid var(--border);">' +
            '<div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:8px;transition:width 0.5s;"></div>' +
          '</div>' +
          '<div style="font-size:0.68rem;font-weight:700;color:' + col + ';">' + br.owned + '<span style="color:var(--text-muted);font-weight:400;">/' + br.total + '</span></div>' +
          '<div style="font-size:0.55rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-top:2px;">' + RARITY_LABELS[r].slice(0,3) + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     TYPE CHART (horizontal bars)
  ───────────────────────────────────────────────────────────── */
  function renderTypeChart(byType) {
    var entries = Object.entries(byType).sort(function (a, b) { return b[1] - a[1]; });
    var max     = entries[0] ? entries[0][1] : 1;
    var typeColors = { strike: C.fire, advantage: C.earth, ally: C.water, chamber: C.zen, location: C.air, event: C.promo };

    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    entries.forEach(function (e) {
      var type  = e[0], count = e[1];
      var color = typeColors[type] || C.accent;
      var w     = Math.max(4, Math.round((count / max) * 100));
      var icon  = TYPE_ICONS[type] || '🃏';
      html +=
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:80px;font-size:0.72rem;color:var(--text-secondary);text-align:right;flex-shrink:0;white-space:nowrap;">' + icon + ' ' + type + '</div>' +
          '<div style="flex:1;background:var(--bg-surface);border-radius:99px;height:20px;overflow:hidden;border:1px solid var(--border);position:relative;">' +
            '<div style="height:100%;width:' + w + '%;background:linear-gradient(90deg,' + color + '33,' + color + '66);border-radius:99px;transition:width 0.5s;display:flex;align-items:center;padding:0 8px;">' +
            '</div>' +
          '</div>' +
          '<div style="width:30px;font-size:0.72rem;font-weight:700;color:' + color + ';flex-shrink:0;text-align:right;">' + count + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     TIMELINE  (sparkline via canvas)
  ───────────────────────────────────────────────────────────── */
  function renderTimeline(timeline) {
    // Only show last 26 weeks max
    var recent = timeline.slice(-26);
    var html =
      '<canvas id="cs-timeline-canvas" height="140" style="width:100%;display:block;"></canvas>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-muted);margin-top:6px;">' +
        '<span>' + fmtWeek(recent[0] ? recent[0].week : Date.now()) + '</span>' +
        '<span>Now</span>' +
      '</div>';

    // Week with most adds
    var peakWeek = recent.reduce(function (a, b) { return b.count > a.count ? b : a; }, recent[0] || { count:0, week:0 });
    if (peakWeek.count > 0) {
      html +=
        '<div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;">' +
          statPill('Peak week', peakWeek.count + ' cards', C.zen) +
          statPill('Total timeline', recent[recent.length-1] ? recent[recent.length-1].cumulative + ' cards' : '—', C.accent) +
          statPill('Weeks tracked', recent.length, C.earth) +
        '</div>';
    }
    return html;
  }

  function fmtWeek(ts) {
    var d = new Date(ts);
    return (d.getMonth()+1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
  }

  /* ─────────────────────────────────────────────────────────────
     QUANTITY DISTRIBUTION
  ───────────────────────────────────────────────────────────── */
  function renderQtyDist(qtyDist) {
    var entries = [
      { label:'1 copy',  val: qtyDist[1],    color: C.common },
      { label:'2 copies',val: qtyDist[2],    color: C.uncommon },
      { label:'3 copies',val: qtyDist[3],    color: C.water },
      { label:'4+ copies',val: qtyDist['4+'], color: C.zen },
    ];
    var total = entries.reduce(function (s, e) { return s + e.val; }, 0) || 1;

    var html = '<div style="display:flex;gap:6px;margin-bottom:12px;">';
    entries.forEach(function (e) {
      var w = Math.round((e.val / total) * 100);
      if (w > 0) {
        html += '<div style="height:28px;width:' + w + '%;background:' + e.color + '55;border:1px solid ' + e.color + ';border-radius:6px;transition:width 0.5s;" title="' + e.label + ': ' + e.val + '"></div>';
      }
    });
    html += '</div><div style="display:flex;flex-wrap:wrap;gap:8px;">';
    entries.forEach(function (e) {
      html +=
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<div style="width:10px;height:10px;border-radius:3px;background:' + e.color + ';flex-shrink:0;"></div>' +
          '<span style="font-size:0.7rem;color:var(--text-secondary);">' + e.label + ': </span>' +
          '<span style="font-size:0.7rem;font-weight:700;color:var(--text-primary);">' + e.val + '</span>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     COMPLETION PROJECTION
  ───────────────────────────────────────────────────────────── */
  function renderProjection(d, isDigital) {
    var p = d.projection;
    if (!p) {
      if (d.coreOwned >= d.coreTotal) {
        return '<div style="text-align:center;padding:20px;">' +
          '<div style="font-size:2rem;margin-bottom:8px;">🏆</div>' +
          '<div style="font-family:\'Cinzel\',serif;font-size:1rem;color:var(--earth);">Core Set Complete!</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">All 248 core cards collected.</div>' +
        '</div>';
      }
      return '<div style="color:var(--text-muted);font-size:0.8rem;padding:10px 0;">Not enough data yet — add more cards to see a projection.</div>';
    }

    var eta = p.targetDate;
    var etaStr = eta.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    var remaining = d.coreTotal - d.coreOwned;

    var html =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px;">' +
        statCard('Cards Needed', remaining, C.fire) +
        statCard('Rate', p.ratePerWeek + '/wk', C.water) +
        statCard('Weeks Left', p.weeksLeft, C.earth) +
        statCard('ETA', etaStr, C.zen) +
      '</div>';

    // Projected progress bar over time
    var pct = Math.round((d.coreOwned / d.coreTotal) * 100);
    html +=
      '<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:14px;">' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">Projected completion curve</div>' +
        '<div style="position:relative;background:var(--bg-primary);border-radius:8px;height:36px;overflow:hidden;border:1px solid var(--border);">' +
          '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pct + '%;background:linear-gradient(90deg,' + C.zen + '33,' + C.zen + '66);"></div>' +
          '<div style="position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(90deg,transparent ' + pct + '%, ' + C.accent + '22 ' + pct + '%);"></div>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:var(--text-primary);">' +
            pct + '% now → 100% by ' + etaStr +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.6rem;color:var(--text-muted);">' +
          '<span>Today</span><span>' + etaStr + '</span>' +
        '</div>' +
      '</div>';

    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     ESTIMATED VALUE (physical only)
  ───────────────────────────────────────────────────────────── */
  function renderValue(d) {
    var allCards   = d.allCards || [];
    var collection = d.collection || {};
    var prices     = window.cardPrices || {};

    // Top valued cards
    var valued = [];
    allCards.forEach(function (c) {
      var qty = collection[c.number] || 0;
      if (qty > 0) {
        var p = prices[c.number];
        if (p && p.avg) valued.push({ name: c.name, rarity: c.rarity, avg: p.avg, qty: qty, total: p.avg * qty });
      }
    });
    valued.sort(function (a, b) { return b.total - a.total; });
    var top5 = valued.slice(0, 5);

    var html =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:14px;">' +
        statCard('Est. Total', '$' + d.totalValue.toFixed(2), C.air) +
        statCard('Avg/Card', '$' + (d.totalValue / (d.totalUnique||1)).toFixed(2), C.promo) +
        statCard('Cards Priced', valued.length, C.earth) +
      '</div>';

    if (top5.length) {
      html += '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:8px;">Top value cards</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      top5.forEach(function (v) {
        var col = C[v.rarity] || C.common;
        html +=
          '<div style="display:flex;align-items:center;gap:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;"></div>' +
            '<div style="flex:1;font-size:0.75rem;color:var(--text-primary);font-weight:600;">' + v.name + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);">x' + v.qty + '</div>' +
            '<div style="font-size:0.78rem;font-weight:700;color:' + C.air + ';">$' + v.total.toFixed(2) + '</div>' +
          '</div>';
      });
      html += '</div>';
    }
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     TOP CARDS
  ───────────────────────────────────────────────────────────── */
  function renderTopCards(list, isDigital) {
    var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
    list.forEach(function (item, i) {
      var col = C[item.rarity] || C.common;
      html +=
        '<div style="display:flex;align-items:center;gap:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">' +
          '<div style="font-family:\'Cinzel\',serif;font-size:0.7rem;color:var(--text-muted);width:18px;text-align:center;">' + (i+1) + '</div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;"></div>' +
          '<div style="flex:1;font-size:0.75rem;font-weight:600;color:var(--text-primary);">' + item.name + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:' + col + ';">x' + item.qty + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     POWER INDEX (physical only)
  ───────────────────────────────────────────────────────────── */
  function renderPowerIndex(d) {
    var zen   = d.byRarity.zenemental;
    var rare  = d.byRarity.rare;
    var uc    = d.byRarity.uncommon;
    var com   = d.byRarity.common;

    var score   = Math.min(100, Math.round(
      (zen.owned * 5 + rare.owned * 2.5 + uc.owned * 1.2 + com.owned * 0.4) /
      Math.max(1, zen.total * 5 + rare.total * 2.5 + uc.total * 1.2 + com.total * 0.4) * 100
    ));
    var rank    = score >= 85 ? 'Legend' : score >= 65 ? 'Master' : score >= 40 ? 'Adept' : score >= 20 ? 'Apprentice' : 'Novice';
    var rankCol = score >= 85 ? C.zen : score >= 65 ? C.water : score >= 40 ? C.earth : score >= 20 ? C.promo : C.common;

    var html =
      '<div style="text-align:center;margin-bottom:14px;">' +
        '<div style="font-family:\'Cinzel\',serif;font-size:2.8rem;font-weight:700;color:' + rankCol + ';filter:drop-shadow(0 0 12px ' + rankCol + '88);line-height:1;">' + score + '</div>' +
        '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);margin-top:4px;">out of 100</div>' +
        '<div style="display:inline-flex;align-items:center;gap:6px;background:' + rankCol + '22;border:1px solid ' + rankCol + '55;border-radius:99px;padding:5px 14px;margin-top:8px;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + rankCol + ';"></div>' +
          '<div style="font-size:0.75rem;font-weight:700;color:' + rankCol + ';">' + rank + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:var(--bg-surface);border-radius:99px;height:12px;overflow:hidden;border:1px solid var(--border);">' +
        '<div style="height:100%;width:' + score + '%;background:linear-gradient(90deg,' + rankCol + '88,' + rankCol + ');border-radius:99px;transition:width 0.8s ease;"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.58rem;color:var(--text-muted);">' +
        '<span>Novice</span><span>Apprentice</span><span>Adept</span><span>Master</span><span>Legend</span>' +
      '</div>';

    // Rarity contribution breakdown
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;">';
    [
      { label:'ZEN', count: zen.owned, total: zen.total, col: C.zenemental },
      { label:'R',   count: rare.owned, total: rare.total, col: C.rare },
      { label:'UC',  count: uc.owned,  total: uc.total,  col: C.uncommon },
      { label:'C',   count: com.owned, total: com.total,  col: C.common },
    ].forEach(function (x) {
      var p = x.total > 0 ? Math.round(x.count / x.total * 100) : 0;
      html +=
        '<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;">' +
          '<div style="font-size:0.78rem;font-weight:700;color:' + x.col + ';">' + p + '%</div>' +
          '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:2px;">' + x.label + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     MISSING BY RARITY
  ───────────────────────────────────────────────────────────── */
  function renderMissingByRarity(d, isDigital) {
    var allCards   = window.allCards || [];
    var owned      = isDigital
      ? function (num) { var dc = window.aqstDigitalCollection||{}; return dc[num] && dc[num].qty > 0; }
      : function (num) { var col = window.collection||{}; return (col[num]||0) > 0; };

    var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
    RARITY_ORDER.forEach(function (r) {
      var all     = allCards.filter(function (c) { return c.rarity === r; });
      var missing = all.filter(function (c) { return !owned(c.number); });
      var pct     = all.length > 0 ? Math.round(((all.length - missing.length) / all.length) * 100) : 0;
      var col     = C[r] || C.common;

      html +=
        '<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:12px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';"></div>' +
              '<span style="font-size:0.78rem;font-weight:700;color:' + col + ';">' + RARITY_LABELS[r] + '</span>' +
            '</div>' +
            '<span style="font-size:0.7rem;color:var(--text-muted);">' + (all.length - missing.length) + ' / ' + all.length + ' &nbsp;·&nbsp; <strong style="color:' + col + ';">' + pct + '%</strong></span>' +
          '</div>' +
          '<div style="background:var(--bg-primary);border-radius:99px;height:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:99px;transition:width 0.5s;"></div>' +
          '</div>' +
          (missing.length > 0 && missing.length <= 15
            ? '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">' +
                missing.map(function (c) {
                  return '<span style="font-size:0.6rem;background:' + col + '22;border:1px solid ' + col + '55;border-radius:4px;padding:2px 6px;color:var(--text-secondary);">#' + c.number + ' ' + c.name + '</span>';
                }).join('') +
              '</div>'
            : missing.length > 15
              ? '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;">' + missing.length + ' cards still needed</div>'
              : '<div style="font-size:0.65rem;color:var(--earth);margin-top:6px;">✓ All ' + RARITY_LABELS[r] + ' cards collected!</div>'
          ) +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────────
     CANVAS CHARTS
  ───────────────────────────────────────────────────────────── */
  function drawAllCharts(dash, d) {
    drawRarityDonut(dash, d);
    drawTimeline(dash, d);
  }

  function drawRarityDonut(dash, d) {
    var canvas = dash.querySelector('#cs-rarity-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var W   = canvas.offsetWidth || 300;
    var H   = 180;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    // Draw a horizontal stacked bar for simplicity and compactness
    var total = RARITY_ORDER.reduce(function (s, r) { return s + (d.byRarity[r].owned || 0); }, 0) || 1;
    var barY  = H / 2 - 14;
    var barH  = 28;
    var padX  = 16;
    var barW  = W - padX * 2;
    var x     = padX;

    // Background
    ctx.fillStyle = 'rgba(26,32,53,0.6)';
    roundRect(ctx, padX, barY, barW, barH, 10);
    ctx.fill();

    // Segments
    RARITY_ORDER.forEach(function (r) {
      var seg = (d.byRarity[r].owned / total) * barW;
      if (seg < 1) return;
      ctx.fillStyle = C[r] || C.common;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.rect(x, barY, seg, barH);
      ctx.fill();
      ctx.globalAlpha = 1;
      x += seg;
    });

    // Labels below
    var lx = padX;
    RARITY_ORDER.forEach(function (r) {
      var seg  = (d.byRarity[r].owned / total) * barW;
      var col  = C[r] || C.common;
      if (seg > 20) {
        ctx.fillStyle = col;
        ctx.font = 'bold 9px "Nunito Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.byRarity[r].owned, lx + seg / 2, barY + barH / 2 + 4);
      }
      lx += seg;
    });

    // Legend row
    var legX = padX;
    var legY = barY + barH + 20;
    ctx.font = '10px "Nunito Sans", sans-serif';
    RARITY_ORDER.forEach(function (r) {
      var col   = C[r] || C.common;
      var label = RARITY_LABELS[r].slice(0, 3).toUpperCase();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(legX + 5, legY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b8fa8';
      ctx.textAlign = 'left';
      ctx.fillText(label + ' ' + d.byRarity[r].owned + '/' + d.byRarity[r].total, legX + 12, legY + 4);
      legX += Math.max(60, (W - padX * 2) / 5);
    });
  }

  function drawTimeline(dash, d) {
    var canvas = dash.querySelector('#cs-timeline-canvas');
    if (!canvas || !d.timeline || d.timeline.length < 2) return;
    var ctx    = canvas.getContext('2d');
    var dpr    = window.devicePixelRatio || 1;
    var W      = canvas.offsetWidth || 300;
    var H      = 140;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    var data   = d.timeline.slice(-26);
    var maxCum = data[data.length - 1].cumulative || 1;
    var maxWk  = Math.max.apply(null, data.map(function (w) { return w.count; })) || 1;
    var padX   = 6, padY = 14, bH = H - padY * 2;
    var bW     = W - padX * 2;
    var nPts   = data.length;
    var step   = bW / Math.max(nPts - 1, 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(37,42,66,0.8)';
    ctx.lineWidth   = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (frac) {
      var y = padY + bH * (1 - frac);
      ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
    });

    // Bar chart (weekly new cards)
    var barW = Math.max(2, step * 0.6);
    data.forEach(function (w, i) {
      if (!w.count) return;
      var barH = (w.count / maxWk) * bH * 0.85;
      var bx   = padX + i * step - barW / 2;
      var by   = padY + bH - barH;
      ctx.fillStyle = C.zen + '55';
      roundRect(ctx, bx, by, barW, barH, 3);
      ctx.fill();
    });

    // Cumulative line
    ctx.beginPath();
    data.forEach(function (w, i) {
      var cx = padX + i * step;
      var cy = padY + bH * (1 - w.cumulative / maxCum);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.strokeStyle = C.water;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Dots at data points
    data.forEach(function (w, i) {
      if (!w.count) return;
      var cx = padX + i * step;
      var cy = padY + bH * (1 - w.cumulative / maxCum);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = C.water;
      ctx.fill();
    });

    // Labels
    ctx.font      = '9px "Nunito Sans", sans-serif';
    ctx.fillStyle = '#5a5e78';
    ctx.textAlign = 'right';
    ctx.fillText(maxCum, W - padX, padY + 4);
    ctx.fillText(Math.round(maxCum / 2), W - padX, padY + bH / 2 + 4);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ─────────────────────────────────────────────────────────────
     SMALL HELPERS
  ───────────────────────────────────────────────────────────── */
  function statCard(label, val, color) {
    return (
      '<div style="background:var(--bg-surface);border:1px solid var(--border-light);border-radius:10px;padding:12px 8px;text-align:center;">' +
        '<div style="font-family:\'Cinzel\',serif;font-size:1.05rem;font-weight:700;color:' + color + ';line-height:1.2;">' + val + '</div>' +
        '<div style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.09em;color:var(--text-muted);margin-top:4px;">' + label + '</div>' +
      '</div>'
    );
  }

  function statPill(label, val, color) {
    return (
      '<div style="display:flex;align-items:center;gap:6px;background:' + color + '1a;border:1px solid ' + color + '44;border-radius:99px;padding:4px 12px;">' +
        '<span style="font-size:0.65rem;color:var(--text-muted);">' + label + ':</span>' +
        '<span style="font-size:0.7rem;font-weight:700;color:' + color + ';">' + val + '</span>' +
      '</div>'
    );
  }

})();
