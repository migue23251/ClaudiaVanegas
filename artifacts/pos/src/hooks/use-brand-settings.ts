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

export const useBrandSettings = create<BrandSettingsState>((set) => ({
  logoUrl: storedLogo,
  primaryColor: storedColor,
  storeName: null,
  hasSynced: false,

  setLogo: (logo) => {
    if (logo) localStorage.setItem("pos_logo", logo);
    else localStorage.removeItem("pos_logo");
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
