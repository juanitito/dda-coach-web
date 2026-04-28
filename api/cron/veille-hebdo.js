// api/cron/veille-hebdo.js
// Déclenché chaque lundi à 6h00 UTC via vercel.json
// Runtime : edge

export const config = { runtime: 'edge' };

const FETCH_TIMEOUT_MS = 6000;  // 6s max par source RSS
const MAX_ITEMS_CLAUDE = 40;    // max items envoyés à Claude par run (Sonnet)
const ITEMS_PER_SOURCE = 5;     // max items retenus par source (30 sources × 5 = 150 max)

// Légifrance PISTE sandbox
const LF_TOKEN_URL  = 'https://sandbox-oauth.piste.gouv.fr/api/oauth/token';
const LF_API_BASE   = 'https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const LF_CLIENT_ID  = process.env.LEGIFRANCE_CLIENT_ID;
const LF_CLIENT_SECRET = process.env.LEGIFRANCE_CLIENT_SECRET;

// ============================================================
// SOURCES
// ============================================================

const SOURCES = [

  // -- AMF : toutes actualités (RSS confirmé) ----------------
  {
    id: 'amf',
    label: 'AMF',
    async fetch() {
      return fetchRSS('https://www.amf-france.org/fr/flux-rss/display/21');
    },
  },

  // -- Légifrance LODA (API PISTE sandbox, OAuth2) -----------
  {
    id: 'legifrance',
    label: 'Légifrance JORF',
    async fetch() {
      return fetchLegifrance();
    },
  },

  // -- Google Alerts : 30 flux assurance ---------------------
  {
    id: 'galert-01',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/9165188408137547198');
    },
  },

  {
    id: 'galert-02',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/9150811095837532829');
    },
  },

  {
    id: 'galert-03',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/5621329156925239624');
    },
  },

  {
    id: 'galert-04',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/15421384119269762260');
    },
  },

  {
    id: 'galert-05',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/4283530991600927213');
    },
  },

  {
    id: 'galert-06',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/2620124716397577525');
    },
  },

  {
    id: 'galert-07',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/515028178138472746');
    },
  },

  {
    id: 'galert-08',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/10772468089943263050');
    },
  },

  {
    id: 'galert-09',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/12208372053856358753');
    },
  },

  {
    id: 'galert-10',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/7130175805859425644');
    },
  },

  {
    id: 'galert-11',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/15054059966457578796');
    },
  },

  {
    id: 'galert-12',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/3615451721715666237');
    },
  },

  {
    id: 'galert-13',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/10560826816637102300');
    },
  },

  {
    id: 'galert-14',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/260170253894965895');
    },
  },

  {
    id: 'galert-15',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/13140767607460021696');
    },
  },

  {
    id: 'galert-16',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/14023106918058336167');
    },
  },

  {
    id: 'galert-17',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/13335856215233101673');
    },
  },

  {
    id: 'galert-18',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/17005582107813007766');
    },
  },

  {
    id: 'galert-19',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/17743453367879111428');
    },
  },

  {
    id: 'galert-20',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/9275251244920854082');
    },
  },

  {
    id: 'galert-21',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/14212361113564714308');
    },
  },

  {
    id: 'galert-22',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/13559508812816058290');
    },
  },

  {
    id: 'galert-23',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/7432016483663118806');
    },
  },

  {
    id: 'galert-24',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/12027949116479620195');
    },
  },

  {
    id: 'galert-25',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/15001582308566950767');
    },
  },

  {
    id: 'galert-26',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/7947216403921138614');
    },
  },

  {
    id: 'galert-27',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/13743543431718821334');
    },
  },

  {
    id: 'galert-28',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/13559508812816056452');
    },
  },

  {
    id: 'galert-29',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/12027949116479619116');
    },
  },

  {
    id: 'galert-30',
    label: 'Google Alerts',
    async fetch() {
      return fetchRSS('https://www.google.com/alerts/feeds/15350856753362926494/15692666047793124040');
    },
  },

];

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(req) {

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const semaine = getISOWeek();
  const results = {
    semaine,
    sources:    {},
    inserted:   0,
    duplicates: 0,
    errors:     [],
    debug:      {},
  };

  // 1. Collecte en parallèle (avec timeout individuel)
  const fetched = await Promise.allSettled(
    SOURCES.map(s => fetchWithDebug(s))
  );

  let allItems = [];
  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];
    const result = fetched[i];
    if (result.status === 'fulfilled') {
      const { items, debug } = result.value;
      // Limiter par source pour éviter le timeout Claude
      const capped = items.slice(0, ITEMS_PER_SOURCE);
      results.sources[source.id] = items.length;
      results.debug[source.id]   = { ...debug, capped: capped.length };
      allItems = allItems.concat(capped.map(item => ({
        ...item, source: source.id, source_label: source.label, semaine,
      })));
    } else {
      results.errors.push({ source: source.id, error: result.reason?.message });
      results.debug[source.id] = { error: result.reason?.message };
    }
  }

  if (allItems.length === 0) {
    return json({ ...results, message: 'Aucun item collecté' }, 200);
  }

  // 2. Enrichissement Claude (limité à MAX_ITEMS_CLAUDE)
  const toEnrich = allItems.slice(0, MAX_ITEMS_CLAUDE);
  const enriched = await enrichWithClaude(toEnrich);
  // Les items au-delà de MAX_ITEMS_CLAUDE sont insérés sans enrichissement
  const remaining = allItems.slice(MAX_ITEMS_CLAUDE);
  const finalItems = [...enriched, ...remaining];

  // 3. Insertion Supabase (seuil pertinence >= 40)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const filteredItems = finalItems.filter(i => (i.score_pertinence ?? 50) >= 40);
  results.filtered_out = finalItems.length - filteredItems.length;

  for (const item of filteredItems) {
    const res = await fetch(`${supabaseUrl}/rest/v1/veille_items?on_conflict=url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         supabaseKey,
        Authorization:  `Bearer ${supabaseKey}`,
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        semaine:          item.semaine,
        source:           item.source,
        source_label:     item.source_label,
        titre:            item.titre,
        url:              item.url,
        resume:           item.resume    || null,
        categorie:        item.categorie || null,
        score_pertinence: item.score_pertinence ?? 50,
        statut:           'pending',
      }),
    });

    if (res.status === 201)      results.inserted++;
    else if (res.status === 200) results.duplicates++;
    else {
      const err = await res.text();
      results.errors.push({ url: item.url, status: res.status, error: err });
    }
  }

  return json(results, 200);
}

// ============================================================
// LÉGIFRANCE : OAuth2 + liste LODA (lois, décrets, arrêtés)
// ============================================================

async function fetchLegifrance() {
  if (!LF_CLIENT_ID || !LF_CLIENT_SECRET) {
    throw new Error('LEGIFRANCE_CLIENT_ID ou LEGIFRANCE_CLIENT_SECRET manquant');
  }

  // 1. Token OAuth2
  const tokenRes = await fetch(LF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     LF_CLIENT_ID,
      client_secret: LF_CLIENT_SECRET,
      scope:         'openid',
    }),
  });
  if (!tokenRes.ok) throw new Error(`LF OAuth ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('LF token vide');

  // 2. Fenêtre semaine précédente
  const now    = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 7);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  // 3. Liste LODA : lois, décrets, arrêtés récents
  // /list/loda est l'endpoint stable pour les textes réglementaires
  const listRes = await fetch(`${LF_API_BASE}/list/loda`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      sort:        'PUBLICATION_DATE_DESC',
      legalStatus: ['VIGUEUR', 'VIGUEUR_DIFF'],
      natures:     ['LOI', 'ORDONNANCE', 'DECRET', 'ARRETE'],
      pageNumber:  1,
      pageSize:    20,
      publicationDate: {
        start: monday.toISOString().split('T')[0],
        end:   sunday.toISOString().split('T')[0],
      },
    }),
  });

  if (!listRes.ok) throw new Error(`LF list ${listRes.status}`);
  const data = await listRes.json();

  return (data.results || []).map(r => ({
    titre: r.titre || r.title || 'Sans titre',
    url:   `https://www.legifrance.gouv.fr/loda/id/${r.id || r.cid}`,
    date:  r.dateParution || r.datePublication || null,
  }));
}

