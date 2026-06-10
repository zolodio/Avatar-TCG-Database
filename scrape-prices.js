// ================================================================
//  AVATAR TCG — eBay Price Scraper → Supabase
// ================================================================
//  Usage:
//    node scrape-prices.js              — update ALL cards
//    node scrape-prices.js --card=AME001  — update ONE card (for testing)
//    node scrape-prices.js --dry-run    — fetch prices but don't save
//
//  Prerequisites:
//    1. Copy .env.example → .env and fill in your keys
//    2. npm install
//    3. Run the SQL in create-prices-table.sql in Supabase
// ================================================================

import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────
const EBAY_APP_ID   = process.env.EBAY_APP_ID             || '';
const SUPABASE_URL  = process.env.SUPABASE_URL             || '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY     || '';
const RESULTS_COUNT = parseInt(process.env.EBAY_RESULTS_PER_CARD || '30', 10);
const DELAY_MS      = parseInt(process.env.DELAY_MS || '800', 10);
const CSV_URL       = process.env.CSV_URL ||
  'https://raw.githubusercontent.com/zolodio/Avatar-TCG-Database/main/Extended%20Database.csv';

// ── Parse CLI args ────────────────────────────────────────────────
const args       = process.argv.slice(2);
const singleCard = args.find(a => a.startsWith('--card='))?.split('=')[1] || null;
const dryRun     = args.includes('--dry-run');

// ── Load price overrides ──────────────────────────────────────────
const __dir = path.dirname(fileURLToPath(import.meta.url));

function loadOverrides() {
  try {
    const raw  = readFileSync(path.join(__dir, 'price-overrides.json'), 'utf8');
    const data = JSON.parse(raw);
    const overrides = data.overrides || {};
    const clean = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (k.startsWith('EXAMPLE') || !v || typeof v !== 'string') continue;
      clean[k] = v;
    }
    return clean;
  } catch {
    console.warn('⚠  Could not read price-overrides.json — using auto search terms for all cards.');
    return {};
  }
}

// ── Build eBay search term from card ─────────────────────────────
//
//  The eBay search term that matches individual Avatar TCG card
//  listings is the card's set-prefixed identifier with a
//  zero-padded 3-digit number: e.g. AME001, STRT007, SHDW042.
//
//  CSV Number column contains:
//    • Plain integers (1, 2, 3…)  → combine with Set column → AME001
//    • Pre-formatted codes (STRT001, RLBK001…) → use as-is
//
function buildSearchTerm(card) {
  // Already has letters in the number field → use directly
  if (/[A-Za-z]/.test(card.number)) {
    return card.number;
  }
  // Pure numeric → SET + zero-padded 3 digits
  const padded = card.number.padStart(3, '0');
  return card.set ? `${card.set}${padded}` : padded;
}

