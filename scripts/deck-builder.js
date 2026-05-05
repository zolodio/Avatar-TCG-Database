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

    var standard = getStandardCards(pool).filter(function (c) {
      return isCompatibleWithChamber(c, chamber);
    });
    if (standard.length === 0) return null;

    var selectedCards = {};
    var totalAdded    = 0;

    /* ── Shared helpers ──────────────────────────────────────── */

    /* Sort a card array by cardScore for the current strength */
    function sortedByScore(cards) {
      return cards.slice().sort(function (a, b) {
        return cardScore(b, strength) - cardScore(a, strength);
      });
    }

    /* Fill up to `quota` total-cards-in-deck using cards from `typeCards`.
       Copies-per-card follow top/mid/tail tier limits (4 / 2 / 1). */
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

    /* Fill remaining slots up to `target` using the full pool sorted by score */
    function fillRemainder() {
      if (totalAdded >= target) return;
      var allSorted = sortedByScore(standard);
      for (var j = 0; j < allSorted.length && totalAdded < target; j++) {
        var ca   = allSorted[j];
        var curA = selectedCards[ca.number] || 0;
        var mxA  = maxCopiesForCard(ca.number);
        var addA = Math.min(mxA - curA, target - totalAdded);
        if (addA > 0) { selectedCards[ca.number] = curA + addA; totalAdded += addA; }
      }
      /* Safety top-up: cycle through all cards if still short */
      var pass = 0;
      while (totalAdded < target && pass < standard.length * MAX_COPIES) {
        var sc  = standard[pass % standard.length];
        var cur = selectedCards[sc.number] || 0;
        var mx  = maxCopiesForCard(sc.number);
        if (cur < mx) { selectedCards[sc.number] = cur + 1; totalAdded++; }
        pass++;
      }
    }

    /* ── ATTACK ──────────────────────────────────────────────────
       At least 20 high-force cards (top third by force value),
       remainder filled by attack score.
    ──────────────────────────────────────────────────────────── */
    if (strength === 'attack') {
      var MIN_HIGH_FORCE = 20;

      var byForce = standard.slice().sort(function (a, b) {
        return (parseFloat(b.force) || 0) - (parseFloat(a.force) || 0);
      });
      var highForceCards = byForce.slice(0, Math.ceil(byForce.length / 3));

      fillQuota(highForceCards, Math.min(MIN_HIGH_FORCE, target));
      fillRemainder();

    /* ── DEFENSE ─────────────────────────────────────────────────
       At least 20 high-intercept cards (top third by intercept),
       remainder filled by defense score.
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'defense') {
      var MIN_HIGH_INTERCEPT = 20;

      var byIntercept = standard.slice().sort(function (a, b) {
        return (parseFloat(b.intercept) || 0) - (parseFloat(a.intercept) || 0);
      });
      var highInterceptCards = byIntercept.slice(0, Math.ceil(byIntercept.length / 3));

      fillQuota(highInterceptCards, Math.min(MIN_HIGH_INTERCEPT, target));
      fillRemainder();

    /* ── BALANCED ────────────────────────────────────────────────
       Golden-ratio split: Strike (φ²) : Advantage (φ) : Ally (1)
         φ² ≈ 2.618  →  ~50% strikes
         φ  ≈ 1.618  →  ~31% advantage
         1           →  ~19% allies
       Remainder (rounding slack) filled by balanced score.
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'balanced') {
      var PHI2        = PHI * PHI;
      var totalRatio  = PHI2 + PHI + 1;

      var minStrikesB   = Math.round(target * (PHI2 / totalRatio));
      var minAdvantageB = Math.round(target * (PHI  / totalRatio));
      var minAlliesB    = Math.round(target * (1    / totalRatio));

      var strikesB   = standard.filter(function (c) { return c.type === 'strike';    });
      var advantageB = standard.filter(function (c) { return c.type === 'advantage'; });
      var alliesB    = standard.filter(function (c) { return c.type === 'ally';      });

      fillQuota(strikesB,   Math.min(minStrikesB, target));
      fillQuota(advantageB, Math.min(totalAdded + minAdvantageB, target));
      fillQuota(alliesB,    Math.min(totalAdded + minAlliesB,    target));
      fillRemainder();

    /* ── SUPPORT ─────────────────────────────────────────────────
       At least 50% strikes, 25% allies, 5 advantage cards.
    ──────────────────────────────────────────────────────────── */
    } else if (strength === 'support') {
      var minStrikesS   = Math.ceil(target * 0.50);
      var minAlliesS    = Math.ceil(target * 0.25);
      var minAdvantageS = 5;

      var strikesS   = standard.filter(function (c) { return c.type === 'strike';    });
      var alliesS    = standard.filter(function (c) { return c.type === 'ally';      });
      var advantageS = standard.filter(function (c) { return c.type === 'advantage'; });

      fillQuota(strikesS,   Math.min(minStrikesS, target));
      fillQuota(alliesS,    Math.min(totalAdded + minAlliesS,    target));
      fillQuota(advantageS, Math.min(totalAdded + minAdvantageS, target));
      fillRemainder();

    /* ── ALL OTHER STRENGTHS (random, energy, chamber, wild) ─────
       Original greedy-score logic, unchanged.
    ──────────────────────────────────────────────────────────── */
    } else {
      standard.sort(function (a, b) { return cardScore(b, strength) - cardScore(a, strength); });

      var topTier = Math.ceil(standard.length * 0.3);
      var midTier = Math.ceil(standard.length * 0.6);
      for (var i = 0; i < standard.length && totalAdded < target; i++) {
        var c    = standard[i];
        var maxC = Math.min(
          strength === 'random' ? (1 + Math.floor(Math.random() * MAX_COPIES)) :
            i < topTier ? 4 : i < midTier ? 2 : 1,
          maxCopiesForCard(c.number),
          target - totalAdded
        );
        if (maxC > 0) { selectedCards[c.number] = maxC; totalAdded += maxC; }
      }

      if (totalAdded < target) {
        var pass2 = 0;
        while (totalAdded < target && pass2 < standard.length * MAX_COPIES) {
          var card2 = standard[pass2 % standard.length];
          var cur2  = selectedCards[card2.number] || 0;
          var mx2   = maxCopiesForCard(card2.number);
          if (cur2 < mx2) { selectedCards[card2.number] = cur2 + 1; totalAdded++; }
          pass2++;
          if (pass2 > standard.length * MAX_COPIES) break;
        }
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
