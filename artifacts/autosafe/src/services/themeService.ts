import type { AppSettings } from "@/types/sensor";

export const THEME_STORAGE_EVENT = "autosafe-theme-change";

export type ThemeMode = AppSettings["theme"];

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

export const getSystemTheme = (): "light" | "dark" => {
  if (!isBrowser()) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const resolveTheme = (theme: ThemeMode): "light" | "dark" => {
  if (theme === "system") return getSystemTheme();
  return theme;
};

export const applyTheme = (theme: ThemeMode) => {
  if (!isBrowser()) return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = resolved;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = resolved === "dark" ? "#070706" : "#fbf7ef";
};

export const notifyThemeChanged = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(THEME_STORAGE_EVENT));
};

export const subscribeSystemTheme = (callback: () => void) => {
  if (!isBrowser()) return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change", callback);
  return () => media.removeEventListener?.("change", callback);
};
