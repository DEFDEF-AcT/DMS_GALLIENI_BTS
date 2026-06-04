import { supabase } from "./supabase";

// ── Adaptateurs DB (snake_case) ↔ App (camelCase) ──────────────────────────
// Même principe que l'app DMS : le JSX manipule du camelCase, on convertit ici.

const camelToSnake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const DATE_COLS = new Set(["entry_date"]);
// Champs jamais écrits (gérés par la DB ou en lecture seule).
const SKIP_WRITE = new Set(["id", "inspectionNum", "createdAt", "updatedAt"]);

export function rowToInspection(r) {
  return {
    id: r.id,
    inspectionNum: r.inspection_num,
    orderId: r.order_id || "",
    orderNum: r.order_num || "",
    plate: r.plate, brand: r.brand || "", model: r.model || "", year: r.year || "",
    km: r.km || "", fuel: r.fuel || "",
    clientName: r.client_name || "", clientPhone: r.client_phone || "",
    entryDate: r.entry_date || "", entryTime: r.entry_time || "",
    tires: r.tires || {}, windshield: r.windshield || {}, windows: r.windows || {},
    wipers: r.wipers || {}, interior: r.interior || {},
    bodyDamages: Array.isArray(r.body_damages) ? r.body_damages : [],
    photos: Array.isArray(r.photos) ? r.photos : [],
    generalNote: r.general_note || "",
    signature: r.signature || "",
    driveUrl: r.drive_url || "", reportUrl: r.report_url || "",
    status: r.status || "brouillon",
    createdBy: r.created_by || "",
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// patch/objet App → ligne DB (update partiel : ne pose que les clés fournies).
function inspectionToRow(o) {
  const row = {};
  for (const [k, v] of Object.entries(o)) {
    if (SKIP_WRITE.has(k)) continue;
    const col = camelToSnake(k);
    row[col] = DATE_COLS.has(col) ? (v || null) : v;
  }
  return row;
}

// ── États des lieux ──────────────────────────────────────────────────────────
export async function listInspections() {
  const { data, error } = await supabase
    .from("inspections").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(rowToInspection);
}
export async function insertInspection(o) {
  const { data, error } = await supabase
    .from("inspections").insert(inspectionToRow(o)).select().single();
  if (error) throw error;
  return rowToInspection(data);
}
export async function updateInspection(id, patch) {
  const { data, error } = await supabase
    .from("inspections").update(inspectionToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return rowToInspection(data);
}
export async function deleteInspection(id) {
  const { error } = await supabase.from("inspections").delete().eq("id", id);
  if (error) throw error;
}

// ── Ordres de réparation (lecture seule : pour relier un état des lieux) ──────
// On lit le sous-ensemble utile à la réception. RLS : le staff voit tout ;
// un élève ne voit que les OR où il est affecté (cf. schéma du DMS).
export async function listOrdersLite() {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_num,plate,brand,model,year,km,vtype,client_name,client_phone,entry_date,entry_time,status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, orderNum: r.order_num, plate: r.plate, brand: r.brand, model: r.model,
    year: r.year || "", km: r.km || "", vtype: r.vtype,
    clientName: r.client_name || "", clientPhone: r.client_phone || "",
    entryDate: r.entry_date || "", entryTime: r.entry_time || "", status: r.status,
  }));
}

// ── Archivage Drive (photos + PDF) via l'Edge Function passerelle ─────────────
// photos : [{ label, dataUrl }]  (dataUrl = image compressée "data:image/jpeg;base64,…")
export async function archiveInspection({ inspectionNum, plate, entryDate, html, photos }) {
  const { data, error } = await supabase.functions.invoke("archive-inspection", {
    body: { inspectionNum, plate, entryDate, html, photos },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Erreur d'archivage Drive");
  return data;   // { ok, folderUrl, files:[{label,url,id}], reportUrl }
}
