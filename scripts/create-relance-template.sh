#!/usr/bin/env bash
# Crée (soumet à l'approbation Meta) le template WhatsApp `relance_client`.
# C'est le SEUL canal autorisé par WhatsApp pour écrire à un client plus de
# 24 h après son dernier message. Sa variable {{1}} porte le texte que Jacob
# tape dans le back-office : le message arrive donc intégralement, même
# fenêtre fermée (voir sendHumanMessageAction côté dashboard).
# Usage : ./scripts/create-relance-template.sh   (lit WHATSAPP_TOKEN, WABA_ID dans .env)
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source ./.env
set +a
GRAPH="${GRAPH_API_BASE:-https://graph.facebook.com/v21.0}"
NAME="${RELANCE_TEMPLATE_NAME:-relance_client}"

if [[ -z "${WABA_ID:-}" ]]; then
  echo "❌ WABA_ID manquant dans .env (ID du compte WhatsApp Business, ex. 1829399691434225)"
  exit 1
fi

# Meta refuse un corps réduit à une variable : il doit commencer ET finir par
# du texte fixe. D'où l'en-tête et la signature autour de {{1}}.
BODY_TEXT=$'Salut 👋 C\'est Jacob d\'ARBI JACOB.\n\n{{1}}\n\nRéponds-moi ici, je reste dispo.'
# Un texte libre de relance est classé MARKETING par Meta ; le forcer en
# UTILITY expose à un refus ou à une reclassification.
CATEGORY="${RELANCE_TEMPLATE_CATEGORY:-MARKETING}"

PAYLOAD=$(python3 - "$NAME" "$BODY_TEXT" "$CATEGORY" <<'PY'
import json, sys
name, body_text, category = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "name": name,
    "language": "fr",
    "category": category,
    "components": [{
        "type": "BODY",
        "text": body_text,
        "example": {"body_text": [[
            "Salut, c'est Jacob d'ARBI JACOB. Je reviens vers toi au sujet de ta demande de volant Megane 3RS : il est dispo, je t'envoie le prix.",
        ]]},
    }],
}))
PY
)

echo "── Soumission du template $NAME au WABA $WABA_ID…"
curl -s -X POST "$GRAPH/$WABA_ID/message_templates" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
echo
echo "→ Statut d'approbation :"
curl -s "$GRAPH/$WABA_ID/message_templates?name=$NAME&fields=name,status,language" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN"
echo
echo "ℹ️  Une fois APPROVED, renseigne « $NAME » dans Dashboard → Réglages →"
echo "    « Template de relance client (hors fenêtre 24 h) ». Les réponses tapées"
echo "    dans le back-office partiront alors même si la fenêtre 24 h est fermée."
