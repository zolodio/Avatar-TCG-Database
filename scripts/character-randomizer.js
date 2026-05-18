/**
 * AVATAR BENDING UNIVERSE CHARACTER CREATOR
 * Comprehensive Randomization System — fixed
 *
 * Key fixes vs. original:
 *  • randomizePillSelect no longer dispatches synthetic click events.
 *    Synthetic clicks were re-triggering app handlers that reset dependent
 *    fields (pet dropdown, specialty list, etc.).  Dependent side-effects
 *    are now handled explicitly inside randomizeCharacter().
 *  • randomizeSliders fires an `input` event after each value change so
 *    linked display labels update immediately.
 *  • Flaws use a data-attribute-agnostic selector (any .cc-pill inside the
 *    group), with an optional cap of 3.
 *  • Backstory template: the "Use template" toggle is activated automatically
 *    before randomizing the template fields.
 *  • Pet values are written last, after the pill class has been set, so the
 *    pet dropdown and bond pill are never overwritten by a stale handler.
 */

// ════════════════════════════════════════════════════════════════════════════
// RANDOMIZATION DATA
// ════════════════════════════════════════════════════════════════════════════

const RANDOMIZE_DATA = {
  givenNames: {
    fireNation:   ['Zuko','Azula','Ozai','Ursa','Iroh','Azulon','Kiyi','Rin','Rui','Shoji','Kwan','Lee','Ren','Roku'],
    earthKingdom: ['Toph','Bumi','Long Feng','Oka','Jet','Smellerbee','Ty Lee','The Boulder'],
    waterTribe:   ['Katara','Sokka','Yue','Amon','Tarrlok','Tonraq','Korra','Senna','Eska','Desna','Unalaq'],
    airNomads:    ['Aang','Gyatso','Ikki','Jinora','Meelo','Rohan','Opal'],
    spiritWorld:  ['Koh','Hei Bai','Wan Shi Tong','Vaatu','Raava'],
    generic:      ['Suki','Ying','Wei','Ming','Chit Sang','Haru','Jiang','Kai','Desai','Mira','Fang','Lo','Li','Ryo']
  },

  nicknames: [
    'The Blue Spirit','The Phoenix King','The Dragon of the West','The Blind Bandit',
    'Combustion Kid','The Swamp Monster','The Boulder','Sparky Sparky Boom Man',
    'Twinkle Toes','Sokka the Strategist','The Water Tribe Warrior',
    'The Blind Swordmaster','Spirit Warrior','The Last Airbender','Avatar'
  ],

  heights: [
    '4\'10"','4\'11"','5\'0"','5\'1"','5\'2"','5\'3"','5\'4"','5\'5"',
    '5\'6"','5\'7"','5\'8"','5\'9"','5\'10"','5\'11"','6\'0"','6\'1"','6\'2"'
  ],

  weights: [
    '110 lbs','120 lbs','130 lbs','140 lbs','150 lbs','160 lbs','170 lbs',
    '180 lbs','190 lbs','200 lbs','210 lbs','220 lbs'
  ],

  eyeColors: [
    'amber','golden','silver','steel blue','ocean blue','grey','coal black',
    'jade green','emerald','pale blue','dark brown','copper','violet'
  ],

  hairColors: [
    'jet black','dark brown','auburn','copper red','platinum white','silver',
    'ash grey','midnight blue','raven black','honey brown','dark orange'
  ],

  skinTones: [
    'pale','fair','light tan','warm tan','olive','bronze','warm brown',
    'deep brown','dark brown','mahogany','rich chocolate'
  ],

  appearanceDetails: [
    'A thin scar across the cheek.',
    'Intricate warrior tattoos along the arms.',
    'A spiraling scar on the back.',
    'Ritual body paint markings.',
    'Calloused hands from bending training.',
    'A burn mark on the face.',
    'Ornate jewelry and bracelets.',
    'Traditional nation clothing.',
    'A topknot tied with silk ribbon.',
    'Bandaged knuckles from combat.',
    'A wolf tail pelt across the shoulders.',
    'Earthbender rings on each hand.',
    'Waterbender tribal tattoos.',
    'Fire Nation royal insignia.',
    'Air Nomad arrows on the forehead.',
    'Scars from past battles.',
    'An air of quiet intensity.',
    'Elaborate armor plating.'
  ],

  backstoryNations: [
    'Fire Nation','Earth Kingdom','Water Tribe (Northern)','Water Tribe (Southern)',
    'Air Nomads','Spirit World','United Republic / Republic City','Unknown / Stateless'
  ],

  backstoryTraumas: [
    'Watched their village destroyed.',
    'Separated from family during war.',
    'Betrayed by a trusted mentor.',
    'Survived an assassination attempt.',
    'Lost their bending temporarily.',
    'Caused an accident that hurt others.',
    'Exiled from their nation.',
    'Kidnapped by enemy forces.',
    'Watched their master fall in battle.',
    'Discovered they were not who they thought.',
    'Failed a crucial test of character.',
    'Lost their place in society.'
  ],

  backstoryTraining: [
    'Trained under a retired master in hiding.',
    'Learned from a warrior of an enemy nation.',
    'Mentored by a monk seeking redemption.',
    'Drilled by a general with unconventional methods.',
    'Self-taught through trial and survival.',
    'Guided by a traveling teacher of mysterious origin.',
    'Shaped by a former rival turned ally.',
    'Instructed through dreams by a spirit guide.',
    'Trained alongside a sibling who believed in them.',
    'Hardened by a fighter they once defeated.'
  ],

  backstoryMentors: [
    'A retired master in hiding.',
    'A warrior from an enemy nation.',
    'A monk seeking redemption.',
    'A general with unconventional methods.',
    'A traveling teacher with mysterious origins.',
    'A former rival turned ally.',
    'A spirit guide.',
    'A sibling who believed in them.',
    'A fighter they defeated and respected.',
    'An old warrior living in exile.'
  ],

  backstoryRivals: [
    'A childhood friend turned enemy.',
    'Someone seeking the same goal.',
    'A sibling competing for recognition.',
    'A warrior from an opposing faction.',
    'Someone who saved them once, then betrayed them.',
    'A prodigy they can never quite match.',
    'Their sworn enemy.',
    'Someone chasing them for revenge.',
    'A rival trained by the same master.'
  ],

  backstoryGoals: [
    'Restore honor to their family.',
    'Master their bending beyond known limits.',
    'Find a lost loved one.',
    'Prevent a war before it starts.',
    'Discover their true heritage.',
    'Become the strongest fighter alive.',
    'Protect their nation at any cost.',
    'Seek redemption for past failures.',
    'Bridge two warring nations.',
    'Unlock a forbidden technique.',
    'Prove their worth to skeptics.',
    'Escape a dark past.'
  ],

  backstorySecrets: [
    'They\'re secretly from an enemy nation.',
    'Their mentor was their enemy in disguise.',
    'They caused a tragedy they\'ve hidden ever since.',
    'They\'re more powerful than they admit.',
    'They no longer want to be a bender.',
    'They\'re in love with someone forbidden.',
    'They were born of two opposing nations.',
    'They made an oath they deeply regret.',
    'They\'re running from someone very dangerous.',
    'They know something that could change everything.'
  ]
};

