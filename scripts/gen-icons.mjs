// Génère les icônes PNG de la PWA à partir de l'illustration source (scripts/logo-source.webp).
// Usage ponctuel : `npm i --no-save sharp && node scripts/gen-icons.mjs`
// (sharp n'est PAS une dépendance du projet ; les PNG sont commités dans public/.)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "scripts/logo-source.webp";
const BG = { r: 255, g: 255, b: 255, alpha: 1 };   // fond blanc (comme l'illustration)

mkdirSync("public", { recursive: true });

// On rogne le fond blanc autour du dessin pour maximiser sa taille dans l'icône.
const trimmed = await sharp(SRC).flatten({ background: BG }).trim({ threshold: 15 }).png().toBuffer();

async function icon(file, size, innerRatio) {
  const inner = Math.round(size * innerRatio);
  const fitted = await sharp(trimmed)
    .resize({ width: inner, height: inner, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toFile(file);
  console.log("écrit", file, size + "px");
}

// Icônes « any » : marge légère. Maskable : marge de sécurité plus grande (zone masquée).
await icon("public/icon-192.png", 192, 0.9);
await icon("public/icon-512.png", 512, 0.9);
await icon("public/apple-touch-icon.png", 180, 0.9);
await icon("public/maskable-512.png", 512, 0.66);
console.log("OK");
