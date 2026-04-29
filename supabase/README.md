# Supabase

## Edge Functions

Le code des 5 Edge Functions hébergées sur Supabase est versionné ici pour
permettre revue de code, audits sécurité, et rollback.

| Function               | Rôle                                                    |
|------------------------|---------------------------------------------------------|
| `create-subscription`  | Crée un Customer + Billing Request GoCardless           |
| `gocardless-webhook`   | Traite les webhooks GoCardless (paiements, statuts)     |
| `cron-reminders`       | Envoie les rappels DDA (60/30/7 jours avant échéance)   |
| `send-email`           | Wrapper Brevo pour l'envoi d'emails transactionnels     |
| `generate-attestation` | Génère le PDF d'attestation DDA annuelle                |

## Workflow

```bash
# Récupérer les versions actuelles depuis la prod
supabase link --project-ref vrufldjydjrgcqwhmpnt
supabase functions download <name>

# Déployer une version locale modifiée
supabase functions deploy <name>

# Lister les versions / status
supabase functions list
```

## Secrets

Les fonctions consomment ces variables d'environnement (configurées via
le dashboard Supabase → Project Settings → Edge Functions → Secrets) :

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injectées)
- `BREVO_API_KEY` (send-email, cron-reminders)
- `GOCARDLESS_ACCESS_TOKEN`, `GOCARDLESS_WEBHOOK_SECRET` (create-subscription, gocardless-webhook)

Aucun secret n'est commité dans le code source — toutes les fonctions
utilisent `Deno.env.get(...)`.
