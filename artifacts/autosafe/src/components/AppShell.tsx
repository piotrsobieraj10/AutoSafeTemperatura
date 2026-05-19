import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Home, LineChart, Settings as SettingsIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { getSettings } from "@/services/storageService";
import { applyTheme, THEME_STORAGE_EVENT } from "@/services/themeService";
import { ensureDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/BrandMark";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/config/app";

const NAV = [
  { to: "/", label: "Dom", icon: Home },
  { to: "/sensors", label: "Czujniki", icon: Activity },
  { to: "/history", label: "Historia", icon: LineChart },
  { to: "/settings", label: "Ustawienia", icon: SettingsIcon },
] as const;

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  useEffect(() => {
    const applySavedTheme = () => applyTheme(getSettings().theme);
    applySavedTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applySavedTheme);
    window.addEventListener(THEME_STORAGE_EVENT, applySavedTheme);

    const settings = getSettings();
    if (settings.demoMode) {
      ensureDemoSensors();
      startDemoLoop(() => {});
    }

    return () => {
      media.removeEventListener("change", applySavedTheme);
      window.removeEventListener(THEME_STORAGE_EVENT, applySavedTheme);
      stopDemoLoop();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandMark compact />
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold leading-none tracking-tight">{APP_NAME}</div>
              <div className="hidden truncate text-xs text-muted-foreground sm:block">{APP_TAGLINE}</div>
            </div>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        {children}
      </main>

      <div className="pointer-events-none fixed bottom-20 right-3 z-20 hidden rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur md:block">
        {APP_VERSION}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/50 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-around px-2 py-2">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Toaster position="top-center" richColors />
    </div>
  );
}
