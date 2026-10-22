#!/bin/bash
# One-time setup of winswift.tacticalops.fun on the server (runs as miko, no sudo needed):
#  - container winswift-web: nginx serving ~/winswift-web/www/site on 127.0.0.1:8793
#  - Cloudflare tunnel "winswift" (separate from the tacticalops tunnel) + DNS record, connector in container winswift-tunnel
# Undo: bash ~/winswift-web/undo.sh
set -euo pipefail
D="$HOME/winswift-web"
mkdir -p "$D/www/site" "$D/conf" "$D/cloudflared"
cp "$D/upload/nginx.conf" "$D/conf/nginx.conf"
cp "$D/upload/headers.conf" "$D/conf/headers.conf"

# 1) web server
if docker ps -a --format '{{.Names}}' | grep -qx winswift-web; then
  docker exec winswift-web nginx -t && docker exec winswift-web nginx -s reload
else
  docker run -d --name winswift-web --restart unless-stopped --network host \
    -v "$D/www:/srv/www:ro" \
    -v "$D/conf/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$D/conf/headers.conf:/etc/nginx/winswift-headers.conf:ro" \
    nginx:alpine
fi

# 2) tunnel + DNS (the cert in ~/.cloudflared is for the tacticalops.fun zone)
if ! cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx winswift; then
  cloudflared tunnel create winswift
fi
ID=$(cloudflared tunnel list 2>/dev/null | awk '$2=="winswift"{print $1}')
[ -n "$ID" ] || { echo "tunnel id not found"; exit 1; }
install -m 600 "$HOME/.cloudflared/$ID.json" "$D/cloudflared/creds.json"
cat > "$D/cloudflared/config.yml" <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: winswift.tacticalops.fun
    service: http://127.0.0.1:8793
  - service: http_status:404
EOF
chmod 600 "$D/cloudflared/config.yml"
cloudflared tunnel route dns winswift winswift.tacticalops.fun || echo "(DNS record already exists?)"
if ! docker ps -a --format '{{.Names}}' | grep -qx winswift-tunnel; then
  docker run -d --name winswift-tunnel --restart unless-stopped --network host --user "$(id -u):$(id -g)" \
    -v "$D/cloudflared:/etc/cloudflared:ro" cloudflare/cloudflared:latest \
    tunnel --config /etc/cloudflared/config.yml run
else
  docker restart winswift-tunnel
fi

cat > "$D/undo.sh" <<EOF
#!/bin/bash
# removes winswift.tacticalops.fun (containers + tunnel; the DNS CNAME must be deleted in the Cloudflare dashboard)
docker rm -f winswift-web winswift-tunnel
cloudflared tunnel cleanup winswift; cloudflared tunnel delete winswift
EOF
chmod +x "$D/undo.sh"
echo "tunnel $ID"
docker ps --filter name=winswift --format '{{.Names}} {{.Status}}'
