# Script to find and copy missing UI components from shared/ to src/
Write-Host "🔍 Finding missing UI components..." -ForegroundColor Cyan

$uiPackage = "packages\ui"
$appPackage = "packages\app"
$missingFiles = @()

# Check UI package for missing components
Write-Host "`n📦 Checking UI package..." -ForegroundColor Yellow
$uiSharedComponents = Get-ChildItem "$uiPackage\src\shared\components\*.tsx" -ErrorAction SilentlyContinue
foreach ($file in $uiSharedComponents) {
    $targetPath = "$uiPackage\src\components\$($file.Name)"
    if (-not (Test-Path $targetPath)) {
        $missingFiles += @{
            Source = $file.FullName
            Target = $targetPath
            Package = "UI"
            Name = $file.BaseName
        }
    }
}

# Check App package for missing components
Write-Host "📦 Checking App package..." -ForegroundColor Yellow
$appSharedComponents = Get-ChildItem "$appPackage\src\shared\**\*.tsx" -Recurse -ErrorAction SilentlyContinue
foreach ($file in $appSharedComponents) {
    $relativePath = $file.FullName.Replace("$appPackage\src\shared\", "")
    $targetPath = "$appPackage\src\$relativePath"
    if (-not (Test-Path $targetPath)) {
        # Determine target directory
        if ($relativePath -like "ui\*") {
            $targetPath = "$appPackage\src\components\$($file.Name)"
        }
        if (-not (Test-Path $targetPath)) {
            $missingFiles += @{
                Source = $file.FullName
                Target = $targetPath
                Package = "App"
                Name = $file.BaseName
            }
        }
    }
}

# Display missing files
if ($missingFiles.Count -eq 0) {
    Write-Host "`n✅ No missing files found!" -ForegroundColor Green
    exit 0
}

Write-Host "`n⚠️  Found $($missingFiles.Count) missing files:" -ForegroundColor Red
foreach ($item in $missingFiles) {
    Write-Host "  [$($item.Package)] $($item.Name)" -ForegroundColor Yellow
}

# Ask for confirmation
Write-Host "`n❓ Copy all missing files? (Y/N): " -ForegroundColor Cyan -NoNewline
$confirmation = Read-Host
if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 1
}

# Copy files
Write-Host "`n📋 Copying files..." -ForegroundColor Cyan
$copiedFiles = @()
foreach ($item in $missingFiles) {
    try {
        $targetDir = Split-Path $item.Target -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item $item.Source $item.Target -Force
        $copiedFiles += $item.Name
        Write-Host "  ✓ Copied: $($item.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed: $($item.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Update package.json exports for UI package
if ($copiedFiles.Count -gt 0) {
    Write-Host "`n📝 Updating package.json exports..." -ForegroundColor Cyan
    $packageJsonPath = "$uiPackage\package.json"
    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        $exportsUpdated = $false
        
        foreach ($fileName in $copiedFiles) {
            $exportKey = "./$fileName"
            $exportValue = "./src/components/$fileName.tsx"
            
            if (-not $packageJson.exports.PSObject.Properties.Name -contains $exportKey) {
                $packageJson.exports | Add-Member -MemberType NoteProperty -Name $exportKey -Value $exportValue -Force
                $exportsUpdated = $true
                Write-Host "  ✓ Added export: $exportKey" -ForegroundColor Green
            }
        }
        
        if ($exportsUpdated) {
            $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath
            Write-Host "  ✓ package.json updated" -ForegroundColor Green
        }
    }
}

Write-Host "`n✅ Done! Copied $($copiedFiles.Count) files." -ForegroundColor Green
Write-Host "🔄 Restart the dev server to pick up changes." -ForegroundColor Cyan
