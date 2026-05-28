import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { APP_VERSION } from "@/config/app";
import { clearLocalAppData } from "@/services/storageService";

interface Props { children: ReactNode; }
interface State { hasError: boolean; message?: string; stack?: string; }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message, stack: error.stack };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error("AutoSafe app error", error, info.componentStack);
    } catch {
      // noop
    }
  }

  private reload = () => window.location.reload();

  private clearAndReload = () => {
    if (!confirm("Wyczyścić lokalne dane aplikacji z tej przeglądarki? Usunie to czujniki, historię i ustawienia zapisane lokalnie.")) return;
    clearLocalAppData();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background px-5 py-10 text-foreground">
        <section className="mx-auto max-w-lg rounded-3xl border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{APP_VERSION}</p>
              <h1 className="mt-1 font-display text-2xl font-black">Aplikacja została zabezpieczona przed błędem</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Wystąpił błąd widoku, ale karta Chrome nie powinna się już wysypywać. Odśwież aplikację albo wyczyść lokalne dane, jeśli problem wynika ze starego cache lub uszkodzonego zapisu.
              </p>
              {this.state.message && (
                <pre className="mt-4 max-h-40 overflow-auto rounded-2xl bg-muted p-3 text-xs text-muted-foreground">{this.state.message}</pre>
              )}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button onClick={this.reload}><RefreshCw className="mr-2 h-4 w-4" />Odśwież</Button>
                <Button variant="outline" onClick={this.clearAndReload}><Trash2 className="mr-2 h-4 w-4" />Wyczyść lokalne dane</Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
