import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import {
  listInspections, insertInspection, updateInspection, deleteInspection,
  listOrdersLite, archiveInspection,
} from "./data";

// ── Thème (identique au DMS pour la cohérence visuelle) ──────────────────────
// Thème clair « verts pastel » : fond vert très pâle, cartes blanches, accent vert sauge.
const C = {
  bg:"#f0f7f1", card:"#ffffff", side:"#e3efe5", hdr:"#e8f2ea",
  acc:"#5d9e78", acc2:"#3f8059", bdr:"#cfe3d4", txt:"#1f3d2b", sub:"#4a6552", mut:"#6f8a79",
  field:"#f3f9f4",
};
const STATUS = {
  brouillon: { label:"Brouillon", col:"#c2871a" },
  finalise:  { label:"Finalisé",  col:"#2f9e6b" },
};
const ROLE_STYLE = {
  admin:      { bg:"#fde8e6", cl:"#b14138" },
  enseignant: { bg:"#e4eefb", cl:"#2f6fb0" },
  eleve:      { bg:"#e3f3ea", cl:"#3f8059" },
};
const ROLE_LABEL = { admin:"Administrateur", enseignant:"Enseignant", eleve:"Étudiant Technicien" };
const roleLabel = (r) => ROLE_LABEL[r] || r;

// Domaine interne des identifiants élèves (doit correspondre à l'app DMS / Edge Function).
const STUDENT_DOMAIN = "eleve.gallieni.local";
const toLoginEmail = (v) => v.includes("@") ? v.trim() : v.trim().toLowerCase() + "@" + STUDENT_DOMAIN;
const APP_URL = window.location.origin + import.meta.env.BASE_URL;

// ── Référentiels du tour du véhicule ─────────────────────────────────────────
const TIRE_POS = [
  { k:"fl", l:"Avant gauche" }, { k:"fr", l:"Avant droit" },
  { k:"rl", l:"Arrière gauche" }, { k:"rr", l:"Arrière droit" },
];
const TIRE_STATE  = ["Neuf", "Bon", "Usé", "À remplacer"];
const GLASS_STATE = ["RAS", "Impact", "Fissure", "À remplacer"];
const WIPER_STATE = ["Bon", "À surveiller", "À remplacer"];
const CLEAN_STATE = ["Propre", "Correct", "Sale", "Très sale"];
const FUEL_STATE  = ["Vide", "1/4", "1/2", "3/4", "Plein"];
const DAMAGE_TYPE = ["Rayure", "Choc", "Enfoncement", "Éclat peinture", "Élément manquant", "Autre"];
const BODY_ZONES  = [
  "Pare-chocs AV", "Capot", "Aile AV gauche", "Aile AV droite",
  "Porte AV gauche", "Porte AV droite", "Porte AR gauche", "Porte AR droite",
  "Aile AR gauche", "Aile AR droite", "Pare-chocs AR", "Hayon / Coffre",
  "Toit / Pavillon", "Bas de caisse gauche", "Bas de caisse droit", "Jantes",
];
// Couleur d'un état (vert = bon … rouge = à remplacer).
const stateColor = (s) =>
  /remplacer|fissure|très sale|sale|manquant/i.test(s) ? "#d2564f"
  : /usé|à surveiller|impact|correct|enfoncement|choc/i.test(s) ? "#c2871a"
  : "#2f9e6b";

// ── Mode démo (?demo dans l'URL) ─────────────────────────────────────────────
// Permet de présenter l'app SANS connexion ni backend (auth + données factices).
// N'affecte rien en usage normal : tout est gardé derrière ce paramètre d'URL.
// Activé par ?demo dans l'URL ; rendu persistant le temps de l'onglet (sessionStorage)
// pour survivre aux rechargements/navigations internes lors d'une démonstration.
const DEMO = (() => {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).has("demo");
  try {
    if (q) sessionStorage.setItem("reception_demo", "1");
    return q || sessionStorage.getItem("reception_demo") === "1";
  } catch { return q; }
})();
const DEMO_USER = { id:"demo", name:"Démo (réceptionnaire)", role:"admin" };
const _demoDay = new Date().toISOString().slice(0,10);
const DEMO_ORDERS = [
  { id:"o1", orderNum:"OR-2026-0042", plate:"FX-512-AB", brand:"Peugeot", model:"308 SW", year:"2021", km:"68450", vtype:"client", clientName:"M. Dupont", clientPhone:"06 12 34 56 78", entryDate:_demoDay, entryTime:"09:15", status:"en_attente" },
  { id:"o2", orderNum:"OR-2026-0043", plate:"GK-908-ZT", brand:"Renault", model:"Clio V", year:"2020", km:"41200", vtype:"client", clientName:"Mme Martin", clientPhone:"06 98 76 54 32", entryDate:_demoDay, entryTime:"10:30", status:"en_attente" },
];
const DEMO_INSPECTIONS = [{
  id:"i1", inspectionNum:"REC-2026-0007", orderId:"o2", orderNum:"OR-2026-0043",
  plate:"GK-908-ZT", brand:"Renault", model:"Clio V", km:"41200", fuel:"1/2",
  clientName:"Mme Martin", clientPhone:"06 98 76 54 32", entryDate:_demoDay, entryTime:"10:30",
  tires:{ fl:{state:"Bon",depth:"5.5"}, fr:{state:"Bon",depth:"5.0"}, rl:{state:"Usé",depth:"3.0"}, rr:{state:"Usé",depth:"2.8"} },
  windshield:{ state:"Impact", note:"Impact côté passager, bas du pare-brise" }, windows:{ state:"RAS", note:"" },
  wipers:{ front:"À surveiller", rear:"Bon" }, interior:{ cleanliness:"Correct", note:"Siège conducteur taché" },
  bodyDamages:[{ id:"d1", zone:"Porte AV droite", type:"Rayure", note:"Rayure ~15 cm" }, { id:"d2", zone:"Pare-chocs AR", type:"Choc", note:"Léger enfoncement" }],
  photos:[{ label:"Vue d'ensemble", url:"#", fileId:"" }, { label:"Porte AV droite", url:"#", fileId:"" }],
  generalNote:"Véhicule reçu avec quelques défauts préexistants signalés au client.",
  signature:"", driveUrl:"#", reportUrl:"#", status:"finalise", createdBy:"Démo (réceptionnaire)",
  createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
}];

// ── Utilitaires ──────────────────────────────────────────────────────────────
const gid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const today = () => new Date().toISOString().slice(0,10);
const tNow  = () => new Date().toTimeString().slice(0,5);
const fD    = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const esc   = (s) => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// Compression d'une photo (input file) → dataURL JPEG (max 1280 px, qualité 0.7).
// Indispensable : limite le poids des uploads Drive et la taille des PDF.
function compressImage(file, max = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r); height = Math.round(height * r);
        }
        const cv = document.createElement("canvas");
        cv.width = width; cv.height = height;
        cv.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Données Supabase (fetch initial + realtime) ──────────────────────────────
