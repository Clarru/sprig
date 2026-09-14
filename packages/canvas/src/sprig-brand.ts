/** Shared artwork for the static app icon and every animated Sprig mascot. */
export const sprigBrand = {
  background: '#101013',
  foreground: '#ffffff',
  body: 'M22 48C22 37 30 32 41 33C49 29 63 35 66 46C70 58 59 69 46 70C30 72 19 62 22 48Z',
  leaves: [
    'M43 30C34 31 29 25 30 20C38 20 44 23 43 30Z',
    'M45 25C44 15 50 11 59 12C58 21 54 26 45 25Z',
  ],
  stem: 'M44 36C42 30 44 26 48 22',
  smile: 'M40 56.5C43 60 48.5 59 51 55',
} as const;

export function sprigIconSvg() {
  const b = sprigBrand;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88">
  <rect width="88" height="88" rx="22" fill="${b.background}"/>
  <g fill="${b.foreground}">
    <path d="${b.body}"/>
${b.leaves.map(d => `    <path d="${d}"/>`).join('\n')}
  </g>
  <path d="${b.stem}" fill="none" stroke="${b.foreground}" stroke-width="3.2" stroke-linecap="round"/>
  <g fill="${b.background}">
    <circle cx="35.5" cy="48" r="3"/>
    <circle cx="52.5" cy="46.5" r="3"/>
  </g>
  <path d="${b.smile}" fill="none" stroke="${b.background}" stroke-width="2.8" stroke-linecap="round"/>
</svg>\n`;
}