// ════════════════════════════════════════════════════════════════════════════
// SPECIALTIES BY BENDING TYPE
// ════════════════════════════════════════════════════════════════════════════

const SPECIALTIES = {
  water:   ['Healing','Bloodbending','Ice Armor','Swamp Bending','Steam Redirection'],
  earth:   ['Metalbending','Lavabending','Seismic Sensing','Sand Bending','Crystal Bending'],
  fire:    ['Lightning','Blue Fire','Combustion','Breath of Fire','Redirection'],
  air:     ['Spiritual Connection','Air Scooter','Spiraling Motion','Sound Manipulation','Flight'],
  spirit:  ['Spirit Projection','Spirit Manipulation','Spiritual Healing','Astral Walking','Energybending']
};

// ════════════════════════════════════════════════════════════════════════════
// PILL HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Set exactly one pill as selected by value, WITHOUT dispatching synthetic
 * click events (which trigger app-level side-effect handlers).
 * Returns the matched pill element or null.
 */
function setPill(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return null;
  const pills = group.querySelectorAll('.cc-pill');
  let matched = null;
  pills.forEach(pill => {
    const active = pill.dataset.val === value;
    pill.classList.toggle('selected', active);
    if (active) matched = pill;
  });
  return matched;
}

/**
 * Pick a random value from options, set the pill, return the chosen value.
 */
