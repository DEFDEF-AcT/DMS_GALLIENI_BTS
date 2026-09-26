// Génère les icônes PNG de la PWA à partir du logo source (scripts/logo-source.png).
// Le logo est un cercle bleu marine sur fond clair : on isole le cercle (masque)
// puis on le pose sur un carré bleu marine plein (pas de coins clairs).
// Usage ponctuel : `npm i --no-save sharp && node scripts/gen-icons.mjs`
// (sharp n'est PAS une dépendance du projet ; les PNG sont commités dans public/.)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "scripts/logo-source.png";
const NAVY = { r: 39, g: 63, b: 118, alpha: 1 };   // #273f76 (fond du cercle)

mkdirSync("public", { recursive: true });

const meta = await sharp(SRC).metadata();
const W = meta.width, H = meta.height, R = Math.min(W, H) / 2;
// Masque circulaire (un poil plus petit que le rayon pour couper le liseré clair).
const mask = Buffer.from(
  `<svg width="${W}" height="${H}"><circle cx="${W / 2}" cy="${H / 2}" r="${R * 0.985}" fill="#fff"/></svg>`
);
// Cercle isolé, transparent tout autour.
const circled = await sharp(SRC).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

async function icon(file, size, innerRatio) {
  const inner = Math.round(size * innerRatio);
  const fitted = await sharp(circled).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toFile(file);
  console.log("écrit", file, size + "px");
}

// Icônes « any » : le cercle remplit le carré. Maskable : marge de sécurité (zone masquée).
await icon("public/icon-192.png", 192, 1.0);
await icon("public/icon-512.png", 512, 1.0);
await icon("public/apple-touch-icon.png", 180, 1.0);
await icon("public/maskable-512.png", 512, 0.84);

// Logo rond transparent affiché DANS l'app (écran de connexion, sur carte blanche).
await sharp(circled).resize({ width: 640, fit: "inside" }).png().toFile("public/logo.png");
console.log("écrit public/logo.png");
console.log("OK");
