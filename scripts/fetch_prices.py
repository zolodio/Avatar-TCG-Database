"""
fetch_prices.py
Fetches recent eBay SOLD prices for Avatar Quick Strike TCG cards
using the eBay Marketplace Insights API (REST, OAuth 2.0) and writes
prices.json to the repo root.

Required GitHub Secrets:
  EBAY_CLIENT_ID     – your eBay App ID   (developer.ebay.com → My Keys)
  EBAY_CLIENT_SECRET – your eBay Cert ID  (developer.ebay.com → My Keys)

The Marketplace Insights scope must be enabled for your app:
  → developer.ebay.com → My Account → Application Access Requests
  → Request "Buy APIs" → "Marketplace Insights"
  (Usually approved within a few hours for new accounts.)

Output – prices.json:
{
  "updated": "2025-01-15T06:00:00Z",
  "card_count": 142,
  "prices": {
    "1":   { "low": 0.49, "avg": 1.20, "med": 1.10, "high": 3.00, "sales": 6 },
    "235": { "low": 8.00, "avg": 14.50, "med": 13.00, "high": 22.00, "sales": 3 },
    ...
  }
}
"""

import os
import re
import csv
import json
import time
import base64
import requests
from datetime import datetime, timezone
from io import StringIO
from difflib import SequenceMatcher

# ── Config ──────────────────────────────────────────────────────────────────
EBAY_CLIENT_ID     = os.environ.get("EBAY_CLIENT_ID", "")
EBAY_CLIENT_SECRET = os.environ.get("EBAY_CLIENT_SECRET", "")

CSV_URL     = (
    "https://raw.githubusercontent.com/zolodio/Avatar-TCG-Database"
    "/main/Extended%20Database.csv"
)
OUTPUT_PATH = "prices.json"

EBAY_TOKEN_URL    = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_INSIGHTS_URL = "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"

# Marketplace Insights scope required for sold-item data
INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"

# Broad searches: fetch up to this many results each (API max is 200)
BROAD_LIMIT = 200

# Targeted searches for high-value rarities: smaller result set is fine
TARGETED_LIMIT = 50

# Rarities that get their own card-by-card targeted search
TARGETED_RARITIES = {"rare", "zenemental", "promo"}

# Fuzzy-match threshold 0–1; raise if you get false positives
MATCH_THRESHOLD = 0.72

# Polite delay between API calls (seconds)
SLEEP_BETWEEN = 0.35


# ── Auth ─────────────────────────────────────────────────────────────────────
def get_access_token() -> str:
    """Exchange client credentials for a short-lived OAuth access token."""
    if not EBAY_CLIENT_ID or not EBAY_CLIENT_SECRET:
        raise RuntimeError(
            "EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set as GitHub secrets.\n"
            "Find them at developer.ebay.com → My Keys → Production."
        )

    creds_b64 = base64.b64encode(
        f"{EBAY_CLIENT_ID}:{EBAY_CLIENT_SECRET}".encode()
    ).decode()

    resp = requests.post(
        EBAY_TOKEN_URL,
        headers={
            "Authorization": f"Basic {creds_b64}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "client_credentials",
            "scope": INSIGHTS_SCOPE,
        },
        timeout=15,
    )

    if resp.status_code == 401:
        raise RuntimeError(
            "eBay rejected the credentials (401). Double-check that "
            "EBAY_CLIENT_ID = App ID and EBAY_CLIENT_SECRET = Cert ID "
            "from the Production key set on developer.ebay.com."
        )
    if resp.status_code == 400:
        body = resp.json()
        if "invalid_scope" in str(body):
            raise RuntimeError(
                "Scope not approved (invalid_scope).\n"
                "Go to developer.ebay.com → My Account → Application Access Requests\n"
                "and request access to the Marketplace Insights (Buy) API.\n"
                "Approval is usually same-day for new production keys."
            )

    resp.raise_for_status()
    token = resp.json().get("access_token", "")
    if not token:
        raise RuntimeError(f"No access_token in eBay response: {resp.text[:300]}")
    print("  ✓ OAuth token obtained")
    return token


# ── eBay Marketplace Insights API ────────────────────────────────────────────
EBAY_FINDING_URL = "https://svcs.ebay.com/services/search/FindingService/v1"

