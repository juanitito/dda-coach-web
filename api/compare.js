export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://vrufldjydjrgcqwhmpnt.supabase.co';
// Clé anon publique (déjà inline côté front), sert uniquement de "apikey"
// pour l'endpoint /auth/v1/user. La sécurité repose sur la validation du JWT.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZydWZsZGp5ZGpyZ2Nxd2htcG50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTA3ODksImV4cCI6MjA5MjUyNjc4OX0.jW1CQ5yzJr4Ccac9-OI2RgVLXqFn-X0MjAxCkc9Xbfc';

const ALLOWED_ORIGIN     = 'https://dda-coach.vercel.app';
const ALLOWED_MODEL_RE   = /^claude-haiku-/;
const MAX_TOKENS_CAP     = 4000;

function corsHeaders(origin) {
  // Autorise uniquement notre prod ; toute autre origine ne reçoit pas le
  // header (le navigateur bloquera le response côté client).
  const allow = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
  };
}

function jsonResp(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

export default async function handler(req) {
  const origin = req.headers.get('Origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    // 1. Vérification JWT (un user authentifié sur la prod uniquement).
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!jwt) return jsonResp({ error: 'Unauthorized' }, 401, origin);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userRes.ok) return jsonResp({ error: 'Unauthorized' }, 401, origin);

    // 2. Validation du body : whitelist model, cap max_tokens, garde-fou messages.
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return jsonResp({ error: 'Invalid body' }, 400, origin);
    }
    if (!ALLOWED_MODEL_RE.test(body.model || '')) {
      return jsonResp({ error: 'Model not allowed' }, 400, origin);
    }
    if (typeof body.max_tokens !== 'number' || body.max_tokens > MAX_TOKENS_CAP) {
      return jsonResp({ error: 'max_tokens too high' }, 400, origin);
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResp({ error: 'messages required' }, 400, origin);
    }

    // 3. Forward sur Anthropic (les paramètres sont dans le body validé).
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();
    return jsonResp(data, anthropicRes.status, origin);

  } catch (err) {
    return jsonResp({ error: err.message }, 500, origin);
  }
}