function useCollection(listFn, table, demoData) {
  const [items, setItems] = useState(DEMO ? (demoData || []) : []);
  const [loading, setLoading] = useState(!DEMO);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    if (DEMO) return;
    // setState uniquement dans les callbacks asynchrones (évite les rendus en
    // cascade signalés par react-hooks/set-state-in-effect).
    listFn()
      .then((d) => { setItems(d); setError(null); })
      .catch((e) => { console.error("[Réception] " + table, e); setError(e); })
      .finally(() => setLoading(false));
  }, [listFn, table]);
  useEffect(() => {
    if (DEMO) return;
    reload();
    const ch = supabase.channel("rt-" + table)
      .on("postgres_changes", { event: "*", schema: "public", table }, reload).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload, table]);
  return { items, setItems, loading, error, reload };
}
function useInspections() {
  const { items, setItems, loading, reload } = useCollection(listInspections, "inspections", DEMO_INSPECTIONS);
  const add = useCallback(async (o) => {
    if (DEMO) { const r = { ...o, id:gid(), inspectionNum:"REC-DEMO-"+(100+Math.floor(Math.random()*900)), createdAt:new Date().toISOString() }; setItems(p => [r, ...p]); return r; }
    const r = await insertInspection(o); reload(); return r;
  }, [reload, setItems]);
  const edit = useCallback(async (id, p) => {
    if (DEMO) { setItems(prev => prev.map(x => x.id===id ? { ...x, ...p } : x)); return { id, ...p }; }
    const r = await updateInspection(id, p); reload(); return r;
  }, [reload, setItems]);
  const remove = useCallback(async (id) => {
    if (DEMO) { setItems(prev => prev.filter(x => x.id!==id)); return; }
    await deleteInspection(id); reload();
  }, [reload, setItems]);
  return { inspections: items, loading, add, edit, remove };
}

function useSession() {
  const [user, setUser] = useState(DEMO ? DEMO_USER : null);
  const [ready, setReady] = useState(DEMO);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (DEMO) return;
    let active = true;
    const loadProfile = async (session) => {
      if (!session) { if (active) { setUser(null); setReady(true); } return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!active) return;
      setUser({ id: session.user.id, name: data?.name || session.user.email, role: data?.role || "enseignant" });
      setReady(true);
    };
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      loadProfile(session);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return { user, ready, recovery, clearRecovery: () => setRecovery(false) };
}
function useDesktop() {
  const [d, sd] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const f = () => sd(window.innerWidth >= 1024);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return d;
}

