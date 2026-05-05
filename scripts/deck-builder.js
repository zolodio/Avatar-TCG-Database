  /* ═══════════════════════════════════════════════════════════════
     RANDOMIZER ENGINE
  ═══════════════════════════════════════════════════════════════ */
  function pickBestChamber(pool, strength) {
    var chambers = getChamberCards(pool);
    if (chambers.length === 0) return null;
    chambers.sort(function (a, b) { return chamberScore(b, strength) - chamberScore(a, strength); });
    var top = chambers.slice(0, Math.min(3, chambers.length));
    return top[Math.floor(Math.random() * top.length)];
  }

  /* φ = golden ratio — used for balanced deck type distribution */
  var PHI = 1.6180339887;

  function buildRandomDeck(opts) {
    var pool       = getPoolCards();
    var strength   = opts.strength   || 'random';
    var deckSize   = opts.deckSize   || 'full';
    var customSize = opts.customSize || 60;
    var target     = deckSize === 'full' ? 60 : deckSize === 'half' ? 30 : customSize;
    var chamber    = opts.chamber || pickBestChamber(pool, strength);
    if (!chamber) return null;

    /* compatible  = shares chamber traits (always preferred)
       fullStandard = entire pool, no trait filter (fallback for any gap) */
    var compatible   = getStandardCards(pool).filter(function (c) {
      return isCompatibleWithChamber(c, chamber);
    });
    var fullStandard = getStandardCards(pool);

    if (fullStandard.length === 0) return null;

    var selectedCards = {};
    var totalAdded    = 0;

    /* ── Shared helpers ──────────────────────────────────────── */

    function sortedByScore(cards) {
      return cards.slice().sort(function (a, b) {
        return cardScore(b, strength) - cardScore(a, strength);
      });
    }

    /* Add from a sorted card list up to an absolute `quota`. */
    function fillQuota(typeCards, quota) {
      var sorted  = sortedByScore(typeCards);
      var topTier = Math.ceil(sorted.length * 0.3);
      var midTier = Math.ceil(sorted.length * 0.6);
      for (var i = 0; i < sorted.length && totalAdded < quota; i++) {
        var c      = sorted[i];
        var cur    = selectedCards[c.number] || 0;
        var maxC   = Math.min(
          i < topTier ? 4 : i < midTier ? 2 : 1,
          maxCopiesForCard(c.number)
        );
        var canAdd = Math.min(maxC - cur, quota - totalAdded);
        if (canAdd > 0) { selectedCards[c.number] = cur + canAdd; totalAdded += canAdd; }
      }
    }

    /* Try compatible cards for a quota; fall back to full pool if still short. */
    function fillQuotaWithFallback(compatCards, fallbackCards, quota) {
      fillQuota(compatCards, quota);
      if (totalAdded < quota) {
        var extras = fallbackCards.filter(function (c) {
          return (selectedCards[c.number] || 0) < maxCopiesForCard(c.number);
        });
        fillQuota(extras, quota);
      }
    }

    /* Fill all remaining slots to `target`.
       Uses compatible cards first (by score), then falls back to full pool,
       then does a safety top-up cycle. Shared by ALL strength paths. */
    function fillRemainder() {
      if (totalAdded >= target) return;

      /* Pass 1 — compatible pool */
      var sorted1 = sortedByScore(compatible);
      for (var i = 0; i < sorted1.length && totalAdded < target; i++) {
        var c1   = sorted1[i];
        var cur1 = selectedCards[c1.number] || 0;
        var mx1  = maxCopiesForCard(c1.number);
        var add1 = Math.min(mx1 - cur1, target - totalAdded);
        if (add1 > 0) { selectedCards[c1.number] = cur1 + add1; totalAdded += add1; }
      }

      /* Pass 2 — full pool fallback */
      if (totalAdded < target) {
        var sorted2 = sortedByScore(fullStandard);
        for (var j = 0; j < sorted2.length && totalAdded < target; j++) {
          var c2   = sorted2[j];
          var cur2 = selectedCards[c2.number] || 0;
          var mx2  = maxCopiesForCard(c2.number);
          var add2 = Math.min(mx2 - cur2, target - totalAdded);
          if (add2 > 0) { selectedCards[c2.number] = cur2 + add2; totalAdded += add2; }
        }
      }

      /* Pass 3 — safety top-up cycle */
      var all  = fullStandard;
      var pass = 0;
      while (totalAdded < target && pass < all.length * MAX_COPIES) {
        var sc  = all[pass % all.length];
        var cur = selectedCards[sc.number] || 0;
        var mx  = maxCopiesForCard(sc.number);
        if (cur < mx) { selectedCards[sc.number] = cur + 1; totalAdded++; }
        pass++;
      }
    }

    /* Convenience: filter a card list by type */
    function byType(cards, t) {
      return cards.filter(function (c) { return c.type === t; });
    }

    /* ── ATTACK ──────────────────────────────────────────────────
       ≥20 high-force cards (top third by force stat).
    ──────────────────────────────────────────────────────────── */
    if (strength === 'attack') {
      function topByForce(cards) {
        return cards.slice()
          .sort(function (a, b) { return (parseFloat(b.force)||0) - (parseFloat(a.force)||0); })
          .slice(0, Math.ceil(cards.length / 3));
      }
      fillQuotaWithFallback(topByForce(compatible), topByForce(fullStandard), Math.min(20, target));
      fillRemainder();

    /* ── DEFENSE ─────────────────────────────────────────────────
       ≥20 high-intercept cards (top third by intercept stat).
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'defense') {
      function topByIntercept(cards) {
        return cards.slice()
          .sort(function (a, b) { return (parseFloat(b.intercept)||0) - (parseFloat(a.intercept)||0); })
          .slice(0, Math.ceil(cards.length / 3));
      }
      fillQuotaWithFallback(topByIntercept(compatible), topByIntercept(fullStandard), Math.min(20, target));
      fillRemainder();

    /* ── BALANCED ────────────────────────────────────────────────
       Golden-ratio split  Strike(φ²) : Advantage(φ) : Ally(1)
         ~50% strikes  |  ~31% advantage  |  ~19% allies
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'balanced') {
      var PHI2       = PHI * PHI;
      var totalRatio = PHI2 + PHI + 1;

      var minStrikesB   = Math.round(target * (PHI2 / totalRatio));
      var minAdvantageB = Math.round(target * (PHI  / totalRatio));
      var minAlliesB    = Math.round(target * (1    / totalRatio));

      fillQuotaWithFallback(byType(compatible,'strike'),    byType(fullStandard,'strike'),    Math.min(minStrikesB, target));
      fillQuotaWithFallback(byType(compatible,'advantage'), byType(fullStandard,'advantage'), Math.min(totalAdded + minAdvantageB, target));
      fillQuotaWithFallback(byType(compatible,'ally'),      byType(fullStandard,'ally'),      Math.min(totalAdded + minAlliesB,    target));
      fillRemainder();

    /* ── SUPPORT ─────────────────────────────────────────────────
       ≥50% strikes  |  ≥25% allies  |  ≥5 advantage
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'support') {
      var minStrikesS   = Math.ceil(target * 0.50);
      var minAlliesS    = Math.ceil(target * 0.25);
      var minAdvantageS = 5;

      fillQuotaWithFallback(byType(compatible,'strike'),    byType(fullStandard,'strike'),    Math.min(minStrikesS, target));
      fillQuotaWithFallback(byType(compatible,'ally'),      byType(fullStandard,'ally'),      Math.min(totalAdded + minAlliesS,    target));
      fillQuotaWithFallback(byType(compatible,'advantage'), byType(fullStandard,'advantage'), Math.min(totalAdded + minAdvantageS, target));
      fillRemainder();

    /* ── ALL OTHER STRENGTHS (random, energy, chamber, wild) ─────
       Greedy score fill — compatible cards first, full pool fallback,
       then safety top-up. Same fallback guarantee as quota strengths.
    ──────────────────────────────────────────────────────────── */
    } else {
      var src     = sortedByScore(compatible);
      var topTier = Math.ceil(src.length * 0.3);
      var midTier = Math.ceil(src.length * 0.6);

      /* Pass 1 — compatible pool with tier-based copy limits */
      for (var i = 0; i < src.length && totalAdded < target; i++) {
        var c    = src[i];
        var maxC = Math.min(
          strength === 'random' ? (1 + Math.floor(Math.random() * MAX_COPIES)) :
            i < topTier ? 4 : i < midTier ? 2 : 1,
          maxCopiesForCard(c.number),
          target - totalAdded
        );
        if (maxC > 0) { selectedCards[c.number] = maxC; totalAdded += maxC; }
      }

      /* Pass 2 — full pool fallback if compatible cards ran dry */
      if (totalAdded < target) {
        var src2     = sortedByScore(fullStandard);
        var topTier2 = Math.ceil(src2.length * 0.3);
        var midTier2 = Math.ceil(src2.length * 0.6);
        for (var k = 0; k < src2.length && totalAdded < target; k++) {
          var c2    = src2[k];
          var cur2  = selectedCards[c2.number] || 0;
          var maxC2 = Math.min(
            strength === 'random' ? (1 + Math.floor(Math.random() * MAX_COPIES)) :
              k < topTier2 ? 4 : k < midTier2 ? 2 : 1,
            maxCopiesForCard(c2.number)
          );
          var add2 = Math.min(maxC2 - cur2, target - totalAdded);
          if (add2 > 0) { selectedCards[c2.number] = cur2 + add2; totalAdded += add2; }
        }
      }

      /* Pass 3 — safety top-up cycle */
      var pass = 0;
      while (totalAdded < target && pass < fullStandard.length * MAX_COPIES) {
        var sc  = fullStandard[pass % fullStandard.length];
        var cur = selectedCards[sc.number] || 0;
        var mx  = maxCopiesForCard(sc.number);
        if (cur < mx) { selectedCards[sc.number] = cur + 1; totalAdded++; }
        pass++;
      }
    }

    return {
      id:         'deck_' + Date.now(),
      name:       opts.name || 'Randomized Deck',
      chamber:    chamber.number,
      cards:      selectedCards,
      deckSize:   deckSize,
      customSize: customSize,
      strength:   strength,
      pool:       S.pool,
      created:    Date.now()
    };
  }
