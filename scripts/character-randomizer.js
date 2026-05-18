/**
 * character-randomizer.js
 *
 * Drop-in replacement. Key fixes vs. every previous version:
 *
 *  1. DUPLICATE HANDLER — clones #cc-random-btn to strip the inline IIFE's
 *     listener, then attaches only this handler. One click = one randomize.
 *
 *  2. PILL SIDE-EFFECTS — uses .click() (not classList) for bending and petcat
 *     pills so the inline handlers fire: bending → updateSpecialties(),
 *     petcat → updatePetPicker().
 *
 *  3. PET SELECT — waits one tick after the petcat click so updatePetPicker()
 *     has rebuilt the <select> options, then picks from the actual live options
 *     and dispatches 'change' so the inline onchange sets state.pet.
 *
 *  4. SLIDERS — each class is handled separately:
 *       .cc-slider  → personality  (label IDs: sv-*)
 *       .cc-slider2 → physical     (label IDs: svxt-*)
 *       .cc-slider3 → mental       (label IDs: svxq-*)
 *     Fires 'input' so each slider's own listener updates both state and label.
 *
 *  5. FLAWS — clears selected state manually, then .click()s 1–3 random pills
 *     so the inline multi-select handler updates state.flaws correctly.
 *
 *  6. BACKSTORY TEMPLATE — clicks the "Use Template" tab button first (making
 *     the section visible), then fills every template field. Nation is a
 *     <select> so value + 'change' event are used.
 *
 *  7. TACTICAL RANGE — randomizes cc-range-group (was missing entirely).
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════════════════════════ */
  var DATA = {
    givenNames: [
      'Bai Long', 'Zhen Wei', 'Kai Shen', 'Lei Fang', 'Mei Xiu',
      'Tao Jin', 'Suki Ryo', 'Raya Chen', 'Shen Po', 'Jin Yao',
      'Lira Fang', 'Nori Kai', 'Sable Tao', 'Wen Shi', 'Roku Fei',
      'Asha Dun', 'Cord Vex', 'Suri Ane', 'Mako Jin', 'Lian Tzu'
    ],
    nickNames: [
      'The Blue Spirit', 'The Phoenix King', 'Dragon of the West',
      'The Blind Bandit', 'Combustion Kid', 'The Boulder',
      'Twinkle Toes', 'Sokka the Strategist', 'Spirit Warrior',
      'The Last Airbender', 'Shadow Fox', 'Iron Fist', 'The Wanderer',
      'Sparky Sparky', 'Ghost of the East', 'The Silent Storm'
    ],
    heights: [
      "4'10\"", "4'11\"", "5'0\"", "5'1\"", "5'2\"", "5'3\"", "5'4\"",
      "5'5\"", "5'6\"", "5'7\"", "5'8\"", "5'9\"", "5'10\"",
      "5'11\"", "6'0\"", "6'1\"", "6'2\""
    ],
    weights: [
      '110 lbs', '120 lbs', '130 lbs', '140 lbs', '150 lbs',
      '160 lbs', '170 lbs', '180 lbs', '190 lbs', '200 lbs', '215 lbs'
    ],
    eyeColors: [
      'amber', 'golden', 'silver', 'steel blue', 'ocean blue', 'grey',
      'coal black', 'jade green', 'emerald', 'pale blue', 'dark brown',
      'copper', 'violet'
    ],
    hairColors: [
      'jet black', 'dark brown', 'auburn', 'copper red', 'platinum white',
      'silver', 'ash grey', 'midnight blue', 'raven black', 'honey brown',
      'dark orange'
    ],
    skinTones: [
      'pale', 'fair', 'light tan', 'warm tan', 'olive', 'bronze',
      'warm brown', 'deep brown', 'mahogany', 'rich chocolate'
    ],
    appearanceNotes: [
      'A thin scar traces their left cheek.',
      'Intricate warrior tattoos run along their forearms.',
      'A spiraling scar covers part of their upper back.',
      'Ritual body paint in faded tribal patterns.',
      'Calloused hands from years of bending training.',
      'A burn mark along one side of their jaw.',
      'Ornate jewelry and carved bone bracers.',
      'Traditional nation clothing with ceremonial markings.',
      'A topknot bound with silk ribbon.',
      'Bandaged knuckles from recent combat.',
      'Scars from battles they never speak of.',
      'An air of quiet, unsettling intensity.'
    ],
    training: [
      'Trained under a retired master living in hiding.',
      'Learned from a warrior who was once an enemy.',
      'Self-taught through years of trial and survival.',
      'Drilled by a general with deeply unconventional methods.',
      'Guided by a traveling teacher of mysterious origin.',
      'Shaped by a fighter they defeated and came to respect.',
      'Hardened by countless skirmishes along the border.'
    ],
    traumas: [
      'Their village was destroyed during wartime.',
      'They were separated from their family at a young age.',
      'A mentor they trusted betrayed them completely.',
      'They caused an accident that hurt people they cared about.',
      'They were exiled from their nation.',
      'They watched their master fall in battle.',
      'They survived an assassination attempt meant for someone else.'
    ],
    mentors: [
      'A retired master living in hiding.',
      'A monk still seeking redemption.',
      'A former rival turned reluctant ally.',
      'A spirit guide that appeared only in visions.',
      'A wandering teacher with no fixed name.',
      'An old warrior living quietly in exile.',
      'A sibling who refused to give up on them.'
    ],
    rivals: [
      'A childhood friend who chose a much darker path.',
      'A prodigy trained under the same master.',
      'A warrior from an opposing faction.',
      'Someone hunting them over an old, unresolved debt.',
      'A sibling competing for recognition.',
      'Someone who saved them once and then betrayed them.'
    ],
    goals: [
      'Restore honor to their family name.',
      'Master their bending beyond any known limit.',
      'Find a loved one who went missing years ago.',
      'Prevent a war before the first blow falls.',
      'Seek redemption for past failures.',
      'Prove their worth to those who wrote them off.',
      'Bridge two nations that have been enemies for generations.'
    ],
    secrets: [
      "They are secretly from a nation they claim to oppose.",
      "They caused a tragedy they have hidden ever since.",
      "They are far more powerful than they let on.",
      "They made an oath they deeply regret and cannot escape.",
      "They know something that could change everything.",
      "They are running from someone very dangerous.",
      "They were born to two opposing nations and claim neither."
    ]
  };

  /* ══════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════ */

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Simulate a pill click — triggers all inline IIFE handlers.
   * This is intentional: bending→updateSpecialties(), petcat→updatePetPicker().
   */
  function clickPill(group, val) {
    var p = document.querySelector('.cc-pill[data-group="' + group + '"][data-val="' + val + '"]');
    if (p) p.click();
  }

  /** Simulate a trait-card click (strike / advantage / ally). */
  function clickTraitCard(group, val) {
    var c = document.querySelector('.cc-trait-card[data-group="' + group + '"][data-val="' + val + '"]');
    if (c) c.click();
  }

  /**
   * Set a text input / textarea value and fire 'input' so the inline
   * state-sync listeners (set up in bindActions) update state[field].
   */
  function setField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Set a <select> value and fire both 'input' and 'change'.
   * The inline backstory listener uses 'input'; native browser pickers
   * listen to 'change', so we fire both to be safe.
   */
  function setSelect(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize every slider of a given CSS class.
   * Fires 'input' so each slider's own listener updates both state and
   * its sibling display label (sv-*, svxt-*, svxq-*).
   */
  function randomizeSliderClass(cssClass) {
    document.querySelectorAll('.' + cssClass).forEach(function (s) {
      var min = parseInt(s.min) || 0;
      var max = parseInt(s.max) || 100;
      s.value = Math.floor(Math.random() * (max - min + 1)) + min;
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Show the character-creator toast (uses #cc-toast, not the global #toast). */
  function showCCToast(msg) {
    var t = document.getElementById('cc-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._crTimer);
    t._crTimer = setTimeout(function () { t.classList.remove('show'); }, 2300);
  }

  /* ══════════════════════════════════════════════════════════════════
     MAIN RANDOMIZER
  ══════════════════════════════════════════════════════════════════ */

  function randomizeCharacter() {

    /* ── 1. Identity ─────────────────────────────────────────────── */
    setField('cc-given-name', pick(DATA.givenNames));
    setField('cc-nick-name',  pick(DATA.nickNames));

    /* ── 2. Physical Description ─────────────────────────────────── */
    setField('cc-height', pick(DATA.heights));
    setField('cc-weight', pick(DATA.weights));
    setField('cc-eyes',   pick(DATA.eyeColors));
    setField('cc-hair',   pick(DATA.hairColors));
    setField('cc-skin',   pick(DATA.skinTones));
    setField('cc-appearance-notes', pick(DATA.appearanceNotes));

    // Build (pill, no relevant side-effects — click is fine)
    clickPill('build', pick(['lean', 'muscular', 'stocky', 'slender']));

    /* ── 3. Bending + Specialties ────────────────────────────────── */
    // .click() triggers updateSpecialties() inside the inline IIFE
    var elements = ['water', 'earth', 'fire', 'air', 'non-bender'];
    clickPill('bending', pick(elements));

    // Specialty pills are rebuilt asynchronously by updateSpecialties(),
    // so we wait one frame before selecting one.
    setTimeout(function () {
      var specs = Array.from(
        document.querySelectorAll('#cc-specialty-group .cc-pill')
      );
      if (specs.length) {
        // Deselect all (without triggering state, since there is no
        // single-select handler with a persistent group query here)
        specs.forEach(function (p) { p.classList.remove('selected'); });
        // Click one random pill — fires the inline multi-select handler
        specs[Math.floor(Math.random() * specs.length)].click();
      }
    }, 60);

    /* ── 4. Mastery ──────────────────────────────────────────────── */
    clickPill('mastery', pick(['novice', 'adept', 'master', 'grandmaster']));

    /* ── 5. Quickstrike Traits ───────────────────────────────────── */
    clickTraitCard('strike',    pick(['bull', 'fox', 'lion']));
    clickTraitCard('advantage', pick(['mind', 'body', 'spirit']));
    clickTraitCard('ally',      pick(['light', 'shadow', 'dark']));

    /* ── 6. Combat Style ─────────────────────────────────────────── */
    clickPill('temperament', pick(['aggressive', 'defensive', 'tactical', 'passive', 'chaotic', 'disciplined']));
    clickPill('lifepath',    pick(['open-palm', 'closed-fist']));

    // Tactical Range — was entirely missing before
    clickPill('range', pick(['close', 'mid', 'long', 'support', 'control']));

    /* ── 7. Companion / Pet ──────────────────────────────────────── */
    // .click() triggers updatePetPicker() inside the inline IIFE,
    // which rebuilds the <select> options from PET_OPTIONS[cat].
    var petCats = ['none', 'standard', 'hybrid', 'mount', 'spirit'];
    var petCat  = pick(petCats);
    clickPill('petcat', petCat);

    if (petCat !== 'none') {
      // Wait for updatePetPicker() to rebuild the <select> options,
      // then pick from whatever is actually in the live DOM.
      setTimeout(function () {
        var sel  = document.getElementById('cc-pet-select');
        if (!sel) return;
        var opts = Array.from(sel.options).filter(function (o) { return o.value; });
        if (!opts.length) return;
        // Set value + dispatch 'change' so the inline onchange sets state.pet
        sel.value = pick(opts).value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // Bond — set after pet so the picker is fully visible
        clickPill('bond', pick(['wild', 'trained', 'loyal', 'spirit-bound']));
      }, 100);
    }

    /* ── 8. Sliders ──────────────────────────────────────────────── */
    // Each slider class has its own 'input' listener that updates state
    // AND the sibling label. Fire 'input' after setting value.
    randomizeSliderClass('cc-slider');   // personality  →  sv-*
    randomizeSliderClass('cc-slider2');  // physical     →  svxt-*
    randomizeSliderClass('cc-slider3');  // mental       →  svxq-*

    /* ── 9. Flaws (multi-select) ─────────────────────────────────── */
    // Deselect all manually (no handler for bulk-deselect), then .click()
    // 1–3 random pills so the inline toggle handler updates state.flaws.
    var flawPills = Array.from(
      document.querySelectorAll('#cc-flaws-group .cc-pill')
    );
    flawPills.forEach(function (p) { p.classList.remove('selected'); });
    var flawCount = Math.floor(Math.random() * 3) + 1;
    flawPills
      .slice()
      .sort(function () { return Math.random() - 0.5; })
      .slice(0, Math.min(flawCount, flawPills.length))
      .forEach(function (p) { p.click(); });

    /* ── 10. Backstory — switch to template tab first ────────────── */
    var templateTab = document.querySelector(
      '#cc-backstory-tabs [data-bstab="template"]'
    );
    if (templateTab && !templateTab.disabled) {
      templateTab.click(); // shows #cc-bs-template via inline bindBackstoryTabs()
    }

    // Nation is a <select> — use setSelect (fires input + change)
    var nationSel = document.getElementById('cc-bs-nation');
    if (nationSel) {
      var nationOpts = Array.from(nationSel.options).filter(function (o) { return o.value; });
      if (nationOpts.length) setSelect('cc-bs-nation', pick(nationOpts).value);
    }

    setField('cc-bs-training', pick(DATA.training));
    setField('cc-bs-trauma',   pick(DATA.traumas));
    setField('cc-bs-mentor',   pick(DATA.mentors));
    setField('cc-bs-rival',    pick(DATA.rivals));
    setField('cc-bs-goal',     pick(DATA.goals));
    setField('cc-bs-secret',   pick(DATA.secrets));

    clickPill('bstone', pick(['hopeful', 'dark', 'epic', 'political', 'tragic']));

    showCCToast('✦ Character randomized!');
  }

  /* ══════════════════════════════════════════════════════════════════
     WIRE UP — replace the button to remove the inline IIFE's listener
  ══════════════════════════════════════════════════════════════════ */

  function wireButton() {
    var oldBtn = document.getElementById('cc-random-btn');
    if (!oldBtn || oldBtn._crWired) return;

    // Cloning strips all existing addEventListener listeners (including
    // the one bound by the inline IIFE's init() → bindActions()).
    var newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn._crWired = true;
    newBtn.addEventListener('click', randomizeCharacter);
  }

  // Run immediately if DOM is ready, otherwise wait for it.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButton);
  } else {
    // Inline scripts have already run (and bound their listeners),
    // so we can replace the button right now.
    wireButton();
  }

  console.log('[character-randomizer.js] loaded ✓');

})();