// ── Primitives UI (reprises du DMS) ──────────────────────────────────────────
function Btn({ children, onClick, disabled, sm, ghost, danger, full, style: ex }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: sm?"5px 12px":"9px 18px", borderRadius:7, cursor: disabled?"not-allowed":"pointer",
      fontSize: sm?12:14, fontWeight:500, width: full?"100%":undefined, opacity: disabled?0.5:1,
      background: ghost?"transparent":danger?"#dc2626":C.acc, color: ghost?C.sub:"#fff",
      border: ghost?"1px solid "+C.bdr:"none", transition:"opacity .15s", ...(ex||{})
    }}>{children}</button>
  );
}
function Badge({ status }) {
  const m = STATUS[status] || STATUS.brouillon;
  return <span style={{ background:m.col+"22", color:m.col, border:"1px solid "+m.col+"44", padding:"2px 10px", borderRadius:999, fontSize:12, fontWeight:600 }}>{m.label}</span>;
}
function Inp({ label, value, onChange, type, placeholder, readOnly, style: ex }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:12, color:C.sub, fontWeight:500 }}>{label}</label>}
      <input type={type||"text"} value={value} onChange={e => onChange&&onChange(e.target.value)}
        placeholder={placeholder} readOnly={readOnly}
        style={{ background:C.field, border:"1px solid "+C.bdr, borderRadius:6, padding:"8px 10px", color:readOnly?C.mut:C.txt, fontSize:13, outline:"none", ...(ex||{}) }}/>
    </div>
  );
}
function Sel({ label, value, onChange, opts }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:12, color:C.sub, fontWeight:500 }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background:C.field, border:"1px solid "+C.bdr, borderRadius:6, padding:"8px 10px", color:C.txt, fontSize:13, outline:"none" }}>
        {opts.map(o => <option key={o.v!=null?o.v:o} value={o.v!=null?o.v:o}>{o.l!=null?o.l:o}</option>)}
      </select>
    </div>
  );
}
function TA({ label, value, onChange, placeholder, rows, readOnly }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:12, color:C.sub, fontWeight:500 }}>{label}</label>}
      <textarea value={value} onChange={e => onChange&&onChange(e.target.value)} rows={rows||3}
        placeholder={placeholder} readOnly={readOnly}
        style={{ background:C.field, border:"1px solid "+C.bdr, borderRadius:6, padding:"8px 10px", color:C.txt, fontSize:13, outline:"none", resize:"vertical", fontFamily:"inherit" }}/>
    </div>
  );
}
function Crd({ children, style: ex }) {
  return <div style={{ background:C.card, borderRadius:12, padding:16, border:"1px solid "+C.bdr, ...(ex||{}) }}>{children}</div>;
}
function SecTitle({ children }) {
  return <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, margin:"16px 0 10px", paddingBottom:6, borderBottom:"1px solid "+C.bdr }}>{children}</h3>;
}
// Sélecteur d'état sous forme de pastilles (un seul choix), coloré selon la valeur.
function ChipSelect({ value, opts, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {opts.map(o => {
        const on = value === o;
        const col = stateColor(o);
        return (
          <button key={o} type="button" onClick={() => onChange(o)}
            style={{ padding:"6px 12px", borderRadius:999, cursor:"pointer", fontSize:12, fontWeight:600,
              border:"1px solid "+(on?col:C.bdr), background:on?col+"22":"transparent", color:on?col:C.sub }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function SigPad({ onSave, init }) {
  const cv = useRef(); const dr = useRef(false);
  const [has, sh] = useState(!!init);
  useEffect(() => {
    if (init && cv.current) {
      const img = new Image();
      img.onload = () => { if (cv.current) cv.current.getContext("2d").drawImage(img,0,0); sh(true); };
      img.src = init;
    }
  }, []); // eslint-disable-line
  const getPos = (e) => {
    const r=cv.current.getBoundingClientRect(), sx=cv.current.width/r.width, sy=cv.current.height/r.height;
    const s=e.touches?e.touches[0]:e;
    return [(s.clientX-r.left)*sx, (s.clientY-r.top)*sy];
  };
  const dn=(e)=>{e.preventDefault();dr.current=true;const[x,y]=getPos(e);const ctx=cv.current.getContext("2d");ctx.beginPath();ctx.moveTo(x,y);};
  const mv=(e)=>{if(!dr.current)return;e.preventDefault();const[x,y]=getPos(e);const ctx=cv.current.getContext("2d");ctx.strokeStyle="#3f8059";ctx.lineWidth=2;ctx.lineCap="round";ctx.lineTo(x,y);ctx.stroke();sh(true);};
  const up=(e)=>{e.preventDefault();dr.current=false;};
  return (
    <div>
      <canvas ref={cv} width={500} height={130}
        style={{ width:"100%", background:"#fff", borderRadius:8, cursor:"crosshair", touchAction:"none", border:"2px solid "+C.bdr, display:"block" }}
        onMouseDown={dn} onMouseMove={mv} onMouseUp={up} onMouseLeave={up}
        onTouchStart={dn} onTouchMove={mv} onTouchEnd={up}/>
      <div style={{ display:"flex", gap:8, marginTop:6 }}>
        <Btn sm ghost onClick={() => { cv.current.getContext("2d").clearRect(0,0,500,130); sh(false); if(onSave) onSave(""); }}>Effacer</Btn>
        <Btn sm disabled={!has} onClick={() => { if(onSave) onSave(cv.current.toDataURL()); }}>Valider la signature</Btn>
      </div>
    </div>
  );
}

// Capture de photos (appareil photo sur mobile/tablette via capture="environment").
function PhotoCapture({ photos, setPhotos, notify }) {
  const [busy, sb] = useState(false);
  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    sb(true);
    try {
      const added = [];
      for (const f of files) {
        try { added.push({ id: gid(), label: "", dataUrl: await compressImage(f) }); }
        catch { notify && notify("Photo illisible ignorée", "error"); }
      }
      setPhotos((p) => [...p, ...added]);
    } finally { sb(false); }
  };
  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
        <label style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"9px 16px", borderRadius:7, cursor:"pointer", fontSize:14, fontWeight:500, background:C.acc, color:"#fff" }}>
          📷 Prendre une photo
          <input type="file" accept="image/*" capture="environment" onChange={onFiles} style={{ display:"none" }}/>
        </label>
        <label style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"9px 16px", borderRadius:7, cursor:"pointer", fontSize:14, fontWeight:500, background:"transparent", color:C.sub, border:"1px solid "+C.bdr }}>
          🖼 Importer
          <input type="file" accept="image/*" multiple onChange={onFiles} style={{ display:"none" }}/>
        </label>
        {busy && <span style={{ color:C.sub, fontSize:13, alignSelf:"center" }}>Compression…</span>}
      </div>
      {photos.length === 0
        ? <p style={{ color:C.mut, fontSize:13, margin:0 }}>Aucune photo. Faites le tour complet du véhicule (4 faces + toit + détails).</p>
        : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10 }}>
            {photos.map((ph) => (
              <div key={ph.id} style={{ background:C.field, borderRadius:8, border:"1px solid "+C.bdr, overflow:"hidden" }}>
                <img src={ph.dataUrl} alt="" style={{ width:"100%", height:110, objectFit:"cover", display:"block" }}/>
                <div style={{ padding:6, display:"flex", flexDirection:"column", gap:6 }}>
                  <select value={ph.label} onChange={(e) => setPhotos((p) => p.map((x) => x.id===ph.id?{...x,label:e.target.value}:x))}
                    style={{ background:C.bg, border:"1px solid "+C.bdr, borderRadius:5, padding:"4px 6px", color:C.txt, fontSize:11, outline:"none" }}>
                    <option value="">Zone / vue…</option>
                    {BODY_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                    <option value="Vue d'ensemble">Vue d'ensemble</option>
                    <option value="Tableau de bord / km">Tableau de bord / km</option>
                    <option value="Intérieur">Intérieur</option>
                  </select>
                  <button type="button" onClick={() => setPhotos((p) => p.filter((x) => x.id!==ph.id))}
                    style={{ background:"none", border:"1px solid "+C.bdr, borderRadius:5, color:"#d2564f", cursor:"pointer", fontSize:11, padding:"3px 0" }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── Génération du PDF (fiche d'état des lieux imprimable) ─────────────────────
function inspectionHTML(insp, photos) {
  const row = (lb, vl) => `<div><div class="lb">${esc(lb)}</div><div class="vl">${esc(vl||"—")}</div></div>`;
  const tiresHTML = TIRE_POS.map((t) => {
    const v = insp.tires[t.k] || {};
    return `<div><div class="lb">${esc(t.l)}</div><div class="vl">${esc(v.state||"—")}${v.depth?" · "+esc(v.depth)+" mm":""}</div></div>`;
  }).join("");
  const dmgHTML = (insp.bodyDamages||[]).length
    ? `<table class="dt"><tr><th>Zone</th><th>Type</th><th>Détail</th></tr>` +
      insp.bodyDamages.map((d) => `<tr><td>${esc(d.zone)}</td><td>${esc(d.type)}</td><td>${esc(d.note||"")}</td></tr>`).join("") + `</table>`
    : `<div class="tb">Aucun dégât préexistant signalé.</div>`;
  const phHTML = (photos||[]).length
    ? `<div class="phg">` + photos.map((p) =>
        `<div class="ph"><img src="${p.dataUrl}"/><div class="pc">${esc(p.label||"Photo")}</div></div>`).join("") + `</div>`
    : "";
  const sigHTML = insp.signature
    ? `<img src="${insp.signature}" style="max-height:74px;max-width:100%;display:block;margin:auto;"/>`
    : `<div style="font-size:11px;color:#bbb;text-align:center;line-height:80px;">Non signé</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(insp.inspectionNum)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;background:#fff;}
.page{padding:12mm 14mm;max-width:210mm;margin:0 auto;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #3f8059;padding-bottom:10px;margin-bottom:14px;}
.bn{font-size:20px;font-weight:bold;color:#3f8059;}.bs{font-size:10px;color:#555;margin-top:2px;}
.on{font-size:20px;font-weight:bold;color:#3f8059;text-align:right;}.om{font-size:10px;color:#555;text-align:right;margin-top:2px;}
.sec{margin-bottom:10px;}.sh{background:#3f8059;color:#fff;padding:4px 10px;font-size:11px;font-weight:bold;margin-bottom:6px;}
.grid{display:grid;gap:6px 10px;}.g2{grid-template-columns:1fr 1fr;}.g3{grid-template-columns:repeat(3,1fr);}.g4{grid-template-columns:repeat(4,1fr);}.g5{grid-template-columns:repeat(5,1fr);}
.lb{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;}
.vl{font-size:12px;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:2px;min-height:17px;}
.tb{border:1px solid #ddd;padding:6px 8px;min-height:30px;font-size:11px;line-height:1.5;white-space:pre-wrap;}
.dt{width:100%;border-collapse:collapse;font-size:11px;}.dt th{background:#f1f5f9;text-align:left;padding:4px 6px;border:1px solid #ddd;}.dt td{padding:4px 6px;border:1px solid #ddd;}
.phg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}.ph{border:1px solid #ddd;border-radius:4px;overflow:hidden;}.ph img{width:100%;height:90px;object-fit:cover;display:block;}.pc{font-size:9px;color:#555;padding:2px 4px;text-align:center;}
.sr{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;padding-top:12px;border-top:2px solid #3f8059;}
.sl{font-size:10px;color:#333;font-weight:bold;margin-bottom:5px;}.sb{border:1px solid #999;height:82px;display:flex;align-items:center;justify-content:center;background:#fafafa;overflow:hidden;}
.sn{font-size:9px;color:#888;text-align:center;margin-top:3px;}
.foot{margin-top:12px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#aaa;text-align:center;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{padding:8mm 12mm;}}</style>
</head><body><div class="page">
<div class="hdr"><div><div class="bn">Lycée Gallieni</div><div class="bs">Atelier BTS Maintenance des Véhicules</div>
<div class="bs" style="font-weight:bold;margin-top:5px;font-size:12px;">ÉTAT DES LIEUX D'ENTRÉE — TOUR DU VÉHICULE</div></div>
<div><div class="on">${esc(insp.inspectionNum)}</div>${insp.orderNum?`<div class="om">OR lié : ${esc(insp.orderNum)}</div>`:""}
<div class="om">Entrée le ${fD(insp.entryDate)} à ${esc(insp.entryTime||"—")}</div><div class="om">Réceptionné par : ${esc(insp.createdBy||"—")}</div></div></div>
<div class="sec"><div class="sh">Véhicule</div><div class="grid g5">
${row("Immatriculation", insp.plate)}${row("Marque", insp.brand)}${row("Modèle", insp.model)}
${row("Kilométrage", insp.km?insp.km+" km":"")}${row("Carburant", insp.fuel)}</div></div>
<div class="sec"><div class="sh">Client</div><div class="grid g2">
${row("Nom du client", insp.clientName)}${row("Téléphone", insp.clientPhone)}</div></div>
<div class="sec"><div class="sh">Pneumatiques</div><div class="grid g4">${tiresHTML}</div></div>
<div class="sec"><div class="sh">Vitrage & essuie-glaces</div><div class="grid g4">
${row("Pare-brise", (insp.windshield.state||"—")+(insp.windshield.note?" — "+insp.windshield.note:""))}
${row("Autres vitres", (insp.windows.state||"—")+(insp.windows.note?" — "+insp.windows.note:""))}
${row("Essuie-glaces avant", insp.wipers.front)}${row("Essuie-glace arrière", insp.wipers.rear)}</div></div>
<div class="sec"><div class="sh">Propreté intérieure</div><div class="grid g2">
${row("État", insp.interior.cleanliness)}${row("Remarque", insp.interior.note)}</div></div>
<div class="sec"><div class="sh">Dégâts / défauts préexistants relevés</div>${dmgHTML}</div>
${insp.generalNote?`<div class="sec"><div class="sh">Observations générales</div><div class="tb">${esc(insp.generalNote)}</div></div>`:""}
${phHTML?`<div class="sec"><div class="sh">Photos</div>${phHTML}</div>`:""}
<div class="sr">
<div><div class="sl">Signature du client (reconnaît l'état constaté à l'entrée)</div><div class="sb">${sigHTML}</div><div class="sn">${esc(insp.clientName||"")}</div></div>
<div><div class="sl">Visa du réceptionnaire</div><div class="sb"><div style="font-size:11px;color:#ccc;line-height:80px;">..................................</div></div><div class="sn">${esc(insp.createdBy||"")}</div></div>
</div>
<div class="foot">Lycée Gallieni – BTS MV &nbsp;|&nbsp; État des lieux ${esc(insp.inspectionNum)} &nbsp;|&nbsp; Imprimé le ${new Date().toLocaleDateString("fr-FR")}</div>
</div></body></html>`;
}
function printInspection(insp, photos) {
  try {
    const blob = new Blob([inspectionHTML(insp, photos)], { type:"text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 800);
    else { const a = document.createElement("a"); a.href = url; a.download = insp.inspectionNum+".html"; a.click(); }
  } catch { alert("Impossible d'ouvrir l'impression. Vérifiez les popups."); }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function AuthCard({ children }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, padding:16 }}>
      <div style={{ background:C.card, borderRadius:16, padding:32, width:"100%", maxWidth:380, border:"1px solid "+C.bdr, boxShadow:"0 18px 45px rgba(31,61,43,.14)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:42, marginBottom:12 }}>🚗 🚛</div>
          <h1 style={{ color:C.txt, fontSize:20, fontWeight:700, margin:0 }}>Réception Atelier Véhicule</h1>
          <p style={{ color:C.mut, fontSize:13, marginTop:6 }}>Lycée Gallieni - BTS MV</p>
        </div>
        {children}
      </div>
    </div>
  );
}
function LoginView() {
  const [mode,setMode]=useState("login");
  const [u,su]=useState(""); const [p,sp]=useState(""); const [err,se]=useState(""); const [msg,sm]=useState(""); const [busy,sb]=useState(false);
  const go=async()=>{ se(""); sb(true);
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(u), password: p });
    sb(false); if (error) se("Identifiants incorrects");
  };
  const sendReset=async()=>{ se(""); sm("");
    if(!u.trim()){se("Saisis ton e-mail");return;}
    sb(true);
    const { error } = await supabase.auth.resetPasswordForEmail(u.trim(), { redirectTo: APP_URL });
    sb(false); if(error){se(error.message);return;}
    sm("Si un compte existe pour cet e-mail, un lien vient d'être envoyé.");
  };
  if(mode==="forgot") return (
    <AuthCard>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }} onKeyDown={e=>{if(e.key==="Enter"&&!busy)sendReset();}}>
        <p style={{ color:C.sub, fontSize:13, margin:0 }}>Saisis ton e-mail : tu recevras un lien pour redéfinir ton mot de passe.</p>
        <Inp label="E-mail" value={u} onChange={su} type="email" placeholder="prenom.nom@exemple.fr"/>
        {err && <p style={{ color:"#d2564f", fontSize:13, textAlign:"center", margin:0 }}>{err}</p>}
        {msg && <p style={{ color:"#2f9e6b", fontSize:13, textAlign:"center", margin:0 }}>{msg}</p>}
        <Btn full onClick={sendReset} disabled={busy}>{busy?"Envoi…":"Envoyer le lien"}</Btn>
        <button onClick={()=>{setMode("login");se("");sm("");}} style={{ background:"none", border:"none", color:C.acc2, cursor:"pointer", fontSize:13 }}>← Retour</button>
      </div>
    </AuthCard>
  );
  return (
    <AuthCard>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }} onKeyDown={e=>{if(e.key==="Enter"&&!busy)go();}}>
        <Inp label="E-mail (staff) ou identifiant (élève)" value={u} onChange={su} placeholder="prenom.nom@… ou Etudiant1"/>
        <Inp label="Mot de passe" value={p} onChange={sp} type="password" placeholder="••••••••"/>
        {err && <p style={{ color:"#d2564f", fontSize:13, textAlign:"center", margin:0 }}>{err}</p>}
        <Btn full onClick={go} disabled={busy}>{busy?"Connexion…":"Se connecter"}</Btn>
        <button onClick={()=>{setMode("forgot");se("");sm("");}} style={{ background:"none", border:"none", color:C.acc2, cursor:"pointer", fontSize:13 }}>Mot de passe oublié ? (staff)</button>
      </div>
      <div style={{ marginTop:20, padding:12, background:C.field, borderRadius:8, fontSize:12, color:C.mut, textAlign:"center" }}>
        Mêmes comptes que le DMS. Staff : e-mail · Élèves : « EtudiantN ».
      </div>
    </AuthCard>
  );
}
function ResetPasswordView({ notify, onDone }) {
  const [p,sp]=useState(""); const [p2,sp2]=useState(""); const [err,se]=useState(""); const [busy,sb]=useState(false);
  const go=async()=>{ se("");
    if(p.length<6){se("6 caractères minimum");return;}
    if(p!==p2){se("Les deux mots de passe ne correspondent pas");return;}
    sb(true);
    const { error } = await supabase.auth.updateUser({ password:p });
    sb(false); if(error){se(error.message);return;}
    notify("Mot de passe modifié. Reconnecte-toi."); onDone();
  };
  return (
    <AuthCard>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }} onKeyDown={e=>{if(e.key==="Enter"&&!busy)go();}}>
        <p style={{ color:C.sub, fontSize:13, margin:0 }}>Définis ton nouveau mot de passe.</p>
        <Inp label="Nouveau mot de passe" value={p} onChange={sp} type="password" placeholder="••••••••"/>
        <Inp label="Confirmer" value={p2} onChange={sp2} type="password" placeholder="••••••••"/>
        {err && <p style={{ color:"#d2564f", fontSize:13, textAlign:"center", margin:0 }}>{err}</p>}
        <Btn full onClick={go} disabled={busy}>{busy?"Enregistrement…":"Modifier le mot de passe"}</Btn>
      </div>
    </AuthCard>
  );
}

// ── Liste / tableau de bord ────────────────────────────────────────────────────
function ListView({ inspections, nav, sel }) {
  const [q,sq]=useState("");
  const shown = inspections.filter(i =>
    !q || [i.plate,i.brand,i.model,i.clientName,i.inspectionNum,i.orderNum].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <h2 style={{ color:C.txt, fontSize:20, fontWeight:700, margin:0 }}>🚗 🚛 États des lieux ({inspections.length})</h2>
        <Btn onClick={() => nav("new")}>+ Nouvelle réception d'un véhicule</Btn>
      </div>
      <input value={q} onChange={e => sq(e.target.value)} placeholder="🔍 Immatriculation, client, n° fiche, OR…"
        style={{ background:C.card, border:"1px solid "+C.bdr, borderRadius:8, padding:"10px 14px", color:C.txt, fontSize:13, outline:"none" }}/>

      {/* Historique des réceptions déjà réalisées, avec le n° d'OR associé. */}
      <div>
        <h3 style={{ color:C.acc2, fontSize:14, fontWeight:700, margin:"4px 0 10px", paddingBottom:6, borderBottom:"1px solid "+C.bdr }}>
          📋 Historique des réceptions {q ? `(${shown.length})` : ""}
        </h3>
        {shown.length===0
          ? <Crd><p style={{ color:C.mut, textAlign:"center", margin:0 }}>{q ? "Aucune réception ne correspond à la recherche." : "Aucune réception enregistrée pour le moment."}</p></Crd>
          : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {shown.map(i => (
                <div key={i.id} onClick={() => { sel(i.id); nav("detail"); }}
                  style={{ background:C.card, borderRadius:10, padding:"13px 16px", border:"1px solid "+C.bdr, cursor:"pointer", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}
                  onMouseEnter={e => e.currentTarget.style.background="#eef6f0"} onMouseLeave={e => e.currentTarget.style.background=C.card}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ color:C.acc2, fontWeight:700, fontSize:12 }}>{i.inspectionNum}</span>
                      <Badge status={i.status}/>
                      {i.photos.length>0 && <span style={{ fontSize:11, color:C.sub }}>📷 {i.photos.length}</span>}
                      {i.signature && <span style={{ fontSize:11, color:"#2f9e6b" }}>✍ signé</span>}
                    </div>
                    <div style={{ color:C.txt, fontWeight:600 }}>{i.plate} – {i.brand} {i.model}</div>
                    <div style={{ color:C.sub, fontSize:12 }}>{i.clientName||"—"}</div>
                    {/* N° d'ordre de réparation associé */}
                    <div style={{ marginTop:4 }}>
                      {i.orderNum
                        ? <span style={{ display:"inline-block", fontSize:12, fontWeight:600, color:"#2f6fb0", background:"#e4eefb", border:"1px solid #2f6fb033", borderRadius:6, padding:"2px 8px" }}>🔧 OR associé : {i.orderNum}</span>
                        : <span style={{ fontSize:12, color:C.mut }}>Sans OR associé</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", color:C.mut, fontSize:12 }}>
                    <div>Reçu le {fD(i.createdAt)}</div>
                    <div>Entrée : {fD(i.entryDate)}</div>
                    {i.km && <div>{Number(i.km).toLocaleString("fr-FR")} km</div>}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// Recherche / sélection d'un ordre de réparation à relier.
function OrderPicker({ orders, loading, error, onReload, onPick, onSkip }) {
  const [q,sq]=useState("");
  const shown = orders.filter(o => !q || [o.plate,o.brand,o.model,o.clientName,o.orderNum].join(" ").toLowerCase().includes(q.toLowerCase())).slice(0,40);
  return (
    <div>
      <input value={q} onChange={e=>sq(e.target.value)} placeholder="🔍 Rechercher un OR (immat, client, n°)…"
        style={{ width:"100%", background:C.field, border:"1px solid "+C.bdr, borderRadius:6, padding:"8px 10px", color:C.txt, fontSize:13, outline:"none", marginBottom:10 }}/>
      <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
        {loading && <p style={{ color:C.mut, fontSize:13, margin:"4px 0" }}>Chargement des ordres de réparation…</p>}
        {!loading && error && (
          <div style={{ background:"#fdecea", border:"1px solid #d2564f55", borderRadius:8, padding:10 }}>
            <p style={{ color:"#8a241d", fontSize:13, margin:"0 0 8px" }}>Impossible de charger les OR : {error.message || String(error)}</p>
            <Btn sm ghost onClick={onReload}>↻ Réessayer</Btn>
          </div>
        )}
        {!loading && !error && shown.length===0 && (
          <p style={{ color:C.mut, fontSize:13, margin:"4px 0" }}>
            {orders.length===0 ? "Aucun ordre de réparation visible pour votre compte." : "Aucun OR ne correspond à la recherche."}
          </p>
        )}
        {!loading && !error && shown.map(o => (
          <button key={o.id} type="button" onClick={() => onPick(o)}
            style={{ textAlign:"left", background:C.field, border:"1px solid "+C.bdr, borderRadius:7, padding:"8px 12px", cursor:"pointer", color:C.txt }}>
            <span style={{ color:"#2f6fb0", fontWeight:700, fontSize:12 }}>{o.orderNum}</span>
            <span style={{ marginLeft:8, fontWeight:600 }}>{o.plate}</span>
            <span style={{ color:C.sub, fontSize:12 }}> · {o.brand} {o.model} · {o.clientName||"—"}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
        <Btn sm ghost onClick={onReload}>↻ Rafraîchir la liste</Btn>
        <Btn sm ghost onClick={onSkip}>Continuer sans OR (saisie manuelle) →</Btn>
      </div>
    </div>
  );
}

// ── Nouveau tour du véhicule ────────────────────────────────────────────────────
function NewInspection({ orders, ordersLoading, ordersError, reloadOrders, add, edit, user, nav, sel, notify }) {
  const [busy,sbusy]=useState(false);
  const [linked,setLinked]=useState(false);   // un OR a-t-il été choisi (ou saisie manuelle confirmée) ?
  const [photos,setPhotos]=useState([]);      // [{id,label,dataUrl}] — non encore uploadées
  const [f,sf]=useState({
    orderId:"", orderNum:"", plate:"", brand:"", model:"", km:"", fuel:"",
    clientName:"", clientPhone:"", entryDate:today(), entryTime:tNow(),
    tires:{ fl:{state:"",depth:""}, fr:{state:"",depth:""}, rl:{state:"",depth:""}, rr:{state:"",depth:""} },
    windshield:{ state:"", note:"" }, windows:{ state:"", note:"" },
    wipers:{ front:"", rear:"" }, interior:{ cleanliness:"", note:"" },
    bodyDamages:[], generalNote:"", signature:"",
  });
  const set=(k,v)=>sf(p=>({...p,[k]:v}));
  const setTire=(pos,key,v)=>sf(p=>({...p,tires:{...p.tires,[pos]:{...p.tires[pos],[key]:v}}}));
  const pickOrder=(o)=>{ sf(p=>({...p,orderId:o.id,orderNum:o.orderNum,plate:o.plate,brand:o.brand,model:o.model,km:o.km,clientName:o.clientName,clientPhone:o.clientPhone,entryDate:o.entryDate||today(),entryTime:o.entryTime||tNow()})); setLinked(true); };
  const addDamage=()=>set("bodyDamages",[...f.bodyDamages,{id:gid(),zone:BODY_ZONES[0],type:DAMAGE_TYPE[0],note:""}]);
  const setDamage=(id,key,v)=>set("bodyDamages",f.bodyDamages.map(d=>d.id===id?{...d,[key]:v}:d));
  const delDamage=(id)=>set("bodyDamages",f.bodyDamages.filter(d=>d.id!==id));

  const submit=async()=>{
    if(!f.plate.trim()){ notify("L'immatriculation est obligatoire","error"); return; }
    sbusy(true);
    try {
      // 1) Créer la fiche (le n° REC-AAAA-XXXX est généré par la base).
      const rec = {
        orderId:f.orderId||null, orderNum:f.orderNum, plate:f.plate.toUpperCase(),
        brand:f.brand, model:f.model, km:f.km, fuel:f.fuel,
        clientName:f.clientName, clientPhone:f.clientPhone, entryDate:f.entryDate, entryTime:f.entryTime,
        tires:f.tires, windshield:f.windshield, windows:f.windows, wipers:f.wipers,
        interior:f.interior, bodyDamages:f.bodyDamages, generalNote:f.generalNote,
        signature:f.signature, photos:[], status:"finalise", createdBy:user.name,
      };
      const created = await add(rec);
      notify("Fiche "+created.inspectionNum+" créée — envoi des photos sur le Drive…");

      // 2) Archiver photos + PDF sur le Drive, puis enregistrer les liens.
      try {
        const html = inspectionHTML({ ...created, createdBy:user.name }, photos);
        const res = await archiveInspection({
          inspectionNum: created.inspectionNum, plate: created.plate, entryDate: created.entryDate,
          html, photos: photos.map(p => ({ label: p.label || "photo", dataUrl: p.dataUrl })),
        });
        const stored = (res.files||[]).filter(x=>x.url).map(x => ({ label:x.label||"", url:x.url, fileId:x.id }));
        await edit(created.id, { photos:stored, driveUrl:res.folderUrl||"", reportUrl:res.reportUrl||"" });
        notify("Tour du véhicule archivé sur le Drive ✔");
      } catch(e) {
        console.error("[Réception] Drive", e);
        notify("Fiche enregistrée, mais archivage Drive échoué : "+(e.message||e), "error");
      }
      sel(created.id); nav("detail");
    } catch(e) {
      console.error(e); notify("Erreur lors de l'enregistrement : "+(e.message||e), "error");
    } finally { sbusy(false); }
  };

  // Étape 1 : choix de l'OR (ou saisie manuelle).
  if(!linked) return (
    <div style={{ maxWidth:760, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ color:C.txt, fontSize:20, fontWeight:700, margin:0 }}>🚗 🚛 Nouvelle réception d'un véhicule</h2>
        <Btn ghost sm onClick={() => nav("list")}>← Retour</Btn>
      </div>
      <Crd>
        <SecTitle>🔧 Relier à un ordre de réparation</SecTitle>
        <p style={{ color:C.sub, fontSize:13, marginBottom:12 }}>Choisis l'OR du véhicule qui arrive (pré-remplit les informations), ou poursuis sans OR.</p>
        <OrderPicker orders={orders} loading={ordersLoading} error={ordersError} onReload={reloadOrders} onPick={pickOrder} onSkip={() => setLinked(true)}/>
      </Crd>
    </div>
  );

  // Étape 2 : le tour complet.
  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ color:C.txt, fontSize:20, fontWeight:700, margin:0 }}>🚗 Tour du véhicule</h2>
        <Btn ghost sm onClick={() => nav("list")}>← Retour</Btn>
      </div>
      <Crd>
        {f.orderNum
          ? <div style={{ marginBottom:8, padding:"8px 12px", background:C.field, borderRadius:8, fontSize:13, color:"#2f6fb0" }}>🔧 Relié à l'ordre de réparation <b>{f.orderNum}</b></div>
          : <div style={{ marginBottom:8 }}><Btn sm ghost onClick={() => setLinked(false)}>← Relier à un OR</Btn></div>}

        <SecTitle>🚙 Véhicule & client</SecTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
          <Inp label="Immatriculation *" value={f.plate} onChange={v=>set("plate",v)} placeholder="AB-123-CD"/>
          <Inp label="Marque" value={f.brand} onChange={v=>set("brand",v)} placeholder="Peugeot"/>
          <Inp label="Modèle" value={f.model} onChange={v=>set("model",v)} placeholder="308 SW"/>
          <Inp label="Kilométrage relevé" value={f.km} onChange={v=>set("km",v)} placeholder="45000"/>
          <Sel label="Niveau de carburant" value={f.fuel} onChange={v=>set("fuel",v)} opts={["",...FUEL_STATE].map(x=>({v:x,l:x||"— Choisir —"}))}/>
          <Inp label="Nom du client" value={f.clientName} onChange={v=>set("clientName",v)} placeholder="M. Dupont"/>
          <Inp label="Téléphone" value={f.clientPhone} onChange={v=>set("clientPhone",v)} placeholder="06 12 34 56 78"/>
          <Inp label="Date d'entrée" value={f.entryDate} onChange={v=>set("entryDate",v)} type="date"/>
          <Inp label="Heure d'entrée" value={f.entryTime} onChange={v=>set("entryTime",v)} type="time"/>
        </div>

        <SecTitle>📷 Photos de la carrosserie</SecTitle>
        <PhotoCapture photos={photos} setPhotos={setPhotos} notify={notify}/>

        <SecTitle>🛞 Pneumatiques</SecTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
          {TIRE_POS.map(t => (
            <div key={t.k} style={{ background:C.field, borderRadius:8, padding:12, border:"1px solid "+C.bdr }}>
              <div style={{ color:C.txt, fontSize:13, fontWeight:600, marginBottom:8 }}>{t.l}</div>
              <ChipSelect value={f.tires[t.k].state} opts={TIRE_STATE} onChange={v=>setTire(t.k,"state",v)}/>
              <div style={{ marginTop:8 }}>
                <Inp label="Profondeur (mm)" value={f.tires[t.k].depth} onChange={v=>setTire(t.k,"depth",v)} placeholder="ex. 4.5"/>
              </div>
            </div>
          ))}
        </div>

        <SecTitle>🪟 Vitrage</SecTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
          <div style={{ background:C.field, borderRadius:8, padding:12, border:"1px solid "+C.bdr }}>
            <div style={{ color:C.txt, fontSize:13, fontWeight:600, marginBottom:8 }}>Pare-brise</div>
            <ChipSelect value={f.windshield.state} opts={GLASS_STATE} onChange={v=>set("windshield",{...f.windshield,state:v})}/>
            <div style={{ marginTop:8 }}><Inp label="Précision (localisation impact…)" value={f.windshield.note} onChange={v=>set("windshield",{...f.windshield,note:v})}/></div>
          </div>
          <div style={{ background:C.field, borderRadius:8, padding:12, border:"1px solid "+C.bdr }}>
            <div style={{ color:C.txt, fontSize:13, fontWeight:600, marginBottom:8 }}>Autres vitres</div>
            <ChipSelect value={f.windows.state} opts={GLASS_STATE} onChange={v=>set("windows",{...f.windows,state:v})}/>
            <div style={{ marginTop:8 }}><Inp label="Précision" value={f.windows.note} onChange={v=>set("windows",{...f.windows,note:v})}/></div>
          </div>
        </div>

        <SecTitle>🌧 Essuie-glaces</SecTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
          <div><label style={{ fontSize:12, color:C.sub, fontWeight:500, display:"block", marginBottom:8 }}>Avant</label>
            <ChipSelect value={f.wipers.front} opts={WIPER_STATE} onChange={v=>set("wipers",{...f.wipers,front:v})}/></div>
          <div><label style={{ fontSize:12, color:C.sub, fontWeight:500, display:"block", marginBottom:8 }}>Arrière</label>
            <ChipSelect value={f.wipers.rear} opts={WIPER_STATE} onChange={v=>set("wipers",{...f.wipers,rear:v})}/></div>
        </div>

        <SecTitle>🧽 Propreté intérieure</SecTitle>
        <ChipSelect value={f.interior.cleanliness} opts={CLEAN_STATE} onChange={v=>set("interior",{...f.interior,cleanliness:v})}/>
        <div style={{ marginTop:10 }}><Inp label="Remarque (taches, odeurs, objets de valeur…)" value={f.interior.note} onChange={v=>set("interior",{...f.interior,note:v})}/></div>

        <SecTitle>⚠️ Dégâts / défauts préexistants</SecTitle>
        <p style={{ color:C.sub, fontSize:12, marginBottom:10 }}>Noter tout ce qui existe déjà (rayures, chocs…) pour ne pas se le voir reprocher à la restitution.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {f.bodyDamages.map(d => (
            <div key={d.id} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.4fr auto", gap:8, alignItems:"end", background:C.field, padding:10, borderRadius:8, border:"1px solid "+C.bdr }}>
              <Sel label="Zone" value={d.zone} onChange={v=>setDamage(d.id,"zone",v)} opts={BODY_ZONES.map(z=>({v:z,l:z}))}/>
              <Sel label="Type" value={d.type} onChange={v=>setDamage(d.id,"type",v)} opts={DAMAGE_TYPE.map(z=>({v:z,l:z}))}/>
              <Inp label="Détail" value={d.note} onChange={v=>setDamage(d.id,"note",v)} placeholder="ex. rayure 10 cm"/>
              <Btn sm danger onClick={()=>delDamage(d.id)}>×</Btn>
            </div>
          ))}
        </div>
        <div style={{ marginTop:10 }}><Btn sm ghost onClick={addDamage}>+ Ajouter un défaut</Btn></div>

        <SecTitle>📝 Observations générales</SecTitle>
        <TA value={f.generalNote} onChange={v=>set("generalNote",v)} placeholder="Tout autre point à signaler…" rows={3}/>

        <SecTitle>✍ Signature du client</SecTitle>
        <div style={{ background:C.field, borderRadius:10, padding:16, border:"1px solid "+C.bdr }}>
          <p style={{ color:C.sub, fontSize:12, marginBottom:12 }}>Le client reconnaît l'état du véhicule constaté à l'entrée (photos et défauts notés ci-dessus).</p>
          {f.signature ? (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                <span style={{ color:"#2f9e6b", fontSize:13, fontWeight:600 }}>✅ Signature enregistrée</span>
                <Btn sm ghost onClick={()=>set("signature","")}>Resigner</Btn>
              </div>
              <img src={f.signature} alt="Signature" style={{ maxHeight:80, background:"#fff", borderRadius:6, padding:4, display:"block" }}/>
            </div>
          ) : <SigPad onSave={v=>set("signature",v)} init={f.signature}/>}
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20, paddingTop:16, borderTop:"1px solid "+C.bdr }}>
          <Btn ghost onClick={() => nav("list")}>Annuler</Btn>
          <Btn onClick={submit} disabled={busy}>{busy?"Enregistrement…":"✅ Enregistrer & archiver"}</Btn>
        </div>
      </Crd>
    </div>
  );
}

// ── Détail d'un état des lieux ─────────────────────────────────────────────────
function DetailView({ inspId, inspections, edit, remove, isAdmin, nav, notify }) {
  const [signing, setSigning] = useState(false);
  const i = inspections.find(x => x.id === inspId);
  if(!i) return <p style={{ color:C.txt }}>Fiche introuvable.</p>;
  // Enregistre la signature du client depuis la fiche, puis met à jour le PDF
  // signé sur le Drive (best-effort, non bloquant).
  const saveSig = async (dataUrl) => {
    if(!dataUrl) return;            // « Effacer » : on ne ferme pas, on laisse re-signer
    try {
      await edit(i.id, { signature: dataUrl });
      setSigning(false);
      notify("Signature du client enregistrée ✔");
      try {
        const html = inspectionHTML({ ...i, signature: dataUrl }, []);
        await archiveInspection({ inspectionNum: i.inspectionNum, plate: i.plate, entryDate: i.entryDate, html, photos: [] });
      } catch(e) { console.warn("[Réception] re-archivage PDF signé", e); }
    } catch(e) { notify("Erreur : " + (e.message||e), "error"); }
  };
  const row = (lb,vl,col) => (
    <div><div style={{ color:C.mut, fontSize:11, marginBottom:2 }}>{lb}</div>
      <div style={{ color:col||C.txt, fontWeight:500, wordBreak:"break-word" }}>{vl||"—"}</div></div>
  );
  const del=async()=>{ if(!window.confirm("Supprimer définitivement la fiche "+i.inspectionNum+" ?"))return;
    try{ await remove(i.id); notify("Fiche supprimée"); nav("list"); }catch(e){ notify("Erreur : "+(e.message||e),"error"); } };
  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <Btn ghost sm onClick={() => nav("list")} style={{ marginBottom:8 }}>← Retour</Btn>
          <h2 style={{ color:C.txt, fontSize:20, fontWeight:700, margin:0 }}>{i.inspectionNum} – {i.plate}</h2>
          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
            <Badge status={i.status}/>
            <span style={{ fontSize:13, color:C.sub }}>{i.brand} {i.model}</span>
            {i.orderNum && <span style={{ fontSize:12, color:"#2f6fb0" }}>🔧 OR {i.orderNum}</span>}
            {i.signature && <span style={{ fontSize:12, color:"#2f9e6b" }}>✍ Signé</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {/* Réimpression : les photos restent sur le Drive (on n'a plus le base64), on ne les ré-embarque pas. */}
          <Btn sm ghost onClick={()=>printInspection(i, [])} style={{ borderColor:C.acc, color:C.acc2 }}>📄 PDF</Btn>
          {i.driveUrl && <a href={i.driveUrl} target="_blank" rel="noreferrer"><Btn sm ghost style={{ borderColor:"#2f9e6b", color:"#2f9e6b" }}>📁 Dossier Drive</Btn></a>}
          {isAdmin && <Btn sm danger onClick={del}>Supprimer</Btn>}
        </div>
      </div>

      <Crd style={{ marginBottom:12 }}>
        <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:10 }}>Véhicule & client</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:12, fontSize:13 }}>
          {row("Entrée", fD(i.entryDate)+" "+(i.entryTime||""))}
          {row("Kilométrage", i.km?Number(i.km).toLocaleString("fr-FR")+" km":"")}
          {row("Carburant", i.fuel)}
          {row("Client", i.clientName)}
          {row("Téléphone", i.clientPhone)}
          {row("Réceptionné par", i.createdBy)}
        </div>
      </Crd>

      <Crd style={{ marginBottom:12 }}>
        <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:10 }}>🛞 Pneumatiques</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:12, fontSize:13 }}>
          {TIRE_POS.map(t => { const v=i.tires[t.k]||{}; return row(t.l, (v.state||"—")+(v.depth?" · "+v.depth+" mm":""), stateColor(v.state||"")); })}
        </div>
      </Crd>

      <Crd style={{ marginBottom:12 }}>
        <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:10 }}>🪟 Vitrage, essuie-glaces & propreté</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, fontSize:13 }}>
          {row("Pare-brise", (i.windshield.state||"—")+(i.windshield.note?" — "+i.windshield.note:""), stateColor(i.windshield.state||""))}
          {row("Autres vitres", (i.windows.state||"—")+(i.windows.note?" — "+i.windows.note:""), stateColor(i.windows.state||""))}
          {row("Essuie-glaces avant", i.wipers.front, stateColor(i.wipers.front||""))}
          {row("Essuie-glace arrière", i.wipers.rear, stateColor(i.wipers.rear||""))}
          {row("Propreté intérieure", i.interior.cleanliness, stateColor(i.interior.cleanliness||""))}
          {i.interior.note && row("Remarque intérieur", i.interior.note)}
        </div>
      </Crd>

      {i.bodyDamages.length>0 && (
        <Crd style={{ marginBottom:12 }}>
          <h3 style={{ color:"#c2871a", fontSize:13, fontWeight:700, marginBottom:10 }}>⚠️ Dégâts préexistants relevés</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {i.bodyDamages.map(d => (
              <div key={d.id} style={{ display:"flex", gap:10, fontSize:13, padding:"6px 0", borderBottom:"1px solid "+C.bdr }}>
                <span style={{ color:C.txt, fontWeight:600, minWidth:140 }}>{d.zone}</span>
                <span style={{ color:"#c2871a" }}>{d.type}</span>
                <span style={{ color:C.sub }}>{d.note}</span>
              </div>
            ))}
          </div>
        </Crd>
      )}

      {i.generalNote && (
        <Crd style={{ marginBottom:12 }}>
          <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:8 }}>📝 Observations</h3>
          <p style={{ color:C.txt, fontSize:13, whiteSpace:"pre-wrap", margin:0 }}>{i.generalNote}</p>
        </Crd>
      )}

      {i.photos.length>0 && (
        <Crd style={{ marginBottom:12 }}>
          <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:10 }}>📷 Photos ({i.photos.length}) — sur le Drive</h3>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {i.photos.map((p,idx) => (
              <a key={idx} href={p.url} target="_blank" rel="noreferrer"
                style={{ fontSize:12, color:C.acc2, background:C.field, border:"1px solid "+C.bdr, borderRadius:7, padding:"6px 12px", textDecoration:"none" }}>
                🖼 {p.label || ("Photo "+(idx+1))}
              </a>
            ))}
          </div>
        </Crd>
      )}

      <Crd>
        <h3 style={{ color:C.acc2, fontSize:13, fontWeight:700, marginBottom:10 }}>✍ Accord du client sur l'état constaté</h3>
        {signing ? (
          <div style={{ background:C.field, borderRadius:10, padding:16, border:"1px solid "+C.bdr }}>
            <p style={{ color:C.sub, fontSize:12, marginBottom:12 }}>Faites signer le client ci-dessous, puis appuyez sur « Valider la signature ».</p>
            <SigPad onSave={saveSig} init={i.signature}/>
            <div style={{ marginTop:8 }}><Btn sm ghost onClick={()=>setSigning(false)}>Annuler</Btn></div>
          </div>
        ) : i.signature ? (
          <div>
            <img src={i.signature} alt="Signature client" style={{ maxWidth:380, width:"100%", background:"#fff", borderRadius:8, padding:6, display:"block", border:"1px solid "+C.bdr }}/>
            <div style={{ color:C.mut, fontSize:12, marginTop:8 }}>Signataire : {i.clientName||"—"}</div>
            <div style={{ marginTop:10 }}><Btn sm ghost onClick={()=>setSigning(true)}>✍ Refaire la signature</Btn></div>
          </div>
        ) : (
          <div>
            <p style={{ color:C.sub, fontSize:13, marginBottom:12 }}>Aucune signature pour cette fiche. Le client peut signer maintenant.</p>
            <Btn onClick={()=>setSigning(true)}>✍ Faire signer le client</Btn>
          </div>
        )}
      </Crd>
    </div>
  );
}

