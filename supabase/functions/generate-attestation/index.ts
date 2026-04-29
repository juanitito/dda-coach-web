import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const C_DARK   = rgb(0.043, 0.059, 0.098);
const C_BLUE   = rgb(0.239, 0.467, 1.0);
const C_WHITE  = rgb(1, 1, 1);
const C_MUTED  = rgb(0.42, 0.478, 0.533);
const C_TEAL   = rgb(0.18, 0.827, 0.749);
const C_BORDER = rgb(0.149, 0.196, 0.267);
const C_GOLD   = rgb(0.784, 0.659, 0.294);

function norm(s: string): string {
  return s
    .replace(/[àâä]/g,'a').replace(/[ÀÂÄÄ]/g,'A')
    .replace(/[éèêë]/g,'e').replace(/[ÉÈÊË]/g,'E')
    .replace(/[îï]/g,'i').replace(/[ÎÏ]/g,'I')
    .replace(/[ôö]/g,'o').replace(/[ÔÖ]/g,'O')
    .replace(/[ùûü]/g,'u').replace(/[ÙÛÜ]/g,'U')
    .replace(/ç/g,'c').replace(/Ç/g,'C')
    .replace(/[--]/g,'-').replace(/['']/g,"'")
    .replace(/\u2026/g,'...').replace(/\u00b0/g,' ')
    .replace(/[^\x00-\xFF]/g,'?');
}

