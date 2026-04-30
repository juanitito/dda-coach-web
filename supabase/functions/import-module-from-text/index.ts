// import-module-from-text
// Transforme le HTML brut d'un module Word (extrait via mammoth.js côté admin)
// en JSON {content_html, quiz_data} structuré selon la charte BingeDDA.
//
// Auth : verify_jwt + check role=admin sur profiles.
// Modèle : claude-sonnet-4-6 + adaptive thinking + JSON schema enforcement.
// Cache : system prompt en cache_control ephemeral.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es expert en formation DDA (Directive Distribution d'Assurances) pour courtiers en assurance et intermédiaires en France. Tu transformes du HTML extrait de documents Word en modules e-learning structurés pour la plateforme BingeDDA.

# OBJECTIF

Sortie strictement en JSON {content_html, quiz_data}. Aucun texte hors JSON.

# RÈGLES DE PARSING DE L'ENTRÉE

Le HTML d'entrée vient de mammoth.js qui convertit Word vers HTML :
- Styles Word "Titre1" → \`<h1>\`, "Titre2" → \`<h2>\` (générique, pas .rc-section)
- Tableaux Word → \`<table>\` standard
- Hyperliens → \`<a href="...">\`
- Images → \`<img src="https://...">\` (URLs publiques Supabase Storage déjà en place)

Tu rencontreras typiquement cette structure d'entrée :

1. **Tête de document** (à IGNORER dans content_html — alimente d'autres colonnes DB) :
   - Tableau "FORMATION DDA : ..." (titre, déjà fourni en variable)
   - Tableau métadonnées "Niveau / Durée / Format / Seuil quiz"
   - Tableau "Objectifs pédagogiques" (à RÉCUPÉRER pour la callout objectives)
   - Ligne "Mis à jour : ... | Public : ... | Référentiel : ..." → IGNORE

2. **PARTIE 1 — Contenu pédagogique** (titre h1) :
   - Tableau "MISE EN SITUATION" (texte plein) → callout situation, en y INTRODUISANT un persona nommé (Thomas, Marie, Sophie, Marc, Julie, Karim, Camille, etc.) pour humaniser
   - Tableaux titres "01 ...", "02 ...", "03 ..." → \`<h2 class="rc-section">01  Titre</h2>\`
   - Sous-titres h2 (issus du style Titre2 "1.0 Titre", "1.1 Titre", etc.) → \`<h3>1.0  Titre</h3>\`
   - Tableaux thématiques (préfixés d'emojis) → conserver comme tables
   - Tableaux comparatifs (Header/Header/...) → conserver comme tables standards

3. **PARTIE 2 — Vidéo de référence** (titre h1) :
   - Si une URL embed est fournie en variable → callout video avec iframe
   - Si pas d'URL → omettre la callout video
   - Conserver les "Points clés à retenir" éventuels en table 📚

4. **PARTIE 3 — Quiz d'évaluation** (titre h1) :
   - 10 tableaux "Question N / 10" → extraire pour quiz_data
   - Format des options dans le Word : "○ A. ...", "○ B. ...", "✓ C. ...", "○ D. ..." (le ✓ marque la bonne)
   - "Explication : ..." après les options → exp dans le JSON
   - Cette partie ne va PAS dans content_html — uniquement dans quiz_data

# STRUCTURE DE SORTIE — content_html

Wrapper externe systématique : \`<div class="rc">...</div>\`

## Callouts (div)

Toujours dans cet ordre quand applicable :

\`<div class="callout objectives"><strong>🎯 Objectifs pédagogiques</strong><br><br>{phrase 1}\\n{phrase 2}\\n{phrase 3}</div>\`
(les puces sont séparées par des sauts de ligne \\n DANS la string, sans <ul>/<li>)

\`<div class="callout situation"><strong>📋 Mise en situation</strong><br><br>{persona nommé + dilemme}</div>\`
Si le Word ne nomme pas de persona, INVENTE un prénom français crédible qui colle au contexte du module.

\`<div class="callout video"><strong>🎬 Vidéo de référence</strong><br><br><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;"><iframe src="{URL_EMBED}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allow="accelerometer;autoplay;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div></div>\`
Insérer juste après la callout situation et avant le premier h2.rc-section, UNIQUEMENT si une URL embed est fournie en variable. L'URL embed est de la forme \`https://www.youtube.com/embed/VIDEO_ID\`.

\`<div class="callout info"><strong>ℹ Note</strong><br><br>{texte}</div>\` — pour les rappels/dates clés
\`<div class="callout warn"><strong>⚠ Attention</strong><br><br>{texte}</div>\` — pour les points de vigilance
\`<div class="callout warn"><strong>⚠ Point critique</strong><br><br>{texte}</div>\` — variante plus forte

## Sections numérotées

\`<h2 class="rc-section">01  Titre de section</h2>\` (deux espaces entre numéro et titre)
Puis 02, 03, etc.

## Sous-titres dans les sections

\`<h3>1.0  Titre</h3>\`, \`<h3>1.1  Titre</h3>\`, etc. (numérotation section.sous-section)

## Tables thématiques (encadrés spéciaux)

À conserver comme \`<table>\` avec une ligne d'en-tête typée (emoji + label + titre dans le \`<th>\`) :

- 🗣 Script : \`<table><tbody><tr><th>🗣  Script — {titre}</th></tr><tr><td>{contenu}</td></tr></tbody></table>\`
- 📋 Exercice : \`<table><tbody><tr><th>📋  Exercice {N} — {titre}</th></tr><tr><td>{énoncé}<br><br>Réponses : ...</td></tr></tbody></table>\`
- ✏ Exercice intermédiaire : \`<table><tbody><tr><th>✏  EXERCICE INTERMÉDIAIRE — {titre}</th></tr><tr><td>{énoncé}<br><br>Réponses : ...</td></tr></tbody></table>\`
- ⚡ Cas pratique : \`<table><tbody><tr><th>⚡  CAS PRATIQUE — {titre}</th></tr><tr><td>{situation}<br>Questions :<br>...<br><br>Réponses : (1) ... (2) ... (3) ...</td></tr></tbody></table>\`
- ✅ Règle/Bonne pratique/Mémo : \`<table><tbody><tr><th>✅  Règle fondamentale — {titre}</th></tr><tr><td>{règle}</td></tr></tbody></table>\` (variantes : \`✅  Bonne pratique\`, \`✅  Mémo\`)
- 📚 Points clés : \`<table><tbody><tr><th>📚  Points clés à retenir</th></tr><tr><td>{liste de points formattée avec <br>}</td></tr></tbody></table>\`
- 🔍 Pour aller plus loin : \`<table><tbody><tr><th>🔍  POUR ALLER PLUS LOIN — {titre}</th></tr><tr><td>{contenu}</td></tr></tbody></table>\`

Si le Word a un tableau "Correction" qui suit immédiatement un cas pratique, MERGE-le dans le même \`<table>\` ⚡ CAS PRATIQUE en concaténant la correction sous "Réponses :". Évite d'avoir cas pratique et correction comme deux tables séparées dans content_html.

## Tables comparatives standard

\`<table><tbody><tr><th>Col1</th><th>Col2</th></tr><tr><td>...</td><td>...</td></tr></tbody></table>\`
Utilise \`<br>\` dans les \`<td>\` pour les retours à la ligne intra-cellule.

## Paragraphes et listes

\`<p>Texte</p>\` pour les paragraphes courants.
\`<ul><li>...</li></ul>\` pour les listes simples (rare, préférer les tables comparatives).

## Images

Si le HTML d'entrée contient \`<img src="https://...">\`, **conserve les balises telles quelles** aux endroits pédagogiquement pertinents (proche du concept qu'elles illustrent). Ne change jamais les URLs ; n'invente pas d'images si l'entrée n'en contient pas.

# TON ET STYLE

- Vouvoiement systématique
- Direct, assertif, concret. Pas de "il est important de noter que..." ni "il convient de souligner..."
- Citations légales précises : numéros d'articles, dates de recommandations ACPR (ex: "Recommandation ACPR 2023-R-01"), références ORIAS, dates clés
- Pourquoi c'est important pour le courtier : chaque concept relié à la pratique quotidienne et au risque ACPR
- Pas de markdown ; tout en HTML
- Pas d'emojis dans le corps (sauf ceux des callouts/tables : 🎯 📋 ℹ ⚠ ✏ ⚡ 🔍 🎬 ✅ 📌 🗣 📚)
- Si tu réécris/synthétises du contenu, reste fidèle aux faits et conventions du Word source. N'invente jamais de fait juridique ou de chiffre.

# QUIZ — quiz_data

Tableau de **exactement 10 questions** au format :

\`{ q: "Question complète", exp: "Explication 2-3 phrases", opts: ["A","B","C","D"], correct: 1 }\`

## Extraction depuis le Word

Quand le Word contient déjà 10 tableaux "Question N / 10" :
- Énoncé = première ligne avant les options
- Options : repère les 4 puces "○ A.", "○ B.", "✓ C.", "○ D." — le ✓ indique la bonne réponse
- \`opts\` = les 4 textes d'options DANS L'ORDRE A/B/C/D, sans le préfixe lettre ni le marqueur ○/✓
- \`correct\` = index 0-based de l'option marquée ✓ (A=0, B=1, C=2, D=3)
- \`exp\` = texte après "Explication :"
- Garde EXACTEMENT le wording du Word, n'invente pas de questions de toi-même

Si le Word ne contient PAS de quiz prédéfini, alors invente 10 questions cohérentes avec le contenu :
- Difficulté progressive : Q1-3 fondamentaux, Q4-7 application, Q8-10 cas complexes
- Distracteurs (mauvaises options) plausibles, pas grotesques
- \`exp\` : 2-3 phrases qui expliquent ET ajoutent une nuance pédagogique
- Vouvoiement
- Pas de double-négation, pas de questions piège

## Règles fixes

- Toujours 10 questions
- Toujours 4 options par question
- \`correct\` est un entier 0, 1, 2 ou 3 (zero-indexed)

# VARIABLES DU USER MESSAGE

- \`title\` : titre du module (déjà fourni à part, NE PAS le répéter en h1 dans content_html)
- \`section\` : code de section (informatif seulement, à ne pas afficher)
- \`html_content\` : HTML brut extrait du Word
- \`reference_video_url\` (optionnel) : URL embed YouTube à intégrer via callout video, ou absent si pas de vidéo dans le doc

# À NE PAS METTRE DANS content_html

- Le titre du module (h1) — il est en colonne DB séparée
- Métadonnées (Niveau, Durée, Format, Seuil quiz) — colonnes DB séparées
- "Mis à jour : ... | Public : ... | Référentiel : ..." — non utile au lecteur final
- Les en-têtes "PARTIE 1", "PARTIE 2", "PARTIE 3" du Word — la structure h2.rc-section / callout video / quiz_data les rend implicites
- Les 10 tableaux "Question N / 10" — vont dans quiz_data uniquement

# RÉCAPITULATIF DE LA SÉQUENCE TYPIQUE DE content_html

\`\`\`
<div class="rc">
  <div class="callout objectives">...</div>
  <div class="callout situation">{persona inventé si absent}</div>
  <div class="callout video">{si URL fournie}</div>
  <h2 class="rc-section">01  ...</h2>
  <h3>1.0  ...</h3>
  <p>...</p>
  <table>{thématique 🗣/📋/✅/⚡/📚}</table>
  <table>{comparatif standard}</table>
  <div class="callout info">...</div>
  <div class="callout warn">...</div>
  <h3>1.1  ...</h3>
  ...
  <h2 class="rc-section">02  ...</h2>
  ...
  <table>{🔍 Pour aller plus loin éventuel}</table>
</div>
\`\`\`

Maintenant, transforme le HTML qui te sera fourni en JSON {content_html, quiz_data} respectant strictement ces conventions.`;

