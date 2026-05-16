/**
 * AVATAR BENDING UNIVERSE CHARACTER CREATOR
 * Comprehensive Randomization System
 * 
 * Handles all field types:
 * - Text inputs & textareas
 * - Single-select pills
 * - Multi-select pills (flaws)
 * - Sliders (personality, physical, mental)
 * - Dropdowns (nation, pet)
 * - Dependent fields (specialties based on bending)
 */

// ════════════════════════════════════════════════════════════════════════════
// RANDOMIZATION DATA
// ════════════════════════════════════════════════════════════════════════════

const RANDOMIZE_DATA = {
  // NAMES
  givenNames: {
    fireNation: ['Zuko', 'Azula', 'Ozai', 'Ursa', 'Iroh', 'Azulon', 'Kiyi', 'Rin', 'Rui', 'Shoji', 'Kwan', 'Lee', 'Ren', 'Toph', 'Roku'],
    earthKingdom: ['Toph', 'Bumi', 'Long Feng', 'Oka', 'Jet', 'Smellerbee', 'Sokka', 'Katara', 'Suki', 'Ty Lee', 'The Boulder', 'The Big Badger'],
    waterTribe: ['Katara', 'Sokka', 'Yue', 'Amon', 'Tarrlok', 'Tonraq', 'Korra', 'Senna', 'Eska', 'Desna', 'Unalaq'],
    airNomads: ['Aang', 'Appa', 'Momo', 'Gyatso', 'Bumi', 'Ikki', 'Jinora', 'Meelo', 'Rohan', 'Opal'],
    spiritWorld: ['Koh', 'Hei Bai', 'Aye Aye', 'Wan Shi Tong', 'Vaatu', 'Raava', 'Tui', 'La'],
    generic: ['Suki', 'Ty Lee', 'Ying', 'Wei', 'Ming', 'Chit Sang', 'Haru', 'Jiang', 'Kai', 'Desai']
  },

  nicknames: [
    'The Blue Spirit',
    'The Phoenix King',
    'The Dragon of the West',
    'The Blind Bandit',
    'Combustion Kid',
    'The Swamp Monster',
    'The Boulder',
    'Sparky Sparky Boom Man',
    'Twinkle Toes',
    'Sokka the Strategist',
    'The Water Tribe Warrior',
    'The Blind Swordmaster',
    'Spirit Warrior',
    'The Last Airbender',
    'Avatar'
  ],

  // PHYSICAL DESCRIPTIONS
  heights: [
    '4\'10"', '4\'11"', '5\'0"', '5\'1"', '5\'2"', '5\'3"', '5\'4"', '5\'5"',
    '5\'6"', '5\'7"', '5\'8"', '5\'9"', '5\'10"', '5\'11"', '6\'0"', '6\'1"', '6\'2"'
  ],

  weights: [
    '110 lbs', '120 lbs', '130 lbs', '140 lbs', '150 lbs', '160 lbs', '170 lbs',
    '180 lbs', '190 lbs', '200 lbs', '210 lbs', '220 lbs'
  ],

  eyeColors: [
    'amber', 'golden', 'silver', 'steel blue', 'ocean blue', 'grey', 'coal black',
    'jade green', 'emerald', 'pale blue', 'dark brown', 'copper', 'violet'
  ],

  hairColors: [
    'jet black', 'dark brown', 'auburn', 'copper red', 'platinum white', 'silver',
    'ash grey', 'midnight blue', 'raven black', 'honey brown', 'dark orange'
  ],

  skinTones: [
    'pale', 'fair', 'light tan', 'warm tan', 'olive', 'bronze', 'warm brown',
    'deep brown', 'dark brown', 'mahogany', 'rich chocolate'
  ],

  // APPEARANCE DETAILS
  appearanceDetails: [
    'A thin scar across the cheek',
    'Intricate warrior tattoos along the arms',
    'A spiraling scar on the back',
    'Ritual body paint markings',
    'Calloused hands from bending training',
    'A burn mark on the face',
    'Ornate jewelry and bracelets',
    'Traditional nation clothing',
    'A topknot tied with silk ribbon',
    'Bandaged knuckles from combat',
    'A wolf tail pelt across the shoulders',
    'Earthbender rings on each hand',
    'Waterbender tribal tattoos',
    'Fire Nation royal insignia',
    'Air Nomad arrows on arms',
    'Scars from past battles',
    'An air of quiet intensity',
    'Elaborate armor plating'
  ],

  // BACKSTORY ELEMENTS
  backstoryTraumas: [
    'Watched their village destroyed',
    'Separated from family during war',
    'Betrayed by a trusted mentor',
    'Survived an assassination attempt',
    'Lost their bending temporarily',
    'Caused an accident that hurt others',
    'Exiled from their nation',
    'Kidnapped by enemy forces',
    'Watched their master fall in battle',
    'Discovered they were someone else\'s child',
    'Failed a crucial test',
    'Lost their place in society'
  ],

  backstoryMentors: [
    'A retired master in hiding',
    'A warrior from an enemy nation',
    'A monk seeking redemption',
    'A general with unconventional methods',
    'A traveling teacher with mysterious origins',
    'A former rival turned ally',
    'A spirit guide',
    'A sibling who believed in them',
    'A fighter they defeated and respected',
    'An old warrior living in exile'
  ],

  backstoryRivals: [
    'A childhood friend turned enemy',
    'Someone seeking the same goal',
    'A sibling competing for recognition',
    'A warrior from an opposing faction',
    'Someone who saved them once, then betrayed them',
    'A prodigy they can never quite match',
    'Their sworn enemy',
    'Someone chasing them for revenge',
    'A rival trained by the same master'
  ],

  backstoryGoals: [
    'Restore honor to their family',
    'Master their bending beyond limits',
    'Find a lost loved one',
    'Prevent a war',
    'Discover their true heritage',
    'Become the strongest fighter',
    'Protect their nation',
    'Seek redemption for past failures',
    'Bridge two warring nations',
    'Unlock a forbidden technique',
    'Prove their worth to skeptics',
    'Escape a dark past'
  ],

  backstorySecrets: [
    'They\'re secretly from an enemy nation',
    'Their mentor was their enemy',
    'They caused a tragedy they hide',
    'They\'re more powerful than they admit',
    'They don\'t want to be a bender anymore',
    'They\'re in love with someone forbidden',
    'They were born of two opposing nations',
    'They made an oath they regret',
    'They\'re running from someone dangerous',
    'They know something that could change everything'
  ]
};

