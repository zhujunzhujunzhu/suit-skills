import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'apps', 'desktop', 'icons');

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="144" y1="112" x2="880" y2="928" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1f241b"/>
      <stop offset="0.46" stop-color="#121411"/>
      <stop offset="1" stop-color="#0d0f0c"/>
    </linearGradient>
    <radialGradient id="topGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(286 220) rotate(42) scale(660 520)">
      <stop offset="0" stop-color="#b7e05a" stop-opacity="0.32"/>
      <stop offset="0.55" stop-color="#b7e05a" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#b7e05a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="goldGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(746 758) rotate(-132) scale(540 420)">
      <stop offset="0" stop-color="#efbd67" stop-opacity="0.24"/>
      <stop offset="0.62" stop-color="#efbd67" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#efbd67" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ribbon" x1="286" y1="230" x2="744" y2="816" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d5f58a"/>
      <stop offset="0.36" stop-color="#b7e05a"/>
      <stop offset="0.68" stop-color="#7ea32b"/>
      <stop offset="1" stop-color="#efbd67"/>
    </linearGradient>
    <linearGradient id="ribbonShade" x1="302" y1="188" x2="724" y2="830" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.56"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="edge" x1="512" y1="72" x2="512" y2="952" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.2"/>
      <stop offset="0.52" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.24"/>
    </linearGradient>
    <filter id="tileShadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#020712" flood-opacity="0.44"/>
      <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#061020" flood-opacity="0.38"/>
    </filter>
    <filter id="markShadow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#020814" flood-opacity="0.54"/>
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#020814" flood-opacity="0.36"/>
    </filter>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.72  0 0 0 0 0.88  0 0 0 0 0.35  0 0 0 0.42 0"/>
      <feBlend in2="SourceGraphic" mode="screen"/>
    </filter>
    <clipPath id="squircle">
      <rect x="64" y="64" width="896" height="896" rx="220"/>
    </clipPath>
  </defs>

  <g filter="url(#tileShadow)">
    <rect x="64" y="64" width="896" height="896" rx="220" fill="url(#bg)"/>
    <rect x="64" y="64" width="896" height="896" rx="220" fill="url(#topGlow)"/>
    <rect x="64" y="64" width="896" height="896" rx="220" fill="url(#goldGlow)"/>
    <rect x="67" y="67" width="890" height="890" rx="217" fill="none" stroke="url(#edge)" stroke-width="6"/>
  </g>

  <g clip-path="url(#squircle)" opacity="0.34">
    <path d="M196 276H824M144 420H880M144 604H880M196 748H824" stroke="#b7e05a" stroke-width="4" stroke-linecap="round" opacity="0.14"/>
    <path d="M276 176V846M432 122V902M592 122V902M748 176V846" stroke="#ece9dc" stroke-width="3" stroke-linecap="round" opacity="0.06"/>
    <circle cx="214" cy="420" r="10" fill="#b7e05a" opacity="0.34"/>
    <circle cx="812" cy="604" r="10" fill="#efbd67" opacity="0.3"/>
  </g>

  <g filter="url(#markShadow)">
    <path d="M692 258C586 205 390 218 337 329C282 443 416 487 548 510C689 535 756 609 696 710C626 827 430 832 318 758"
      fill="none" stroke="#161d0b" stroke-width="184" stroke-linecap="round" stroke-linejoin="round" opacity="0.62"/>
    <path d="M692 258C586 205 390 218 337 329C282 443 416 487 548 510C689 535 756 609 696 710C626 827 430 832 318 758"
      fill="none" stroke="url(#ribbon)" stroke-width="138" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M692 258C586 205 390 218 337 329C282 443 416 487 548 510C689 535 756 609 696 710C626 827 430 832 318 758"
      fill="none" stroke="url(#ribbonShade)" stroke-width="82" stroke-linecap="round" stroke-linejoin="round" opacity="0.72"/>
  </g>

  <g filter="url(#softGlow)">
    <circle cx="338" cy="330" r="35" fill="#1a1d18" stroke="#ece9dc" stroke-width="14"/>
    <circle cx="548" cy="510" r="30" fill="#1a1d18" stroke="#ece9dc" stroke-width="12"/>
    <circle cx="696" cy="710" r="34" fill="#1a1d18" stroke="#f3d99d" stroke-width="13"/>
  </g>

  <g opacity="0.82">
    <path d="M490 483L538 510L490 537" fill="none" stroke="#161d0b" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M574 548H638" stroke="#161d0b" stroke-width="20" stroke-linecap="round"/>
  </g>
</svg>`;

await mkdir(iconsDir, { recursive: true });
await writeFile(path.join(root, 'app-icon.svg'), svg, 'utf8');

await sharp(Buffer.from(svg))
  .resize(1024, 1024, { fit: 'contain' })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(path.join(root, 'app-icon.png'));

await sharp(Buffer.from(svg))
  .resize(512, 512, { fit: 'contain' })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(path.join(iconsDir, 'icon.png'));

console.log('Generated app-icon.svg, app-icon.png, and apps/desktop/icons/icon.png');
