# deploy.ps1 — Build Spacak Launcher a vytvor GitHub Release
# Pouzitie: .\deploy.ps1
# Pred prvym pouzitim spusti: gh auth login

$ErrorActionPreference = "Stop"

# Zisti verziu z package.json
$pkg = Get-Content "package.json" | ConvertFrom-Json
$version = $pkg.version
$tag = "v$version"

Write-Host ""
Write-Host "==> Spacak Launcher $tag" -ForegroundColor Cyan

# ── 1. Build ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build zlyhal" }

# ── 2. Packaging (Defender zbrisu electron.exe — opravime manualne) ───────────
Write-Host ""
Write-Host "==> Packaging..." -ForegroundColor Cyan
Remove-Item "release\win-unpacked" -Recurse -Force -ErrorAction SilentlyContinue
npx electron-builder --win --dir 2>&1 | Out-Null

$unpacked = "release\win-unpacked"
$src = "node_modules\electron\dist"
$needed = @("electron.exe","d3dcompiler_47.dll","dxcompiler.dll","ffmpeg.dll",
            "icudtl.dat","LICENSES.chromium.html","resources.pak",
            "snapshot_blob.bin","v8_context_snapshot.bin","version","vulkan-1.dll")
foreach ($f in $needed) {
  $from = Join-Path $src $f
  $to   = Join-Path $unpacked $f
  if ((Test-Path $from) -and !(Test-Path $to)) { Copy-Item $from $to -Force }
}
if (Test-Path "$unpacked\electron.exe") {
  Rename-Item "$unpacked\electron.exe" "Spacak Launcher.exe"
}

# ── 3. Profiles ───────────────────────────────────────────────────────────────
Write-Host "==> Kopírujem Profiles/..." -ForegroundColor Cyan
if (!(Test-Path "$unpacked\Profiles")) {
  Copy-Item "Profiles" "$unpacked\Profiles" -Recurse
}

# ── 4. Installer ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Vytváram inštalátor..." -ForegroundColor Cyan
npx electron-builder --win --prepackaged $unpacked
if ($LASTEXITCODE -ne 0) { throw "Installer zlyhal" }

# ── 5. GitHub Release ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Vytváram GitHub Release $tag..." -ForegroundColor Cyan

$exe      = "release\Spacak Launcher-Setup-$version.exe"
$yml      = "release\latest.yml"
$blockmap = "release\Spacak Launcher-Setup-$version.exe.blockmap"

gh release create $tag $exe $yml $blockmap `
  --title "Spacak Launcher $tag" `
  --notes "Spacak Launcher $tag" `
  --repo "Arduinak/SpacakSMP-launcher"

if ($LASTEXITCODE -ne 0) { throw "GitHub release zlyhal" }

Write-Host ""
Write-Host "==> Hotovo! Release $tag je live." -ForegroundColor Green
Write-Host "    Pouzivatelia dostanu update pri dalsom spusteni launchera." -ForegroundColor Green
