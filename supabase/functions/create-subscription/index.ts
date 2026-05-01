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
const GC_EXIT_URL     = Deno.env.get("GOCARDLESS_EXIT_URL") ?? "https://www.bingedda.fr";

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
  if (!res.ok) throw new Error(`GoCardless ${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Normalise un téléphone FR : "06 12 34 56 78" → "+33612345678"
function normalizePhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("33")) return "+" + digits;
  if (digits.startsWith("0"))  return "+33" + digits.slice(1);
  return raw.startsWith("+") ? raw : "+" + digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const {
    prenom, nom, email,
    raison_sociale,
    adresse, address_line2, cp, ville,
    tel, siret, orias,
    iban, titulaire
  } = await req.json();

  const phone   = normalizePhone(tel);
  const ibanRaw = (iban || "").replace(/\s/g, "").toUpperCase();
  const holder  = (titulaire || "").trim();

  if (!ibanRaw || !holder) {
    return new Response(JSON.stringify({ error: "IBAN et titulaire du compte requis" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Métadonnées GC : 3 clés max, 50 chars max par valeur
  const gcMetadata: Record<string, string> = { supabase_user_id: user.id };
  if (siret) gcMetadata.siret = String(siret).slice(0, 50);
  if (orias) gcMetadata.orias = String(orias).slice(0, 50);

  const customerPayload = {
    email,
    given_name:    prenom,
    family_name:   nom,
    company_name:  raison_sociale ?? undefined,
    address_line1: adresse        || undefined,
    address_line2: address_line2  || undefined,
    postal_code:   cp             || undefined,
    city:          ville          || undefined,
    country_code:  "FR",
    language:      "fr",
    phone_number:  phone,
    metadata:      gcMetadata
  };

  console.log("create-subscription", {
    user_id: user.id,
    company_name: raison_sociale,
    siret,
    has_phone: !!phone
  });

  try {
    // Idempotence : si l'utilisateur a déjà un subscription pending avec un GC customer,
    // on UPDATE le customer existant au lieu d'en créer un nouveau (résout le bug
    // "raison sociale qui reste figée à la valeur de la 1re tentative").
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id, gc_customer_id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId: string;
    if (existing?.gc_customer_id) {
      const { customers: customer } = await gcRequest(
        "PUT",
        `/customers/${existing.gc_customer_id}`,
        { customers: customerPayload }
      );
      customerId = customer.id;
      console.log("create-subscription: updated GC customer", {
        id: customerId,
        sent_company_name: raison_sociale,
        gc_returned_company_name: customer.company_name,
        gc_returned_given_name: customer.given_name,
        gc_returned_family_name: customer.family_name
      });
    } else {
      const { customers: customer } = await gcRequest("POST", "/customers", {
        customers: customerPayload
      });
      customerId = customer.id;
      console.log("create-subscription: created GC customer", {
        id: customerId,
        sent_company_name: raison_sociale,
        gc_returned_company_name: customer.company_name
      });
    }

    // Création du customer_bank_account avec l'IBAN saisi dans le funnel
    // → user n'aura pas à le re-saisir sur GC (combiné avec lock_bank_account: true)
    const { customer_bank_accounts: bankAccount } = await gcRequest("POST", "/customer_bank_accounts", {
      customer_bank_accounts: {
        iban:                ibanRaw,
        account_holder_name: holder,
        country_code:        "FR",
        links:               { customer: customerId }
      }
    });
    console.log("create-subscription: created GC bank account", bankAccount.id);

    const { billing_requests: billingRequest } = await gcRequest("POST", "/billing_requests", {
      billing_requests: {
        mandate_request: {
          currency: "EUR",
          scheme:   "sepa_core",
          metadata: { supabase_user_id: user.id }
        },
        links: {
          customer:              customerId,
          customer_bank_account: bankAccount.id
        }
      }
    });

    const { billing_request_flows: flow } = await gcRequest("POST", "/billing_request_flows", {
      billing_request_flows: {
        redirect_uri:       GC_REDIRECT_URL,
        exit_uri:           GC_EXIT_URL,
        language:           "fr",
        lock_bank_account:  true,
        prefilled_customer: {
          email,
          given_name:    prenom,
          family_name:   nom,
          address_line1: adresse        || undefined,
          address_line2: address_line2  || undefined,
          postal_code:   cp             || undefined,
          city:          ville          || undefined,
          country_code:  "FR",
          company_name:  raison_sociale || undefined,
          phone_number:  phone
        },
        links:                  { billing_request: billingRequest.id }
      }
    });

    if (existing) {
      await supabase.from("subscriptions")
        .update({ gc_customer_id: customerId })
        .eq("id", existing.id);
    } else {
      await supabase.from("subscriptions").insert({
        user_id:        user.id,
        gc_customer_id: customerId,
        status:         "pending",
        amount_ht:      24.99,
        tva_rate:       20.00
      });
    }

    await supabase.from("profiles").update({
      prenom,
      nom,
      raison_sociale: raison_sociale ?? null
    }).eq("id", user.id);

    // Onboarding J0 envoyé seulement à la 1re tentative (pas à chaque ré-essai du funnel).
    // Appel direct via fetch + service role : supabase.functions.invoke() ne pose pas
    // l'Authorization header attendu par les Edge Functions avec verify_jwt: true.
    if (!existing) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method:  "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_ROLE}`,
            "apikey":        SERVICE_ROLE,
            "Content-Type":  "application/json"
          },
          body: JSON.stringify({
            userId:     user.id,
            templateId: "onboarding_j0",
            metadata:   {}
          })
        });
        if (!r.ok) console.error("send-email onboarding_j0 failed:", r.status, await r.text());
      } catch (e) {
        console.error("send-email onboarding_j0 invoke error:", e);
      }
    }

    return new Response(JSON.stringify({
      checkout_url:       flow.authorisation_url,
      billing_request_id: billingRequest.id,
      gc_customer_id:     customerId
    }), {
      status:  200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("create-subscription error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
