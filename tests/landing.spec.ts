import { test, expect } from '@playwright/test';

// Tests sur la page d'accueil et les modals login/inscription.
// Aucun login requis — pure interface publique.

test.describe('Landing — page publique', () => {
  test('charge sans erreur JS bloquante', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await expect(page).toHaveTitle(/BingeDDA/i);
    // Aucune erreur JS critique au chargement.
    expect(errors).toEqual([]);
  });

  test('le bouton "Se connecter" ouvre le modal login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /se connecter/i }).first().click();
    await expect(page.locator('#funnel-login')).toBeVisible();
  });

  test('le bouton "S\'abonner" ouvre le funnel inscription à l\'étape 1', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /s'abonner/i }).first().click();
    await expect(page.locator('#fv-1')).toHaveClass(/active/);
  });
});

test.describe('Modal login — UX form', () => {
  test('autofocus sur le champ email à l\'ouverture', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /se connecter/i }).first().click();
    // Petit délai pour laisser focusFirstInput s'exécuter (setTimeout 0).
    await expect(page.locator('#l-email')).toBeFocused();
  });

  test('Enter dans le formulaire de login déclenche la soumission', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /se connecter/i }).first().click();
    await page.locator('#l-email').fill('inexistant@example.com');
    await page.locator('#l-mdp').fill('mauvais-mot-de-passe');
    // Le submit du form doit appeler handleLogin (pas de click sur le bouton).
    await page.locator('#l-mdp').press('Enter');
    // L'auth Supabase doit échouer → erreur affichée. Pas de redirection.
    await expect(page.locator('#login-error')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Funnel inscription — validation', () => {
  test('autofocus sur prénom à l\'étape 1', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /s'abonner/i }).first().click();
    await expect(page.locator('#f-prenom')).toBeFocused();
  });

  test('mot de passe sans majuscule est refusé', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /s'abonner/i }).first().click();
    await page.locator('#f-prenom').fill('Test');
    await page.locator('#f-nom').fill('User');
    await page.locator('#f-email').fill('test-' + Date.now() + '@example.com');
    await page.locator('#f-mdp').fill('motdepasse123');
    await page.locator('#f-mdp2').fill('motdepasse123');

    // L'app utilise alert() pour signaler les erreurs de validation.
    page.on('dialog', (d) => {
      expect(d.message()).toMatch(/majuscule/i);
      d.dismiss();
    });
    await page.getByRole('button', { name: /continuer/i }).first().click();
    // On doit toujours être sur l'étape 1.
    await expect(page.locator('#fv-1')).toHaveClass(/active/);
  });

  test('mot de passe sans chiffre est refusé', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /s'abonner/i }).first().click();
    await page.locator('#f-prenom').fill('Test');
    await page.locator('#f-nom').fill('User');
    await page.locator('#f-email').fill('test-' + Date.now() + '@example.com');
    await page.locator('#f-mdp').fill('Motdepasse');
    await page.locator('#f-mdp2').fill('Motdepasse');

    page.on('dialog', (d) => {
      expect(d.message()).toMatch(/chiffre/i);
      d.dismiss();
    });
    await page.getByRole('button', { name: /continuer/i }).first().click();
    await expect(page.locator('#fv-1')).toHaveClass(/active/);
  });
});
