// ── DIGITAL COLLECTION MODULE ────────────────────────────────────────
class DigitalCollection {
  constructor(cardDatabase) {
    this.cards = [];
    this.cardDatabase = cardDatabase;
    this.storageKey = 'avatar_digital_collection';
    this.loadFromStorage();
  }

  // Add card from redemption code
  addCardFromCode(code) {
    const payload = decodeRedemptionCode(code);
    if (!payload) return { success: false, error: 'Invalid redemption code' };

    // Validate timestamp isn't too old (optional: prevent ancient codes)
    const codeAge = Date.now() - payload.t;
    if (codeAge > 30 * 24 * 60 * 60 * 1000) { // 30 days
      return { success: false, error: 'Code has expired' };
    }

    // Add each card from the code
    const addedCards = [];
    for (const cardNumber of payload.c) {
      const cardData = this.cardDatabase.findCard(cardNumber);
      if (!cardData) {
        console.warn(`Card ${cardNumber} not found in database`);
        continue;
      }

      const digitalCard = {
        id: generateUUID(),
        number: cardNumber,
        ...cardData,
        acquiredAt: payload.t,
        source: 'digital',
        codeUsed: code,
        packTypeId: payload.p
      };

      this.cards.push(digitalCard);
      addedCards.push(digitalCard);
    }

    this.saveToStorage();
    return { 
      success: true, 
      cardsAdded: addedCards,
      message: `Added ${addedCards.length} card(s) to digital collection`
    };
  }

  // Get all digital cards
  getAllCards() {
    return [...this.cards];
  }

  // Filter by rarity, type, etc.
  filterCards(criteria) {
    return this.cards.filter(card => {
      if (criteria.rarity && card.rarity !== criteria.rarity) return false;
      if (criteria.type && card.type !== criteria.type) return false;
      if (criteria.set && card.set !== criteria.set) return false;
      return true;
    });
  }

  // Get statistics
  getStats() {
    return {
      totalCards: this.cards.length,
      byRarity: this.groupBy('rarity'),
      byType: this.groupBy('type'),
      bySet: this.groupBy('set')
    };
  }

  private groupBy(key) {
    return this.cards.reduce((acc, card) => {
      acc[card[key]] = (acc[card[key]] || 0) + 1;
      return acc;
    }, {});
  }

  // Persistence
  saveToStorage() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.cards));
  }

  loadFromStorage() {
    const stored = localStorage.getItem(this.storageKey);
    this.cards = stored ? JSON.parse(stored) : [];
  }

  clearCollection() {
    this.cards = [];
    localStorage.removeItem(this.storageKey);
  }
}

// ── UI INTEGRATION ────────────────────────────────────────────────────
function initDigitalCollectionTab() {
  const digitalCollection = new DigitalCollection(cardDatabase);

  // Create redemption input area
  const inputPanel = `
    <div class="digital-redemption-panel">
      <h3>Redeem Digital Pack</h3>
      <textarea id="redemption-code-input" placeholder="Paste AQS3... code here"></textarea>
      <button id="btn-redeem">Redeem Code</button>
      <div id="redemption-message"></div>
    </div>
  `;

  document.getElementById('digital-collection-tab').innerHTML += inputPanel;

  // Wire up redemption button
  document.getElementById('btn-redeem').addEventListener('click', () => {
    const code = document.getElementById('redemption-code-input').value.trim();
    const result = digitalCollection.addCardFromCode(code);
    
    const messageEl = document.getElementById('redemption-message');
    messageEl.className = result.success ? 'success' : 'error';
    messageEl.textContent = result.message || result.error;

    if (result.success) {
      document.getElementById('redemption-code-input').value = '';
      updateDigitalCollectionDisplay(digitalCollection);
    }
  });
}

function updateDigitalCollectionDisplay(digitalCollection) {
  const stats = digitalCollection.getStats();
  const collectionHTML = `
    <div class="digital-stats">
      <p>Total Cards: ${stats.totalCards}</p>
      <div class="stats-breakdown">
        ${Object.entries(stats.byRarity).map(([r, c]) => 
          `<span>${r}: ${c}</span>`
        ).join('')}
      </div>
    </div>
    <div class="digital-cards-grid">
      ${digitalCollection.getAllCards().map(card => `
        <div class="digital-card">
          <img src="${card.imageLink}" alt="${card.name}">
          <p>${card.name}</p>
          <p class="card-number">#${card.number}</p>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('digital-cards-display').innerHTML = collectionHTML;
}
