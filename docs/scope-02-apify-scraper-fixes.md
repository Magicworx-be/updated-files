# Scope 02 — Apify scraper: fixes before go-live

**For:** Elisha · **Follows:** `scope-01-apify-scraper.md` · **Updated:** 21 Aug 2026

The workflow structure is right — the two-actor split, the dedupe on `placeId`, and the
order of the nodes all match what the ranking engine expects. Five changes needed before we
run it for real, plus a short list of things that are deliberately **not** needed.

---

## 1 — Reviews actor: set `maxReviews` and `reviewsSort`

**Change:** in the `compass/google-maps-reviews-scraper` input, set

- `maxReviews` → leave empty (or `99999`)
- `reviewsSort` → `newest`

**Why:** our current runs are capped at exactly 100 reviews per business. In the Brugge
scrape of 21 Aug, EPDM Solutions returned 100 while Google shows 355; in the live Gent page
9 businesses are capped, one of them at position #2 (100 of 154). The cap systematically
understates the biggest, most established companies. The ranking engine already handles any
number of reviews and corrects for volume statistically — it needs the complete set to do
that. This is the one setting that measurably changes our output.

**Cost:** reviews are **$0.30 per 1,000** on this actor. Uncapping adds roughly $0.40 per
region. The cap was never saving money.

---

## 2 — Replace the two `Wait` nodes with poll-until-finished + a status check

**Change:** after starting each actor run, poll `GET /v2/actor-runs/{runId}` until the
status is terminal, then continue **only** if `status === "SUCCEEDED"`. Anything else
(`FAILED`, `ABORTED`, `TIMED-OUT`) should stop the run with an error, not fall through.
Apify webhooks are the cleaner version of this and were already in scope 01 — either
approach is fine, as long as the status is checked.

**Why:** Apify run times vary a lot with the number of search terms, so a fixed wait is a
guess in both directions. More importantly, a failed or aborted run **still returns a
dataset** — a partial one — and right now that partial data would flow straight into a
published ranking page with nothing to flag it.

---

## 3 — Trigger on a status column, not `anyUpdate`

**Change:** add a `status` column to the sheet. The workflow picks up only rows where
`status = todo`, sets it to `scraping` at the start and `scraped` at the end, and writes
back the two Apify run IDs and the run date.

**Why:** with `anyUpdate`, any edit to any cell re-fires the whole scrape — including for
regions that are already finished and frozen, whose data must not be overwritten. The status
column also gives a clean restart point when a run fails, and the run date is what the build
uses as `peildatum` (the anchor for all review time-weighting), so it should be recorded
automatically rather than typed by hand.

**Related open point from scope 01:** the sheet also needs a `region` column (the main city
or region name, e.g. `Dendermonde` or `Meetjesland`) — that's what the file naming and the
page slug are derived from. Olivier has the details.

---

## 4 — Keep `apify-places.json` complete and unfiltered

**Change:** the places file must contain **every** business the search returned, including
the ~10 per region with no reviews at all. Don't reduce it to the subset sent to the reviews
actor, and don't strip fields.

**Why:** the reviews export contains **no `website` field at all** — 0 of 1,018 records in
the Aalst run. The places export has one for 97 of 97. The places file is the only source of
the company website (which drives 20% of the final score) and of the GPS coordinates used to
locate businesses whose address comes back empty.

---

## 5 — Don't strip owner responses from the reviews export  *(new)*

**Change:** nothing to add — just make sure the reviews dataset keeps the field
`responseFromOwnerText` (the company's public reply to a review). Both actors return it by
default; don't map it out or set anything that drops it.

**Why:** whether and how a company responds to reviews — especially negative ones — is a
professionalism signal the scoring step is about to start using. It's in the raw export
already; we just need it to survive into the JSON we receive.

---

## Not needed — please don't build these

| | Why not |
|---|---|
| A region/city filter before the reviews actor | Checked against real data: Aalst returned 75 businesses inside the region, 10 with no city, and **zero** outside it. Nothing to filter, and it would hide warnings we rely on downstream. |
| A `language` setting | Every review already carries an absolute `publishedAtDate`. It changes nothing. |
| Merging both actors into one | `crawler-google-places` can scrape reviews too, but charges **$5.00 per 1,000** versus **$0.30** on the dedicated actor. |
| `scrapeContacts` (email enrichment) | $0.20 per business — about $19 per region — for emails we scrape ourselves for free at a later stage. |
| `website`, `placeMinimumStars`, `searchMatching`, `categoryFilterWords` filters | Each one silently removes businesses that legitimately belong in the ranking. |

Optional, one checkbox: `skipClosedPlaces: true` on the places actor.

**Also fine as-is:** `maxCrawledPlacesPerSearch` can stay empty or high — a low value cuts
off the tail of the search results, which is where the small specialists are.

---

## Expected cost per region after these changes

| | |
|---|---|
| Places (`crawler-google-places`) | ~100 places @ $1.50 / 1,000 → **~$0.15** |
| Reviews (`google-maps-reviews-scraper`) | 1,000–4,000 reviews @ $0.30 / 1,000 → **$0.30 – $1.20** |
| **Total** | **well under €1.50 per region** |
