import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);


const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GC_API_KEY      = Deno.env.get("GOCARDLESS_ACCESS_TOKEN")!;
const GC_API_URL      = "https://api-sandbox.gocardless.com";
const GC_REDIRECT_URL = Deno.env.get("GOCARDLESS_REDIRECT_URL")!;

async function gcRequest(method: string, path: string, body?: any) {
  const res = await fetch(`${GC_API_URL}${path}`, {
    method,
    headers: {
      "Authorization":       `Bearer ${GC_API_KEY}`,
      "Content-Type":        "application/json",
      "GoCardless-Version":  "2015-07-06"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`GoCardless error ${res.status}: ${await res.text()}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { prenom, nom, email, raison_sociale, adresse, cp, ville } = await req.json();

  try {
    const { customers: customer } = await gcRequest("POST", "/customers", {
      customers: {
        email,
        given_name:    prenom,
        family_name:   nom,
        company_name:  raison_sociale ?? undefined,
        address_line1: adresse      || undefined,
        postal_code:   cp           || undefined,
        city:          ville        || undefined,
        country_code:  "FR",
        language:      "fr",
        metadata:      { supabase_user_id: user.id }
      }
    });

    const { billing_requests: billingRequest } = await gcRequest("POST", "/billing_requests", {
      billing_requests: {
        mandate_request: {
          currency: "EUR",
          scheme:   "sepa_core",
          metadata: { supabase_user_id: user.id }
        },
        links: { customer: customer.id }
      }
    });

    const { billing_request_flows: flow } = await gcRequest("POST", "/billing_request_flows", {
      billing_request_flows: {
        redirect_uri:       GC_REDIRECT_URL,
        exit_uri:           "https://dda-coach.vercel.app",
        language:           "fr",
        prefilled_customer: {
          email,
          given_name:    prenom,
          family_name:   nom,
          address_line1: adresse        || undefined,
          postal_code:   cp             || undefined,
          city:          ville          || undefined,
          country_code:  "FR",
          company_name:  raison_sociale || undefined,
          language:      "fr"
        },
        links:              { billing_request: billingRequest.id }
      }
    });

    await supabase.from("subscriptions").insert({
      user_id:        user.id,
      gc_customer_id: customer.id,
      status:         "pending",
      amount_ht:      24.99,
      tva_rate:       20.00
    });

    await supabase.from("profiles").update({
      prenom,
      nom,
      raison_sociale: raison_sociale ?? null
    }).eq("id", user.id);

    await supabase.functions.invoke("send-email", {
      body: {
        userId:     user.id,
        templateId: "onboarding_j0",
        metadata:   {}
      }
    });

    return new Response(JSON.stringify({
      checkout_url:       flow.authorisation_url,
      billing_request_id: billingRequest.id
    }), {
      status:  200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("create-subscription error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
