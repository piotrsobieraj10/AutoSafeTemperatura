import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { sanitizeLocalStorage } from "@/services/storageService";

const themeBootScript = () => {
  try {
    const raw = localStorage.getItem("thermo.v2.settings");
    const settings = raw ? JSON.parse(raw) : {};
    const mode = settings.theme || "system";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = mode === "dark" || (mode === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (_) { /* ignore boot theme errors */ }
};

const cleanupOldPwaCache = () => {
  // Hotfix v5.6.1: stare cache/SW z poprzednich paczek potrafi mieszać pliki na Android Chrome.
  // Czyścimy je asynchronicznie, bez blokowania startu aplikacji.
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister().catch(() => {}))).catch(() => {});
    }
    if ("caches" in window) {
      caches.keys().then((keys) => keys
        .filter((key) => key.includes("autosafe") || key.includes("termo") || key.includes("temperatura"))
        .forEach((key) => caches.delete(key).catch(() => false))
      ).catch(() => {});
    }
  } catch (_) { /* ignore cache cleanup */ }
};

themeBootScript();
sanitizeLocalStorage();
cleanupOldPwaCache();

const root = document.getElementById("root");
if (!root) throw new Error("Brak elementu #root dla aplikacji AutoSafe Temperatura");

createRoot(root).render(<App />);
