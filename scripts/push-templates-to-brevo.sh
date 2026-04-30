#!/usr/bin/env bash
# Pousse les 13 templates locaux vers Brevo (PUT). Miroir de sync-templates-from-brevo.sh.
# Workflow type :
#   1. Tu édites email-templates/*.html en local (VS Code + Live Preview ou autre)
#   2. Tu lances ce script → Brevo est mis à jour pour les 13 templates
#   3. Tu lances test-brevo-templates.sh pour relire le rendu Gmail
#   4. Tu commit + PR pour figer la version
#
# Usage:
#   BREVO_API_KEY=xkeysib-xxxx ./scripts/push-templates-to-brevo.sh
#
# Pousser un seul template (par ID) :
#   BREVO_API_KEY=xkeysib-xxxx ONLY=1 ./scripts/push-templates-to-brevo.sh
#   BREVO_API_KEY=xkeysib-xxxx ONLY=onboarding_j0 ./scripts/push-templates-to-brevo.sh

set -euo pipefail

if [[ -z "${BREVO_API_KEY:-}" ]]; then
  echo "Error: variable d'environnement BREVO_API_KEY requise"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq requis pour encoder le HTML en JSON"
  echo "       sudo apt install jq"
  exit 1
fi

API_URL="https://api.brevo.com/v3/smtp/templates"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/email-templates"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: $SRC_DIR introuvable"
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

# Filtrer par ID ou par nom de fichier si ONLY est défini
ids_to_process=(1 2 3 4 5 6 7 8 9 10 11 12 13)
if [[ -n "${ONLY:-}" ]]; then
  ids_to_process=()
  for id in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
    fname="${TEMPLATES[$id]}"
    if [[ "$ONLY" == "$id" ]] || [[ "$ONLY" == "${fname%.html}" ]] || [[ "$ONLY" == "$fname" ]]; then
      ids_to_process=("$id")
      break
    fi
  done
  if [[ ${#ids_to_process[@]} -eq 0 ]]; then
    echo "Error: ONLY=$ONLY ne correspond à aucun template"
    exit 1
  fi
fi

echo "Push vers Brevo : ${#ids_to_process[@]} template(s)"
echo

failed=0
for id in "${ids_to_process[@]}"; do
  filename="${TEMPLATES[$id]}"
  filepath="$SRC_DIR/$filename"

  printf "[%2s] %-25s ... " "$id" "$filename"

  if [[ ! -f "$filepath" ]]; then
    echo "FAIL (fichier introuvable)"
    failed=$((failed + 1))
    continue
  fi

  # jq -Rs prend l'input brut, l'encode en JSON string proprement échappé
  payload=$(jq -Rs '{htmlContent: .}' < "$filepath")

  response=$(curl -s -w "\n%{http_code}" -X PUT "$API_URL/$id" \
    -H "api-key: $BREVO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload")

  http_code=$(printf "%s" "$response" | tail -1)
  body=$(printf "%s" "$response" | sed '$d')

  # Brevo renvoie 204 No Content sur PUT réussi
  if [[ "$http_code" == "204" ]] || [[ "$http_code" == "200" ]]; then
    echo "OK ($(wc -c < "$filepath") octets envoyés)"
  else
    echo "FAIL ($http_code) → $body"
    failed=$((failed + 1))
  fi
done

echo
if [[ $failed -gt 0 ]]; then
  echo "$failed template(s) en erreur"
  exit 1
fi

echo "Push terminé. Pour vérifier le rendu réel :"
echo "  BREVO_API_KEY=$BREVO_API_KEY ./scripts/test-brevo-templates.sh"
