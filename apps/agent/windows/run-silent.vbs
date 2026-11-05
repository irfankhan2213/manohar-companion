Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Run watchdog.bat silently in the background (0 = hide window, False = don't wait)
WshShell.Run "cmd.exe /c """ & strPath & "\watchdog.bat""", 0, False
