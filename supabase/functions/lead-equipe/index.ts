import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const ADMIN_EMAIL   = Deno.env.get("ADMIN_EMAIL") ?? "hello@bingedda.fr";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let telephone: string;
  try {
    ({ telephone } = await req.json());
    if (!telephone || typeof telephone !== "string") throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "telephone requis" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const { error: dbError } = await supabase
    .from("leads_equipe")
    .insert({ telephone });

  if (dbError) {
    console.error("DB insert error:", dbError);
    return new Response(JSON.stringify({ error: "db error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const now = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  const emailPayload = {
    sender: { email: "hello@bingedda.fr", name: "BingeDDA" },
    to: [{ email: ADMIN_EMAIL }],
    subject: `Nouveau lead equipe — ${telephone}`,
    htmlContent: `<p><strong>Nouveau lead equipe BingeDDA</strong></p><p>Telephone : ${telephone}</p><p>Date : ${now}</p>`,
  };

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(emailPayload),
  });

  if (!brevoRes.ok) {
    console.error("Brevo error:", await brevoRes.text());
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
