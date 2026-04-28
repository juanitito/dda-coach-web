export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://vrufldjydjrgcqwhmpnt.supabase.co';
const VEILLE_MAX   = 1800;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { module_code, user_id, increment } = await req.json();
    if (!module_code || !user_id || !increment) {
      return json({ error: 'Missing fields' }, 400);
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. Récupérer le module_id depuis le code
    const modRes = await fetch(
      `${SUPABASE_URL}/rest/v1/modules?code=eq.${encodeURIComponent(module_code)}&select=id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const mods = await modRes.json();
    if (!mods?.length) return json({ error: 'Module not found' }, 404);
    const module_id = mods[0].id;

    // 2. Récupérer la progression existante
    const progRes = await fetch(
      `${SUPABASE_URL}/rest/v1/progress?user_id=eq.${user_id}&module_id=eq.${module_id}&select=seconds_spent,quiz_passed&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const existing = await progRes.json();
    const prev     = existing?.[0] || null;
    const prevSecs = prev?.seconds_spent || 0;
    const newSecs  = Math.min(prevSecs + increment, VEILLE_MAX);
    const validated = newSecs >= VEILLE_MAX;

    // 3. UPSERT progress
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
