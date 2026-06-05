// Génère les icônes PNG de la PWA à partir d'une icône vectorielle simple.
// Usage ponctuel : `npm i --no-save sharp && node scripts/gen-icons.mjs`
// (sharp n'est PAS une dépendance du projet ; les PNG sont commités dans public/.)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#5d9e78"/>
  <rect x="176" y="180" width="160" height="92" rx="28" fill="#ffffff"/>
  <rect x="104" y="250" width="304" height="88" rx="34" fill="#ffffff"/>
  <circle cx="182" cy="346" r="40" fill="#1f3d2b"/>
  <circle cx="330" cy="346" r="40" fill="#1f3d2b"/>
  <circle cx="182" cy="346" r="17" fill="#ffffff"/>
  <circle cx="330" cy="346" r="17" fill="#ffffff"/>
</svg>`;

const buf = Buffer.from(svg);
mkdirSync("public", { recursive: true });

const out = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [file, size] of out) {
  await sharp(buf).resize(size, size).png().toFile(file);
  console.log("écrit", file, size + "px");
}
console.log("OK");
