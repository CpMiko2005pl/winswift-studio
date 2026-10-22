# Publishes an app update. Installed copies of WinSwift Studio check update.json when they start (and every few hours,
# and as soon as the internet comes back), then offer "Download and Install" — the update installs itself and restarts the app.
#
#   1) bump "version" in package.json, run:  npm run installer
#   2) .\website\publish-update.ps1 -NotesFile notes-pl.txt [-NotesEnFile notes-en.txt] [-Mandatory]
#
# What it does: uploads dist\WinSwift-Studio-Setup-<version>.exe to https://winswift.tacticalops.fun/download/ and then
# update.json to https://winswift.tacticalops.fun/update.json (the manifest goes last, so no app sees it before the file).
# A copy is left in dist\update.json — the app also reads https://xdecode.cyberscope.pl/update.json, so the same file can be
# uploaded there by FTP (public_html/update.json); the newest version of the two wins.
param([string]$Notes = '', [string]$NotesEn = '', [string]$NotesFile, [string]$NotesEnFile, [switch]$Mandatory, [switch]$LocalOnly)
$ErrorActionPreference = 'Continue'   # ssh/scp print warnings on stderr
$root = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$v = $pkg.version
$name = "WinSwift-Studio-Setup-$v.exe"
$exe = Join-Path $root "dist\$name"
if (-not (Test-Path $exe)) { throw "Brak $exe - najpierw: npm run installer" }
if ($NotesFile) { $Notes = (Get-Content $NotesFile -Raw -Encoding UTF8).Trim() }
if ($NotesEnFile) { $NotesEn = (Get-Content $NotesEnFile -Raw -Encoding UTF8).Trim() }

$manifest = [ordered]@{
  version     = $v
  date        = (Get-Date -Format 'yyyy-MM-dd')
  notes       = $Notes
  notes_en    = $(if ($NotesEn) { $NotesEn } else { $Notes })
  url         = "https://winswift.tacticalops.fun/download/$name"
  fallbackUrl = "https://github.com/CpMiko2005pl/winswift-studio/releases/download/v$v/$name"
  sha256      = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
  size        = (Get-Item $exe).Length
  mandatory   = [bool]$Mandatory
  page        = 'https://winswift.tacticalops.fun/'
}
$out = Join-Path $root 'dist\update.json'
[IO.File]::WriteAllText($out, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
"update.json: $out (v$v, $([math]::Round($manifest.size / 1MB, 1)) MB, sha256 $($manifest.sha256.Substring(0, 12))...)"
if ($LocalOnly) { return }

ssh prozlecenie-zdalnie 'mkdir -p ~/winswift-web/www/download ~/winswift-web/www/update'
scp -q $exe "prozlecenie-zdalnie:winswift-web/www/download/$name"
if ($LASTEXITCODE) { throw 'upload of the installer failed' }
scp -q $out prozlecenie-zdalnie:winswift-web/www/update/update.json.new
if ($LASTEXITCODE) { throw 'upload of update.json failed' }
ssh prozlecenie-zdalnie 'mv -f ~/winswift-web/www/update/update.json.new ~/winswift-web/www/update/update.json; ls -la ~/winswift-web/www/download | tail -n 4'

# check what the apps will see
$live = Invoke-RestMethod "https://winswift.tacticalops.fun/update.json?t=$(Get-Random)"
$head = Invoke-WebRequest -UseBasicParsing -Method Head $manifest.url
"live update.json: version $($live.version), installer HTTP $($head.StatusCode), $($head.Headers['Content-Length']) bytes"
if ($live.version -ne $v -or [int64]$head.Headers['Content-Length'] -ne $manifest.size) { Write-Warning 'something does not match - check the files on the server' }