// ============================================================
// FETCH AVEC DEBUG
// ============================================================

async function fetchWithDebug(source) {
  const debug = {};
  try {
    const items = await source.fetch();
    debug.items = items.length;
    return { items, debug };
  } catch (e) {
    debug.error = e.message;
    return { items: [], debug };
  }
}

// ============================================================
// RSS / ATOM PARSER avec timeout
// ============================================================

async function fetchRSS(feedUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BingeDDA-Veille/1.0)',
        'Accept':     'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal:   controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${feedUrl}`);

  const xml = await res.text();

  if (!xml.includes('<') || xml.trim().toLowerCase().startsWith('<!doctype html')) {
    throw new Error(`Réponse HTML — ${feedUrl}`);
  }

  const items = [];
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titre = stripTags(
      extractCDATA(block, 'title') || extractXML(block, 'title')
    );
    const url =
      extractCDATA(block, 'link') ||
      extractXML(block, 'link')   ||
      extractAtomLink(block)      ||
      extractXML(block, 'id')     ||
      extractXML(block, 'guid');
    const date =
      extractXML(block, 'pubDate')   ||
      extractXML(block, 'published') ||
      extractXML(block, 'updated')   ||
      null;

    if (!titre || !url) continue;
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) continue;

    // Extraire la description/résumé source si disponible
    const description = stripTags(
      extractCDATA(block, 'description') ||
      extractXML(block, 'description')   ||
      extractCDATA(block, 'summary')     ||
      extractXML(block, 'summary')       ||
      ''
    ).substring(0, 400);

    items.push({ titre: titre.substring(0, 300), url: cleanUrl, date, description: description || null });
  }

  return items;
}