function randomPill(groupId, options) {
  if (!options || !options.length) return null;
  const value = options[Math.floor(Math.random() * options.length)];
  setPill(groupId, value);
  return value;
}

/**
 * Toggle N randomly-chosen pills on inside a group (multi-select).
 * Works on any .cc-pill inside the group regardless of data attributes.
 */
function randomMultiPills(groupId, count) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const pills = Array.from(group.querySelectorAll('.cc-pill'));
  pills.forEach(p => p.classList.remove('selected'));
  const shuffled = pills.sort(() => Math.random() - 0.5);
  shuffled.slice(0, Math.min(count, shuffled.length))
          .forEach(p => p.classList.add('selected'));
}

// ════════════════════════════════════════════════════════════════════════════
// FIELD HELPERS
// ════════════════════════════════════════════════════════════════════════════

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  // Notify any listeners that track the field
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectRandom(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const options = Array.from(el.options).filter(o => o.value);
  if (!options.length) return null;
  const chosen = pick(options);
  el.value = chosen.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return chosen.value;
}

/**
 * Randomize all range sliders inside a container and fire `input` so
 * any linked display labels (e.g. <output> or a sibling span) update.
 */
function randomizeSliders(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('input[type="range"]').forEach(slider => {
    const min = parseInt(slider.min) || 0;
    const max = parseInt(slider.max) || 100;
    slider.value = Math.floor(Math.random() * (max - min + 1)) + min;
    // Fire both events — some UIs listen to `input`, some to `change`
    slider.dispatchEvent(new Event('input',  { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SPECIALTY LIST REBUILD
// ════════════════════════════════════════════════════════════════════════════

function updateSpecialtyOptions(bending) {
  const group = document.getElementById('cc-specialty-group');
  if (!group) return;
  const specialties = SPECIALTIES[bending] || [];
  group.innerHTML = '';
  specialties.forEach(specialty => {
    const pill = document.createElement('div');
    pill.className = 'cc-pill generic';
    pill.dataset.group = 'specialty';
    pill.dataset.val   = specialty.toLowerCase();
    pill.textContent   = specialty;
    group.appendChild(pill);
  });
  // Re-attach single-select handlers for the new pills
  group.querySelectorAll('.cc-pill').forEach(pill => {
    pill.addEventListener('click', function () {
      group.querySelectorAll('.cc-pill').forEach(p => p.classList.remove('selected'));
      this.classList.add('selected');
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// BACKSTORY TEMPLATE TOGGLE
// ════════════════════════════════════════════════════════════════════════════

/**
 * If the backstory section has a "use template" toggle button / checkbox,
 * activate it so the template fields become visible before we populate them.
 */
function ensureBackstoryTemplateVisible() {
  // Common patterns: a button with data-toggle, a checkbox, or a pill
  const toggleBtn = document.querySelector(
    '#cc-bs-template-toggle, [data-toggle="bs-template"], .cc-bs-template-btn'
  );
  if (toggleBtn) {
    // Only click if it doesn't already appear active
    if (!toggleBtn.classList.contains('active') && !toggleBtn.checked) {
      toggleBtn.click();
    }
    return;
  }
  // Fallback: look for a hidden template section and show it directly
  const templateSection = document.querySelector(
    '#cc-bs-template-section, .cc-bs-template-fields'
  );
  if (templateSection && templateSection.style.display === 'none') {
    templateSection.style.display = '';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN RANDOMIZE FUNCTION
// ════════════════════════════════════════════════════════════════════════════

function randomizeCharacter() {

  // ── Identity ──────────────────────────────────────────────────────────────
  setField('cc-given-name', pick(RANDOMIZE_DATA.givenNames.generic));
  setField('cc-nick-name',  pick(RANDOMIZE_DATA.nicknames));

  // ── Physical Description ──────────────────────────────────────────────────
  setField('cc-height', pick(RANDOMIZE_DATA.heights));
  setField('cc-weight', pick(RANDOMIZE_DATA.weights));
  setField('cc-eyes',   pick(RANDOMIZE_DATA.eyeColors));
  setField('cc-hair',   pick(RANDOMIZE_DATA.hairColors));
  setField('cc-skin',   pick(RANDOMIZE_DATA.skinTones));
  setField('cc-appearance-notes', pick(RANDOMIZE_DATA.appearanceDetails));

  // Build (pill, no side-effects expected)
  randomPill('cc-build-group', ['lean', 'muscular', 'stocky', 'slender']);

  // ── Bending & Specialties ─────────────────────────────────────────────────
  const bending = randomPill(
    'cc-bending-group',
    ['water', 'earth', 'fire', 'air', 'spirit', 'non-bender']
  );

  // Rebuild specialty list to match the chosen bending, then pick one
  if (bending && bending !== 'non-bender' && SPECIALTIES[bending]) {
    updateSpecialtyOptions(bending);
    const specialtyVals = SPECIALTIES[bending].map(s => s.toLowerCase());
    randomPill('cc-specialty-group', specialtyVals);
  } else {
    // Non-bender: clear specialties
    const group = document.getElementById('cc-specialty-group');
    if (group) group.innerHTML = '';
  }

  // ── Combat / Bending Profile ──────────────────────────────────────────────
  randomPill('cc-mastery-group',     ['novice', 'adept', 'master', 'grandmaster']);
  randomPill('cc-temperament-group', ['aggressive', 'defensive', 'tactical', 'passive', 'chaotic', 'disciplined']);
  randomPill('cc-lifepath-group',    ['open-palm', 'closed-fist']);
  randomPill('cc-range-group',       ['close', 'mid', 'long', 'support', 'control']);

  // ── Quickstrike Traits ────────────────────────────────────────────────────
  randomPill('cc-strike-group',    ['bull', 'fox', 'lion']);
  randomPill('cc-advantage-group', ['mind', 'body', 'spirit']);
  randomPill('cc-ally-group',      ['light', 'shadow', 'dark']);

  // ── Pet — set category pill first, THEN populate dependent fields ─────────
  // Do NOT dispatch synthetic click events here; just set class directly.
  const petOptions = ['none', 'standard', 'hybrid', 'mount', 'spirit'];
  const petCat = randomPill('cc-pet-cat-group', petOptions);

  if (petCat && petCat !== 'none') {
    // Populate the pet name dropdown (pick any non-empty option)
    setSelectRandom('cc-pet-select');
    // Bond pill — set directly, no side-effects
    randomPill('cc-bond-group', ['wild', 'trained', 'loyal', 'spirit-bound']);
  } else {
    // Explicitly reset pet fields when category is "none"
    const petSelect = document.getElementById('cc-pet-select');
    if (petSelect) {
      petSelect.value = '';
      petSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setPill('cc-bond-group', null); // deselect all
  }

  // ── Flaws (multi-select, 1–3 random) ─────────────────────────────────────
  const flawCount = Math.floor(Math.random() * 3) + 1;
  randomMultiPills('cc-flaws-group', flawCount);

  // ── Sliders ───────────────────────────────────────────────────────────────
  randomizeSliders('cc-personality-sliders');
  randomizeSliders('cc-physical-sliders');
  randomizeSliders('cc-mental-sliders');

  // ── Backstory ─────────────────────────────────────────────────────────────
  // Ensure the template section is visible before writing to it
  ensureBackstoryTemplateVisible();

  setField('cc-bs-nation',    pick(RANDOMIZE_DATA.backstoryNations));
  setField('cc-bs-training',  pick(RANDOMIZE_DATA.backstoryTraining));
  setField('cc-bs-trauma',    pick(RANDOMIZE_DATA.backstoryTraumas));
  setField('cc-bs-mentor',    pick(RANDOMIZE_DATA.backstoryMentors));
  setField('cc-bs-rival',     pick(RANDOMIZE_DATA.backstoryRivals));
  setField('cc-bs-goal',      pick(RANDOMIZE_DATA.backstoryGoals));
  setField('cc-bs-secret',    pick(RANDOMIZE_DATA.backstorySecrets));

  randomPill('cc-bs-tone-group', ['hopeful', 'dark', 'epic', 'political', 'tragic']);

  // ── Done ──────────────────────────────────────────────────────────────────
  showToast('✦ Character randomized!');
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAR FORM
// ════════════════════════════════════════════════════════════════════════════

function clearCharacterForm() {
  const textFields = [
    'cc-given-name','cc-nick-name','cc-height','cc-weight',
    'cc-eyes','cc-hair','cc-skin','cc-appearance-notes',
    'cc-backstory-free','cc-bs-nation','cc-bs-training','cc-bs-trauma',
    'cc-bs-mentor','cc-bs-rival','cc-bs-goal','cc-bs-secret'
  ];
  textFields.forEach(id => setField(id, ''));

  // Deselect all pills, then restore "none" default for pet category
  document.querySelectorAll('.cc-pill').forEach(p => p.classList.remove('selected'));
  setPill('cc-pet-cat-group', 'none');

  // Reset sliders to midpoint
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.value = slider.defaultValue !== undefined ? slider.defaultValue : 50;
    slider.dispatchEvent(new Event('input',  { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Reset image
  const imgPreview     = document.getElementById('cc-img-preview');
  const imgPlaceholder = document.getElementById('cc-img-placeholder');
  const imgClearBtn    = document.getElementById('cc-img-clear');
  if (imgPreview)     { imgPreview.src = ''; imgPreview.style.display = 'none'; }
  if (imgPlaceholder) imgPlaceholder.style.display = 'flex';
  if (imgClearBtn)    imgClearBtn.disabled = true;

  // Reset pet dropdown
  const petSelect = document.getElementById('cc-pet-select');
  if (petSelect) {
    petSelect.value = '';
    petSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  showToast('Form cleared');
}

// ════════════════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════════════════

function showToast(message) {
  const toast = document.getElementById('cc-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.opacity    = '1';
  toast.style.visibility = 'visible';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.visibility = 'hidden';
  }, 2200);
}

// ════════════════════════════════════════════════════════════════════════════
// PILL CLICK HANDLERS (initial setup + re-init for dynamic pills)
// ════════════════════════════════════════════════════════════════════════════

function initializePillHandlers() {
  document.querySelectorAll('.cc-pill').forEach(pill => {
    // Guard: don't double-bind
    if (pill.dataset.handlerBound) return;
    pill.dataset.handlerBound = '1';

    if (pill.dataset.multi) {
      pill.addEventListener('click', function () {
        this.classList.toggle('selected');
      });
    } else {
      pill.addEventListener('click', function () {
        const group = this.closest('[id]') || this.parentElement;
        group.querySelectorAll('.cc-pill').forEach(p => p.classList.remove('selected'));
        this.classList.add('selected');
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  // Wire buttons
  const randomBtn = document.getElementById('cc-random-btn');
  if (randomBtn) randomBtn.addEventListener('click', randomizeCharacter);

  const clearBtn = document.getElementById('cc-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearCharacterForm);

  initializePillHandlers();

  // Rebuild specialty list when the user manually changes bending
  const bendingGroup = document.getElementById('cc-bending-group');
  if (bendingGroup) {
    bendingGroup.addEventListener('click', function (e) {
      const pill = e.target.closest('.cc-pill');
      if (!pill) return;
      const bending = pill.dataset.val;
      if (bending && bending !== 'non-bender' && SPECIALTIES[bending]) {
        updateSpecialtyOptions(bending);
      }
    });
  }
});