// ════════════════════════════════════════════════════════════════════════════
// SPECIALTIES BY BENDING TYPE
// ════════════════════════════════════════════════════════════════════════════

const SPECIALTIES = {
  'water': ['Healing', 'Bloodbending', 'Waterbending', 'Ice Armor', 'Swamp Bending'],
  'earth': ['Earthbending', 'Metalbending', 'Lavabending', 'Seismic Sensing', 'Sand Bending'],
  'fire': ['Firebending', 'Lightning', 'Blue Fire', 'Flight (with airship)', 'Combustion'],
  'air': ['Airbending', 'Spiritual Connection', 'Air Scooter', 'Spiraling Motion', 'Defense'],
  'spirit': ['Spirit Projection', 'Spirit Manipulation', 'Spiritual Healing', 'Astral Walking']
};

// ════════════════════════════════════════════════════════════════════════════
// CORE RANDOMIZE FUNCTION
// ════════════════════════════════════════════════════════════════════════════

function randomizeCharacter() {
  // Text inputs
  randomizeTextField('cc-given-name', RANDOMIZE_DATA.givenNames.generic);
  randomizeTextField('cc-nick-name', RANDOMIZE_DATA.nicknames);
  randomizeTextField('cc-height', RANDOMIZE_DATA.heights);
  randomizeTextField('cc-weight', RANDOMIZE_DATA.weights);
  randomizeTextField('cc-eyes', RANDOMIZE_DATA.eyeColors);
  randomizeTextField('cc-hair', RANDOMIZE_DATA.hairColors);
  randomizeTextField('cc-skin', RANDOMIZE_DATA.skinTones);
  randomizeTextField('cc-appearance-notes', RANDOMIZE_DATA.appearanceDetails, 2);

  // Pill selections (single-select)
  randomizePillSelect('cc-bending-group', ['water', 'earth', 'fire', 'air', 'spirit', 'non-bender']);
  const selectedBending = document.querySelector('#cc-bending-group .cc-pill.selected')?.dataset.val;
  
  // Update specialties based on bending
  if (selectedBending && SPECIALTIES[selectedBending]) {
    updateSpecialtyOptions(selectedBending);
    randomizePillSelect('cc-specialty-group', SPECIALTIES[selectedBending].map(s => s.toLowerCase()));
  }

  randomizePillSelect('cc-mastery-group', ['novice', 'adept', 'master', 'grandmaster']);
  randomizePillSelect('cc-temperament-group', ['aggressive', 'defensive', 'tactical', 'passive', 'chaotic', 'disciplined']);
  randomizePillSelect('cc-lifepath-group', ['open-palm', 'closed-fist']);
  randomizePillSelect('cc-range-group', ['close', 'mid', 'long', 'support', 'control']);
  randomizePillSelect('cc-build-group', ['lean', 'muscular', 'stocky', 'slender']);

  // Quickstrike traits (single-select for each)
  randomizePillSelect('cc-strike-group', ['bull', 'fox', 'lion']);
  randomizePillSelect('cc-advantage-group', ['mind', 'body', 'spirit']);
  randomizePillSelect('cc-ally-group', ['light', 'shadow', 'dark']);

  // Pet selection
  randomizePillSelect('cc-pet-cat-group', ['none', 'standard', 'hybrid', 'mount', 'spirit']);
  const petCat = document.querySelector('#cc-pet-cat-group .cc-pill.selected')?.dataset.val;
  if (petCat && petCat !== 'none') {
    const petSelect = document.getElementById('cc-pet-select');
    const options = Array.from(petSelect.options).slice(1); // Skip default
    if (options.length > 0) {
      const randomPet = options[Math.floor(Math.random() * options.length)];
      petSelect.value = randomPet.value;
    }
    randomizePillSelect('cc-bond-group', ['wild', 'trained', 'loyal', 'spirit-bound']);
  }

  // Multi-select flaws (random 1-3)
  const flawCount = Math.floor(Math.random() * 3) + 1;
  randomizeMultiSelect('cc-flaws-group', flawCount);

  // Backstory elements
  randomizeTextField('cc-bs-nation', ['Fire Nation', 'Earth Kingdom', 'Water Tribe (Northern)', 'Water Tribe (Southern)', 'Air Nomads', 'Spirit World', 'United Republic / Republic City', 'Unknown / Stateless']);
  randomizeTextField('cc-bs-training', RANDOMIZE_DATA.backstoryMentors);
  randomizeTextField('cc-bs-trauma', RANDOMIZE_DATA.backstoryTraumas);
  randomizeTextField('cc-bs-mentor', RANDOMIZE_DATA.backstoryMentors);
  randomizeTextField('cc-bs-rival', RANDOMIZE_DATA.backstoryRivals);
  randomizeTextField('cc-bs-goal', RANDOMIZE_DATA.backstoryGoals);
  randomizeTextField('cc-bs-secret', RANDOMIZE_DATA.backstorySecrets);
  randomizePillSelect('cc-bs-tone-group', ['hopeful', 'dark', 'epic', 'political', 'tragic']);

  // Sliders - Personality traits
  randomizeSliders('cc-personality-sliders');

  // Sliders - Physical traits
  randomizeSliders('cc-physical-sliders');

  // Sliders - Mental traits
  randomizeSliders('cc-mental-sliders');

  // Show success toast
  showToast('✦ Character randomized!');
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Randomize a text input or select dropdown
 */
function randomizeTextField(fieldId, dataArray, count = 1) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  if (field.tagName === 'SELECT') {
    // Dropdown
    const options = Array.from(field.options).slice(1); // Skip default
    if (options.length > 0) {
      const random = options[Math.floor(Math.random() * options.length)];
      field.value = random.value;
    }
  } else if (field.tagName === 'TEXTAREA') {
    // Textarea - join multiple items
    const selected = [];
    for (let i = 0; i < count; i++) {
      selected.push(dataArray[Math.floor(Math.random() * dataArray.length)]);
    }
    field.value = selected.join('. ') + (count > 1 ? '.' : '');
  } else {
    // Text input
    field.value = dataArray[Math.floor(Math.random() * dataArray.length)];
  }
}

