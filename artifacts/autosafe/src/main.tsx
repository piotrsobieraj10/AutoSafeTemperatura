import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

themeBootScript();

createRoot(document.getElementById("root")!).render(<App />);
