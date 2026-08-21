#!/usr/bin/env bash
# Crée (soumet à l'approbation Meta) le template WhatsApp `alerte_admin`
# utilisé pour notifier l'admin hors fenêtre de service 24 h.
# Usage : ./scripts/create-template.sh   (lit WHATSAPP_TOKEN, WABA_ID, DASHBOARD_URL dans .env)
set -euo pipefail
cd "$(dirname "$0")/.."

source <(grep -E '^(WHATSAPP_TOKEN|WABA_ID|DASHBOARD_URL|GRAPH_API_BASE)=' .env)
GRAPH="${GRAPH_API_BASE:-https://graph.facebook.com/v21.0}"

if [[ -z "${WABA_ID:-}" ]]; then
  echo "❌ WABA_ID manquant dans .env (ID du compte WhatsApp Business, ex. 1829399691434225)"
  exit 1
fi

BODY_TEXT=$'🔔 NOUVELLE ALERTE — ARBI JACOB\n\nClient : {{1}}\nCatégorie : {{2}}\nIntention : {{3}}\n\nRésumé : {{4}}\nBlocage : {{5}}\nDernier message : « {{6}} »'

BUTTONS='[]'
if [[ -n "${DASHBOARD_URL:-}" ]]; then
  BUTTONS=$(cat <<JSON
[{"type":"BUTTONS","buttons":[{"type":"URL","text":"Reprendre la conversation","url":"${DASHBOARD_URL%/}/conversations/{{1}}","example":["33612345678"]}]}]
JSON
)
fi

PAYLOAD=$(python3 - "$BODY_TEXT" "$BUTTONS" <<'PY'
import json, sys
body_text, buttons = sys.argv[1], json.loads(sys.argv[2])
components = [{
    "type": "BODY",
    "text": body_text,
    "example": {"body_text": [[
        "Karim (+33612345678)", "Digital", "tarif",
        "Le client veut un site e-commerce · budget 2000 · en attente de devis",
        "devis personnalisé nécessaire", "c'est possible pour ce prix ?",
    ]]},
}] + buttons
print(json.dumps({
    "name": "alerte_admin",
    "language": "fr",
    "category": "UTILITY",
    "components": components,
}))
PY
)

echo "── Soumission du template alerte_admin au WABA $WABA_ID…"
curl -s -X POST "$GRAPH/$WABA_ID/message_templates" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
echo
echo "→ Statut d'approbation :"
curl -s "$GRAPH/$WABA_ID/message_templates?name=alerte_admin&fields=name,status,language" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN"
echo
echo "ℹ️  L'approbation Meta prend de quelques minutes à 24 h. Tant que le template"
echo "    n'est pas APPROVED, les alertes partent en texte libre (si fenêtre 24 h ouverte)"
echo "    ou par e-mail (si configuré) — voir README."
