export interface AutoRefreshStatus {
  enabled: boolean;
  intervalMs: number;
  scanning: boolean;
  lastRefreshAt?: string;
  nextRefreshAt?: number;
  lastSkippedAt?: string;
  skippedReason?: string;
  lastError?: string;
}

const PWA_LIMITATION_MESSAGE = "Automatyczne odświeżanie BLE działa stabilnie w aplikacji Android. W przeglądarce może wymagać ręcznego uruchomienia.";

let status: AutoRefreshStatus = {
  enabled: true,
  intervalMs: 30_000,
  scanning: false,
};

const listeners = new Set<(status: AutoRefreshStatus) => void>();

export const getAutoRefreshStatus = (): AutoRefreshStatus => status;

export const setAutoRefreshStatus = (patch: Partial<AutoRefreshStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
};

export const subscribeAutoRefreshStatus = (listener: (status: AutoRefreshStatus) => void) => {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
};

export const refreshIntervalLabel = (intervalMs?: number): string => {
  if (!intervalMs || intervalMs <= 0) return "ręcznie";
  if (intervalMs === 15_000) return "co 15 s";
  if (intervalMs === 30_000) return "co 30 s";
  if (intervalMs === 60_000) return "co 60 s";
  if (intervalMs === 120_000) return "co 2 min";
  return `co ${Math.round(intervalMs / 1000)} s`;
};

export const browserAutoRefreshLimitationMessage = PWA_LIMITATION_MESSAGE;
