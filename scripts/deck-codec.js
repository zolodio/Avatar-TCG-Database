/**
 * DECK ENCODE / DECODE
 * Allows importing and exporting deck codes for Avatar TCG
 * Format: AQSD1|name|chamber|cardPairs|deckSize|customSize|strength
 */

function encodeDeck(deck) {
  var cardPairs = Object.keys(deck.cards || {})
    .map(function (n) { return n + ':' + deck.cards[n]; }).join(',');

  var raw = [
    (deck.name       || 'Unnamed').replace(/\|/g, ' '),
    (deck.chamber    || ''),
    cardPairs,
    (deck.deckSize   || 'full'),
    (deck.customSize || 60),
    (deck.strength   || '')
  ].join('|');

  try { 
    return 'AQSD1' + btoa(unescape(encodeURIComponent(raw))); 
  } catch (e) { 
    return ''; 
  }
}

function decodeDeck(code) {
  try {
    code = (code || '').trim();
    if (code.substring(0, 5) !== 'AQSD1') return null;

    var raw = decodeURIComponent(escape(atob(code.substring(5))));
    var parts = raw.split('|');
    if (parts.length < 4) return null;

    var cards = {};
    if (parts[2]) {
      parts[2].split(',').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2) { 
          var q = parseInt(p[1], 10); 
          if (q > 0) cards[p[0]] = q; 
        }
      });
    }

    return {
      name:       parts[0] || 'Unnamed',
      chamber:    parts[1] || null,
      cards:      cards,
      deckSize:   parts[3] || 'full',
      customSize: parseInt(parts[4], 10) || 60,
      strength:   parts[5] || ''
    };
  } catch (e) { 
    return null; 
  }
}

/**
 * Convert a decoded deck object to a card template array
 * @param {Object} decodedDeck - Result from decodeDeck()
 * @returns {Array} Template array compatible with buildDeck()
 */
function deckToTemplate(decodedDeck) {
  const template = [];
  for (const [cardId, count] of Object.entries(decodedDeck.cards)) {
    template.push({ id: cardId, count: count });
  }
  return template;
}

/**
 * Convert a template array to a deck object for encoding
 * @param {Array} template - Template array like AANG_DECK_TEMPLATE
 * @param {String} name - Deck name
 * @param {String} chamber - Chamber/character ID
 * @returns {Object} Deck object ready for encoding
 */
function templateToDeck(template, name, chamber) {
  const cards = {};
  for (const entry of template) {
    cards[entry.id] = entry.count;
  }
  return {
    name: name,
    chamber: chamber,
    cards: cards,
    deckSize: 'full',
    customSize: 60,
    strength: ''
  };
}
