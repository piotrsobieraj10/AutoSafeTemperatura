// components/AppShell.tsx v2
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Activity, Home, LineChart, Radio, Settings } from "lucide-react";
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
  { to: "/settings", label: "Ustawienia", icon: Settings },
] as const;

export function AppShell() {
  const location = useLocation();
  const { alertSensors } = useSensors();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const s = getSettings();
    document.documentElement.classList.toggle("dark", s.theme !== "light");
    if (s.demoMode) { ensureDemoSensors(); startDemoLoop(() => {}); }
    setMounted(true);
    return () => stopDemoLoop();
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero shadow-glow">
              <Radio className="h-5 w-5 text-white" />
              {alertSensors.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow">
                  {alertSensors.length}
                </span>
              )}
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-tight group-hover:text-primary transition-colors">
                Termo ELA
              </div>
              <div className="text-[11px] text-muted-foreground">Monitor temperatury BLE</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link key={to} to={to} className={cn(
                  "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                  {label}
                  {to === "/sensors" && alertSensors.length > 0 && !active && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 page-enter">
        <Outlet />
      </main>

      {/* Mobile nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-sm items-center justify-around px-2 py-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link key={to} to={to} className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-medium transition-all",
                active ? "text-primary" : "text-muted-foreground"
              )}>
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
