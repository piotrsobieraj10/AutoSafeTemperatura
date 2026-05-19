import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const themeBootScript = () => {
  try {
    const raw = localStorage.getItem("thermo.settings.v1");
    const settings = raw ? JSON.parse(raw) : {};
    const mode = settings.theme || "auto";
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (_) {}
};
themeBootScript();

createRoot(document.getElementById("root")!).render(<App />);