/**
 * Randomize pill selection (single-select)
 */
function randomizePillSelect(groupId, options) {
  const group = document.getElementById(groupId);
  if (!group) return;

  const pills = group.querySelectorAll('.cc-pill');
  
  // Clear all selections
  pills.forEach(pill => pill.classList.remove('selected'));

  // Select random pill
  if (options.length > 0) {
    const randomOption = options[Math.floor(Math.random() * options.length)];
    const targetPill = Array.from(pills).find(pill => pill.dataset.val === randomOption);
    if (targetPill) {
      targetPill.classList.add('selected');
      // Trigger change event for dependent updates
      targetPill.dispatchEvent(new Event('click', { bubbles: true }));
    }
  }
}

/**
 * Randomize multi-select (flaws)
 */
function randomizeMultiSelect(groupId, count) {
  const group = document.getElementById(groupId);
  if (!group) return;

  const pills = Array.from(group.querySelectorAll('.cc-pill[data-multi="1"]'));
  
  // Clear all selections
  pills.forEach(pill => pill.classList.remove('selected'));

  // Shuffle and select N items
  const shuffled = pills.sort(() => Math.random() - 0.5);
  const toSelect = shuffled.slice(0, Math.min(count, shuffled.length));
  toSelect.forEach(pill => pill.classList.add('selected'));
}

