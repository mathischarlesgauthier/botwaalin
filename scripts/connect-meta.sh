#!/usr/bin/env bash
# Enregistre le numéro WhatsApp sur l'API Cloud, de bout en bout.
# Usage : ./scripts/connect-meta.sh   (lit WHATSAPP_TOKEN et PHONE_NUMBER_ID dans .env)
set -euo pipefail
cd "$(dirname "$0")/.."

source <(grep -E '^(WHATSAPP_TOKEN|PHONE_NUMBER_ID|GRAPH_API_BASE)=' .env)
GRAPH="${GRAPH_API_BASE:-https://graph.facebook.com/v21.0}"
PIN="${PIN:-123456}"

if [[ -z "${WHATSAPP_TOKEN:-}" || "$WHATSAPP_TOKEN" == "A_COLLER" ]]; then
  echo "❌ WHATSAPP_TOKEN manquant dans .env (console Meta → Configuration de l'API → Générer un jeton d'accès)"
  exit 1
fi

api() { curl -s -H "Authorization: Bearer $WHATSAPP_TOKEN" "$@"; }

echo "── État du numéro ($PHONE_NUMBER_ID)"
STATE=$(api "$GRAPH/$PHONE_NUMBER_ID?fields=display_phone_number,status,code_verification_status,name_status")
echo "$STATE"

if echo "$STATE" | grep -q '"error"'; then
  echo "❌ Le jeton est invalide ou expiré : régénère-le dans la console Meta et remets-le dans .env"
  exit 1
fi

if echo "$STATE" | grep -Eq '"code_verification_status":"(NOT_VERIFIED|EXPIRED)"'; then
  echo "── Vérification SMS nécessaire : envoi du code…"
  api -X POST "$GRAPH/$PHONE_NUMBER_ID/request_code" -d "code_method=SMS&language=fr"
  echo
  read -rp "Code à 6 chiffres reçu par SMS sur le numéro : " CODE
  echo "── Validation du code…"
  api -X POST "$GRAPH/$PHONE_NUMBER_ID/verify_code" -d "code=$CODE"
  echo
fi

echo "── Enregistrement (register, PIN=$PIN)…"
api -X POST "$GRAPH/$PHONE_NUMBER_ID/register" \
  -H "Content-Type: application/json" \
  -d "{\"messaging_product\":\"whatsapp\",\"pin\":\"$PIN\"}"
echo

echo "── État final"
api "$GRAPH/$PHONE_NUMBER_ID?fields=display_phone_number,status,code_verification_status"
echo
echo "✅ Si status=CONNECTED (ou success:true ci-dessus) : c'est branché. PIN de sécurité : $PIN — note-le."
