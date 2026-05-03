/* deck-sync.js — persistence + Supabase sync for the Deck Builder
   Depends on: deck-builder.js (defines S, saveDecks, pushDecksToSupabase)
   Must be loaded AFTER deck-builder.js in the HTML.
*/

function persistDeck(deck) {
  var idx = S.decks.findIndex(function (d) { return d.id === deck.id; });
  if (idx !== -1) {
    S.decks[idx] = deck;
  } else {
    S.decks.push(deck);
  }
  saveDecks();
  pushDecksToSupabase();
}

function removeDeck(deckId) {
  S.decks = S.decks.filter(function (d) { return d.id !== deckId; });
  saveDecks();
  pushDecksToSupabase();
}
