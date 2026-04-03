"""
fetch_prices.py
Fetches recent eBay sold prices for Avatar Quick Strike TCG cards
and writes prices.json to the repo root.

Structure of prices.json:
{
  "updated": "2025-01-15T06:00:00Z",
  "prices": {
    "1":    { "low": 0.49, "avg": 1.20, "high": 3.00, "sales": 6 },
    "235":  { "low": 8.00, "avg": 14.50, "high": 22.00, "sales": 3 },
    ...
  }
}

The site fetches this file once per page load and reads prices[card.number].
"""

import os
import re
import csv
import json
import time
import math
import requests
from datetime import datetime, timezone
from urllib.parse import urlencode
from io import StringIO
from difflib import SequenceMatcher

# ── Config ─────────────────────────────────────────────────────────────────
EBAY_APP_ID = os.environ.get("EBAY_APP_ID", "")
CSV_URL = (
    "https://raw.githubusercontent.com/zolodio/Avatar-TCG-Database"
    "/main/Extended%20Database.csv"
)
FINDING_API = "https://svcs.ebay.com/services/search/FindingService/v1"
OUTPUT_PATH = "prices.json"

# How many broad-search pages to pull (100 items each → 400 eBay listings total)
BROAD_PAGES = 4

# For rares/zenemental/promo also do a targeted single-card search
TARGETED_RARITIES = {"rare", "zenemental", "promo"}

# Fuzzy-match threshold: 0–1, higher = stricter
MATCH_THRESHOLD = 0.72

# Seconds between API calls (stay well under rate limits)
SLEEP_BETWEEN = 0.4


# ── Helpers ────────────────────────────────────────────────────────────────
def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def median(lst: list[float]) -> float:
    s = sorted(lst)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def normalize_title(title: str) -> str:
    """Strip common noise words so card names match better."""
    noise = re.compile(
        r"\b(holo|foil|nm|nm-?mt|mp|lp|sp|exc|vg|g|psa|bgs|cgc"
        r"|lot|set|common|uncommon|rare|promo|tcg|trading card"
        r"|avatar|last airbender|quick strike|qs|single"
        r"|card game|\d+/\d+|\(\d+\))\b",
        re.IGNORECASE,
    )
    cleaned = noise.sub(" ", title)
    return re.sub(r"\s+", " ", cleaned).strip()


# ── eBay API ────────────────────────────────────────────────────────────────
def ebay_completed_items(keywords: str, page: int = 1, per_page: int = 100) -> list[dict]:
    """
    Call eBay Finding API findCompletedItems (sold items only).
    Returns list of {"title": str, "price": float}.
    """
    if not EBAY_APP_ID:
        print("  [WARN] EBAY_APP_ID not set – skipping API call")
        return []

    params = {
        "OPERATION-NAME": "findCompletedItems",
        "SERVICE-VERSION": "1.0.0",
        "SECURITY-APPNAME": EBAY_APP_ID,
        "RESPONSE-DATA-FORMAT": "JSON",
        "keywords": keywords,
        "itemFilter(0).name": "SoldItemsOnly",
        "itemFilter(0).value": "true",
        "itemFilter(1).name": "ListingType",
        "itemFilter(1).value(0)": "AuctionWithBIN",
        "itemFilter(1).value(1)": "FixedPrice",
        "itemFilter(1).value(2)": "Auction",
        "paginationInput.pageNumber": page,
        "paginationInput.entriesPerPage": per_page,
        "sortOrder": "EndTimeSoonest",
    }

 def safe_request(url, params, retries=3):
    for i in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if i == retries - 1:
                print(f"[ERROR] अंतिम failure: {e}")
                return None
            time.sleep(1.5 * (i + 1))

    results = []
    try:
        items = (
            data["findCompletedItemsResponse"][0]
            .get("searchResult", [{}])[0]
            .get("item", [])
        )
        for item in items:
            title = item.get("title", [""])[0]
            price_info = item.get("sellingStatus", [{}])[0].get("currentPrice", [{}])[0]
            price = float(price_info.get("__value__", 0))
            currency = price_info.get("@currencyId", "USD")
            # Only keep USD listings (most eBay.com results)
            if currency in ("USD", "US $", None) and price > 0:
                results.append({"title": title, "price": price})
    except (KeyError, IndexError, TypeError, ValueError):
        pass

    return results


