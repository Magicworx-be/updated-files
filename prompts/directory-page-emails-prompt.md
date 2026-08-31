# Build new directory page + draft emails

**Canonical Phase 0–6 work-process prompt.** Instructions are in English; the two
outreach email templates in Phase 6 are deliberately in Dutch (they go to Flemish
companies) — keep them that way.

> **Dutch output, always.** These instructions are in English, but everything that
> reaches the public page or a company's inbox must be Dutch: config text, and every
> `synthese`/chip (produced via `prompts/scoring-prompt.md`, which is Dutch and
> enforces this on its own). Both outreach email templates in Phase 6 below are
> already in Dutch. If Dutch text turns English anywhere in `beoordeling.json`,
> `output/<slug>/index.html`, or a Gmail draft, stop and flag it.

---

## Step 1 — The opening prompt

> You are building a new **Keurwijzer** directory page for niche **{{NICHE}}** in
> **region {{REGIO}}**, slug **{{SLUG}}**.
>
> You'll find the JSON files here: `data/{{SLUG}}/`
>
> Work exactly as we did before for the roofers pages of Ghent and Meetjesland.
> **Never skip a step, never guess, and stop and ask me whenever you're in doubt.**
>
> **Follow these phases in order.**

---

## Fixed project rules (not up for discussion again)

- **URL structure:** detail pages sit flat at the root (`/{{SLUG}}/`), hubs live in
  folders. Do not nest.
- **Registry-driven:** all navigation/hubs/sitemap come from the configs via
  `lib/registry.js`. The safe final command is always `node build-all.js`.
- **Deterministic:** the LLM (you) only judges text. All the computation (Bayes,
  time-weighting, selection, Top 10/Top 5, ordering) is done by `build.js`. Never
  ask for or provide a final score or ranking yourself.
- **Same data = same result:** `beoordeling.json` is created once and then frozen.

---

## Phase 0 — Determine the niche

Does the niche already exist (is there already a `config/{{NICHE}}/*.json`)? Then use
an existing config from the **same niche** as a model, so the trade block, synonyms,
and hero image stay consistent.

Is this a **new niche** (no `config/{{NICHE}}/` folder yet)? Then use
`config/dakwerkers/dakwerkers-gent.json` as the structural model and define the trade
block explicitly:

- `mv` (plural, e.g. "dakwerkers"), `mvCap` (capitalized), `ev` (singular,
  "dakwerker"), `kort` (the activity, e.g. "dakwerken"), and `syn` = one commonly
  used synonym `{ mv, ev }` (e.g. dakwerkers→dakdekkers). **If you're unsure about
  the right synonym or the right term for this niche → ask me first, don't make it
  up.**
- **Hero:** if the niche doesn't exist yet, there is no niche hero yet — ask me for a
  hero image URL (or explicit permission to reuse the roofers hero for now).

---

## Phase 1 — Create the config

Create `config/{{NICHE}}/{{SLUG}}.json` following the model from Phase 0. Same schema:
`slug`, `vak` (see Phase 0), `regio` (`naam` "regio {{REGIO}}", `kern` "{{REGIO}}",
correct province), `gemeenten`, `zoektermen` (three variants with the niche term +
{{REGIO}}), `peildatum`, `updateDatum`, `hero` (`img` from Phase 0; `alt` adjusted to
niche + {{REGIO}}).

**Methodology version.** A new page ALWAYS uses the newest methodiek version. Do not
include a `methodiek` field in a new config: `build.js` then automatically applies the
latest version (`METHODIEK_LATEST` in `build.js`). Never pin a new config to a specific
version number, and don't hard-code "the newest version is vN" anywhere — read the
current newest version and its rules from METHODIEK.md § Methodiek-versies. Only existing
pages are deliberately pinned (e.g. the three original roofers pages at `"methodiek": 1`);
those stay frozen and must never change.

