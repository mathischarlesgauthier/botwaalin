#!/usr/bin/env bash
# Expose le bot local en HTTPS (cloudflared) et re-pointe automatiquement le
# webhook Meta vers la nouvelle URL. À relancer après chaque redémarrage.
# Usage : ./scripts/expose.sh   (lit META_APP_ID, APP_SECRET, VERIFY_TOKEN dans .env)
set -euo pipefail
cd "$(dirname "$0")/.."

source <(grep -E '^(META_APP_ID|APP_SECRET|VERIFY_TOKEN|GRAPH_API_BASE)=' .env)
GRAPH="${GRAPH_API_BASE:-https://graph.facebook.com/v21.0}"

if [[ -z "${META_APP_ID:-}" || -z "${APP_SECRET:-}" || -z "${VERIFY_TOKEN:-}" ]]; then
  echo "❌ META_APP_ID, APP_SECRET et VERIFY_TOKEN sont requis dans .env"
  exit 1
fi

if ! curl -s --max-time 3 http://localhost:3000/health > /dev/null; then
  echo "❌ Le bot ne répond pas sur http://localhost:3000 — lance d'abord : docker compose up -d"
  exit 1
fi

LOG=/tmp/cloudflared-arbi.log
pkill -f "cloudflared tunnel --url http://localhost:3000" 2>/dev/null || true
sleep 1
nohup cloudflared tunnel --url http://localhost:3000 > "$LOG" 2>&1 &
echo "── Tunnel cloudflared démarré (PID $!)…"

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
if [[ -z "$URL" ]]; then
  echo "❌ Impossible d'obtenir l'URL du tunnel (voir $LOG)"
  exit 1
fi
echo "── URL publique : $URL"

echo "── Mise à jour du webhook Meta…"
curl -s -X POST "$GRAPH/$META_APP_ID/subscriptions" \
  --data-urlencode "object=whatsapp_business_account" \
  --data-urlencode "callback_url=$URL/webhook" \
  --data-urlencode "verify_token=$VERIFY_TOKEN" \
  --data-urlencode "fields=messages" \
  --data-urlencode "access_token=$META_APP_ID|$APP_SECRET"
echo
echo "✅ Webhook pointé sur $URL/webhook — le bot est joignable."
echo "⚠️  URL éphémère : si le tunnel ou le Mac redémarre, relance ce script."
