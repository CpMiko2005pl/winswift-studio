#!/bin/bash
# Activation server for WinSwift Studio (runs as miko, no sudo): container winswift-api (node:22-alpine) on 127.0.0.1:8794.
# Safe to run again: it only restarts the container when server.js changed.
# Data: ~/winswift-web/license — licenses.json (codes), signing-key.pem, admin-token. BACK IT UP: without signing-key.pem
# no new code can be activated by the released apps (they carry the matching public key).
set -euo pipefail
D="$HOME/winswift-web"
mkdir -p "$D/api" "$D/license" "$D/www/update" "$D/www/download"
chmod 700 "$D/license"

changed=1
if [ -f "$D/api/server.js" ] && cmp -s "$D/upload/server.js" "$D/api/server.js"; then changed=0; fi
cp "$D/upload/server.js" "$D/api/server.js"

if docker ps -a --format '{{.Names}}' | grep -qx winswift-api; then
  if [ "$changed" = 1 ]; then docker restart winswift-api >/dev/null; echo "winswift-api restarted (new server.js)"; fi
else
  docker run -d --name winswift-api --restart unless-stopped --network host --user "$(id -u):$(id -g)" \
    -e PORT=8794 -e HOST=127.0.0.1 -e DATA_DIR=/data \
    -v "$D/api:/app:ro" -v "$D/license:/data" \
    --memory 128m node:22-alpine node /app/server.js >/dev/null
  echo "winswift-api created"
  grep -q winswift-api "$D/undo.sh" 2>/dev/null || echo 'docker rm -f winswift-api   # activation server (codes stay in ~/winswift-web/license)' >> "$D/undo.sh"
fi
sleep 2
docker ps --filter name=winswift-api --format '{{.Names}} {{.Status}}'
docker logs --tail 2 winswift-api 2>&1
