# Geplande taken — back-upkopie

De taken die vanzelf draaien staan **niet** in deze projectmap maar in Oliviers
persoonlijke Claude-instellingen:

    C:\Users\brain\.claude\scheduled-tasks\<taaknaam>\SKILL.md

Die map valt buiten `sync-keurwijzer`, dus stond er nooit een kopie op GitHub.
Deze map is die kopie. Gemaakt op 3 september 2026.

## Dit is een kopie, geen bron

**Wijzig je een bestand hier, dan verandert er niets aan de draaiende taak.**
De volgorde is altijd:

1. Pas het echte bestand aan onder `C:\Users\brain\.claude\scheduled-tasks\…`
2. Kopieer het daarna naar de map hiernaast met dezelfde naam.
3. Push met `node .claude/skills/sync-keurwijzer/sync.mjs -m "…"`.

Andersom werkt het bij een herinstallatie: kopieer het bestand van hier terug
naar `.claude\scheduled-tasks\<taaknaam>\SKILL.md`, en registreer de taak
opnieuw met het bijbehorende schema uit de tabel hieronder.

## Wat er in staat

| Map | Draait | Schema |
|---|---|---|
| `keurwijzer-mailwacht` | **ja** | elke dag 08u15, 15u15 en 20u15 (`15 8,15,20 * * *`) |
| `keurwijzer-opvolgmails-vrijdag` | **ja** | vrijdag 17u (`0 17 * * 5`) |
| `keurwijzer-replies` | nee | verwijderd van de laptop op 3 september 2026 |
| `keurwijzer-whatsapp-dagelijks` | nee | idem |
| `keurwijzer-whatsapp-wekelijks` | nee | idem |

De onderste drie zijn restanten van een oudere opzet. Ze waren nooit
geregistreerd en deden dus niets; op 3 september 2026 zijn ze van de laptop
gehaald. **Deze map is nu hun enige kopie** — dat is bewust, mocht er ooit iets
uit nodig blijken. Het werk dat zij deden zit intussen in de skills
`keurwijzer-mails` en `keurwijzer-opvolgmails` in `.claude/skills/`, die Olivier
zelf start.
