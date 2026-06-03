import { createClient } from "@supabase/supabase-js";

// IMPORTANT : ces variables doivent pointer vers le MÊME projet Supabase que
// l'application DMS principale (dms-gallieni). C'est ce partage qui permet à la
// réception de réutiliser les comptes (auth/profiles) et de relier un état des
// lieux à un ordre de réparation existant (table « orders »).
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error(
    "[Réception] Variables d'environnement Supabase manquantes. " +
    "Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir .env.example)."
  );
}

export const supabase = createClient(url, anon);
