import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate("/", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Compte créé. Bienvenue !");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("E-mail de réinitialisation envoyé");
        setMode("signin");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse at top, hsl(275, 85%, 15%), hsl(0, 0%, 4%))" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Nex</h1>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 shadow-2xl">
          <div className="flex gap-1 p-1 rounded-xl bg-secondary/40 mb-6">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                    placeholder="••••••••"
                  />
                </div>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground mt-1">6 caractères minimum.</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signup" ? "Créer mon compte" : mode === "signin" ? "Se connecter" : "Envoyer l'e-mail"}
            </button>
          </form>

          <div className="mt-4 text-center">
            {mode === "signin" ? (
              <button onClick={() => setMode("forgot")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Mot de passe oublié ?
              </button>
            ) : mode === "forgot" ? (
              <button onClick={() => setMode("signin")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Retour à la connexion
              </button>
            ) : null}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Tes données et préférences restent privées et liées à ton compte.
        </p>
      </div>
    </div>
  );
}
