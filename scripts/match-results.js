/* ═══════════════════════════════════════════════════════════════════════
   match-results.js  —  Avatar TCG Battle Result Screen
   
   Handles:
   • Victory/Loss screens visible to both players
   • Winner receives unique pack code/link
   • Loser receives random common card
   • Real-time result synchronization via Supabase
   
   Usage:
     MatchResults.showResult(matchData, currentUserId)
   
   matchData structure:
     {
       matchId: 'uuid',
       winnerId: 'uuid',
       loserId: 'uuid',
       winnerUsername: 'string',
       loserUsername: 'string',
       winnerCardCount: 'number',
       loserCardCount: 'number'
     }
   ════════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var MatchResults = window.MatchResults || {};

  // ── CONSTANTS ─────────────────────────────────────────────
  var COMMON_CARD_IDS = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'
  ];

  var DC_KEY = 'aqtcg_digital_v1';

  // ── STATE ─────────────────────────────────────────────
  var resultScreenEl = null;
  var overlayEl = null;
  var currentMatchData = null;

  // ── HELPER: Get random common card ────────────────────
  function getRandomCommonCard() {
    var randomIdx = Math.floor(Math.random() * COMMON_CARD_IDS.length);
    return COMMON_CARD_IDS[randomIdx];
  }

  // ── HELPER: Add card to collection ────────────────────
  function addCardToCollection(cardNumber, quantity) {
    try {
      var dc = {};
      var stored = localStorage.getItem(DC_KEY);
      if (stored) {
        dc = JSON.parse(stored);
      }
      
      var now = new Date().toISOString();
      
      if (!dc[cardNumber]) {
        dc[cardNumber] = { qty: 0, lastAcquired: now };
      }
      
      dc[cardNumber].qty = (dc[cardNumber].qty || 0) + (quantity || 1);
      dc[cardNumber].lastAcquired = now;
      
      localStorage.setItem(DC_KEY, JSON.stringify(dc));
      
      // Expose globally and trigger sync
      window.aqstDigitalCollection = dc;
      if (typeof window._aqst_cloudSync === 'function') {
        window._aqst_cloudSync();
      }
      
      return true;
    } catch (e) {
      console.error('Error adding card to collection:', e);
      return false;
    }
  }

  // ── HELPER: Generate unique winner pack code ──────────
  function generateWinnerPackCode(winnerId, matchId) {
    var timestamp = Date.now();
    var random = Math.random().toString(36).substr(2, 9);
    var packId = 'BATTLE_' + matchId.substr(0, 8) + '_' + random.toUpperCase();
    
    // This creates a unique identifier that links to the booster site
    // The booster site should check for ?pack=BATTLE_* codes
    return {
      packId: packId,
      winnerId: winnerId,
      matchId: matchId,
      timestamp: timestamp,
      url: window.location.origin + '/booster/?pack=' + encodeURIComponent(packId)
    };
  }

  // ── HELPER: Sanitize HTML ─────────────────────────────
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── CREATE RESULT SCREEN ──────────────────────────────
  function createResultScreen() {
    // Remove if exists
    if (resultScreenEl) resultScreenEl.remove();
    if (overlayEl) overlayEl.remove();

    // Overlay
    overlayEl = document.createElement('div');
    overlayEl.id = 'match-result-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    // Result screen
    resultScreenEl = document.createElement('div');
    resultScreenEl.id = 'match-result-screen';
    resultScreenEl.style.cssText = `
      position: relative;
      width: 90%;
      max-width: 500px;
      max-height: 85vh;
      background: linear-gradient(135deg, #0f1322 0%, #151a2c 100%);
      border: 1px solid #252a42;
      border-radius: 16px;
      padding: 0;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
      animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
    `;

    overlayEl.appendChild(resultScreenEl);
    document.body.appendChild(overlayEl);

    return resultScreenEl;
  }

  // ── RENDER VICTORY SCREEN ────────────────────────────
  function renderVictoryScreen(matchData, isViewer) {
    var screen = createResultScreen();
    
    var winnerName = escapeHtml(matchData.winnerUsername || 'Champion');
    var loserName = escapeHtml(matchData.loserUsername || 'Opponent');

    var header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(135deg, #b44ddf 0%, #4a7dff 100%);
      padding: 32px 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
    `;
    header.innerHTML = `
      <div style="position: absolute; inset: 0; opacity: 0.1; font-size: 120px; display: flex; align-items: center; justify-content: center;">
        <i class="fas fa-crown"></i>
      </div>
      <div style="position: relative; z-index: 1;">
        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.8); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;">
          ${isViewer ? 'YOU WON!' : 'VICTORY FOR'}
        </div>
        <div style="font-family: 'Cinzel', serif; font-size: 1.8rem; font-weight: 700; color: #fff; margin-bottom: 4px;">
          ${isViewer ? 'Victory!' : winnerName + ' won!'}
        </div>
      </div>
    `;
    screen.appendChild(header);

    var content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      padding: 32px 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    // Match summary
    var summary = document.createElement('div');
    summary.style.cssText = `
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #8b8fa8;
    `;
    summary.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <span>${winnerName}</span>
        <span style="color: #3db86c; font-weight: 700;">${matchData.winnerCardCount || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>${loserName}</span>
        <span style="color: #e04848; font-weight: 700;">${matchData.loserCardCount || 0}</span>
      </div>
    `;
    content.appendChild(summary);

    if (isViewer) {
      // Winner pack offer
      var packDiv = document.createElement('div');
      packDiv.style.cssText = `
        background: linear-gradient(135deg, rgba(180, 77, 223, 0.15) 0%, rgba(74, 125, 255, 0.15) 100%);
        border: 1.5px solid rgba(180, 77, 223, 0.4);
        border-radius: 12px;
        padding: 18px 16px;
        text-align: center;
      `;
      packDiv.innerHTML = `
        <div style="font-size: 0.7rem; color: #b44ddf; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; font-weight: 700;">
          Victory Prize
        </div>
        <div style="font-size: 0.9rem; color: #e8e6f0; margin-bottom: 12px; line-height: 1.5;">
          You've earned a special victory booster pack! Click below to open it.
        </div>
        <button id="btn-open-victory-pack" style="
          width: 100%;
          padding: 12px 16px;
          background: linear-gradient(135deg, #b44ddf, #4a7dff);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-family: 'Cinzel', serif;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.04em;
        ">
          OPEN PACK
        </button>
      `;
      content.appendChild(packDiv);

      // Store winner pack info for later use
      var winnerPack = generateWinnerPackCode(matchData.winnerId, matchData.matchId);
      resultScreenEl._winnerPackCode = winnerPack;
    } else {
      // Loser consolation
      var consolationDiv = document.createElement('div');
      consolationDiv.style.cssText = `
        background: linear-gradient(135deg, rgba(61, 184, 108, 0.1) 0%, rgba(74, 125, 255, 0.08) 100%);
        border: 1.5px solid rgba(61, 184, 108, 0.3);
        border-radius: 12px;
        padding: 18px 16px;
        text-align: center;
      `;
      consolationDiv.innerHTML = `
        <div style="font-size: 0.7rem; color: #6fda80; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; font-weight: 700;">
          Consolation Prize
        </div>
        <div style="font-size: 0.9rem; color: #e8e6f0; line-height: 1.5;">
          You've received a random common card from the collection. Better luck next battle!
        </div>
      `;
      content.appendChild(consolationDiv);

      // Award loser a random common card
      var randomCard = getRandomCommonCard();
      addCardToCollection(randomCard, 1);
      resultScreenEl._loserRewardCard = randomCard;
    }

    content.appendChild(document.createElement('div'));
    screen.appendChild(content);

    // Footer
    var footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    `;

    var btnReturn = document.createElement('button');
    btnReturn.textContent = 'Return to Collection';
    btnReturn.style.cssText = `
      flex: 1;
      min-width: 140px;
      padding: 12px 16px;
      background: #1b2238;
      border: 1px solid #252a42;
      border-radius: 8px;
      color: #8b8fa8;
      font-family: 'Nunito Sans', sans-serif;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    `;
    btnReturn.addEventListener('mouseover', function() {
      this.style.borderColor = '#4a7dff';
      this.style.color = '#4a7dff';
    });
    btnReturn.addEventListener('mouseout', function() {
      this.style.borderColor = '#252a42';
      this.style.color = '#8b8fa8';
    });
    btnReturn.addEventListener('click', function() {
      MatchResults.close();
    });
    footer.appendChild(btnReturn);

    var btnShare = document.createElement('button');
    btnShare.textContent = 'Share Battle';
    btnShare.style.cssText = `
      flex: 1;
      min-width: 140px;
      padding: 12px 16px;
      background: transparent;
      border: 1.5px solid #b44ddf;
      border-radius: 8px;
      color: #b44ddf;
      font-family: 'Nunito Sans', sans-serif;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    `;
    btnShare.addEventListener('mouseover', function() {
      this.style.background = 'rgba(180, 77, 223, 0.1)';
    });
    btnShare.addEventListener('mouseout', function() {
      this.style.background = 'transparent';
    });
    btnShare.addEventListener('click', function() {
      if (navigator.share) {
        navigator.share({
          title: 'Avatar TCG Battle',
          text: winnerName + ' defeated ' + loserName + ' in Avatar TCG!',
          url: window.location.href
        });
      }
    });
    footer.appendChild(btnShare);

    screen.appendChild(footer);

    // Add CSS animations if not already added
    if (!document.getElementById('match-result-animations')) {
      var style = document.createElement('style');
      style.id = 'match-result-animations';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `;
      document.head.appendChild(style);
    }

    // Set up event delegation for buttons
    setTimeout(function() {
      var btnOpenPack = document.getElementById('btn-open-victory-pack');
      if (btnOpenPack) {
        btnOpenPack.addEventListener('click', function() {
          MatchResults.openWinnerPack();
        });
      }
    }, 100);
  }

  // ── PUBLIC API ────────────────────────────────────────
  MatchResults.showResult = function(matchData, currentUserId) {
    if (!matchData || !matchData.matchId) {
      console.error('Invalid match data');
      return;
    }

    currentMatchData = matchData;
    var isViewer = matchData.winnerId === currentUserId;
    
    renderVictoryScreen(matchData, isViewer);
  };

  MatchResults.openWinnerPack = function() {
    if (!resultScreenEl || !resultScreenEl._winnerPackCode) {
      console.error('No winner pack available');
      return;
    }

    var packCode = resultScreenEl._winnerPackCode;
    var boosterUrl = '/booster/?pack=' + encodeURIComponent(packCode.packId);
    
    // Store pack info for booster site to pick up
    sessionStorage.setItem('battleWinnerPack', JSON.stringify(packCode));
    
    window.location.href = boosterUrl;
  };

  MatchResults.close = function() {
    if (resultScreenEl) resultScreenEl.remove();
    if (overlayEl) overlayEl.remove();
    resultScreenEl = null;
    overlayEl = null;
    currentMatchData = null;
  };

  MatchResults.getWinnerPackCode = function(winnerId, matchId) {
    return generateWinnerPackCode(winnerId, matchId);
  };

  MatchResults.awardLoserCard = function(cardNumber) {
    return addCardToCollection(cardNumber, 1);
  };

  MatchResults.getRandomCommonCard = function() {
    return getRandomCommonCard();
  };

  // Expose globally
  window.MatchResults = MatchResults;

})();
