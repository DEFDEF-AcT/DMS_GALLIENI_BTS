-- ============================================================================
-- Réception / Tour du véhicule — Lycée Gallieni (application complémentaire DMS)
-- Schéma Supabase : à exécuter UNE SEULE FOIS dans le SQL Editor du MÊME projet
-- que l'application DMS principale (dms-gallieni).
-- ----------------------------------------------------------------------------
-- Pré-requis : les tables `profiles` et `orders` ainsi que les fonctions
-- is_admin() / is_staff() / current_name() existent déjà (schéma du DMS).
-- Ce fichier n'ajoute QUE la table `inspections` (état des lieux d'entrée).
-- ============================================================================

-- 1. TABLE -------------------------------------------------------------------
-- Un « état des lieux » (fiche de réception contradictoire) constate l'état du
-- véhicule à son ARRIVÉE à l'atelier, pour se prémunir d'éventuelles réclamations.
-- Les photos ne sont PAS stockées en base : elles partent sur Google Drive et
-- seules leurs URL sont conservées dans la colonne jsonb `photos`.
create table if not exists inspections (
  id              uuid primary key default gen_random_uuid(),
  inspection_num  text unique,                       -- généré par trigger (REC-AAAA-XXXX)
  -- Lien optionnel vers un ordre de réparation existant (on conserve aussi
  -- order_num en clair pour l'affichage même si l'OR est supprimé plus tard).
  order_id        uuid references orders(id) on delete set null,
  order_num       text default '',
  -- Véhicule (pré-rempli depuis l'OR si lié, sinon saisi à la main)
  plate           text not null,
  brand           text default '',
  model           text default '',
  year            text default '',                   -- année (importée de l'OR)
  km              text default '',                   -- kilométrage relevé à l'entrée
  fuel            text default '',                   -- niveau de carburant (jauge)
  client_name     text default '',
  client_phone    text default '',
  entry_date      date,
  entry_time      text default '',
  -- État relevé lors du tour du véhicule (structures libres en jsonb)
  tires           jsonb default '{}'::jsonb,          -- {fl:{state,depth},fr,rl,rr}
  windshield      jsonb default '{}'::jsonb,          -- {state, note}
  windows         jsonb default '{}'::jsonb,          -- {state, note}
  wipers          jsonb default '{}'::jsonb,          -- {front, rear}
  interior        jsonb default '{}'::jsonb,          -- {cleanliness, note}
  body_damages    jsonb default '[]'::jsonb,          -- [{id, zone, type, note}]
  photos          jsonb default '[]'::jsonb,          -- [{label, url, fileId}]
  general_note    text default '',
  signature       text default '',                    -- dataURL PNG : accord du client sur l'état constaté
  drive_url       text default '',                    -- lien du dossier Drive du véhicule/date
  report_url      text default '',                    -- lien du PDF d'état des lieux sur le Drive
  status          text not null default 'brouillon'
                  check (status in ('brouillon','finalise')),
  created_by      text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_inspections_order on inspections(order_id);
create index if not exists idx_inspections_plate on inspections(plate);

-- 2. NUMÉROTATION REC-AAAA-XXXX (atomique, anti-collision multi-postes) -------

create table if not exists inspection_counters (
  year int primary key,
  last int not null default 0
);

create or replace function set_inspection_num() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if new.inspection_num is null then
    insert into public.inspection_counters(year, last) values (y, 1)
      on conflict (year) do update set last = public.inspection_counters.last + 1
      returning last into n;
    new.inspection_num := 'REC-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inspection_num on inspections;
create trigger trg_inspection_num before insert on inspections
  for each row execute function set_inspection_num();

-- updated_at auto (réutilise touch_updated_at() défini par le schéma du DMS ;
-- redéfini ici par sécurité si ce fichier est exécuté seul).
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_inspections_touch on inspections;
create trigger trg_inspections_touch before update on inspections
  for each row execute function touch_updated_at();

-- 3. RLS ---------------------------------------------------------------------
-- Lecture : tout utilisateur connecté (staff + élèves « Étudiant Technicien »).
-- Création / modification : tout utilisateur connecté (la réception peut être
-- réalisée par un élève dans le cadre pédagogique). Suppression : admin.

alter table inspections enable row level security;

drop policy if exists read_inspections on inspections;
drop policy if exists ins_inspections  on inspections;
drop policy if exists upd_inspections  on inspections;
drop policy if exists del_inspections  on inspections;

create policy read_inspections on inspections for select using (auth.role() = 'authenticated');
create policy ins_inspections  on inspections for insert with check (auth.role() = 'authenticated');
create policy upd_inspections  on inspections for update using (auth.role() = 'authenticated');
create policy del_inspections  on inspections for delete using (is_admin());

-- 4. REALTIME : diffuser les changements aux postes connectés -----------------
alter publication supabase_realtime add table inspections;

-- ============================================================================
-- APRÈS EXÉCUTION : déployer l'Edge Function « archive-inspection » et mettre à
-- jour le script Google Apps Script (voir google-apps-script/Code.gs et README).
-- ============================================================================