// ── Application authentifiée ─────────────────────────────────────────────────
// Montée UNIQUEMENT après connexion (cf. ReceptionApp). C'est essentiel : ainsi
// le chargement des OR et des fiches s'exécute avec une session valide. Avant ce
// découpage, les données étaient lues au tout premier rendu — donc en anonyme sur
// un appareil où l'on se connecte « à frais » (téléphone) → listes vides.
function AuthedApp({ user, notify, isDesktop, onLogout }) {
  const { inspections, add, edit, remove } = useInspections();
  const { items: orders, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useCollection(listOrdersLite, "orders", DEMO_ORDERS);
  const [page,sp]=useState("list");      // démarre toujours sur « États des lieux »
  const [selId,ssi]=useState(null);
  const nav=(p)=>{ sp(p); };
  const isAdmin = user.role === "admin";
  const rs = ROLE_STYLE[user.role] || { bg:"#eef2ef", cl:C.sub };

  const renderPage=()=>{
    if(page==="new")    return <NewInspection orders={orders} ordersLoading={ordersLoading} ordersError={ordersError} reloadOrders={reloadOrders} add={add} edit={edit} user={user} nav={nav} sel={ssi} notify={notify}/>;
    if(page==="detail") return selId ? <DetailView inspId={selId} inspections={inspections} edit={edit} remove={remove} isAdmin={isAdmin} nav={nav} notify={notify}/> : null;
    return <ListView inspections={inspections} nav={nav} sel={ssi}/>;
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:C.bg, color:C.txt }}>
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"12px 16px", background:C.hdr, borderBottom:"1px solid "+C.bdr, position:"sticky", top:0, zIndex:30 }}>
        {/* Titre cliquable : revient aux états des lieux. */}
        <button onClick={()=>nav("list")} style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0, minWidth:0 }}>
          <div style={{ color:C.acc2, fontWeight:700, fontSize:15 }}>Réception Atelier Véhicule</div>
          <div style={{ color:C.mut, fontSize:11 }}>Lycée Gallieni - BTS MV</div>
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {isDesktop && <span style={{ color:C.sub, fontSize:13 }}>{user.name}</span>}
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:999, fontWeight:600, background:rs.bg, color:rs.cl }}>{roleLabel(user.role)}</span>
          <button onClick={onLogout} title="Déconnexion" style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, border:"1px solid "+C.bdr, cursor:"pointer", background:"transparent", color:C.sub, fontSize:13 }}>
            🚪{isDesktop ? " Déconnexion" : ""}
          </button>
        </div>
      </header>
      <main style={{ flex:1, padding:16, overflowY:"auto" }}>
        <div style={{ maxWidth:1000, margin:"0 auto" }}>{renderPage()}</div>
      </main>
    </div>
  );
}