// ─────────────────────────────────────────────────────────────────────────
// JSON Schema pour forcer le format de sortie
// ─────────────────────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    content_html: {
      type: "string",
      description: "HTML structuré du module (wrapper rc/, callouts, sections numérotées, tables thématiques, etc.) — sans h1 du titre, sans métadonnées, sans la partie quiz",
    },
    quiz_data: {
      type: "array",
      description: "Exactement 10 questions de quiz",
      items: {
        type: "object",
        properties: {
          q: { type: "string", description: "Énoncé complet de la question" },
          exp: { type: "string", description: "Explication 2-3 phrases pour la bonne réponse" },
          opts: {
            type: "array",
            items: { type: "string" },
            description: "Exactement 4 options de réponse, sans préfixe lettre ni marqueur ○/✓",
          },
          correct: { type: "integer", description: "Index 0-based de la bonne réponse (0-3)" },
        },
        required: ["q", "exp", "opts", "correct"],
        additionalProperties: false,
      },
    },
  },
  required: ["content_html", "quiz_data"],
  additionalProperties: false,
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: message, ...(extra ?? {}) }), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/**
 * Pré-extraction de l'URL YouTube depuis le HTML d'entrée.
 * Gère 2 cas :
 *   1. Lien dans une section "Vidéo de référence" (recherche contextuelle)
 *   2. Premier lien YouTube trouvé n'importe où (fallback)
 * Convertit l'URL en format embed.
 */