**`peildatum` (ISO, YYYY-MM-DD)** = the date the Apify data was scraped (≈ today for
fresh data). It's the anchor point for the 24-month recency window and for relative
review dates in `normalize.js` — choose it deliberately, not carelessly as "today" if
the scrape is older. `build.js` fails hard on a missing or invalid field (`vak.mv`,
`regio.naam`/`kern`/`provincie`, `gemeenten`, `peildatum`, `updateDatum` are required).

Three hard rules apply to the **gemeenten (municipalities) list**:

1. **Region radius ~20 km:** a customer looks for a trade specialist within ~20 km.
   Include {{REGIO}} itself + the neighboring municipalities within that radius.
   **Double-check every municipality name** (does it exist, is it really near
   {{REGIO}}, no name confusion with another province or with the Netherlands).
2. **Municipal merger of 1 Jan 2025 — ALWAYS include both forms.** Google Maps now
   gives the merged name in addresses (e.g. "Merelbeke-Melle", "Nazareth-De Pinte").
   The matching in `build.js` / `normalize.js` is an *exact* set comparison, not
   partial matching. So for every merged municipality, include **both the merged name
   and each separate constituent name** in `gemeenten`. Only the separate names would
   drop current data; only the merged name would miss older records.
3. **No overlap with existing regions within the same niche.** First read the other
   `config/{{NICHE}}/*.json` files. If a border municipality is already in the
   municipality list of a neighboring region (e.g. Evergem/Deinze/Lochristi are part
   of Ghent), then **by default don't include it** — even if that costs rankable
   companies. Tell me which border municipalities this concerns and with what concrete
   consequence (which companies, Top 10 vs Top 5), and let me make the call before you
   continue.

---

## Phase 2 — Normalize

Run:

```bash
node scripts/normalize.js apify {{SLUG}} data/{{SLUG}}/apify-export.json data/{{SLUG}}/apify-places.json
```

This writes `data/{{SLUG}}/reviews.json`. **Read every warning** and address it:

- `~ "…" is located in "X" — not in the municipality list`: decide deliberately. Is X
  a 2025 merger municipality (hyphenated name) or a neighboring municipality within
  ~20 km that belongs to the region → add it to the config (rules from Phase 1) and
  rerun normalize. Is X already in another region → leave it out (overlap rule) and
  report it to me.
- `! "…": no municipality found`: a company with no location data. Hard rule: never
  guess or infer the municipality from the name/website. Always drop it. These go into
  the report section "NO LOCATION DATA".
- `~ "…": rankable but no website`: make a note — in Phase 3 you must look up that
  site yourself.

Repeat Phase 1↔2 until the municipality list is correct and there are no more
unexplained `~` warnings. Report to me briefly: number of companies, number within the
municipality list, number rankable.

---

## Phase 3 — Assessment (freeze)

Follow `prompts/scoring-prompt.md` literally, with `data/{{SLUG}}/reviews.json` as
input. Key points:

- Assess **all** companies from `reviews.json` (including waitlist candidates).
- **Average 2–3 independent runs.** Score review quality and trade focus in 2–3
  separate runs (each in 0.5 increments) and freeze the **average** — not the first
  run. The averaged value may fall outside the 0.5 increments; `build.js` accepts that.
  Take the synthesis, chips, and fraction from the most representative run. (This
  run-averaging is a standing rule, retained by every methodiek version from v2 onward.)
- **Trade focus (rubric 2) requires actually visiting the website** (web search on).
  For **every** company with `rankbaar: true`, look up the official site if the
  `website` field is empty, and **verify** that the name and municipality match (watch
  for name confusion and SEO decoy sites from another region). Trade focus measures
  niche purity **for this niche** ({{NICHE}}): how purely the company specializes in
  it. No reliable site → `vakfocus: null`, `vakfocusBron: "geen-website"`. Never guess.
- Write the JSON response exactly according to the schema to
  `data/{{SLUG}}/beoordeling.json`. Every company from `reviews.json` appears **exactly
  once**; the company name must match **literally** (the script matches on that name).
  `build.js` validates this and prints warnings for missing companies or invalid
  scores — read and resolve those in Phase 4.
- **Freeze** it afterward: don't rerun it lightly (every new run is the only source of
  variation in the outcome).

