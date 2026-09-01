' Start de watchdog zonder zichtbaar venster.
' Wordt elke 10 minuten opgeroepen door de Windows-taak "Keurwijzer watchdog".
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website\scripts\watchdog-taken.js""", 0, False