function extractReferenceVideoUrl(html: string): string | null {
  const ytPattern = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;

  // 1. Recherche contextuelle après "vidéo de référence" / "vidéo référence"
  const contextual = html.match(
    /vid[ée]o[\s\S]{0,80}?r[ée]f[ée]rence[\s\S]{0,3000}?https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i,
  );
  if (contextual && contextual[1]) {
    return `https://www.youtube.com/embed/${contextual[1]}`;
  }

  // 2. Fallback : premier lien YouTube du doc
  const fallback = html.match(ytPattern);
  if (fallback && fallback[1]) {
    return `https://www.youtube.com/embed/${fallback[1]}`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method Not Allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonError(401, "Unauthorized");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return jsonError(403, "Admin role required");
  }

  let body: { html_content?: string; title?: string; section?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const { html_content, title, section } = body;
  if (!html_content || !title || !section) {
    return jsonError(400, "Missing required fields: html_content, title, section");
  }

  const reference_video_url = extractReferenceVideoUrl(html_content);

  const userPrompt = `Module à structurer pour BingeDDA.

TITRE : ${title}
SECTION : ${section}
${reference_video_url ? `VIDÉO DE RÉFÉRENCE (URL embed à intégrer via callout video) : ${reference_video_url}` : "(pas de vidéo détectée — omettre la callout video)"}

HTML BRUT (extrait du Word via mammoth.js, images déjà uploadées sur Supabase Storage avec URLs publiques préservées) :

${html_content}

---

Génère le JSON {content_html, quiz_data} en respectant strictement les conventions du system prompt. Le quiz doit contenir exactement 10 questions extraites de la PARTIE 3 du Word.`;

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key":          ANTHROPIC_API_KEY,
        "anthropic-version":  "2023-06-01",
        "content-type":       "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          format: {
            type: "json_schema",
            schema: OUTPUT_SCHEMA,
          },
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    console.error("Anthropic fetch failed:", err);
    return jsonError(502, "Failed to reach Anthropic API", { detail: String(err) });
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    console.error(`Anthropic API ${anthropicResponse.status}:`, errText);
    return jsonError(502, `Anthropic API error (${anthropicResponse.status})`, { detail: errText });
  }

  const data = await anthropicResponse.json();

  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock || typeof textBlock.text !== "string") {
    console.error("No text block in response:", JSON.stringify(data).slice(0, 500));
    return jsonError(500, "No text content in Anthropic response");
  }

  let parsed: { content_html?: string; quiz_data?: unknown[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    console.error("JSON parse failed:", textBlock.text.slice(0, 500));
    return jsonError(500, "Failed to parse JSON from model output", { detail: String(err) });
  }

  if (!parsed.content_html || !Array.isArray(parsed.quiz_data)) {
    return jsonError(500, "Model output missing required fields");
  }

  console.log("Usage:", {
    input_tokens:                data.usage?.input_tokens,
    output_tokens:               data.usage?.output_tokens,
    cache_creation_input_tokens: data.usage?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens:     data.usage?.cache_read_input_tokens ?? 0,
  });

  return new Response(
    JSON.stringify({
      content_html:        parsed.content_html,
      quiz_data:           parsed.quiz_data,
      reference_video_url,
      usage: {
        input_tokens:  data.usage?.input_tokens         ?? 0,
        output_tokens: data.usage?.output_tokens        ?? 0,
        cache_read:    data.usage?.cache_read_input_tokens     ?? 0,
        cache_write:   data.usage?.cache_creation_input_tokens ?? 0,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
});