---

## Phase 4 — Build and verify

```bash
node build.js {{SLUG}}
```

```bash
node build-all.js
```

The first is a quick check of just this page. The second rebuilds EVERYTHING +
consistency check + `registry.json` push — that is the final command.

Then check and report to me:

- `output/{{SLUG}}/index.html` — the page itself (Top 10 or Top 5, is the order
  correct, no score above 10).
- `reports/{{SLUG}}/…-rapport.txt` — verification report, including the
  **"NO LOCATION DATA"** section.
- `reports/{{SLUG}}/…-prospectie-dasslim.md` — positions 11–20 + not-eligible
  (internal, do not publish).
- The **"dit gaat live" list** that `build-all.js` prints.
- **Phase 4b below — the live check that the region really appears on the niche hub.**
  This one is not optional and cannot be skipped by reasoning about it.

`build-all.js` publishes everything itself: the site goes to
`Magicworx-be/keurwijzer-site` and Cloudflare serves it on keurwijzer.be within about
30 seconds. It also pushes `registry.json` to `Magicworx-be/keurwijzer-data`, after
which the hub and homepage navigation picks up the new page client-side via jsDelivr.
No manual step exists any more — which also means there is no review gate between
building and going live.

### Phase 4b — MANDATORY live check: does the region actually show up on the niche hub?

The paragraph above is a claim, not a fact — so verify it every single time, for every
new region. It can fail **silently**: a CDN may serve an outdated `registry.json` with a
perfectly normal `200`, so nothing throws, no fallback fires, and the new region just
quietly stays a grey, non-clickable "binnenkort" card while its detail page is live. This
happened on 2026-08-28 and hid three already-published regions (Oostende, Veurne-Diksmuide,
Roeselare) as well as the new one. Never report a region as live on the strength of an
exit code.

**Step 1 — the data layer.** All three sources must contain `{{SLUG}}`:

```bash
node -e "const h=require('https');const SLUG='{{SLUG}}';const g=u=>new Promise(r=>h.get(u,{headers:{'User-Agent':'kw-check'}},s=>{let b='';s.on('data',d=>b+=d);s.on('end',()=>r(b))}).on('error',()=>r('')));(async()=>{const S={'jsDelivr ref-loos':'https://cdn.jsdelivr.net/gh/Magicworx-be/keurwijzer-data/registry.json','jsDelivr @main':'https://cdn.jsdelivr.net/gh/Magicworx-be/keurwijzer-data@main/registry.json','GitHub raw':'https://raw.githubusercontent.com/Magicworx-be/keurwijzer-data/main/registry.json'};for(const[n,u]of Object.entries(S)){let ok=false,gen='';try{const j=JSON.parse(await g(u));ok=j.pages.some(p=>p.slug===SLUG);gen=j._generated||''}catch(e){}console.log((ok?'OK   ':'MIST ')+n+'  '+gen)}})()"
```

**Step 2 — the rendered page.** The hub cards are injected client-side, so `{{SLUG}}` is
**not** present in the raw HTML of the live hub — grepping the HTML gives a false
negative. You must render it. Open `https://keurwijzer.be/{{NICHE}}/` with the browser
tools and assert that the region appears as a **clickable** card (an `<a href>` to
`/{{SLUG}}/`), not as a "binnenkort" label:

```js
[...document.querySelectorAll('#hub-cards a[href]')].map(a => a.getAttribute('href'))
```

For a **new region**, also open `https://keurwijzer.be/regio/<regioSlug>/` and check the
niche card is there.

**If anything is missing:** the push or the purge did not land. Re-run `node build-all.js`
— `registry.json` carries a full `_generated` timestamp, so it differs on every build and
the commit + purge of both jsDelivr variants always runs. Do **not** purge the CDN by hand
to "fix" it before you understand why the automatic purge failed; a blind purge can pull an
even older cached copy and make it worse. Report the outcome of both steps explicitly.

Two cases that still deserve attention, even though nothing needs pasting:

