// ================================================================
//  AVATAR TCG — Supabase Price Loader
//  Replaces the GitHub prices.json fetch with a Supabase query.
//
//  HOW TO INSTALL:
//    Add this ONE line to index.html, right after supabase-config.js:
//      <script src="scripts/prices.js"></script>
//
//  IMPORTANT RLS SETUP:
//    For prices table, ensure your RLS policies allow:
//    - SELECT for authenticated users, OR
//    - SELECT with "Enable read access for anonymous users" policy
// ================================================================
(function () {
  'use strict';

  window.loadPrices = async function loadPrices() {
    // Guard: Supabase SDK and config must be loaded first
    if (!window.supabase || typeof SUPABASE_URL === 'undefined' ||
        SUPABASE_URL.indexOf('YOUR_PROJECT') !== -1) {
      console.warn('[Prices] Supabase not configured — skipping price load.');
      window.pricesLoaded = true;
      return;
    }

    // Use the globally shared Supabase client if available,
    // otherwise create a new one (for anonymous reads)
    var sb = window.sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
      console.log('[Prices] Fetching price data from Supabase…');
      
      var res = await sb
        .from('prices')
        .select('card_number, low, avg, high, sales');

      if (res.error) {
        console.error('[Prices] ❌ Supabase query error:', res.error.message || res.error);
        throw res.error;
      }

      if (!res.data) {
        console.warn('[Prices] ⚠️  No data returned from query');
        window.prices = {};
        window.pricesLoaded = true;
        return;
      }

      console.log('[Prices] Received ' + res.data.length + ' rows from Supabase');

      var map = {};
      var entriesWithAvg = 0;
      
      (res.data || []).forEach(function (row) {
        if (!row.card_number) return;
        
        // Safely convert to numbers
        var low  = row.low !== null && row.low !== undefined ? Number(row.low) : 0;
        var avg  = row.avg !== null && row.avg !== undefined ? Number(row.avg) : 0;
        var high = row.high !== null && row.high !== undefined ? Number(row.high) : 0;
        var sales = row.sales !== null && row.sales !== undefined ? Number(row.sales) : 0;

        // Only add entry if we have valid avg price
        if (avg > 0 && !isNaN(avg)) {
          map[row.card_number] = {
            low:   low,
            avg:   avg,
            high:  high,
            sales: sales
          };
          entriesWithAvg++;
        }
      });

      window.prices = map;
      console.log('[Prices] ✅ Loaded ' + entriesWithAvg + ' price entries with avg values from ' + res.data.length + ' total rows');

    } catch (e) {
      console.error('[Prices] ❌ Failed to load prices:', e.message || e);
      console.error('[Prices] Debug info:', e);
      window.prices = {};
    }

    window.pricesLoaded = true;
  };

})();
