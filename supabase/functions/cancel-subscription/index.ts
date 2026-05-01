import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const GC_API_KEY = Deno.env.get("GOCARDLESS_ACCESS_TOKEN")!;
const GC_API_URL = Deno.env.get("GOCARDLESS_API_URL") ?? "https://api-sandbox.gocardless.com";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, gc_mandate_id, status")
    .eq("user_id", user.id)
    .in("status", ["active", "pending", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return new Response(JSON.stringify({ error: "No active subscription" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Pre-flag : empêche le webhook GC mandates/cancelled (qui suit) d'envoyer
  // mandat_annule en parallèle de notre mail "resiliation".
  await supabase.from("subscriptions").update({ cancelled_by_user: true }).eq("id", sub.id);

  if (sub.gc_mandate_id) {
    const r = await fetch(`${GC_API_URL}/mandates/${sub.gc_mandate_id}/actions/cancel`, {
      method:  "POST",
      headers: {
        "Authorization":      `Bearer ${GC_API_KEY}`,
        "Content-Type":       "application/json",
        "GoCardless-Version": "2015-07-06"
      }
    });
    // 422 = mandat déjà annulé côté GC : on tolère.
    if (!r.ok && r.status !== 422) {
      const errText = await r.text();
      console.error("GC cancel mandate failed:", r.status, errText);
      // Rollback du flag
      await supabase.from("subscriptions").update({ cancelled_by_user: false }).eq("id", sub.id);
      return new Response(JSON.stringify({ error: "Cancellation failed at GoCardless" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  await supabase.from("subscriptions").update({
    status:       "cancelled",
    cancelled_at: new Date().toISOString()
  }).eq("id", sub.id);

  // Mail "resiliation" via send-email (auth interne).
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method:  "POST",
      headers: {
        "x-internal-secret": SERVICE_ROLE,
        "Content-Type":      "application/json"
      },
      body: JSON.stringify({
        userId:     user.id,
        templateId: "resiliation",
        metadata:   {}
      })
    });
    if (!r.ok) console.error("send-email resiliation failed:", r.status, await r.text());
  } catch (e) {
    console.error("send-email resiliation invoke error:", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