- **New region (first page in that region):** the region hub is generated and published
  automatically. Still open it and confirm it exists and lists the niche.
- **New niche:** the niche hub is published automatically, but the **homepage card must
  already exist in `homepage.html`** (the `data-niche` attribute plus icon and
  description). The JS upgrades that card to "live" once the niche appears in
  `registry.json` — it cannot create a card that isn't in the template. Check this
  before building a first page in a new niche. The hundreds of existing detail pages
  must **not** change — report it if that does happen (something would be wrong).

---

## Phase 5 — Publication

`build-all.js` publishes by itself; there is no handover step. Confirm that the new
page is genuinely reachable on `https://keurwijzer.be/{{SLUG}}/` and report what went
live.

Because publishing is immediate, treat a build as a publication: do not run
`build-all.js` to "see what happens". If something is wrong, fix it and build again —
a correction is live within 30 seconds too.

At the end, summarize: the chosen municipalities (with any overlap exclusions), number
of rankable companies, Top 10 or Top 5, and exactly which pages went live.

---

## Phase 6 — Outreach

For every company in the published selection, prepare **two Gmail drafts**.
**Never send automatically — drafts only.**

1. **Email 1 — contact email to the company.** Clean and short: exactly one link (the
   landing page), no badge link and no image. The badge is *offered* as a reason to
   reply.
2. **Email 2 — follow-up draft for myself** (to `olivier@magicworx.net`). I don't send
   this one; it stays in my Drafts folder. It contains that company's badge links plus
   a ready-made follow-up text. As soon as the company replies to email 1 that they
   want the badge, I open email 2, copy the follow-up text, and paste it as a **reply
   in the company's thread**.

