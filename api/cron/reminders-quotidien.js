// api/cron/reminders-quotidien.js
// Quotidien à 7h UTC : déclenche cron-reminders (onboarding J+N, rappels DDA
// année calendaire, renouvellement). Auth via header x-internal-secret partagé.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Vercel Cron Auth : User-Agent "vercel-cron" + en-tête authorization Bearer
  // CRON_SECRET. On laisse Vercel gérer.
  const authHeader = req.headers.authorization || "";
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing Supabase env vars" });
  }

  const r = await fetch(`${SUPABASE_URL}/functions/v1/cron-reminders`, {
    method:  "POST",
    headers: {
      "x-internal-secret": SERVICE_ROLE,
      "Content-Type":      "application/json"
    }
  });

  const body = await r.text();
  return res.status(r.ok ? 200 : 500).json({ ok: r.ok, status: r.status, body });
}
