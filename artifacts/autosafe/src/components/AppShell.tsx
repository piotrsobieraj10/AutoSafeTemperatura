// AppShell.tsx v2
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Home, LineChart, Radio, Settings as SettingsIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { getSettings } from "@/services/storageService";
import { ensureDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { useSensors } from "@/hooks/useSensors";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/",         label: "Dom",        icon: Home },
  { to: "/sensors",  label: "Czujniki",   icon: Activity },
  { to: "/history",  label: "Historia",   icon: LineChart },
  { to: "/settings", label: "Ustawienia", icon: SettingsIcon },
] as const;

interface AppShellProps {
  children: React.ReactNode;
}

const applyTheme = (theme: "light" | "dark" | "system") => {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
};

export function AppShell({ children }: AppShellProps) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const { alertSensors } = useSensors();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const s = getSettings();
    applyTheme(s.theme);

    if (s.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => {
        mq.removeEventListener("change", handler);
        stopDemoLoop();
      };
    }

    if (s.demoMode) {
      ensureDemoSensors();
      startDemoLoop(() => {});
    }

    setMounted(true);
    return () => { stopDemoLoop(); };
  }, []);

  useEffect(() => {
    if (!mounted) {
      setMounted(true);
    }
  }, [mounted]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="group flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero shadow-glow">
              <Radio className="h-5 w-5 text-white" />
              {alertSensors.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow">
                  {alertSensors.length}
                </span>
              )}
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-tight transition-colors group-hover:text-primary">
                AutoSafe
              </div>
              <div className="text-[11px] text-muted-foreground">Monitor temperatury BLE</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {to === "/sensors" && alertSensors.length > 0 && !active && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 page-enter">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-sm items-center justify-around px-2 py-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-medium transition-all",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                  active && "bg-primary/15"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn("text-[10px]", active && "font-semibold")}>{label}</span>
                {to === "/sensors" && alertSensors.length > 0 && (
                  <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <Toaster position="top-center" richColors expand />
    </div>
  );
}
