# Claude Code prompt — feed owner responses into the scoring input

*Paste everything under the line into a Claude Code session (Opus, web search on) opened
in the Keurwijzer website repo. It changes how NEW pages are scored. Already-published
pages stay frozen and are only revisited at the yearly update.*

---

## Context and goal

Our scoring rubric (`prompts/scoring-prompt.md`, rubric 1) already tells the LLM to weigh
**"professionele, inhoudelijke reacties van het bedrijf op reviews (zeker op negatieve)"**
as a review-quality signal. But `scripts/normalize.js` only keeps `score`, `datum`,
`tekst` and `auteur` per review — the owner's public response
(`responseFromOwnerText` in the Apify export) is discarded. So the LLM has never actually
seen an owner response. In our real data ~23% of reviews carry one and only about a quarter
of companies respond at all, so this is a strong, discriminating professionalism signal we
are currently blind to.

**Goal:** make the owner response available to the scoring LLM, so rubric 1 works as
written. Nothing else.

## Hard constraints — do NOT change these

These are locked by the public promise "dezelfde methode voor elke regio". Do not touch
them, and do not add a new `METHODIEK_PARAMS` version for this change (it is a scoring-input
improvement, not a build.js calibration change):

- the four dimensions and the weights **35 / 30 / 15 / 20**
- `HALFLIFE_JAREN` (2), `BAYES_M` (16), `MIN_REVIEWS` (10), `MIN_RECENT` (3)
- `TRUST_FLOOR`, `RECENCY_ANCHOR`, `PUBLISH_MIN_REVIEWS`, `EXPECT_HALF_STEPS` in any version
- the composite, eligibility, `pickTop`, or ordering logic in `build.js`

If while working you think one of these *should* change, stop and report it — do not change it.

## The change — three files, one behaviour

**1. `scripts/normalize.js` — keep the owner response text (BOTH branches).**

Add one field, `reactie`, to every review object, taken from the Apify field
`responseFromOwnerText` (fall back to empty string). There are two places that build review
objects and both must get it:

- the loose-reviews branch (`looksLikeLooseReviews`), where reviews are pushed with
  `{ score, datum, tekst, auteur }` — add `reactie: r.responseFromOwnerText || ''`
- the place-with-reviews branch (the `it.reviews.map(...)`), same addition on the mapped
  object

Leave the `manueel` branch unchanged (manual files have no owner responses). Do not change
anything about weighting, dates, gemeente logic, `recent24` or `rankbaar`.

**2. `prompts/scoring-prompt.md` — rubric 1: tell the LLM the field now exists.**

Rubric 1 already lists owner responses as a signal. Add one short line stating that each
review object in `reviews.json` may now carry a `reactie` field = the company's public
response to that review, and that a professional, on-topic response — especially to a
critical review — counts as a substance signal, while a templated or defensive one does not.
Keep the 1.0–5.0 scale and the existing ijkpunten exactly as they are; this only clarifies
what evidence rubric 1 draws on. Do not touch rubric 2 (vakfocus) or the output schema.

**3. Congruentie — same turn, in Dutch.**

- `METHODIEK.md`: update §3.2 (reviewkwaliteit) to mention that the company's public
  responses to reviews are part of the evidence, and set "Laatst gelijkgezet met de code"
  at the top to today's date.
- `WIJZIGINGEN.md`: add a short "waarom" entry — the field was always in the rubric but
  never supplied to the LLM; supplying it makes new beoordelingen more faithful to the
  stated method; existing pages stay frozen and pick this up at their yearly refresh.

## What this must NOT do to existing pages

`data/<slug>/beoordeling.json` is frozen and must not be regenerated. This change only
affects beoordelingen created from now on. Do not rerun any existing region's scoring.
Re-running `normalize.js` on an old slug only rewrites its `reviews.json` (regenerable) and
must never touch its frozen `beoordeling.json`.

## Verification (do this, report the result)

1. Run `normalize.js` on ONE existing raw dataset that has owner responses (e.g.
   `dakwerkers-aalst`) but write to a scratch path, or run it and confirm via `git diff`
   that only `reviews.json` changed and `beoordeling.json` did NOT. Show that review objects
   now contain a non-empty `reactie` for reviews that have one, and `""` where none exists.
   Report the count of reviews with a non-empty `reactie`.
2. Confirm `node build.js <slug>` still runs clean on an existing slug (extra field in
   reviews.json must be ignored by build.js — it reads only `score`/`datum`).
3. Confirm you did NOT add a methodiek version and did NOT change any locked constant.
4. State explicitly that you updated `METHODIEK.md` and `WIJZIGINGEN.md`, per the
   congruentieregel.

## Explicitly out of scope (considered, not now)

Do not add these — they are scope creep on a foundation that is otherwise sound:

- reviewer credibility fields (`isLocalGuide`, `reviewerNumberOfReviews`)
- any change to recentheid, the publish threshold, or a weighted-volume cap
- feeding `responseFromOwnerDate` (the text is enough; the review's own score tells the LLM
  whether it was a negative review being answered)
