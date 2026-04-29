import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GC_WEBHOOK_SECRET = Deno.env.get("GOCARDLESS_WEBHOOK_SECRET")!;

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(GC_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = new Uint8Array(signature.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await req.text();
  const signature = req.headers.get("Webhook-Signature") ?? "";

  if (!await verifySignature(body, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(body);
  const events = payload.events ?? [];

  for (const event of events) {
    await supabase.from("webhook_events").insert({
      event_id:      event.id,
      event_type:    `${event.resource_type}/${event.action}`,
      resource_type: event.resource_type,
      resource_id:   event.links?.[event.resource_type],
      payload:       event,
      processed:     false
    });

    try {
      await processEvent(event);
      await supabase.from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("event_id", event.id);
    } catch (err) {
      await supabase.from("webhook_events")
        .update({ error: String(err) })
        .eq("event_id", event.id);
    }
  }

  return new Response("OK", { status: 200 });
});

async function processEvent(event: any) {
  const { resource_type, action, links } = event;

  if (resource_type === "payments") {
    const gcPaymentId = links.payment;

    if (action === "confirmed" || action === "paid_out") {
      const { data: payment } = await supabase
        .from("payments")
        .update({
          status:  action === "paid_out" ? "paid_out" : "confirmed",
          paid_at: new Date().toISOString()
        })
        .eq("gc_payment_id", gcPaymentId)
        .select("*, subscriptions(user_id)")
        .single();

      if (payment) {
        await supabase.from("subscriptions")
          .update({
            status:               "active",
            current_period_start: new Date().toISOString(),
            current_period_end:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          })
          .eq("id", payment.subscription_id)
          .eq("status", "pending");

        await supabase.functions.invoke("send-email", {
          body: {
            userId:     payment.subscriptions.user_id,
            templateId: "facture",
            metadata:   { amount_ttc: payment.amount_ttc }
          }
        });
      }
    }

    if (action === "failed") {
      const { data: payment } = await supabase
        .from("payments")
        .update({
          status:         "failed",
          failed_at:      new Date().toISOString(),
          failure_reason: event.details?.description ?? "Prélèvement refusé"
        })
        .eq("gc_payment_id", gcPaymentId)
        .select("*, subscriptions(user_id)")
        .single();

      if (payment) {
        await supabase.from("subscriptions")
          .update({ status: "past_due" })
          .eq("id", payment.subscription_id);

        await supabase.functions.invoke("send-email", {
          body: {
            userId:     payment.subscriptions.user_id,
            templateId: "echec_prelevement",
            metadata:   { failure_reason: event.details?.description }
          }
        });
      }
    }
  }

  if (resource_type === "mandates") {
    const gcMandateId = links.mandate;

    if (action === "active") {
      await supabase.from("subscriptions")
        .update({ status: "active" })
        .eq("gc_mandate_id", gcMandateId)
        .eq("status", "pending");
    }

    if (action === "cancelled" || action === "failed" || action === "expired") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("gc_mandate_id", gcMandateId)
        .select("user_id")
        .single();

      if (sub) {
        await supabase.functions.invoke("send-email", {
          body: { userId: sub.user_id, templateId: "mandat_annule", metadata: {} }
        });
      }
    }
  }

  if (resource_type === "subscriptions" && action === "cancelled") {
    await supabase.from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("gc_subscription_id", links.subscription);
  }
}
