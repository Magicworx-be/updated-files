---
name: sync-keurwijzer
description: Check the Keurwijzer folder for changes and sync/push/back up the source to GitHub. Use when the user wants to "check for updates", "push my changes", "sync to GitHub", "back up the folder", or "push the updated files repo". Commits the working tree and pushes to the updated-files repo (never origin/keurwijzer-data).
---

# Sync Keurwijzer → GitHub (updated-files)

Detects changes in the Keurwijzer working tree, commits them, rebases on the
remote, and pushes the **source** to the `updated-files` GitHub repo
(`git@github.com:Magicworx-be/updated-files.git`).

The driver is [`.claude/skills/sync-keurwijzer/sync.mjs`](sync.mjs) — a small
Node script wrapping git. Paths below are relative to the repo root.

**Two remotes, don't confuse them:**
- `updated-files` (SSH) → the **source backup** repo. This skill pushes here.
- `origin` = `keurwijzer-data` → the **publish/data** repo (registry.json +
  badges), pushed only by `lib/push-registry.js` / `lib/push-badges.js`.
  **Never push source here.** The driver always targets `updated-files`
  explicitly, so a stray `git push` default can't leak source into the data repo.

`output/`, `badges/` and `.env` are git-ignored — they are generated /
secret and are *not* part of this sync.

## Prerequisites

- Node ≥ 18 and git (already required by this project).
- An SSH key that can push to `Magicworx-be/updated-files`. Verify with:

```bash
git ls-remote --heads updated-files
```

If that prints a `refs/heads/main` line, auth works.

## Run (agent path)

**Step 1 — see what would happen (read-only, changes nothing):**

```bash
node .claude/skills/sync-keurwijzer/sync.mjs --dry-run
```

This fetches `updated-files`, reports how far ahead/behind you are, and lists
**tracked changes** and **new (untracked) files** separately.

**Step 2 — if new/untracked files are listed, ask the user which to include.**
Untracked files are never added automatically (a scrape export or stray file
should not silently ship). Then run the push. It is **automatic** — it stages,
commits, rebases on the remote, and pushes in one go, no further confirmation:

> **Werk je aan één onderdeel? Gebruik `--scope`.** Olivier spaart wijzigingen op
> in plaats van elke keer te committen, dus er ligt vaak ander werk in de map.
> Zonder `--scope` gaat dat allemaal mee in jouw commit, onder een boodschap
> waar het niets mee te maken heeft. Dat is op 03-09-2026 gebeurd: de volledige
> SEO-omzetting van de hub-pagina's belandde in een commit met als boodschap
> "Antwoordmails: WhatsApp-vraag valt nooit weg".
>
> Vuistregel: **alleen de gebruiker zegt "sync alles"** — een agent die aan één
> onderwerp werkt, scopet naar de mappen die bij dat onderwerp horen. Wat
> daarbuiten ligt blijft liggen en wordt aan het eind opgesomd.
>
> ```bash
> node .claude/skills/sync-keurwijzer/sync.mjs -m "..." --scope geplande-taken --scope prompts
> ```

```bash
node .claude/skills/sync-keurwijzer/sync.mjs -m "korte beschrijving van de wijziging"
```

Include chosen new files by path (repeat `--include`), or take them all:

```bash
node .claude/skills/sync-keurwijzer/sync.mjs -m "..." --include "Apify scrape/geolocation.txt"
node .claude/skills/sync-keurwijzer/sync.mjs -m "..." --all-untracked
```

A commit message (`-m`) is required whenever there is anything to commit.
On success the last line is `✓ Klaar — bronbestanden gesynct naar updated-files (main)`.

## Behaviour & gotchas

- **Reconcile = fetch + rebase.** Your local commits are replayed on top of the
  remote, giving a clean linear history. If the rebase hits a conflict the
  driver **aborts it** (your folder is left exactly as before, local commit
  intact) and exits non-zero with the files to resolve. Fix them, then re-run.
- **Untracked files are opt-in** (`--include` / `--all-untracked`). Everything
  git already ignores (`desktop.ini`, `Thumbs.db`, `output/`, `badges/`,
  `.env`, …) never appears.
- **`--scope <pad>` (herhaalbaar) commit alleen wat onder die map(pen) valt.**
  Zonder `--scope` verandert er niets aan het oude gedrag (`git add -u` over de
  hele map). Met scope wordt er per padgrens vergeleken, dus `--scope prompts`
  raakt nooit `promptsmap/`. Een `--include` buiten de scope is een
  tegenstrijdige opdracht en stopt het script (exit 2) in plaats van het
  bestand stil te laten vallen. `--all-untracked` wordt door de scope gefilterd.
- **Wat blijft liggen, wordt altijd opgesomd.** Aan het eind toont de driver
  hoeveel gewijzigde en nieuwe bestanden er níét mee zijn gegaan, met de
  waarschuwing dat die nergens geback-upt staan. Zo wordt opsparen een keuze
  in plaats van iets wat je vergeet.
- **De rebase draait met `--autostash`.** Dat is noodzakelijk sinds `--scope`
  bestaat: git weigert te rebasen zolang er niet-gestagede wijzigingen liggen.
  Struikelt de rebase toch, dan noemt de driver het commit-id van die opzijgezette
  stapel (`git stash apply <id>`). **Gooi `.git/rebase-merge` nooit weg voor je
  dat gedaan hebt** — dat is precies waar die stapel in bewaard wordt.
- **`desktop.ini` in `.git/refs` breaks `git fetch`** (`fatal: bad object
  refs/remotes/updated-files/desktop.ini`). This is a Windows artefact. The
  driver **repairs it automatically** on every run by deleting stray
  `desktop.ini`/`Thumbs.db` files from `.git/refs` (real refs untouched). If you
  ever hit this outside the driver, delete that file by hand and retry.
- **CRLF warnings** (`LF will be replaced by CRLF`) during commit are harmless
  Windows noise.
- The driver assumes you are on the `main` branch (the one that tracks
  `updated-files/main`). It pushes `HEAD:main`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Kon updated-files niet bereiken` | SSH key not loaded/authorized. Test with `git ls-remote --heads updated-files`. |
| `fatal: bad object … desktop.ini` (outside the driver) | Delete the stray `desktop.ini` under `.git/refs/…`, then rerun. The driver does this for you. |
| `Rebase-conflict …` (exit ≠ 0) | Remote and local edited the same lines. Run `git status`, resolve, `git add`, `git rebase --continue`, then rerun the sync. |
| `Er zijn wijzigingen … maar geen bericht` | Add `-m "…"`. |

## How it was verified

- `--dry-run` was run against this real repo (fetch + detection only, no writes).
- The full **commit → rebase-over-remote → push** flow, untracked inclusion, the
  rebase-conflict abort (exit 1, tree restored), and the nothing-to-do case were
  all verified end-to-end against an **isolated throwaway git sandbox** (a local
  bare repo standing in for GitHub, via `KW_SYNC_REMOTE`/`KW_SYNC_BRANCH`
  overrides) — so setup never published work-in-progress to the live repo.