/**
 * Update specialty options based on selected bending
 */
function updateSpecialtyOptions(bending) {
  const group = document.getElementById('cc-specialty-group');
  if (!group) return;

  const specialties = SPECIALTIES[bending] || [];
  
  // Clear existing pills
  group.innerHTML = '';

  // Add new specialty pills
  specialties.forEach(specialty => {
    const pill = document.createElement('div');
    pill.className = 'cc-pill generic';
    pill.dataset.group = 'specialty';
    pill.dataset.val = specialty.toLowerCase();
    pill.textContent = specialty;
    group.appendChild(pill);
  });

  // Re-initialize pill click handlers if needed
  initializePillHandlers();
}

/**
 * Randomize all sliders in a container
 */
function randomizeSliders(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const sliders = container.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    // Random value within range
    const min = parseInt(slider.min) || 0;
    const max = parseInt(slider.max) || 100;
    slider.value = Math.floor(Math.random() * (max - min + 1)) + min;
    
    // Update display if there's a linked output
    const label = slider.nextElementSibling;
    if (label && label.classList.contains('slider-value')) {
      label.textContent = slider.value;
    }
  });
}

/**
 * Show a toast notification
 */
function showToast(message) {
  const toast = document.getElementById('cc-toast');
  if (toast) {
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.visibility = 'visible';
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.visibility = 'hidden';
    }, 2000);
  }
}

/**
 * Initialize pill click handlers (call this after updating specialties)
 */
function initializePillHandlers() {
  document.querySelectorAll('.cc-pill').forEach(pill => {
    if (!pill.dataset.multi) {
      // Single-select
      pill.addEventListener('click', function() {
        const group = this.parentElement;
        group.querySelectorAll('.cc-pill').forEach(p => p.classList.remove('selected'));
        this.classList.add('selected');
      });
    } else {
      // Multi-select
      pill.addEventListener('click', function() {
        this.classList.toggle('selected');
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  const randomBtn = document.getElementById('cc-random-btn');
  if (randomBtn) {
    randomBtn.addEventListener('click', randomizeCharacter);
  }

  // Initialize pill handlers
  initializePillHandlers();

  // Specialty update on bending change
  const bendingGroup = document.getElementById('cc-bending-group');
  if (bendingGroup) {
    bendingGroup.addEventListener('click', function(e) {
      if (e.target.classList.contains('cc-pill')) {
        const bending = e.target.dataset.val;
        if (bending && bending !== 'non-bender' && SPECIALTIES[bending]) {
          updateSpecialtyOptions(bending);
        }
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CLEAR FORM FUNCTION
// ════════════════════════════════════════════════════════════════════════════

function clearCharacterForm() {
  // Text inputs
  const textInputs = [
    'cc-given-name', 'cc-nick-name', 'cc-height', 'cc-weight',
    'cc-eyes', 'cc-hair', 'cc-skin', 'cc-appearance-notes',
    'cc-backstory-free', 'cc-bs-training', 'cc-bs-trauma',
    'cc-bs-mentor', 'cc-bs-rival', 'cc-bs-goal', 'cc-bs-secret'
  ];

  textInputs.forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });

  // Clear all pills
  document.querySelectorAll('.cc-pill').forEach(pill => pill.classList.remove('selected'));
  // Re-select defaults
  document.querySelector('[data-val="none"]')?.classList.add('selected');

  // Reset sliders
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.value = slider.defaultValue || 50;
  });

  // Clear image
  const imgPreview = document.getElementById('cc-img-preview');
  const imgPlaceholder = document.getElementById('cc-img-placeholder');
  const imgClearBtn = document.getElementById('cc-img-clear');
  if (imgPreview) {
    imgPreview.src = '';
    imgPreview.style.display = 'none';
  }
  if (imgPlaceholder) imgPlaceholder.style.display = 'flex';
  if (imgClearBtn) imgClearBtn.disabled = true;

  // Reset dropdowns
  ['cc-pet-select', 'cc-bs-nation'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });

  showToast('Form cleared');
}

// Hook up clear button
document.addEventListener('DOMContentLoaded', function() {
  const clearBtn = document.getElementById('cc-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearCharacterForm);
  }
});
