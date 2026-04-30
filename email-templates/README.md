# Templates email Brevo — BingeDDA

13 templates HTML correspondant aux IDs déclarés dans `supabase/functions/send-email/index.ts`.

## Mapping ID → fichier

| ID | Code | Fichier | Variables custom (au-delà de PRENOM/NOM/RAISON_SOCIALE) |
|---:|---|---|---|
| 1  | `onboarding_j0`     | `onboarding_j0.html`     | `APP_URL` |
| 2  | `onboarding_j3`     | `onboarding_j3.html`     | `APP_URL` |
| 3  | `onboarding_j7`     | `onboarding_j7.html`     | `HEURES_FAITES`, `APP_URL` |
| 4  | `onboarding_j30`    | `onboarding_j30.html`    | `HEURES_FAITES`, `HEURES_RESTANTES`, `APP_URL` |
| 5  | `facture`           | `facture.html`           | `NUMERO_FACTURE`, `MONTANT_HT`, `MONTANT_TTC`, `TVA`, `PERIODE`, `FACTURE_URL` |
| 6  | `echec_prelevement` | `echec_prelevement.html` | `MONTANT_TTC`, `DATE_NOUVELLE_TENTATIVE`, `APP_URL` |
| 7  | `mandat_annule`     | `mandat_annule.html`     | `APP_URL` |
| 8  | `rappel_dda_j60`    | `rappel_dda_j60.html`    | `HEURES_FAITES`, `HEURES_RESTANTES`, `DATE_ECHEANCE`, `APP_URL` |
| 9  | `rappel_dda_j30`    | `rappel_dda_j30.html`    | `HEURES_FAITES`, `HEURES_RESTANTES`, `DATE_ECHEANCE`, `APP_URL` |
| 10 | `rappel_dda_j7`     | `rappel_dda_j7.html`     | `HEURES_RESTANTES`, `DATE_ECHEANCE`, `APP_URL` |
| 11 | `nouveau_contenu`   | `nouveau_contenu.html`   | `MODULE_TITRE`, `MODULE_DUREE`, `MODULE_THEME`, `MODULE_URL` |
| 12 | `renouvellement`    | `renouvellement.html`    | `DATE_RENOUVELLEMENT`, `MONTANT_TTC`, `APP_URL` |
| 13 | `resiliation`       | `resiliation.html`       | `DATE_FIN_ACCES`, `APP_URL` |

## Procédure d'upload (à faire une fois par template)

1. Brevo → **Campagnes** → **Templates** → **Nouveau template**
2. Choisir l'éditeur **HTML**
3. Coller le contenu du fichier `.html`
4. Sujet : voir le commentaire `Suggested subject` en tête de fichier
5. Émetteur : `hello@dda.coach` (BingeDDA) — à migrer vers `hello@bingedda.fr` une fois SPF/DKIM/DMARC configurés sur le nouveau domaine
6. Sauvegarder, **noter l'ID Brevo** affiché
7. Vérifier que l'ID correspond à celui du tableau ci-dessus dans `send-email/index.ts`. Si Brevo en attribue un différent, mettre à jour le mapping côté code.

## Conventions de design

- Largeur fixe 600px, table-based pour compat Outlook / Apple Mail / Gmail.
- Tous les styles sont **inline** (Gmail strip les `<style>` externes dans certains contextes).
- Charte respectée : navy `#0b0f1a`, surface `#1a2030`, accent `#3d7fff`, gold `#e0c472`, danger `#e74c3c`.
- Polices : `DM Sans` en stack avec `Arial` fallback (la web font ne charge pas dans la majorité des clients).
- Lien `{{ unsubscribe }}` en pied : Brevo le résout automatiquement.
- Variables Brevo en syntaxe `{{ params.NOM_VAR }}` — déjà câblées côté `send-email/index.ts` via le `params` du payload.

## Tester un template

```bash
# Déclencher l'envoi via la fonction Supabase (auth requise)
curl -X POST "$SUPABASE_URL/functions/v1/send-email" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"<uuid>",
    "templateId":"onboarding_j0",
    "metadata":{"APP_URL":"https://dda-coach.vercel.app/app"}
  }'
```

L'envoi est tracé dans la table `email_log` (status `sent` ou `failed`).