// ── Racine : gère la session ; ne monte AuthedApp (et donc le chargement des
//    données) qu'une fois l'utilisateur connecté. Le toast est rendu ici pour
//    couvrir aussi l'écran de réinitialisation de mot de passe. ───────────────
export default function ReceptionApp() {
  const { user, ready, recovery, clearRecovery } = useSession();
  const [notif,sn]=useState(null);
  const isDesktop=useDesktop();
  const notify=useCallback((msg,type)=>{ sn({msg,type:type||"success"}); setTimeout(()=>sn(null),3800); },[]);
  const logout=async()=>{ await supabase.auth.signOut(); };

  const toast = notif && (
    <div style={{ position:"fixed", top:16, right:16, zIndex:100, padding:"12px 18px", borderRadius:10, background:notif.type==="success"?"#e3f3ea":"#fdecea", border:"1px solid "+(notif.type==="success"?"#3f8059":"#d2564f"), color:notif.type==="success"?"#1f3d2b":"#8a241d", fontSize:14, fontWeight:500, boxShadow:"0 8px 22px rgba(31,61,43,.15)", maxWidth:340 }}>
      {notif.type==="success"?"✅":"❌"} {notif.msg}
    </div>
  );

  if(!ready) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, color:C.sub }}>Chargement…</div>;
  if(recovery) return <>{toast}<ResetPasswordView notify={notify} onDone={async()=>{ clearRecovery(); await supabase.auth.signOut(); }}/></>;
  if(!user) return <>{toast}<LoginView/></>;
  return <>{toast}<AuthedApp user={user} notify={notify} isDesktop={isDesktop} onLogout={logout}/></>;
}
