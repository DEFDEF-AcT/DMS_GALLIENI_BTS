/**
 * DMS Gallieni — Passerelle Google Drive (VERSION FUSIONNÉE).
 *
 * Ce script gère DEUX usages, distingués par le champ `action` du corps POST :
 *   1. (défaut)        archivage d'un ORDRE DE RÉPARATION en PDF        → app DMS principale
 *   2. action:"reception"  archivage d'un ÉTAT DES LIEUX (photos + PDF) → app Réception
 *
 * ⚠️  Il REMPLACE le script de l'app DMS : recopiez-le dans le MÊME projet Apps
 *     Script déjà déployé, en conservant la valeur de SECRET. Un seul déploiement
 *     « Application Web » sert les deux applications.
 *
 * INSTALLATION / MISE À JOUR :
 *  1. https://script.google.com → ouvrir le projet existant (ou Nouveau projet).
 *  2. Coller ce code ; vérifier que SECRET == APPS_SCRIPT_SECRET (secret Supabase).
 *  3. Déployer → Gérer les déploiements → (crayon) → Nouvelle version → Déployer.
 *     (Pour un nouveau projet : Nouveau déploiement → Application Web,
 *      « Exécuter en tant que : Moi », « Qui a accès : Tout le monde ».)
 *  4. L'URL /exec est le secret Supabase APPS_SCRIPT_URL (inchangée si redéploiement).
 *
 * Arborescence Drive :
 *   Mon Drive / <ROOT_FOLDER_NAME> / <nom du client> / OR-AAAA-XXXX.pdf
 *   Mon Drive / <ROOT_FOLDER_NAME> / Réceptions / <immatriculation> / <date d'entrée> / ...
 */

var SECRET = 'A_REMPLACER_PAR_UN_SECRET_ALEATOIRE';
var ROOT_FOLDER_NAME = 'DMS Gallieni - Ordres de réparation';
var RECEPTION_FOLDER_NAME = 'Réceptions';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return out({ ok: false, error: 'secret invalide' });

    if (body.action === 'reception') return handleReception_(body);
    return handleOrder_(body);   // comportement par défaut : ordre de réparation
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// ── 1. Ordre de réparation → PDF (comportement historique, inchangé) ──────────
function handleOrder_(body) {
  if (!body.html || !body.orderNum) return out({ ok: false, error: 'html et orderNum requis' });

  var root = getFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  var sub = getFolder_(root, sanitize_(body.folder || 'Client sans nom'));
  var name = sanitize_(body.orderNum) + '.pdf';

  var pdf = Utilities.newBlob(body.html, 'text/html', name).getAs('application/pdf').setName(name);

  var existing = sub.getFilesByName(name);
  while (existing.hasNext()) existing.next().setTrashed(true);

  var file = sub.createFile(pdf);
  return out({ ok: true, fileId: file.getId(), url: file.getUrl() });
}

// ── 2. État des lieux → photos + PDF, classés par véhicule puis par date ──────
function handleReception_(body) {
  if (!body.inspectionNum || !body.plate) return out({ ok: false, error: 'inspectionNum et plate requis' });

  // <ROOT> / Réceptions / <immatriculation> / <date d'entrée>
  var root = getFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  var receptions = getFolder_(root, RECEPTION_FOLDER_NAME);
  var vehFolder = getFolder_(receptions, sanitize_(body.plate));
  var dateName = sanitize_(body.entryDate || new Date().toISOString().slice(0, 10));
  var dest = getFolder_(vehFolder, dateName);

  var result = { ok: true, folderUrl: dest.getUrl(), files: [], reportUrl: '' };

  // a) Photos (dataURL base64). On préfixe par le n° de fiche pour grouper plusieurs passages.
  var photos = body.photos || [];
  for (var i = 0; i < photos.length; i++) {
    var p = photos[i];
    var data = String(p.dataUrl || p.data || '');
    var comma = data.indexOf(',');
    var b64 = comma >= 0 ? data.substring(comma + 1) : data;
    var mime = p.mime || mimeFromDataUrl_(data) || 'image/jpeg';
    var ext = mime.indexOf('png') >= 0 ? 'png' : 'jpg';
    var label = sanitize_(p.label || ('photo-' + (i + 1)));
    var fname = sanitize_(body.inspectionNum) + '_' + label + '.' + ext;
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, fname);
      var f = dest.createFile(blob);
      result.files.push({ label: p.label || label, name: fname, id: f.getId(), url: f.getUrl() });
    } catch (errPhoto) {
      result.files.push({ label: p.label || label, error: String(errPhoto) });
    }
  }

  // b) Fiche PDF de l'état des lieux (écrase une version précédente du même n°).
  if (body.html) {
    var pdfName = sanitize_(body.inspectionNum) + '.pdf';
    var old = dest.getFilesByName(pdfName);
    while (old.hasNext()) old.next().setTrashed(true);
    var pdf = Utilities.newBlob(body.html, 'text/html', pdfName).getAs('application/pdf').setName(pdfName);
    var pdfFile = dest.createFile(pdf);
    result.reportUrl = pdfFile.getUrl();
  }

  return out(result);
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function getFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sanitize_(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '-').trim() || 'Sans nom';
}
function mimeFromDataUrl_(d) {
  var m = /^data:([^;,]+)[;,]/.exec(d);
  return m ? m[1] : '';
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