function dr(page: any,x:number,y:number,w:number,h:number,color:any){
  page.drawRectangle({x,y,width:w,height:h,color});
}
function dt(page: any,text:string,opts:any){
  page.drawText(norm(text),opts);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  try {
    const { data: profile } = await supabase
      .from("profiles").select("prenom, nom, orias, raison_sociale, metier")
      .eq("id", user.id).single();

    const { data: progress } = await supabase
      .from("progress").select("module_id, seconds_spent, quiz_passed, completed_at")
      .eq("user_id", user.id).eq("quiz_passed", true).order("completed_at");

    if (!progress || progress.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun module valide." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: modules } = await supabase
      .from("modules").select("id, code, title, duree_minutes, section")
      .in("id", progress.map(p => p.module_id));

    const modMap: Record<string, any> = {};
    (modules || []).forEach(m => { modMap[m.id] = m; });

    // Utiliser seconds_spent (même source que le timer client)
    const totalSeconds = progress.reduce((s,p) => s + (p.seconds_spent || 0), 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const isOfficial   = totalSeconds >= 54000; // 15h = 54000 secondes
    const totalH = Math.floor(totalSeconds / 3600);
    const totalM = Math.floor((totalSeconds % 3600) / 60);
    const totalStr = totalH + "h" + String(totalM).padStart(2,"0");

    const pdfDoc = await PDFDocument.create();
    const page   = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const fB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fR = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Fond
    dr(page, 0, 0, width, height, C_DARK);
    // Header
    dr(page, 0, height-80, width, 80, isOfficial ? C_GOLD : C_BLUE);
    dt(page, "BingeDDA", {x:40, y:height-48, size:22, font:fB, color: isOfficial ? C_DARK : C_WHITE});
    dt(page, "Plateforme de formation DDA", {x:40, y:height-66, size:9, font:fR, color: isOfficial ? rgb(0.3,0.2,0) : rgb(0.8,0.88,1)});
    const lbl = isOfficial ? "CERTIFICAT OFFICIEL DDA" : "ATTESTATION DE SUIVI - DOCUMENT PROVISOIRE";
    dt(page, lbl, {x: width-40-fB.widthOfTextAtSize(lbl,9), y:height-50, size:9, font:fB, color: isOfficial ? C_DARK : C_WHITE});

    // Identite
    let y = height - 115;
    dt(page, [profile?.prenom, profile?.nom].filter(Boolean).join(" ") || "-", {x:40, y, size:18, font:fB, color:C_WHITE});
    y -= 22;
    if (profile?.raison_sociale) { dt(page, profile.raison_sociale, {x:40, y, size:10, font:fR, color:C_MUTED}); y -= 15; }
    if (profile?.orias) { dt(page, "N ORIAS : " + profile.orias, {x:40, y, size:10, font:fR, color:C_TEAL}); y -= 15; }

    y -= 8; dr(page, 40, y, width-80, 1, C_BORDER); y -= 18;

    // Heures
    dt(page, "Formation validee : " + totalStr + "  /  15h00", {x:40, y, size:13, font:fB, color: isOfficial ? C_GOLD : C_WHITE});
    y -= 16;
    if (isOfficial) {
      dt(page, "Obligation annuelle de formation DDA accomplie", {x:40, y, size:10, font:fB, color:C_TEAL});
    } else {
      const pct = Math.round(totalSeconds/54000*100);
      const rem = 54000 - totalSeconds;
      dt(page, "Progression : "+pct+"%  -  "+Math.floor(rem/3600)+"h"+String(Math.floor((rem%3600)/60)).padStart(2,"0")+" restantes",
        {x:40, y, size:10, font:fR, color:C_MUTED});
    }
    y -= 28;
    dr(page, 40, y, width-80, 1, C_BORDER); y -= 18;

    // En-tete tableau
    dt(page, "MODULES VALIDES", {x:40, y, size:8, font:fB, color:C_MUTED});
    dt(page, "DUREE", {x:width-130, y, size:8, font:fB, color:C_MUTED});
    dt(page, "DATE",  {x:width-82,  y, size:8, font:fB, color:C_MUTED});
    y -= 14;

    // Modules
    let alt = false;
    for (const p of progress) {
      if (y < 100) break;
      const mod = modMap[p.module_id];
      if (!mod) continue;
      const date = p.completed_at ? new Date(p.completed_at).toLocaleDateString("fr-FR") : "-";
      const dur  = mod.duree_minutes >= 60
        ? Math.floor(mod.duree_minutes/60)+"h"+String(mod.duree_minutes%60).padStart(2,"0")
        : mod.duree_minutes+"min";
      const title = mod.title.length > 62 ? mod.title.substring(0,59)+"..." : mod.title;
      if (alt) dr(page, 40, y-4, width-80, 17, rgb(0.086,0.114,0.165));
      alt = !alt;
      dt(page, "OK",   {x:44,        y:y+2, size:7, font:fB, color:C_TEAL});
      dt(page, title,  {x:62,        y:y+2, size:8, font:fR, color:C_WHITE});
      dt(page, dur,    {x:width-130, y:y+2, size:8, font:fR, color:C_MUTED});
      dt(page, date,   {x:width-82,  y:y+2, size:8, font:fR, color:C_MUTED});
      y -= 18;
    }

    // Mentions legales
    if (isOfficial) {
      const my = Math.min(y-16, 175);
      dr(page, 40, my+14, width-80, 1, C_BORDER);
      dt(page, "MENTIONS LEGALES", {x:40, y:my, size:8, font:fB, color:C_MUTED});
      const ml = [
        "Ce certificat atteste la realisation de l'obligation annuelle de formation continue prevue par la Directive",
        "sur la Distribution d'Assurances (DDA) - Arrete du 26 septembre 2018, article A 512-7 du Code des assurances.",
        "Les modules ont ete valides par evaluation avec un score minimum de 70%.",
        "Ce document peut etre presente a l'ORIAS ou toute autorite de controle competente.",
      ];
      let ly = my - 13;
      for (const l of ml) { dt(page, l, {x:40, y:ly, size:7, font:fR, color:C_MUTED}); ly -= 11; }
    }

    // Pied de page
    const dateEmission = new Date().toLocaleDateString("fr-FR", {day:"2-digit",month:"long",year:"numeric"});
    dr(page, 0, 48, width, 1, C_BORDER);
    dt(page, "Emis le "+dateEmission+" - BingeDDA - bingedda.fr", {x:40, y:32, size:7, font:fR, color:C_MUTED});
    if (!isOfficial) {
      const pw = fB.widthOfTextAtSize("DOCUMENT PROVISOIRE - NON OPPOSABLE", 7);
      dt(page, "DOCUMENT PROVISOIRE - NON OPPOSABLE", {x:width-40-pw, y:32, size:7, font:fB, color:rgb(0.8,0.5,0.1)});
    } else {
      const cw = fB.widthOfTextAtSize("CERTIFICAT OFFICIEL DDA", 7);
      dt(page, "CERTIFICAT OFFICIEL DDA", {x:width-40-cw, y:32, size:7, font:fB, color:C_GOLD});
    }

    const pdfBytes = await pdfDoc.save();
    const filename = isOfficial ? "certificat-dda-"+new Date().getFullYear()+".pdf" : "attestation-suivi-dda.pdf";

    return new Response(pdfBytes, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type":"application/pdf", "Content-Disposition":`attachment; filename="${filename}"` }
    });

  } catch (err) {
    console.error("generate-attestation error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
