export const APP_NAME = "AutoSafe Temperatura";
export const APP_VERSION = "AutoSafe_Temperatura_v3";
export const APP_TAGLINE = "Monitoring temperatury Bluetooth dla domu, garażu i kotłowni";

export const COMMON_ROOMS = [
  "Salon",
  "Sypialnia",
  "Kuchnia",
  "Łazienka",
  "Garaż",
  "Kotłownia",
  "Poddasze",
  "Biuro",
  "Pokój dziecka",
  "Magazyn",
];

export const COMFORT_MIN_C = 18;
export const COMFORT_MAX_C = 24;
export const STALE_READING_MS = 30 * 60 * 1000;

export const formatReadingTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(d.getTime())) return "—";
  if (diff < 60_000) return "przed chwilą";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} godz. temu`;
  return d.toLocaleString("pl-PL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};
