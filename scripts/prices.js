// ================================================================
//  AVATAR TCG — Supabase Price Loader
//  Replaces the GitHub prices.json fetch with a Supabase query.
//
//  HOW TO INSTALL:
//    Add this ONE line to index.html, right after supabase-config.js:
//      <script src="scripts/prices.js"></script>
// ================================================================
(function () {
  'use strict';

  // Override the loadPrices function defined in index.html.
  // This runs before init() actually calls loadPrices(), so the
  // Supabase version will be used instead of the GitHub raw fetch.
  window.loadPrices = async function loadPrices() {
    // Guard: Supabase SDK and config must be loaded first
    if (!window.supabase || typeof SUPABASE_URL === 'undefined' ||
        SUPABASE_URL.indexOf('YOUR_PROJECT') !== -1) {
      console.warn('[Prices] Supabase not configured — skipping price load.');
      window.pricesLoaded = true;
      return;
    }

    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
      var res = await sb
        .from('prices')
        .select('card_number, low, avg, high, sales');

      if (res.error) throw res.error;

      var map = {};
      (res.data || []).forEach(function (row) {
        if (row.avg) {
          map[row.card_number] = {
            low:   parseFloat(row.low)  || 0,
            avg:   parseFloat(row.avg)  || 0,
            high:  parseFloat(row.high) || 0,
            sales: row.sales            || 0
          };
        }
      });

      window.prices = map;
      console.log('[Prices] Loaded ' + Object.keys(map).length + ' price entries from Supabase.');

    } catch (e) {
      console.warn('[Prices] Failed to load from Supabase:', e.message || e);
      window.prices = {};
    }

    window.pricesLoaded = true;
  };

})();
