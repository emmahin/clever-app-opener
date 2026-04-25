import { Component, ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Filet de sécurité ultime : empêche un crash JS de laisser l'utilisateur
 * face à un écran violet figé (le fond CSS sans aucun contenu rendu).
 * Affiche l'erreur + un bouton de rechargement.
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[nex:root-error-boundary] app crashed", {
      message: error?.message,
      stack: error?.stack,
      info,
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md w-full rounded-2xl border border-destructive/40 bg-card p-6 shadow-elegant space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-destructive">Oups, l'app a planté</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Une erreur a interrompu l'affichage. Aucune donnée n'est perdue.
            </p>
          </div>
          <pre className="text-[11px] font-mono bg-secondary/40 rounded-lg p-3 overflow-auto max-h-40 text-muted-foreground">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium"
            >
              Recharger la page
            </button>
          </div>
        </div>
      </div>
    );
  }
}