def ebay_sold_items(token: str, keywords: str, limit: int = 200, offset: int = 0) -> list[dict]:
    """
    Fallback: uses the eBay Finding API (no special scope needed).
    Note: token is unused here; Finding API uses the App ID directly.
    """
    params = {
        "OPERATION-NAME":        "findCompletedItems",
        "SERVICE-VERSION":       "1.0.0",
        "SECURITY-APPNAME":      EBAY_CLIENT_ID,   # App ID, not a token
        "RESPONSE-DATA-FORMAT":  "JSON",
        "REST-PAYLOAD":          "",
        "keywords":              keywords,
        "itemFilter(0).name":    "SoldItemsOnly",
        "itemFilter(0).value":   "true",
        "itemFilter(1).name":    "ListingType",
        "itemFilter(1).value":   "FixedPrice",
        "sortOrder":             "EndTimeSoonest",
        "paginationInput.entriesPerPage": min(limit, 100),
        "paginationInput.pageNumber":     (offset // 100) + 1,
    }

    try:
        resp = requests.get(EBAY_FINDING_URL, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        print(f"  [ERROR] Finding API call failed: {exc}")
        return []

    results = []
    search_result = (
        data.get("findCompletedItemsResponse", [{}])[0]
            .get("searchResult", [{}])[0]
    )
    for item in search_result.get("item", []):
        title = item.get("title", [""])[0]
        price = item.get("sellingStatus", [{}])[0] \
                    .get("convertedCurrentPrice", [{}])[0] \
                    .get("__value__", None)
        if title and price:
            try:
                p = float(price)
                if p > 0:
                    results.append({"title": title, "price": p})
            except ValueError:
                pass

    return results
# ── Card CSV ─────────────────────────────────────────────────────────────────
def fetch_cards() -> list[dict]:
    resp = requests.get(CSV_URL, timeout=20)
    resp.raise_for_status()
    reader = csv.DictReader(StringIO(resp.text))
    cards = []
    for row in reader:
        number = row.get("Number", "").strip()
        name   = row.get("Name", "").strip()
        rarity = row.get("Rarity", "").strip().lower()
        if number and name:
            cards.append({"number": number, "name": name, "rarity": rarity})
    return cards


# ── Title normalisation & matching ───────────────────────────────────────────
_NOISE = re.compile(
    r"\b(holo|foil|nm|nm-?mt|mp|lp|sp|exc|vg|g|psa|bgs|cgc"
    r"|lot|set|common|uncommon|rare|promo|tcg|trading card"
    r"|avatar|last airbender|quick strike|qs|single"
    r"|card game|\d+/\d+|\(\d+\))\b",
    re.IGNORECASE,
)

def normalize_title(title: str) -> str:
    cleaned = _NOISE.sub(" ", title)
    return re.sub(r"\s+", " ", cleaned).strip()

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def match_listings_to_cards(
    listings: list[dict], cards: list[dict]
) -> dict[str, list[float]]:
    """Fuzzy-match each listing title to the closest card name."""
    card_lookup = {c["number"]: c["name"] for c in cards}
    prices_by_card: dict[str, list[float]] = {}

    for listing in listings:
        title_clean = normalize_title(listing["title"])
        best_num, best_score = None, 0.0

        for num, card_name in card_lookup.items():
            score = similarity(title_clean, card_name)
            # Boost score if the card number appears literally in the title
            if re.search(rf"\b{re.escape(num)}\b", listing["title"]):
                score = max(score, 0.80)
            if score > best_score:
                best_score, best_num = score, num

        if best_num and best_score >= MATCH_THRESHOLD:
            prices_by_card.setdefault(best_num, []).append(listing["price"])

    return prices_by_card


# ── Aggregation ───────────────────────────────────────────────────────────────
def _median(lst: list[float]) -> float:
    s = sorted(lst)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2

def aggregate(prices: list[float]) -> dict:
    if not prices:
        return {}
    return {
        "low":   round(min(prices), 2),
        "avg":   round(sum(prices) / len(prices), 2),
        "med":   round(_median(prices), 2),
        "high":  round(max(prices), 2),
        "sales": len(prices),
    }


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    token = None  # Finding API uses App ID directly, no OAuth needed
    print("\n==> Fetching card list from GitHub CSV …")
    cards = fetch_cards()
    print(f"    {len(cards)} cards loaded")

    all_listings: list[dict] = []

    # ── 1. Broad searches (common/uncommon cards) ──────────────────────────
    broad_queries = [
        "Avatar Last Airbender Quick Strike TCG single card",
        "Avatar Quick Strike TCG holo foil card",
        "Avatar TCG Upper Deck Quick Strike",
    ]
    print(f"\n==> Broad searches ({len(broad_queries)} queries × up to {BROAD_LIMIT} results each) …")
    for query in broad_queries:
        print(f"  Query: \"{query}\"")
        listings = ebay_sold_items(token, query, limit=BROAD_LIMIT)
        all_listings.extend(listings)
        print(f"    → {len(listings)} results")
        time.sleep(SLEEP_BETWEEN)

    # ── 2. Targeted searches for rare / zenemental / promo ─────────────────
    targeted_cards = [c for c in cards if c["rarity"] in TARGETED_RARITIES]
    print(f"\n==> Targeted searches for {len(targeted_cards)} rare/zen/promo cards …")
    for card in targeted_cards:
        query = f'Avatar Quick Strike {card["name"]}'
        print(f"  → #{card['number']} {card['name']}")
        listings = ebay_sold_items(token, query, limit=TARGETED_LIMIT)
        for lst in listings:
            lst["_card_hint"] = card["number"]   # pin result to this card
        all_listings.extend(listings)
        time.sleep(SLEEP_BETWEEN)

    print(f"\n==> Total listings collected: {len(all_listings)}")

    # ── 3. Match listings → cards ─────────────────────────────────────────
    prices_by_card: dict[str, list[float]] = {}

    # Hinted listings (from targeted searches) are pinned directly
    for listing in (l for l in all_listings if "_card_hint" in l):
        prices_by_card.setdefault(listing["_card_hint"], []).append(listing["price"])

    # Broad listings get fuzzy-matched
    broad_listings = [l for l in all_listings if "_card_hint" not in l]
    for num, prices in match_listings_to_cards(broad_listings, cards).items():
        prices_by_card.setdefault(num, []).extend(prices)

    # ── 4. Aggregate & write ──────────────────────────────────────────────
    price_data = {
        num: agg
        for num, raw in prices_by_card.items()
        if (agg := aggregate(raw))
    }

    output = {
        "updated":    datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "card_count": len(price_data),
        "prices":     price_data,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    print(f"\n==> Done! {len(price_data)} cards with price data → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
