import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Appel direct via fetch + service role : supabase.functions.invoke() ne pose
// pas l'Authorization header attendu par send-email (verify_jwt: true).
async function sendEmail(userId: string, templateId: string, metadata: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "apikey":        SERVICE_ROLE,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify({ userId, templateId, metadata })
  });
  if (!r.ok) console.error(`send-email ${templateId} failed:`, r.status, await r.text());
  return r.ok;
}

serve(async () => {
  const { error } = await supabase.rpc("flag_dda_reminders");
  if (error) {
    console.error("cron-reminders error:", error);
    return new Response(JSON.stringify({ error }), { status: 500 });
  }

  const sequences = [
    { days: 3,  template: "onboarding_j3"  },
    { days: 7,  template: "onboarding_j7"  },
    { days: 30, template: "onboarding_j30" }
  ];

  for (const seq of sequences) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - seq.days);
    const dateStr = targetDate.toISOString().split("T")[0];

    const { data: users } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active")
      .gte("started_at", `${dateStr}T00:00:00Z`)
      .lt( "started_at", `${dateStr}T23:59:59Z`);

    for (const { user_id } of (users ?? [])) {
      const { data: already } = await supabase
        .from("email_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("template_id", seq.template)
        .single();

      if (!already) {
        await sendEmail(user_id, seq.template);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
});
