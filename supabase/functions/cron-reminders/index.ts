import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// send-email exige le header partagé x-internal-secret = SERVICE_ROLE.
async function sendEmail(userId: string, templateId: string, metadata: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method:  "POST",
    headers: {
      "x-internal-secret": SERVICE_ROLE,
      "Content-Type":      "application/json"
    },
    body: JSON.stringify({ userId, templateId, metadata })
  });
  if (!r.ok) console.error(`send-email ${templateId} failed:`, r.status, await r.text());
  return r.ok;
}

// J-N depuis started_at : envoie une fois si pas déjà loggé pour ce user+template.
async function processOnboarding(now = new Date()) {
  const sequences = [
    { days: 3,  template: "onboarding_j3"  },
    { days: 7,  template: "onboarding_j7"  },
    { days: 30, template: "onboarding_j30" }
  ];

  for (const seq of sequences) {
    const target = new Date(now);
    target.setDate(target.getDate() - seq.days);
    const dateStr = target.toISOString().split("T")[0];

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active")
      .gte("started_at", `${dateStr}T00:00:00Z`)
      .lt( "started_at", `${dateStr}T23:59:59Z`);

    for (const { user_id } of (subs ?? [])) {
      const { data: already } = await supabase
        .from("email_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("template_id", seq.template)
        .maybeSingle();

      if (!already) await sendEmail(user_id, seq.template);
    }
  }
}

// Rappels DDA : 60/30/7 jours avant le 31/12 de l'année calendaire courante
// (la formation DDA = 15h annuelles à valider chaque année calendaire).
// Idempotence via flags renewal_reminded_60/30/7 (sémantiquement détournés
// pour les rappels DDA — historiquement nommés "renewal" mais c'est la même
// colonne, on évite une migration de schéma).
async function processDdaReminders(now = new Date()) {
  const year = now.getUTCFullYear();
  const endOfYear = Date.UTC(year, 11, 31);   // 31 déc 00:00 UTC
  const j60 = Date.UTC(year, 10, 2);          //  2 nov
  const j30 = Date.UTC(year, 11, 1);          //  1 déc
  const j7  = Date.UTC(year, 11, 24);         // 24 déc
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  // Reset des flags au 1er janvier (nouvelle année calendaire = nouveau cycle DDA).
  if (now.getUTCMonth() === 0 && now.getUTCDate() === 1) {
    await supabase.from("subscriptions")
      .update({ renewal_reminded_60: false, renewal_reminded_30: false, renewal_reminded_7: false })
      .eq("status", "active");
  }

  type Window = { from: number; to: number; flag: "renewal_reminded_60" | "renewal_reminded_30" | "renewal_reminded_7"; template: string };
  const windows: Window[] = [
    { from: j60, to: j30 - 86400000, flag: "renewal_reminded_60", template: "rappel_dda_j60" },
    { from: j30, to: j7  - 86400000, flag: "renewal_reminded_30", template: "rappel_dda_j30" },
    { from: j7,  to: endOfYear,      flag: "renewal_reminded_7",  template: "rappel_dda_j7"  },
  ];

  for (const w of windows) {
    if (today < w.from || today > w.to) continue;

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, user_id, started_at")
      .eq("status", "active")
      .eq(w.flag, false);

    for (const sub of (subs ?? [])) {
      // Skip si le user s'est abonné après la date cible (rappel sans objet).
      const startedAt = new Date(sub.started_at).getTime();
      if (startedAt > w.from) continue;

      const ok = await sendEmail(sub.user_id, w.template, { year });
      if (ok) {
        await supabase.from("subscriptions")
          .update({ [w.flag]: true })
          .eq("id", sub.id);
      }
    }
  }
}

// Renouvellement annuel : le jour J où current_period_end tombe (= anniversaire
// d'inscription). Idempotence via email_log (clé : user + template + period_end).
async function processRenewal(now = new Date()) {
  const todayStr = now.toISOString().split("T")[0];

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("user_id, current_period_end")
    .eq("status", "active")
    .gte("current_period_end", `${todayStr}T00:00:00Z`)
    .lt( "current_period_end", `${todayStr}T23:59:59Z`);

  for (const sub of (subs ?? [])) {
    const { data: already } = await supabase
      .from("email_log")
      .select("id")
      .eq("user_id",     sub.user_id)
      .eq("template_id", "renouvellement")
      .filter("metadata->>period_end", "eq", sub.current_period_end)
      .maybeSingle();

    if (!already) {
      await sendEmail(sub.user_id, "renouvellement", { period_end: sub.current_period_end });
    }
  }
}

serve(async (req) => {
  if (req.headers.get("x-internal-secret") !== SERVICE_ROLE) {
    return new Response("Unauthorized", { status: 401 });
  }

  let overrideDate: Date | undefined;
  try {
    const body = await req.json();
    if (body?.testDate) overrideDate = new Date(body.testDate);
  } catch { /* body vide ou absent */ }

  await processOnboarding(overrideDate);
  await processDdaReminders(overrideDate);
  await processRenewal(overrideDate);

  return new Response(JSON.stringify({ ok: true, ts: (overrideDate ?? new Date()).toISOString() }));
});