function extractCDATA(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractXML(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractAtomLink(str) {
  const m = str.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/>/i)
    || str.match(/<link[^>]+href=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function stripTags(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .trim();
}

// ============================================================
// ENRICHISSEMENT CLAUDE (1 seul batch)
// ============================================================

async function enrichWithClaude(items) {
  if (!items.length) return items;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: buildEnrichPrompt(items) }],
      }),
    });

    if (!res.ok) return items;

    const data   = await res.json();
    const text   = data.content?.[0]?.text || '';
    const parsed = safeParseJSON(text);

    if (Array.isArray(parsed) && parsed.length === items.length) {
      return items.map((item, j) => ({
        ...item,
        resume:           parsed[j].resume    || null,
        categorie:        parsed[j].categorie  || null,
        score_pertinence: parsed[j].score      ?? 50,
      }));
    }
  } catch { /* fallback */ }
  return items;
}

function buildEnrichPrompt(items) {
  return `Tu es un expert en droit et réglementation du secteur de l'assurance en France.

Pour chaque article ci-dessous, fournis :
- resume : 1-2 phrases en français résumant l'essentiel
- categorie : exactement l'une de ces valeurs : "réglementation", "jurisprudence", "marché", "fiscalité", "distribution", "autre"
- score : pertinence (0-100) pour les professionnels du secteur assurance : assureurs, mutuelles, institutions de prévoyance, courtiers, agents généraux, réseaux mutualistes, CGPI, comparateurs, gestionnaires de sinistres

Règles de scoring :
- 70-100 : concerne directement l'assurance (produits, distribution, réglementation sectorielle, Solvabilité II, DDA/IDD, LDMR, protection du consommateur en assurance, jurisprudence assurance, fiscalité des contrats d'assurance, assurance vie, prévoyance, santé, IARD, RC, cyber)
- 40-69 : concerne indirectement l'assurance (finance, banque, épargne, retraite, protection sociale, droit des contrats, numérique financier)
- 0-39 : hors secteur (énergie, industrie, agriculture, marchés publics, fiscalité générale des entreprises, immobilier non lié à l'assurance)

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown ni commentaire.
Format exact : [{"resume":"...","categorie":"...","score":80}, ...]

Articles (${items.length}) :
${items.map((it, idx) => {
    const desc = it.description ? `\n   → ${it.description}` : '';
    return `${idx + 1}. [${it.source_label}] ${it.titre}${desc}`;
  }).join('\n')}`;
}

function safeParseJSON(str) {
  try { return JSON.parse(str.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

// ============================================================
// UTILS
// ============================================================

function getISOWeek() {
  const now  = new Date();
  const year = now.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const start = new Date(jan4);
  start.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const week  = Math.floor((now - start) / (7 * 24 * 3600 * 1000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
