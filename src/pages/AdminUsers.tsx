import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Shield, ShieldOff, Coins, Crown, Search, Lock, ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

interface AdminUserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  subscription_tier: string;
  subscription_credits: number;
  purchased_credits: number;
  total_consumed: number;
  is_admin: boolean;
  is_primary_admin: boolean;
}

const TIERS = ["free", "starter", "pro", "ultra"] as const;

export default function AdminUsers() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [creditDialog, setCreditDialog] = useState<{ user: AdminUserRow } | null>(null);
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditBucket, setCreditBucket] = useState<"purchased" | "subscription">("purchased");
  const [transferDialog, setTransferDialog] = useState<{ user: AdminUserRow } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const callerIsPrimary = useMemo(
    () => rows.some(r => r.user_id === currentUserId && r.is_primary_admin),
    [rows, currentUserId],
  );

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/");
  }, [adminLoading, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_all_users_admin");
    if (error) {
      toast.error("Erreur de chargement : " + error.message);
      setRows([]);
    } else {
      setRows((data as AdminUserRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.email || "").toLowerCase().includes(q) ||
      (r.display_name || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const promote = async (u: AdminUserRow) => {
    const { error } = await supabase.rpc("promote_to_admin", { _target_user_id: u.user_id });
    if (error) toast.error("Échec : " + error.message);
    else { toast.success(`${u.email} promu admin`); load(); }
  };

  const revoke = async (u: AdminUserRow) => {
    if (u.is_primary_admin) {
      toast.error("Admin principal protégé — révocation impossible.");
      return;
    }
    const { error } = await supabase.rpc("revoke_admin", { _target_user_id: u.user_id });
    if (error) toast.error("Échec : " + error.message);
    else { toast.success(`Rôle admin retiré à ${u.email}`); load(); }
  };

  const transferPrimary = async () => {
    if (!transferDialog) return;
    const { error } = await supabase.rpc("transfer_primary_admin", {
      _target_user_id: transferDialog.user.user_id,
    });
    if (error) {
      toast.error("Échec : " + error.message);
    } else {
      toast.success(`${transferDialog.user.email} est désormais l'admin principal`);
      setTransferDialog(null);
      load();
    }
  };

  const setTier = async (u: AdminUserRow, tier: string) => {
    const { error } = await supabase.rpc("admin_set_tier", { _target_user_id: u.user_id, _tier: tier });
    if (error) toast.error("Échec : " + error.message);
    else { toast.success(`Plan ${tier} appliqué à ${u.email}`); load(); }
  };

  const addCredits = async () => {
    if (!creditDialog) return;
    const amount = parseInt(creditAmount, 10);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Montant invalide");
      return;
    }
    const { error } = await supabase.rpc("admin_add_credits", {
      _target_user_id: creditDialog.user.user_id,
      _amount: amount,
      _bucket: creditBucket,
    });
    if (error) toast.error("Échec : " + error.message);
    else {
      toast.success(`${amount} crédits ajoutés (${creditBucket}) à ${creditDialog.user.email}`);
      setCreditDialog(null);
      load();
    }
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-amber-500" />
                Administration
              </h1>
              <p className="text-sm text-muted-foreground">Gestion des utilisateurs, rôles, plans et crédits</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            {filtered.length} / {rows.length} utilisateurs
          </Badge>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par email ou nom…"
            className="pl-9"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utilisateurs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Aucun utilisateur</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Utilisateur</th>
                      <th className="text-left p-3">Plan</th>
                      <th className="text-right p-3">Crédits</th>
                      <th className="text-right p-3">Consommés</th>
                      <th className="text-left p-3">Rôle</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.user_id} className="border-t border-border hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-medium">{u.display_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="p-3">
                          <Select value={u.subscription_tier} onValueChange={(v) => setTier(u, v)}>
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIERS.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <div>{(u.subscription_credits + u.purchased_credits).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.subscription_credits} sub · {u.purchased_credits} achat
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {u.total_consumed.toLocaleString()}
                        </td>
                        <td className="p-3">
                          {u.is_primary_admin ? (
                            <Badge className="gap-1 bg-amber-500/20 text-amber-600 border-amber-500/40">
                              <Crown className="w-3 h-3" /> Principal
                            </Badge>
                          ) : u.is_admin ? (
                            <Badge variant="secondary" className="gap-1">
                              <Shield className="w-3 h-3" /> Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline">user</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={() => { setCreditDialog({ user: u }); setCreditAmount("100"); setCreditBucket("purchased"); }}
                            >
                              <Coins className="w-3.5 h-3.5" /> Crédits
                            </Button>
                            {u.is_primary_admin ? (
                              <Button size="sm" variant="ghost" disabled className="h-8 gap-1" title="Admin principal protégé">
                                <Lock className="w-3.5 h-3.5" />
                              </Button>
                            ) : u.is_admin ? (
                              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => revoke(u)}>
                                <ShieldOff className="w-3.5 h-3.5" /> Révoquer
                              </Button>
                            ) : (
                              <Button size="sm" className="h-8 gap-1" onClick={() => promote(u)}>
                                <Shield className="w-3.5 h-3.5" /> Promouvoir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!creditDialog} onOpenChange={(o) => !o && setCreditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter des crédits</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Pour <strong>{creditDialog?.user.email}</strong>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Montant (négatif = retirer)</label>
              <Input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bucket</label>
              <Select value={creditBucket} onValueChange={(v) => setCreditBucket(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchased">Achetés (permanents)</SelectItem>
                  <SelectItem value="subscription">Abonnement (renouvelables)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialog(null)}>Annuler</Button>
            <Button onClick={addCredits}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
