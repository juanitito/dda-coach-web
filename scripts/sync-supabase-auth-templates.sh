#!/usr/bin/env bash
# Pousse les 5 templates Supabase Auth vers le projet Supabase via Management API.
# Mêmes principes que push-templates-to-brevo.sh, mais pour les emails d'authentification
# (recovery, confirmation, magic_link, email_change, invite).
#
# Prérequis :
#   - Personal Access Token Supabase
#     (https://supabase.com/dashboard/account/tokens)
#   - jq installé
#
# Usage :
#   SUPABASE_ACCESS_TOKEN=sbp_xxxx ./scripts/sync-supabase-auth-templates.sh
#
# Pousser un seul template (par nom) :
#   SUPABASE_ACCESS_TOKEN=sbp_xxxx ONLY=recovery ./scripts/sync-supabase-auth-templates.sh
#
# Modifier le sujet d'un template : édite le mapping SUBJECTS ci-dessous.

set -euo pipefail

PROJECT_REF="vrufldjydjrgcqwhmpnt"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Error: variable d'environnement SUPABASE_ACCESS_TOKEN requise"
  echo "       Génère un token sur https://supabase.com/dashboard/account/tokens"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq requis pour encoder le HTML en JSON"
  echo "       sudo apt install jq"
  exit 1
fi

API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/email-templates/auth"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: $SRC_DIR introuvable"
  exit 1
fi

# Mapping nom template → (fichier, clé API content, clé API subject, sujet email)
declare -A FILES=(
  [recovery]="recovery.html"
  [confirmation]="confirmation.html"
  [magic_link]="magic_link.html"
  [email_change]="email_change.html"
  [invite]="invite.html"
)

declare -A CONTENT_KEYS=(
  [recovery]="mailer_templates_recovery_content"
  [confirmation]="mailer_templates_confirmation_content"
  [magic_link]="mailer_templates_magic_link_content"
  [email_change]="mailer_templates_email_change_content"
  [invite]="mailer_templates_invite_content"
)

declare -A SUBJECT_KEYS=(
  [recovery]="mailer_subjects_recovery"
  [confirmation]="mailer_subjects_confirmation"
  [magic_link]="mailer_subjects_magic_link"
  [email_change]="mailer_subjects_email_change"
  [invite]="mailer_subjects_invite"
)

declare -A SUBJECTS=(
  [recovery]="Réinitialisation de votre mot de passe BingeDDA"
  [confirmation]="Confirmez votre inscription BingeDDA"
  [magic_link]="Votre lien de connexion BingeDDA"
  [email_change]="Confirmez votre nouvelle adresse email BingeDDA"
  [invite]="Vous êtes invité·e à rejoindre BingeDDA"
)

names_to_process=(recovery confirmation magic_link email_change invite)
if [[ -n "${ONLY:-}" ]]; then
  if [[ -z "${FILES[$ONLY]:-}" ]]; then
    echo "Error: ONLY=$ONLY ne correspond à aucun template"
    echo "       Valides : ${!FILES[@]}"
    exit 1
  fi
  names_to_process=("$ONLY")
fi

echo "Push vers Supabase Auth : ${#names_to_process[@]} template(s)"
echo "Projet : $PROJECT_REF"
echo

# Construire un seul payload PATCH avec tous les templates demandés
payload="{}"
for name in "${names_to_process[@]}"; do
  filepath="$SRC_DIR/${FILES[$name]}"
  if [[ ! -f "$filepath" ]]; then
    echo "Error: $filepath introuvable"
    exit 1
  fi
  content_key="${CONTENT_KEYS[$name]}"
  subject_key="${SUBJECT_KEYS[$name]}"
  subject="${SUBJECTS[$name]}"
  payload=$(jq --rawfile html "$filepath" \
                --arg ck "$content_key" \
                --arg sk "$subject_key" \
                --arg sub "$subject" \
                '.[$ck] = $html | .[$sk] = $sub' <<< "$payload")
  printf "  [%-13s] %-20s (%d octets)\n" "$name" "${FILES[$name]}" "$(wc -c < "$filepath")"
done

echo
echo "PATCH $API_URL ..."

response=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$payload")

http_code=$(printf "%s" "$response" | tail -1)
body=$(printf "%s" "$response" | sed '$d')

if [[ "$http_code" == "200" ]] || [[ "$http_code" == "204" ]]; then
  echo "OK ($http_code)"
  echo
  echo "Templates actifs sur Supabase. Vérifie dans :"
  echo "  https://supabase.com/dashboard/project/$PROJECT_REF/auth/templates"
else
  echo "FAIL ($http_code)"
  echo "$body"
  exit 1
fi
