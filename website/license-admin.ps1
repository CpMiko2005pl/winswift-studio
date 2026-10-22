# Activation server admin (winswift.tacticalops.fun/api). License keys themselves are managed in the shop
# (xdecode.cyberscope.pl/admin.php); this only shows which PC holds which key and can free a key from a PC
# (e.g. someone's PC died and they can't press Deactivate any more).
#
#   .\website\license-admin.ps1 list
#   .\website\license-admin.ps1 show  <WS1-key | first 8+ chars of the hash from "list">
#   .\website\license-admin.ps1 reset <WS1-key | first 8+ chars of the hash from "list">
#
# The admin token is on the server in ~/winswift-web/license/admin-token (a copy: %USERPROFILE%\WinSwift-licencje-backup).
param([Parameter(Mandatory = $true)][ValidateSet('list', 'show', 'reset')][string]$Action, [string]$Key)
$tokenFile = Join-Path $env:USERPROFILE 'WinSwift-licencje-backup\admin-token'
if (-not (Test-Path $tokenFile)) { throw "Brak tokenu: $tokenFile" }
$h = @{ Authorization = 'Bearer ' + (Get-Content $tokenFile -Raw).Trim() }
$api = 'https://winswift.tacticalops.fun/api/admin/keys'
$ref = [uri]::EscapeDataString(($Key -replace '\s', ''))
switch ($Action) {
  'list' {
    $r = Invoke-RestMethod $api -Headers $h
    "$($r.keys.Count) key(s), $($r.active) active"
    $r.keys | ForEach-Object {
      [pscustomobject]@{ Hash = $_.hash.Substring(0, 10); PC = $(if ($_.device) { $_.device.name } else { '(free)' }); Since = $(if ($_.device) { $_.device.activatedAt }); LastSeen = $(if ($_.device) { $_.device.lastSeen }); Version = $(if ($_.device) { $_.device.version }); Activations = $_.activations }
    } | Format-Table -AutoSize
  }
  'show' { Invoke-RestMethod "$api/$ref" -Headers $h | ConvertTo-Json -Depth 5 }
  'reset' { $r = Invoke-RestMethod "$api/$ref/reset" -Method Post -Headers $h -ContentType 'application/json' -Body '{}'; "freed $($r.hash.Substring(0, 10)) - the key can be activated on any PC now" }
}
