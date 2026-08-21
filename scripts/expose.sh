#!/usr/bin/env bash
# Expose le bot local en HTTPS (cloudflared) et re-pointe automatiquement le
# webhook Meta vers la nouvelle URL. À relancer après chaque redémarrage.
# Usage : ./scripts/expose.sh   (lit META_APP_ID, APP_SECRET, VERIFY_TOKEN dans .env)
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source ./.env
set +a
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

echo "── Attente de la joignabilité publique du tunnel…"
READY=0
for _ in $(seq 1 20); do
  if curl -s --max-time 5 "$URL/health" | grep -q '"ok"'; then
    READY=1
    break
  fi
  sleep 2
done
if [[ "$READY" != "1" ]]; then
  # Le DNS local peut être en retard sur *.trycloudflare.com : on continue,
  # la vérification de Meta (avec retries) reste le juge de paix.
  echo "⚠️  Le tunnel ne répond pas encore depuis cette machine — on tente quand même côté Meta."
fi

echo "── Mise à jour du webhook Meta…"
OK=0
for attempt in 1 2 3; do
  RESPONSE=$(curl -s -X POST "$GRAPH/$META_APP_ID/subscriptions" \
    --data-urlencode "object=whatsapp_business_account" \
    --data-urlencode "callback_url=$URL/webhook" \
    --data-urlencode "verify_token=$VERIFY_TOKEN" \
    --data-urlencode "fields=messages" \
    --data-urlencode "access_token=$META_APP_ID|$APP_SECRET")
  if echo "$RESPONSE" | grep -q '"success":true'; then
    OK=1
    break
  fi
  echo "   tentative $attempt échouée : $RESPONSE"
  sleep 3
done

if [[ "$OK" == "1" ]]; then
  echo "✅ Webhook pointé sur $URL/webhook — le bot est joignable."
else
  echo "❌ Meta a refusé la configuration du webhook (voir ci-dessus)."
  exit 1
fi
echo "⚠️  URL éphémère : si le tunnel ou le Mac redémarre, relance ce script."
