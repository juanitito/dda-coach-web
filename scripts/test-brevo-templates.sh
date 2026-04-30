#!/usr/bin/env bash
# Envoie les 13 templates Brevo à juanitito@gmail.com pour revue visuelle.
# Tape directement l'API Brevo (skip Supabase send-email), parfait pour relire le rendu.
#
# Usage:
#   BREVO_API_KEY=xkeysib-xxxx ./scripts/test-brevo-templates.sh
#
# Si tu veux changer le destinataire :
#   BREVO_API_KEY=xkeysib-xxxx TO_EMAIL=test@example.com ./scripts/test-brevo-templates.sh

set -euo pipefail

if [[ -z "${BREVO_API_KEY:-}" ]]; then
  echo "Error: variable d'environnement BREVO_API_KEY requise"
  echo "       (Brevo → SMTP & API → API Keys → générer une clé v3)"
  exit 1
fi

TO_EMAIL="${TO_EMAIL:-juanitito@gmail.com}"
TO_NAME="${TO_NAME:-Jean Test}"
API_URL="https://api.brevo.com/v3/smtp/email"

send() {
  local template_id="$1"
  local label="$2"
  local params_json="$3"

  printf "[%2s] %-20s ... " "$template_id" "$label"

  local response http_code body
  response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "api-key: $BREVO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"to\": [{\"email\": \"$TO_EMAIL\", \"name\": \"$TO_NAME\"}],
      \"templateId\": $template_id,
      \"params\": $params_json
    }")

  http_code=$(printf "%s" "$response" | tail -1)
  body=$(printf "%s" "$response" | sed '$d')

  if [[ "$http_code" == "201" ]]; then
    msg_id=$(printf "%s" "$body" | grep -o '"messageId":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "OK (msg ${msg_id:-?})"
  else
    echo "FAIL ($http_code) → $body"
  fi

  sleep 1
}

# Variables de profil (auto-injectées par send-email en prod via la table profiles)
COMMON='"PRENOM":"Jean","NOM":"Dupont","RAISON_SOCIALE":"Cabinet Dupont SARL"'

echo "Envoi des 13 templates à $TO_EMAIL ..."
echo

send  1 "onboarding_j0"     "{$COMMON,\"APP_URL\":\"https://bingedda.fr/formation\"}"
send  2 "onboarding_j3"     "{$COMMON,\"APP_URL\":\"https://bingedda.fr/formation\"}"
send  3 "onboarding_j7"     "{$COMMON,\"HEURES_FAITES\":\"3\",\"APP_URL\":\"https://bingedda.fr/formation\"}"
send  4 "onboarding_j30"    "{$COMMON,\"HEURES_FAITES\":\"7\",\"HEURES_RESTANTES\":\"8\",\"APP_URL\":\"https://bingedda.fr/formation\"}"
send  5 "facture"           "{$COMMON,\"NUMERO_FACTURE\":\"FA-2026-04-001\",\"MONTANT_HT\":\"24,99\",\"MONTANT_TTC\":\"29,99\",\"TVA\":\"5,00\",\"PERIODE\":\"avril 2026\",\"FACTURE_URL\":\"https://bingedda.fr/factures/FA-2026-04-001.pdf\"}"
send  6 "echec_prelevement" "{$COMMON,\"MONTANT_TTC\":\"29,99\",\"DATE_NOUVELLE_TENTATIVE\":\"7 mai 2026\",\"APP_URL\":\"https://bingedda.fr/compte\"}"
send  7 "mandat_annule"     "{$COMMON,\"APP_URL\":\"https://bingedda.fr/compte\"}"
send  8 "rappel_dda_j60"    "{$COMMON,\"HEURES_FAITES\":\"5\",\"HEURES_RESTANTES\":\"10\",\"DATE_ECHEANCE\":\"31 décembre 2026\",\"APP_URL\":\"https://bingedda.fr/formation\"}"
send  9 "rappel_dda_j30"    "{$COMMON,\"HEURES_FAITES\":\"9\",\"HEURES_RESTANTES\":\"6\",\"DATE_ECHEANCE\":\"31 décembre 2026\",\"APP_URL\":\"https://bingedda.fr/formation\"}"
send 10 "rappel_dda_j7"     "{$COMMON,\"HEURES_RESTANTES\":\"3\",\"DATE_ECHEANCE\":\"31 décembre 2026\",\"APP_URL\":\"https://bingedda.fr/formation\"}"
send 11 "nouveau_contenu"   "{$COMMON,\"MODULE_TITRE\":\"DDA et IA générative\",\"MODULE_DUREE\":\"45 min\",\"MODULE_THEME\":\"Veille\",\"MODULE_URL\":\"https://bingedda.fr/formation/VEILLE-2026-W18\"}"
send 12 "renouvellement"    "{$COMMON,\"DATE_RENOUVELLEMENT\":\"30 avril 2026\",\"MONTANT_TTC\":\"29,99\",\"APP_URL\":\"https://bingedda.fr/compte\"}"
send 13 "resiliation"       "{$COMMON,\"DATE_FIN_ACCES\":\"30 mai 2026\",\"APP_URL\":\"https://bingedda.fr/compte\"}"

echo
echo "Terminé. Vérifie $TO_EMAIL dans 1-2 min (regarde aussi le dossier spam au cas où)."
