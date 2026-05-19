import type { ThemeMode } from "@/services/storageService";

export const THEME_STORAGE_EVENT = "autosafe-theme-change";

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

export const getSystemPrefersDark = () =>
  isBrowser() && window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (theme: ThemeMode): "light" | "dark" => {
  if (theme === "auto") return getSystemPrefersDark() ? "dark" : "light";
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
  meta.content = resolved === "dark" ? "#050505" : "#f8f4ea";
};

export const notifyThemeChanged = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(THEME_STORAGE_EVENT));
};
