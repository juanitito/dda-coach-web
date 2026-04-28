export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://vrufldjydjrgcqwhmpnt.supabase.co';
// Clé anon publique — déjà inline dans tous les HTML, sert uniquement de
// "apikey" pour l'endpoint /auth/v1/user. La sécurité repose sur la
// validation du JWT, pas sur cette clé.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZydWZsZGp5ZGpyZ2Nxd2htcG50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTA3ODksImV4cCI6MjA5MjUyNjc4OX0.jW1CQ5yzJr4Ccac9-OI2RgVLXqFn-X0MjAxCkc9Xbfc';
const VEILLE_MAX   = 1800;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // Vérifier le JWT et déduire user_id de l'identité authentifiée,
    // pas du body (qui peut être falsifié).
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!jwt) return json({ error: 'Unauthorized' }, 401);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);
    const user = await userRes.json();
    const user_id = user?.id;
    if (!user_id) return json({ error: 'Unauthorized' }, 401);

    const { module_code, increment } = await req.json();
    if (!module_code || !increment) {
      return json({ error: 'Missing fields' }, 400);
    }
    // Garde-fou : le front utilise VEILLE_STEP=60 (un tick par minute).
    // On tolère jusqu'à 600s/appel pour absorber le throttling de tab inactif.
    const inc = Number.parseInt(increment, 10);
    if (!Number.isFinite(inc) || inc <= 0 || inc > 600) {
      return json({ error: 'Invalid increment' }, 400);
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const modRes = await fetch(
      `${SUPABASE_URL}/rest/v1/modules?code=eq.${encodeURIComponent(module_code)}&select=id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const mods = await modRes.json();
    if (!mods?.length) return json({ error: 'Module not found' }, 404);
    const module_id = mods[0].id;

    const progRes = await fetch(
      `${SUPABASE_URL}/rest/v1/progress?user_id=eq.${user_id}&module_id=eq.${module_id}&select=seconds_spent,quiz_passed&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const existing = await progRes.json();
    const prev     = existing?.[0] || null;
    const prevSecs = prev?.seconds_spent || 0;
    const newSecs  = Math.min(prevSecs + inc, VEILLE_MAX);
    const validated = newSecs >= VEILLE_MAX;

    const upsertBody = {
      user_id,
      module_id,
      seconds_spent: newSecs,
      quiz_passed:   validated,
      ...(validated && !prev?.quiz_passed ? { completed_at: new Date().toISOString() } : {}),
    };

    await fetch(`${SUPABASE_URL}/rest/v1/progress`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(upsertBody),
    });

    return json({ ok: true, seconds_spent: newSecs, validated });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
