import { test, expect } from '@playwright/test';

// Tests de régression sécurité sur les endpoints publics.
// Ne nécessitent pas d'auth — au contraire, on vérifie qu'ils refusent
// correctement l'accès non-authentifié.

test.describe('/api/veille-time — auth requise', () => {
  test('POST sans Authorization header retourne 401', async ({ request }) => {
    const res = await request.post('/api/veille-time', {
      data: { module_code: 'VEILLE-2026-W18', increment: 60 },
    });
    expect(res.status()).toBe(401);
  });

  test('POST avec un module_code injecté SQL retourne 4xx (pas 500)', async ({ request }) => {
    const res = await request.post('/api/veille-time', {
      headers: { Authorization: 'Bearer faux-token' },
      data: { module_code: "VEILLE'; DROP TABLE--", increment: 60 },
    });
    // Doit échouer côté auth (401) avant même d'atteindre la DB.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('/api/compare — auth requise + whitelist model', () => {
  test('POST sans Authorization retourne 401', async ({ request }) => {
    const res = await request.post('/api/compare', {
      data: { model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.status()).toBe(401);
  });

  test('OPTIONS preflight depuis origine non autorisée n\'expose pas le wildcard', async ({ request }) => {
    const res = await request.fetch('/api/compare', {
      method: 'OPTIONS',
      headers: { Origin: 'https://attacker.example' },
    });
    // 204 mais sans Allow-Origin pour cette origine.
    const allow = res.headers()['access-control-allow-origin'] || '';
    expect(allow).not.toBe('*');
    expect(allow).not.toContain('attacker.example');
  });
});
