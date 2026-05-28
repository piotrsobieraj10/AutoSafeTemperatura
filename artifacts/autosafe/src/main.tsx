import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { DEFAULT_SETTINGS, K, migrateLegacyStorage } from "./services/storageService";
import { applyTheme } from "./services/themeService";

const bootTheme = () => {
  try {
    migrateLegacyStorage();
    const raw = localStorage.getItem(K.SETTINGS);
    const settings = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
    applyTheme(settings.theme ?? "system");
  } catch {
    applyTheme("system");
  }
};

bootTheme();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
