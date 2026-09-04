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
3. Push **met `--scope`**, zodat alleen deze map meegaat:

       node .claude/skills/sync-keurwijzer/sync.mjs -m "…" --scope geplande-taken

   Laat je `--scope` weg, dan gaat élke andere gewijzigde map ook mee in deze
   commit — Olivier spaart wijzigingen op, dus er ligt bijna altijd ander werk.
   Zo belandde op 03-09-2026 de hele SEO-omzetting van de hub-pagina's in een
   commit met als boodschap "Antwoordmails: WhatsApp-vraag valt nooit weg".
   Werk je ook aan de prompts, voeg dan `--scope prompts` toe.

Andersom werkt het bij een herinstallatie: kopieer het bestand van hier terug
naar `.claude\scheduled-tasks\<taaknaam>\SKILL.md`, en registreer de taak
opnieuw met het bijbehorende schema uit de tabel hieronder.

## Wat er in staat

| Map | Draait | Schema |
|---|---|---|
| `keurwijzer-mailwacht` | **ja** | elke dag 07u, 11u, 15u en 18u (`0 7,11,15,18 * * *`) |
| `keurwijzer-opvolgmails-vrijdag` | **ja** | vrijdag 17u (`0 17 * * 5`) |

Alles wat hier staat, draait ook echt. Er is precies één taak die zelf mails
opstelt — de vrijdagse opvolgronde. De mailwacht is enkel een deurbel: ze kijkt
of er antwoorden wachten, stuurt daar één melding over en veegt stickers weg.
Het eigenlijke antwoorden gebeurt in de skills `keurwijzer-mails` en
`keurwijzer-opvolgmails` in `.claude/skills/`, die Olivier zelf start.

## Wat er niet meer in staat

Drie mappen zijn hier op 4 september 2026 weggehaald: `keurwijzer-replies`,
`keurwijzer-whatsapp-dagelijks` en `keurwijzer-whatsapp-wekelijks`. Dat waren
kopieën van taken uit een oudere opzet, die op 3 september al van de laptop
verdwenen waren; ze deden dus al niets meer, maar de mappen wekten nog de indruk
van wel. Hun werk zit nu in de twee skills hierboven. Heb je er ooit toch iets
uit nodig, dan staan ze nog in de geschiedenis van deze repo.
