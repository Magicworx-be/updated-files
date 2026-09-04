@echo off
REM ---------------------------------------------------------------------
REM Startpunt voor de Windows-taakplanner.
REM
REM Draait scripts/whatsapp-nabericht.js vanuit de projectmap, zodat het
REM script .env, data/ en reports/ terugvindt ongeacht van waar het gestart
REM wordt. De taakplanner heeft anders een andere werkmap dan jij denkt.
REM
REM DIT BESTAND MOET CRLF-regeleinden houden. Met kale LF leest cmd.exe elke
REM REM-regel als een commando en draait het script twee keer. Schrijf het
REM dus nooit weg met een editor die op LF staat.
REM
REM HIER STAAT MET OPZET GEEN pause. De taakplanner start dit bestand zonder
REM dat er iemand bij zit; een venster dat op een toets wacht laat de taak
REM eeuwig als Wordt uitgevoerd hangen, en dan draait ze nooit meer.
REM Wil je de uitvoer zien, draai dan in een terminal:
REM
REM     node scripts/whatsapp-nabericht.js --droog
REM
REM Eenmalig instellen: zie ARCHITECTUUR.md, Zijstroom WhatsApp-nummers.
REM ---------------------------------------------------------------------
cd /d "%~dp0.."
node scripts/whatsapp-nabericht.js %*
exit /b %errorlevel%
