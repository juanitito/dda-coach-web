# Smoke tests Playwright

Tests E2E dans un vrai navigateur (Chromium). Lancés à chaque PR via GitHub
Actions, peuvent aussi tourner localement.

## Installation

```bash
npm install
npm run test:install   # télécharge Chromium (~150 MB) une seule fois
```

## Lancer les tests

```bash
# Contre la prod (par défaut)
npm test

# Contre une preview Vercel
BASE_URL=https://dda-coach-git-<branch>-<team>.vercel.app npm test

# Mode UI interactif (utile pour debug)
npm run test:ui

# Un seul fichier
npx playwright test tests/landing.spec.ts
```

## Suites incluses

| Fichier               | Couvre                                                     |
|-----------------------|------------------------------------------------------------|
| `landing.spec.ts`     | Page d'accueil, modals login/inscription, validations form |
| `api-security.spec.ts`| Régression 401 sur /api/veille-time et /api/compare        |

## Ajouter un test

Crée un nouveau fichier `tests/<nom>.spec.ts`. Pas de boilerplate, juste
`import { test, expect } from '@playwright/test'` et c'est parti. Les
sélecteurs préfèrent `getByRole`, `getByLabel`, `getByText` aux ID
quand c'est sémantiquement clair.

## CI

`.github/workflows/playwright.yml` lance la suite à chaque push sur main
et chaque PR. Le rapport HTML est uploadé en artifact en cas d'échec.
