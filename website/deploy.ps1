# Builds the website and uploads it to winswift.tacticalops.fun (server: ssh prozlecenie-zdalnie, ~/winswift-web).
# First time: .\website\deploy.ps1 -Setup   (creates the nginx container and the Cloudflare tunnel)
param([switch]$Setup, [switch]$NoBuild)
$ErrorActionPreference = 'Continue'   # cloudflared/ssh print warnings on stderr
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not $NoBuild) {
  & .\node_modules\electron\dist\electron.exe website\build.js
  if ($LASTEXITCODE) { throw 'website build failed' }
}
$tgz = Join-Path $env:TEMP 'winswift-site.tgz'
Remove-Item $tgz -ErrorAction SilentlyContinue
tar -czf $tgz -C website\dist .
ssh prozlecenie-zdalnie 'mkdir -p ~/winswift-web/upload'
scp -q $tgz website\server\nginx.conf website\server\headers.conf website\server\setup.sh prozlecenie-zdalnie:winswift-web/upload/
# swap the site directory inside the mounted ~/winswift-web/www (the container sees the change at once)
ssh prozlecenie-zdalnie 'set -e; W=~/winswift-web/www; rm -rf $W/site.new; mkdir -p $W/site.new; tar -xzf ~/winswift-web/upload/winswift-site.tgz -C $W/site.new; rm -rf $W/site.old; if [ -d $W/site ]; then mv $W/site $W/site.old; fi; mv $W/site.new $W/site; echo "site deployed: $(ls $W/site | wc -l) entries"'
if ($Setup) { ssh prozlecenie-zdalnie 'bash ~/winswift-web/upload/setup.sh 2>&1' }
else { ssh prozlecenie-zdalnie 'cp ~/winswift-web/upload/nginx.conf ~/winswift-web/conf/nginx.conf; cp ~/winswift-web/upload/headers.conf ~/winswift-web/conf/headers.conf; docker exec winswift-web nginx -t 2>&1 | tail -1; docker exec winswift-web nginx -s reload' }
Remove-Item $tgz
