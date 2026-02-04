Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Test Folder Picker - Does this appear?", 0)
If Not objFolder Is Nothing Then
    WScript.Echo objFolder.Self.Path
Else
    WScript.Echo "CANCELLED"
End If