**Why this two-step process:** the badge links point to an external CDN
(`cdn.jsdelivr.net`). In a cold first email, Gmail shows a "Redirect Notice" for that
(Google doesn't trust that destination domain), and an image attachment raises the spam
score. By sending the badge only *after* their reply, in-thread, there is already
contact and trust — so that notice is irrelevant, since they asked for it themselves.
Added benefit: the question "do you want your badge?" is a low-threshold reason to
start a conversation.

Proceed as follows:

### 1 — Fetch the list

Read `reports/{{SLUG}}/…-rapport.txt`, block **"TOP N (this is what's on the site…)"**.

That is the exact list + order of companies currently on the site. Note the actual
number **N** (can be 10 or 5, depending on the region) — this determines whether the
page is a Top 10 or a Top 5, not the email text.

**Important:** the subject line and email text follow the company's **own rank**
(`{tier}` from the badge — #1 / Top 3 / Top 5 / Top 10), not the total number on the
page. A company ranked 4th, you say "top 5"; 2nd or 3rd → "top 3"; 1st → "in first
place". See the table in step 6a.

### 2 — Fetch the website

Fetch each company's website from `data/{{SLUG}}/reviews.json`.

### 3 — Find an email address

Visit each website and look for an email address:

- Check `<a href="mailto:…">` links.
- Regex over the full page text (for addresses that aren't a link).
- Check the contact page if needed.

If you find **no** usable address (parked domain, contact form only, site offline):
**skip that company, don't make anything up**, and report it separately at the end.

### 4 — Fetch the data (from the generated output, not the raw data)

- `{niche}` = `config.vak.mv` (e.g. "dakwerkers")
- `{regio}` = `config.regio.naam`
- `{aantal gecontroleerde bedrijven}` = the number "… van X {niche} in …" from the
  summary paragraph in `output/{{SLUG}}/index.html`
- `{landingspagina url}` = the `<link rel="canonical">` from that same
  `output/{{SLUG}}/index.html`
- `{jaar}` = the year from `config.peildatum`

#### Badge fields (from `badges/{{SLUG}}/badges.json`)

This file is generated by `build.js` and contains the badge data for each published
company. Look up the company by its `naam` field and read:

- `{tier}` = the `tier` field (#1, Top 3, Top 5, or Top 10) — follows the company's own
  rank, not the total number on the page. This drives the placement sentence (see step
  6a).
- `{bedrijf-slug}` = the `bedrijfSlug` field (for the badge file name).

The badges live on jsDelivr (the same CDN as `registry.json`). Build the URLs —
**these only go in email 2 (follow-up), not in email 1:**

- `{badge url donker}` = `https://cdn.jsdelivr.net/gh/Magicworx-be/keurwijzer-data/badges/{{SLUG}}/{bedrijf-slug}--donker.png`
- `{badge url licht}` = `https://cdn.jsdelivr.net/gh/Magicworx-be/keurwijzer-data/badges/{{SLUG}}/{bedrijf-slug}--licht.png`

(Dark text = for a light site background; white text = for a dark one.)

### 5 — Clean up the URL

Make sure `{landingspagina url}` looks like this:
`keurwijzer.be/{{SLUG}}` — should not be clickable, so no hyperlink. important!

### 6a — Email 1: contact email to the company

Create one Gmail draft **to the company's email address that you found**.

Rules:

- **Exactly 1 link:** the landing page (keurwijzer.be). That's your proof that they
  really are in the selection — credibility-critical. **No badge link, no image, no
  attachment.**
- **Badge offer only — do NOT ask for their phone/WhatsApp number here.** That request
  belongs in email 2 (the in-thread follow-up), once they have already replied. Email 1
  makes a single, low-threshold ask so nothing competes with it.
- The landing page link may appear as a **plain URL** in the `htmlBody`.

Determine the **placement sentence** from `{tier}` — it drives both the subject line
and the email text:

| `{tier}` | `{plaatsing-onderwerp}` | `{plaatsing-mail}` (met opmaak) |
|---|---|---|
| #1 | op de eerste plaats bij de | `staat <b>op de eerste plaats</b>` |
| Top 3 | in de top 3 | `staat in de <b>top 3</b>` |
| Top 5 | in de top 5 | `staat in de <b>top 5</b>` |
| Top 10 | in de top 10 | `staat in de <b>top 10</b>` |

**Subject:** `{niche} {regio} vergeleken - resultaat`

(e.g. "Dakwerkers regio Dendermonde vergeleken")

**Email:**

```


Goedemiddag,

We hebben alle {niche} in de {regio} vergeleken.
{naam bedrijf} {plaatsing-mail} van de {aantal gecontroleerde bedrijven} {niche}.  
Zie: {landingspagina url}.

Bezorg ik je je gratis Keurwijzer-kwaliteitsbadge voor op je site of offertes?



Groeten, Olivier
T:0470 12 44 61 - Dorp 81 - Berlare (O-Vl)

Ps: Keurwijzer is gratis voor vakspecialisten.
Ik verdien mijn geld met Dasslim.be


```

### 6b — Email 2: follow-up draft for yourself

Create a second Gmail draft **to `olivier@magicworx.net`** (your own address — not the
company). You never send this one; it's your cheat sheet for the follow-up.

**Subject:** `[Badge klaar] {naam bedrijf} — opvolgtekst + links`

**Email (plain text):**

```
Opvolging voor {naam bedrijf} ({e-mailadres bedrijf}), {plaatsing-onderwerp zonder "bij de"} {niche} {regio}.

--- opvolgtekst ---
Top, bedankt! Hier is je Keurwijzer-kwaliteitsbadge in twee versies:

Donkere tekst (voor een lichte achtergrond): {badge url donker}
Witte tekst (voor een donkere achtergrond): {badge url licht}

Zet 'm gerust op je website of offertes. Een link terug naar je pagina ({landingspagina url}) waardeer ik enorm.

Groeten, Olivier
--- einde opvolgtekst ---

Badge-links ter referentie:
donker: {badge url donker}
licht: {badge url licht}

Bezorg me gerust ook jouw telefoon- en Whatsapp nummer, dan voeg ik deze nog toe aan je listing op onze website.
```

### 7 — Report

At the end, report:

- A table (**company** | **email address used**) — with a checkmark per company showing
  that **both** drafts (contact email + follow-up) were created.
- A separate list of companies **with no findable email address** (for those companies
  you don't create drafts).
