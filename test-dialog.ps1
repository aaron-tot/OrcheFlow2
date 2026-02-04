Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "TEST - Can you see this dialog?"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
Write-Output "Result: $result"
if ($result -eq "OK") {
    Write-Output $dialog.SelectedPath
} else {
    Write-Output "CANCELLED"
}
