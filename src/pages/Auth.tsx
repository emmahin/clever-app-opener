import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        // Si confirmation email activée, pas de session immédiate
        if (!data.session) {
          toast.success("Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.");
          setMode("signin");
          setPassword("");
        } else {
          toast.success("Compte créé — connexion en cours…");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("E-mail de réinitialisation envoyé");
        setMode("signin");
      }
    } catch (err: any) {
      const msg = err?.message ?? "Erreur";
      // Messages plus clairs pour les cas fréquents
      if (/email not confirmed/i.test(msg)) {
        toast.error("E-mail non confirmé. Vérifie ta boîte mail (et les spams).");
      } else if (/invalid login/i.test(msg)) {
        toast.error("E-mail ou mot de passe incorrect.");
      } else if (/already registered|already exists/i.test(msg)) {
        toast.error("Cet e-mail est déjà utilisé. Essaie de te connecter.");
      } else {
        toast.error(msg);
      }
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
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold">
              {mode === "forgot"
                ? "Réinitialiser le mot de passe"
                : mode === "signup"
                ? "Créer un compte"
                : "Se connecter"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "forgot"
                ? "Reçois un lien par e-mail pour choisir un nouveau mot de passe."
                : mode === "signup"
                ? "Inscris-toi en quelques secondes."
                : "Connecte-toi à ton compte."}
            </p>
          </div>

          {mode !== "forgot" && (
            <div className="mb-4 grid grid-cols-2 gap-1 p-1 rounded-lg bg-secondary/40 border border-border/60">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`py-1.5 text-xs rounded-md transition-colors ${mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`py-1.5 text-xs rounded-md transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Inscription
              </button>
            </div>
          )}

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
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin"
                ? "Se connecter"
                : mode === "signup"
                ? "Créer mon compte"
                : "Envoyer l'e-mail"}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            {mode === "signin" && (
              <button onClick={() => setMode("forgot")} className="block w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                Mot de passe oublié ?
              </button>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("signin")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Retour à la connexion
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Tes données et préférences restent privées et liées à ton compte.
        </p>
      </div>
    </div>
  );
}
