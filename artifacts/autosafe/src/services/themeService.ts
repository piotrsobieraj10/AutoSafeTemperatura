export const THEME_STORAGE_EVENT = "autosafe-theme-change";

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

export const applyTheme = (theme: "light" | "dark") => {
  if (!isBrowser()) return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = theme === "dark" ? "#050505" : "#f8f4ea";
};

export const notifyThemeChanged = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(THEME_STORAGE_EVENT));
};
