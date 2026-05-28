import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("AutoSafe Temperatura error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold">Coś poszło nie tak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aplikacja złapała błąd, ale nie utraciła danych. Odśwież stronę. Jeżeli problem wróci, wyślij treść błędu.
          </p>
          <pre className="mt-4 max-h-36 overflow-auto rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
          <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
            Odśwież aplikację
          </Button>
        </div>
      </div>
    );
  }
}
