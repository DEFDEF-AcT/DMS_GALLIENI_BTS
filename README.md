# Réception – Tour du véhicule · Atelier BTS MV · Lycée Gallieni

Application **complémentaire** du [DMS Gallieni](../dms-gallieni). Elle permet au
réceptionnaire de réaliser le **tour d'un véhicule client** à son arrivée à l'atelier
et de constituer un **état des lieux d'entrée** (fiche contradictoire) afin de se
prémunir des réclamations :

- 📷 **Photos de la carrosserie** (appareil photo du téléphone/tablette)
- 🛞 **État des pneumatiques** (4 roues : état + profondeur mm)
- 📍 **Kilométrage** relevé et niveau de carburant
- 🪟 **Pare-brise et vitres** (RAS / impact / fissure…)
- 🌧 **Essuie-glaces** (avant / arrière)
- 🧽 **Propreté intérieure**
- ⚠️ **Dégâts préexistants** (rayures, chocs…) + observations libres
- ✍ **Signature du client** reconnaissant l'état constaté

Chaque fiche peut être **reliée à un ordre de réparation** existant du DMS, génère un
**PDF** et archive automatiquement **photos + PDF sur Google Drive**, rangés par
véhicule puis par date d'entrée.

- **Frontend** : React 19 + Vite (statique, GitHub Pages)
- **Backend** : **même** projet Supabase que le DMS (comptes + ordres partagés)
- **Photos** : Google Drive, via Edge Function + Apps Script (passerelle existante étendue)

---

## 1. Supabase (une seule fois, sur le projet du DMS)

1. **SQL Editor** → coller et exécuter [`supabase/inspections-schema.sql`](supabase/inspections-schema.sql)
   (table `inspections`, numérotation `REC-AAAA-XXXX`, RLS, realtime).
   > Pré-requis : le schéma du DMS (`profiles`, `orders`, `is_admin()`, `is_staff()`) doit déjà être en place.
2. **Edge Functions → Create a new function**, nom EXACT **`archive-inspection`**,
   coller [`supabase/functions/archive-inspection/index.ts`](supabase/functions/archive-inspection/index.ts), *Deploy*.
   Cette fonction réutilise les secrets `APPS_SCRIPT_URL` et `APPS_SCRIPT_SECRET`
   déjà définis pour `archive-order` (aucun nouveau secret à créer).

## 2. Google Apps Script (mise à jour du script existant)

Le script du DMS est **étendu** pour gérer aussi les photos d'état des lieux.

1. https://script.google.com → ouvrir le **projet existant** (celui déjà déployé).
2. Remplacer tout le code par [`google-apps-script/Code.gs`](google-apps-script/Code.gs),
   en **conservant** la valeur de `SECRET` (= `APPS_SCRIPT_SECRET`) et `ROOT_FOLDER_NAME`.
3. **Déployer → Gérer les déploiements → (crayon) → Nouvelle version → Déployer**.
   L'URL `/exec` reste inchangée ; rien à modifier côté Supabase.

> Les photos sont rangées dans :
> `Mon Drive / <ROOT_FOLDER_NAME> / Réceptions / <immatriculation> / <date d'entrée> /`

## 3. Développement local

```bash
cp .env.example .env.local      # URL + clé anon du MÊME projet Supabase que le DMS
npm install
npm run dev
```

## 4. Déploiement (GitHub Pages)

1. Pousser le dépôt sur GitHub sous le nom **`DMS_GALLIENI_BTS`**
   (le `base` de [`vite.config.js`](vite.config.js) doit correspondre, casse comprise).
2. **Settings → Secrets and variables → Actions** → ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. **Settings → Pages** → *Source* : **GitHub Actions**.
4. Chaque `push` sur `main` build et déploie ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

URL finale : `https://<utilisateur>.github.io/DMS_GALLIENI_BTS/`

## Accès & droits

- **Mêmes comptes que le DMS** (staff par e-mail, élèves par identifiant « EtudiantN »).
- Tout utilisateur connecté peut créer/modifier une fiche (la réception peut être un
  exercice pédagogique réalisé par un élève) ; seule la **suppression** est réservée à l'administrateur.

## Scripts

| Commande          | Effet                          |
|-------------------|--------------------------------|
| `npm run dev`     | serveur de développement       |
| `npm run build`   | build de production (`dist/`)  |
| `npm run preview` | prévisualiser le build         |
| `npm run lint`    | ESLint                         |
