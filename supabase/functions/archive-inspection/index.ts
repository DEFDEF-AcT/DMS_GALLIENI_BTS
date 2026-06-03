// Edge Function : passerelle d'archivage d'un état des lieux sur Google Drive.
// Comme « archive-order », le frontend ne connaît jamais l'URL ni le secret du
// script Google : cette fonction (côté serveur) les détient et relaie l'envoi.
//
// Elle transmet au script Apps Script :
//   - les photos (compressées côté navigateur, en dataURL/base64) du tour du véhicule,
//   - le PDF (HTML) de la fiche de réception,
// que le script classe dans :  <ROOT> / Réceptions / <immatriculation> / <date d'entrée> /
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) — partagés avec archive-order :
//   APPS_SCRIPT_URL    = URL /exec de l'application web Apps Script
//   APPS_SCRIPT_SECRET = même secret que la constante SECRET du script
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const scriptUrl = Deno.env.get("APPS_SCRIPT_URL");
    const scriptSecret = Deno.env.get("APPS_SCRIPT_SECRET");
    if (!scriptUrl || !scriptSecret) return json({ ok: false, error: "Archivage non configuré (secrets APPS_SCRIPT_* manquants)" });

    // L'appelant doit être connecté (staff ou élève « Étudiant Technicien »).
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ ok: false, error: "Non authentifié" });

    const { inspectionNum, plate, entryDate, html, photos } = await req.json();
    if (!inspectionNum || !plate) return json({ ok: false, error: "inspectionNum et plate requis" });

    // Relai vers le script Google (qui crée l'arborescence et enregistre photos + PDF).
    const r = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: scriptSecret,
        action: "reception",
        inspectionNum,
        plate,
        entryDate: entryDate || "",
        html: html || "",
        photos: Array.isArray(photos) ? photos : [],
      }),
      redirect: "follow",
    });
    const txt = await r.text();
    let res: unknown;
    try { res = JSON.parse(txt); } catch { res = { ok: false, error: "Réponse inattendue du script: " + txt.slice(0, 200) }; }
    return json(res);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
