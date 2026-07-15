import { create } from "zustand";
import { applyBrandColor } from "@/lib/brand-color";

/**
 * Single source of truth for the store's logo + brand color across the app
 * (login screen, sidebar, everywhere). It initializes instantly from
 * localStorage (so there's no flash of default branding while the network
 * request is in flight), then reconciles with the database via the public
 * `/api/settings/public` endpoint — which requires no auth, so it works on
 * the login screen and on a device/browser that has never saved anything
 * locally. This is what keeps every browser/device showing the same logo
 * and color instead of falling back to the default once local storage is
 * empty.
 */
interface BrandSettingsState {
  logoUrl: string | null;
  primaryColor: string | null;
  storeName: string | null;
  hasSynced: boolean;
  setLogo: (logo: string | null) => void;
  setPrimaryColor: (hex: string | null) => void;
  syncFromServer: () => Promise<void>;
}

const storedLogo = typeof localStorage !== "undefined" ? localStorage.getItem("pos_logo") : null;
const storedColor = typeof localStorage !== "undefined" ? localStorage.getItem("pos_brand_color") : null;

/** Point the browser tab's favicon at the store's logo, falling back to the default svg icon. */
function applyFavicon(logoUrl: string | null) {
  if (typeof document === "undefined") return;
  const href = logoUrl || "/favicon.svg";
  const existing = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
  if (existing.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  existing.forEach((link) => {
    link.href = href;
    // Data URIs aren't SVG/ico — clear a stale type attribute so browsers don't ignore it.
    if (logoUrl) link.removeAttribute("type");
  });
}

// Apply immediately from the local cache so the tab icon is correct before
// the network round-trip in syncFromServer() below resolves.
applyFavicon(storedLogo);

export const useBrandSettings = create<BrandSettingsState>((set) => ({
  logoUrl: storedLogo,
  primaryColor: storedColor,
  storeName: null,
  hasSynced: false,

  setLogo: (logo) => {
    if (logo) localStorage.setItem("pos_logo", logo);
    else localStorage.removeItem("pos_logo");
    applyFavicon(logo);
    set({ logoUrl: logo });
  },

  setPrimaryColor: (hex) => {
    if (hex) {
      localStorage.setItem("pos_brand_color", hex);
      applyBrandColor(hex);
    } else {
      localStorage.removeItem("pos_brand_color");
    }
    set({ primaryColor: hex });
  },

  syncFromServer: async () => {
    try {
      const res = await fetch("/api/settings/public");
      if (!res.ok) return;
      const data = await res.json();
      const logo: string | null = data.logoUrl || null;
      const color: string | null = data.primaryColor || null;

      if (logo) localStorage.setItem("pos_logo", logo);
      else localStorage.removeItem("pos_logo");
      applyFavicon(logo);

      if (color) {
        localStorage.setItem("pos_brand_color", color);
        applyBrandColor(color);
      }

      set({ logoUrl: logo, primaryColor: color, storeName: data.storeName ?? null, hasSynced: true });
    } catch {
      // Offline or the request failed — keep whatever was cached locally
      // rather than clobbering it with a default.
    }
  },
}));
