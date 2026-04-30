#!/usr/bin/env bash
# Rapatrie les 13 templates depuis Brevo vers email-templates/ pour figer leur version.
# Workflow type :
#   1. Tu édites les templates dans Brevo (UI HTML editor), tu valides le rendu
#   2. Tu lances ce script → email-templates/*.html sont écrasés avec la version Brevo
#   3. Tu fais `git diff email-templates/` pour voir les changements
#   4. Tu commit (et idéalement tu PR) pour figer la version
#
# Usage:
#   BREVO_API_KEY=xkeysib-xxxx ./scripts/sync-templates-from-brevo.sh

set -euo pipefail

if [[ -z "${BREVO_API_KEY:-}" ]]; then
  echo "Error: variable d'environnement BREVO_API_KEY requise"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq requis pour parser les réponses JSON Brevo"
  echo "       sudo apt install jq"
  exit 1
fi

API_URL="https://api.brevo.com/v3/smtp/templates"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/email-templates"

if [[ ! -d "$DEST_DIR" ]]; then
  echo "Error: $DEST_DIR introuvable"
  exit 1
fi

# Mapping template ID Brevo → fichier local (doit matcher TEMPLATES dans send-email/index.ts)
declare -A TEMPLATES=(
  [1]="onboarding_j0.html"
  [2]="onboarding_j3.html"
  [3]="onboarding_j7.html"
  [4]="onboarding_j30.html"
  [5]="facture.html"
  [6]="echec_prelevement.html"
  [7]="mandat_annule.html"
  [8]="rappel_dda_j60.html"
  [9]="rappel_dda_j30.html"
  [10]="rappel_dda_j7.html"
  [11]="nouveau_contenu.html"
  [12]="renouvellement.html"
  [13]="resiliation.html"
)

echo "Sync depuis Brevo → $DEST_DIR"
echo

failed=0
for id in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  filename="${TEMPLATES[$id]}"
  printf "[%2s] %-25s ... " "$id" "$filename"

  response=$(curl -s -w "\n%{http_code}" "$API_URL/$id" \
    -H "api-key: $BREVO_API_KEY" \
    -H "Accept: application/json")

  http_code=$(printf "%s" "$response" | tail -1)
  body=$(printf "%s" "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    echo "FAIL ($http_code) → $body"
    failed=$((failed + 1))
    continue
  fi

  html_content=$(printf "%s" "$body" | jq -r '.htmlContent // empty')

  if [[ -z "$html_content" ]]; then
    echo "FAIL (htmlContent vide ou absent dans la réponse Brevo)"
    failed=$((failed + 1))
    continue
  fi

  printf "%s" "$html_content" > "$DEST_DIR/$filename"
  echo "OK ($(wc -c < "$DEST_DIR/$filename") octets)"
done

echo
if [[ $failed -gt 0 ]]; then
  echo "$failed template(s) en erreur — repo non écrasé pour ces fichiers"
  exit 1
fi

echo "Sync terminé. Vérifie les changements :"
echo "  git diff email-templates/"
echo "  git status email-templates/"
