/** Convert a hex color (#rrggbb) to the HSL string format used by CSS vars ("H S% L%") */
export function hexToHsl(hex: string): string | null {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Convert HSL string ("H S% L%") back to a hex color */
export function hslStringToHex(hsl: string): string {
  const parts = hsl.replace(/%/g, "").trim().split(/\s+/);
  if (parts.length !== 3) return "#c06070";
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to255 = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to255(hue2rgb(h + 1 / 3))}${to255(hue2rgb(h))}${to255(hue2rgb(h - 1 / 3))}`;
}

/** Apply a hex color as the CSS --primary variable (and related sidebar var) */
export function applyBrandColor(hex: string) {
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  document.documentElement.style.setProperty("--primary", hsl);
  document.documentElement.style.setProperty("--sidebar-primary", hsl);
  document.documentElement.style.setProperty("--ring", hsl);
  document.documentElement.style.setProperty("--chart-1", hsl);
}

/** Read brand color from localStorage and apply it to the document */
export function initBrandColor() {
  const stored = localStorage.getItem("pos_brand_color");
  if (stored) applyBrandColor(stored);
}
