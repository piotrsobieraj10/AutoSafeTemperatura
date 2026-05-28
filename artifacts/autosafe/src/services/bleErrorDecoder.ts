export interface DecodedBleError {
  code: string;
  title: string;
  userMessage: string;
  action: string;
  technicalDetails: string;
}

const asText = (error: unknown): string => {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  try {
    const maybe = error as { message?: unknown; code?: unknown; reason?: unknown };
    const parts = [maybe.code, maybe.reason, maybe.message].filter(Boolean).map(String);
    return parts.length ? parts.join(" ") : JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const detectCode = (raw: string): string => {
  const text = raw.toUpperCase();
  const explicit = text.match(/\b(BLE_[A-Z0-9_]+|WEB_BLE_[A-Z0-9_]+)\b/);
  if (explicit?.[1]) return explicit[1];

  if (text.includes("BLUETOOTHLESCANNER") && text.includes("NULL")) return "BLE_SCANNER_NULL";
  if (text.includes("STARTSCAN") && text.includes("NULL")) return "BLE_SCANNER_NULL";
  if (text.includes("BLUETOOTHADAPTER") && text.includes("NULL")) return "BLE_NOT_SUPPORTED";
  if (text.includes("BLUETOOTH MANAGER") && text.includes("NULL")) return "BLE_NOT_SUPPORTED";
  if (text.includes("BLUETOOTH") && (text.includes("DISABLED") || text.includes("WYŁĄCZ") || text.includes("WYLACZ"))) return "BLE_OFF";
  if (text.includes("SECURITYEXCEPTION") || text.includes("BLUETOOTH_SCAN") || text.includes("BLUETOOTH_CONNECT") || text.includes("PERMISSION DENIED") || text.includes("BRAK UPRAWNIE")) return "BLE_PERMISSION_DENIED";
  if (text.includes("LOCATION")) return "BLE_LOCATION_REQUIRED";
  if (text.includes("SCAN_FAILED_ALREADY_STARTED") || text.includes("SCAN_FAILED_1") || text.includes("SCAN_FAILED 1")) return "BLE_SCAN_ALREADY_STARTED";
  if (text.includes("SCAN_FAILED_APPLICATION_REGISTRATION_FAILED") || text.includes("SCAN_FAILED_2") || text.includes("SCAN_FAILED 2")) return "BLE_SCAN_REGISTRATION_FAILED";
  if (text.includes("SCAN_FAILED_INTERNAL_ERROR") || text.includes("SCAN_FAILED_3") || text.includes("SCAN_FAILED 3")) return "BLE_SCAN_INTERNAL_ERROR";
  if (text.includes("SCAN_FAILED_FEATURE_UNSUPPORTED") || text.includes("SCAN_FAILED_4") || text.includes("SCAN_FAILED 4")) return "BLE_FEATURE_UNSUPPORTED";
  if (text.includes("SCAN_FAILED_OUT_OF_HARDWARE_RESOURCES") || text.includes("SCAN_FAILED_5") || text.includes("SCAN_FAILED 5")) return "BLE_OUT_OF_HARDWARE_RESOURCES";
  if (text.includes("SCAN_FAILED_SCANNING_TOO_FREQUENTLY") || text.includes("SCAN_FAILED_6") || text.includes("SCAN_FAILED 6")) return "BLE_SCANNING_TOO_FREQUENTLY";
  if (text.includes("NOTALLOWEDERROR")) return "WEB_BLE_PERMISSION_DENIED";
  if (text.includes("NOTFOUNDERROR")) return "WEB_BLE_DEVICE_NOT_FOUND";
  if (text.includes("NOTSUPPORTEDERROR")) return "WEB_BLE_NOT_SUPPORTED";
  return "BLE_UNKNOWN_ERROR";
};

const messages: Record<string, Omit<DecodedBleError, "code" | "technicalDetails">> = {
  BLE_SCANNER_NULL: {
    title: "Skaner BLE jest niedostępny",
    userMessage: "Android nie udostępnił skanera BLE dla aplikacji.",
    action: "Włącz Bluetooth, nadaj uprawnienie „Urządzenia w pobliżu”, zamknij aplikację i uruchom ją ponownie.",
  },
  BLE_NOT_SUPPORTED: {
    title: "Bluetooth BLE niedostępny",
    userMessage: "To urządzenie nie udostępnia obsługi Bluetooth BLE dla aplikacji.",
    action: "Sprawdź Bluetooth na telefonie albo użyj innego urządzenia.",
  },
  BLE_OFF: {
    title: "Bluetooth jest wyłączony",
    userMessage: "Aplikacja nie może skanować czujników, gdy Bluetooth jest wyłączony.",
    action: "Włącz Bluetooth i spróbuj ponownie.",
  },
  BLE_PERMISSION_DENIED: {
    title: "Brak uprawnień Bluetooth",
    userMessage: "Aplikacja nie ma zgody na skanowanie urządzeń w pobliżu.",
    action: "Wejdź w ustawienia aplikacji i nadaj uprawnienie „Urządzenia w pobliżu”.",
  },
  BLE_LOCATION_REQUIRED: {
    title: "Wymagana lokalizacja telefonu",
    userMessage: "Na części telefonów Android skanowanie BLE wymaga włączonej lokalizacji.",
    action: "Włącz lokalizację telefonu i spróbuj ponownie.",
  },
  BLE_SCAN_ALREADY_STARTED: {
    title: "Skanowanie już działa",
    userMessage: "Skanowanie BLE jest już uruchomione.",
    action: "Poczekaj chwilę albo zatrzymaj skanowanie i uruchom je ponownie.",
  },
  BLE_SCAN_REGISTRATION_FAILED: {
    title: "Android nie zarejestrował skanowania",
    userMessage: "System Android chwilowo nie przyjął skanowania BLE.",
    action: "Zamknij aplikację, wyłącz i włącz Bluetooth, a potem spróbuj ponownie.",
  },
  BLE_SCAN_INTERNAL_ERROR: {
    title: "Wewnętrzny błąd Bluetooth",
    userMessage: "Wystąpił błąd modułu Bluetooth Androida.",
    action: "Wyłącz i włącz Bluetooth, zamknij nRF Connect oraz inne aplikacje BLE i spróbuj ponownie.",
  },
  BLE_FEATURE_UNSUPPORTED: {
    title: "Tryb BLE nieobsługiwany",
    userMessage: "Ten telefon nie obsługuje wymaganego trybu skanowania BLE.",
    action: "Spróbuj na innym telefonie albo użyj wersji PWA jako zapasowej.",
  },
  BLE_OUT_OF_HARDWARE_RESOURCES: {
    title: "Bluetooth ma zajęte zasoby",
    userMessage: "Telefon ma zajęte zasoby Bluetooth przez inną aplikację lub poprzednie skanowanie.",
    action: "Zamknij nRF Connect i inne aplikacje Bluetooth, odczekaj chwilę i spróbuj ponownie.",
  },
  BLE_SCANNING_TOO_FREQUENTLY: {
    title: "Za częste skanowanie BLE",
    userMessage: "Android zablokował zbyt częste uruchamianie skanowania.",
    action: "Odczekaj 30–60 sekund i spróbuj ponownie.",
  },
  WEB_BLE_PERMISSION_DENIED: {
    title: "Brak zgody Bluetooth w przeglądarce",
    userMessage: "Przeglądarka nie dostała zgody na Bluetooth.",
    action: "Kliknij ponownie i wybierz czujnik w oknie Bluetooth.",
  },
  WEB_BLE_DEVICE_NOT_FOUND: {
    title: "Nie znaleziono czujnika",
    userMessage: "Nie wybrano czujnika albo czujnik nie został znaleziony.",
    action: "Zbliż telefon do czujnika i uruchom skanowanie ponownie.",
  },
  WEB_BLE_NOT_SUPPORTED: {
    title: "Bluetooth w przeglądarce niedostępny",
    userMessage: "Ta przeglądarka nie obsługuje wymaganej funkcji Bluetooth.",
    action: "Użyj Android APK albo Chrome na Androidzie.",
  },
  BLE_STATE_ERROR: {
    title: "Bluetooth chwilowo niedostępny",
    userMessage: "System Android chwilowo nie pozwolił uruchomić skanowania BLE.",
    action: "Wyłącz i włącz Bluetooth, zamknij aplikację i spróbuj ponownie.",
  },
  BLE_SCAN_START_FAILED: {
    title: "Nie udało się uruchomić skanowania",
    userMessage: "Aplikacja nie mogła rozpocząć skanowania BLE.",
    action: "Sprawdź Bluetooth, uprawnienia i spróbuj ponownie.",
  },
  BLE_UNKNOWN_ERROR: {
    title: "Nieznany błąd Bluetooth",
    userMessage: "Wystąpił nieznany błąd Bluetooth.",
    action: "Spróbuj ponownie albo skopiuj diagnostykę BLE.",
  },
};

export const decodeBleError = (error: unknown): DecodedBleError => {
  const technicalDetails = asText(error);
  const code = detectCode(technicalDetails);
  const base = messages[code] ?? messages.BLE_UNKNOWN_ERROR;
  return {
    code,
    title: base.title,
    userMessage: base.userMessage,
    action: base.action,
    technicalDetails,
  };
};
