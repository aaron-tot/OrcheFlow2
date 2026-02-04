# Fix DeepSeek Agent Model Template
Write-Host "Exporting current Modelfile..." -ForegroundColor Cyan

# Export the modelfile
$modelfile = ollama show mikepfunk28/deepseekq3_agent:latest --modelfile

# Fix the problematic .Status reference
$fixed = $modelfile -replace '"status": "\{\{ if \.Status \}\}\{\{ \.Status \}\}\{\{ else \}\}success\{\{ end \}\}"', '"status": "success"'

# Save to temp file
$tempFile = "deepseek_fixed.modelfile"
$fixed | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "Creating fixed model as 'deepseekq3_agent:fixed'..." -ForegroundColor Cyan
ollama create deepseekq3_agent:fixed -f $tempFile

Write-Host "`nFixed model created successfully!" -ForegroundColor Green
Write-Host "Original model: mikepfunk28/deepseekq3_agent:latest (with bug)" -ForegroundColor Yellow
Write-Host "Fixed model: deepseekq3_agent:fixed (use this one)" -ForegroundColor Green

# Clean up temp file
Remove-Item $tempFile

Write-Host "`nYou can now use 'deepseekq3_agent:fixed' in OpenCode without template errors." -ForegroundColor Cyan