# ── Card CSV ────────────────────────────────────────────────────────────────
def fetch_cards() -> list[dict]:
    resp = requests.get(CSV_URL, timeout=20)
    resp.raise_for_status()
    reader = csv.DictReader(StringIO(resp.text))
    cards = []
    for row in reader:
        number = row.get("Number", "").strip()
        name = row.get("Name", "").strip()
        rarity = row.get("Rarity", "").strip().lower()
        if number and name:
            cards.append({"number": number, "name": name, "rarity": rarity})
    return cards


# ── Matching ────────────────────────────────────────────────────────────────
def match_listings_to_cards(
    listings: list[dict], cards: list[dict]
) -> dict[str, list[float]]:
    """
    For each eBay listing, find the best-matching card and accumulate its price.
    Returns { card_number: [price, price, …] }.
    """
    card_lookup = {c["number"]: c["name"] for c in cards}
    prices_by_card: dict[str, list[float]] = {}

    for listing in listings:
        title_clean = normalize_title(listing["title"])
        best_num = None
        best_score = 0.0

        for num, card_name in card_lookup.items():
            score = similarity(title_clean, card_name)
            # Also try matching card number in title (e.g. "... 47/235")
            if re.search(rf"\b{re.escape(num)}\b", listing["title"]):
                score = max(score, 0.80)
            if score > best_score:
                best_score = score
                best_num = num

        if best_num and best_score >= MATCH_THRESHOLD:
            prices_by_card.setdefault(best_num, []).append(listing["price"])

    return prices_by_card


def aggregate(prices: list[float]) -> dict:
    if not prices:
        return {}
    return {
        "low": round(min(prices), 2),
        "avg": round(sum(prices) / len(prices), 2),
        "med": round(median(prices), 2),
        "high": round(max(prices), 2),
        "sales": len(prices),
    }


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    print("==> Fetching card list from GitHub CSV …")
    cards = fetch_cards()
    print(f"    {len(cards)} cards loaded")

    all_listings: list[dict] = []

    # 1. Broad searches to catch bulk/lot listings and common cards
broad_queries = [
    "Avatar Quick Strike card -lot -bundle",
    "Avatar Quick Strike single card",
]
    for query in broad_queries:
        for page in range(1, BROAD_PAGES + 1):
            print(f'  Broad search p{page}: "{query[:50]}"')
            listings = ebay_completed_items(query, page=page)
            all_listings.extend(listings)
            print(f"    → {len(listings)} results")
            time.sleep(SLEEP_BETWEEN)

    # 2. Targeted searches for high-rarity cards
    targeted_cards = [c for c in cards if c["rarity"] in TARGETED_RARITIES]
    print(f"\n==> Targeted searches for {len(targeted_cards)} rare/zen/promo cards …")
    for card in targeted_cards:
        query = f'Avatar Quick Strike "{card["name"]}"'
        print(f"  → {card['number']} {card['name']}")
        listings = ebay_completed_items(query, page=1, per_page=25)
        # Tag these listings so matching is easier: prepend the card name
        for lst in listings:
            lst["_card_hint"] = card["number"]
        all_listings.extend(listings)
        time.sleep(SLEEP_BETWEEN)

    print(f"\n==> Total listings collected: {len(all_listings)}")

    # Apply card number hint from targeted searches
    prices_by_card: dict[str, list[float]] = {}
    hinted = [l for l in all_listings if "_card_hint" in l]
    normal = [l for l in all_listings if "_card_hint" not in l]

for listing in hinted:
    num = listing["_card_hint"]
    title_clean = normalize_title(listing["title"])
    card_name = next(c["name"] for c in cards if c["number"] == num)

    if similarity(title_clean, card_name) >= 0.6:
        prices_by_card.setdefault(num, []).append(listing["price"])

    fuzzy_matches = match_listings_to_cards(normal, cards)
    for num, prices in fuzzy_matches.items():
        prices_by_card.setdefault(num, []).extend(prices)

    # Build final output
    price_data = {}
    for num, prices in prices_by_card.items():
        agg = aggregate(prices)
        if agg:
            price_data[num] = agg

    output = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "card_count": len(price_data),
        "prices": price_data,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    print(f"\n==> Done! {len(price_data)} cards with price data → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
