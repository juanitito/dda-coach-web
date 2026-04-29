import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BREVO_API_KEY  = Deno.env.get("BREVO_API_KEY")!;
const BREVO_API_URL  = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL   = "hello@dda.coach";
const SENDER_NAME    = "DDA.coach";

const TEMPLATES: Record<string, number> = {
  onboarding_j0:        1,
  onboarding_j3:        2,
  onboarding_j7:        3,
  onboarding_j30:       4,
  facture:              5,
  echec_prelevement:    6,
  mandat_annule:        7,
  rappel_dda_j60:       8,
  rappel_dda_j30:       9,
  rappel_dda_j7:       10,
  nouveau_contenu:     11,
  renouvellement:      12,
  resiliation:         13,
};

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { userId, templateId, metadata } = await req.json();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, prenom, nom, raison_sociale")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  const templateNumId = TEMPLATES[templateId];
  if (!templateNumId) {
    return new Response(JSON.stringify({ error: "Unknown template" }), { status: 400 });
  }

  const payload = {
    to: [{ email: profile.email, name: `${profile.prenom} ${profile.nom}` }],
    templateId: templateNumId,
    params: {
      PRENOM:         profile.prenom,
      NOM:            profile.nom,
      RAISON_SOCIALE: profile.raison_sociale ?? "",
      ...metadata
    },
    sender:  { email: SENDER_EMAIL, name: SENDER_NAME },
    replyTo: { email: SENDER_EMAIL }
  };

  const res = await fetch(BREVO_API_URL, {
    method:  "POST",
    headers: {
      "api-key":      BREVO_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  await supabase.from("email_log").insert({
    user_id:      userId,
    email_to:     profile.email,
    template_id:  templateId,
    status:       res.ok ? "sent" : "failed",
    brevo_msg_id: result.messageId ?? null,
    metadata:     metadata
  });

  return new Response(
    JSON.stringify({ success: res.ok, messageId: result.messageId }),
    { status: res.ok ? 200 : 500 }
  );
});