// ── Fetch card list from GitHub CSV ──────────────────────────────
async function fetchCards() {
  console.log('📋 Fetching card list from GitHub…');
  const res  = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`CSV fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV appears empty');

  function parseLine(line) {
    const parts = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    parts.push(cur.trim());
    return parts;
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/"/g, '').trim());
  const numIdx  = headers.indexOf('Number');
  const nameIdx = headers.indexOf('Name');
  const setIdx  = headers.indexOf('Set');

  if (numIdx  === -1) throw new Error('CSV missing Number column');
  if (nameIdx === -1) throw new Error('CSV missing Name column');
  if (setIdx  === -1) console.warn('⚠  CSV missing Set column — numeric card IDs will not be prefixed');

  return lines.slice(1).map(line => {
    const p = parseLine(line);
    return {
      number: (p[numIdx]  || '').replace(/"/g, '').trim(),
      name:   (p[nameIdx] || '').replace(/"/g, '').trim(),
      set:    setIdx !== -1 ? (p[setIdx] || '').replace(/"/g, '').trim() : ''
    };
  }).filter(c => c.number && c.name);
}

// ── eBay Finding API ──────────────────────────────────────────────
const EBAY_API = 'https://svcs.ebay.com/services/search/FindingService/v1';

async function searchEbaySold(searchTerm) {
  const params = new URLSearchParams({
    'OPERATION-NAME':                 'findCompletedItems',
    'SERVICE-VERSION':                '1.0.0',
    'SECURITY-APPNAME':               EBAY_APP_ID,
    'RESPONSE-DATA-FORMAT':           'JSON',
    'keywords':                       searchTerm,
    'itemFilter(0).name':             'SoldItemsOnly',
    'itemFilter(0).value':            'true',
    'sortOrder':                      'EndTimeSoonest',
    'paginationInput.entriesPerPage': String(RESULTS_COUNT)
  });

  const res = await fetch(`${EBAY_API}?${params}`, {
    headers: { 'User-Agent': 'AvatarTCGPriceScraper/1.0' }
  });

  if (!res.ok) throw new Error(`eBay API HTTP ${res.status}`);

  const data = await res.json();

  const ack = data?.findCompletedItemsResponse?.[0]?.ack?.[0];
  if (ack === 'Failure') {
    const errMsg = data?.findCompletedItemsResponse?.[0]?.errorMessage?.[0]
                       ?.error?.[0]?.message?.[0] || 'Unknown eBay error';
    throw new Error(`eBay API: ${errMsg}`);
  }

  const items = data?.findCompletedItemsResponse?.[0]
                    ?.searchResult?.[0]?.item || [];

  const priceList = items
    .map(item => parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
    .filter(p => !isNaN(p) && p > 0)
    .sort((a, b) => a - b);

  if (priceList.length === 0) return null;

  const low  = priceList[0];
  const high = priceList[priceList.length - 1];
  const avg  = Math.round((priceList.reduce((s, p) => s + p, 0) / priceList.length) * 100) / 100;

  return { low, avg, high, sales: priceList.length };
}

// ── Delay helper ──────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (!EBAY_APP_ID || EBAY_APP_ID.includes('xxxxxxxx')) {
    console.error('❌ EBAY_APP_ID not set in .env');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env');
    process.exit(1);
  }

  console.log('🚀 Avatar TCG Price Scraper');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no saves)' : 'LIVE'}`);
  if (singleCard) console.log(`   Single card: ${singleCard}`);
  console.log('');

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let allCards = await fetchCards();
  console.log(`✅ Found ${allCards.length} cards in CSV`);

  const overrides = loadOverrides();
  const overrideCount = Object.keys(overrides).length;
  if (overrideCount > 0) console.log(`🔧 Loaded ${overrideCount} custom search override(s)`);

  // singleCard can be the formatted ID (AME001) or the raw number (1)
  if (singleCard) {
    allCards = allCards.filter(c => {
      const ebayId = buildSearchTerm(c);
      return c.number === singleCard || ebayId === singleCard;
    });
    if (allCards.length === 0) {
      console.error(`❌ Card "${singleCard}" not found in CSV`);
      process.exit(1);
    }
  }

  console.log(`\n⏳ Scraping ${allCards.length} card(s)…\n`);

  const results    = { updated: [], noData: [], errors: [] };
  const upsertBatch = [];

  for (let i = 0; i < allCards.length; i++) {
    const card       = allCards[i];
    const ebayId     = buildSearchTerm(card);               // e.g. AME001
    const searchTerm = overrides[card.number] || overrides[ebayId] || ebayId;

    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${allCards.length}] ${ebayId.padEnd(8)} ${card.name.padEnd(30)} → "${searchTerm}"  `
    );

    try {
      const priceData = await searchEbaySold(searchTerm);

      if (!priceData) {
        process.stdout.write('⚪ No data\n');
        results.noData.push({ number: card.number, ebayId, name: card.name });
      } else {
        process.stdout.write(
          `✅ $${priceData.low.toFixed(2)} / $${priceData.avg.toFixed(2)} / $${priceData.high.toFixed(2)}  (${priceData.sales} sales)\n`
        );
        upsertBatch.push({
          card_number: card.number,   // original CSV key (matches prices.js lookup)
          ebay_id:     ebayId,        // formatted ID used for search (AME001, etc.)
          low:         priceData.low,
          avg:         priceData.avg,
          high:        priceData.high,
          sales:       priceData.sales,
          search_term: searchTerm,
          updated_at:  new Date().toISOString()
        });
        results.updated.push(ebayId);
      }
    } catch (err) {
      process.stdout.write(`❌ Error: ${err.message}\n`);
      results.errors.push({ number: card.number, ebayId, name: card.name, error: err.message });
    }

    // Flush batch every 50 cards or on last card
    if (!dryRun && upsertBatch.length > 0 && (upsertBatch.length % 50 === 0 || i === allCards.length - 1)) {
      const batch = upsertBatch.splice(0);
      const { error } = await sb.from('prices').upsert(batch, { onConflict: 'card_number' });
      if (error) console.error('\n⚠  Supabase upsert error:', error.message);
    }

    if (i < allCards.length - 1) await sleep(DELAY_MS);
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✅ Updated:  ${results.updated.length} cards`);
  console.log(`  ⚪ No data:  ${results.noData.length} cards`);
  console.log(`  ❌ Errors:   ${results.errors.length} cards`);

  if (results.noData.length > 0) {
    console.log('\n📝 CARDS WITH NO RESULTS — add to price-overrides.json to tune:');
    console.log('─'.repeat(60));
    results.noData.forEach(c => {
      console.log(`  "${c.number}": "${c.ebayId}",   // was: "${c.name}"`);
    });
    console.log('\n  → Re-run: node scrape-prices.js --card=' + results.noData[0]?.ebayId + '  to test one card');
  }

  if (results.errors.length > 0) {
    console.log('\n⚠  ERRORS:');
    results.errors.forEach(e => console.log(`  ${e.ebayId} ${e.name}: ${e.error}`));
  }

  if (dryRun) {
    console.log('\n⚠  DRY RUN — nothing was saved to Supabase.');
  } else {
    console.log(`\n✅ Done! ${results.updated.length} price rows saved to Supabase.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
