import { supabase } from "@/integrations/supabase/client";

export type ConnectedProvider = "whatsapp" | "chatgpt" | "notion" | "google" | "gmail" | string;

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: ConnectedProvider;
  account_label: string;
  credentials: Record<string, unknown>;
  status: "active" | "expired" | "revoked";
  connected_at: string;
  last_used_at: string | null;
}

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .order("connected_at", { ascending: false });
  if (error) {
    console.warn("listAccounts error", error);
    return [];
  }
  return (data ?? []) as ConnectedAccount[];
}

export async function addAccount(input: {
  provider: ConnectedProvider;
  account_label?: string;
  credentials: Record<string, unknown>;
}): Promise<ConnectedAccount | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("connected_accounts")
    .insert({
      user_id: uid,
      provider: input.provider,
      account_label: input.account_label ?? "",
      credentials: input.credentials,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.warn("addAccount error", error);
    return null;
  }
  return data as ConnectedAccount;
}

export async function removeAccount(id: string): Promise<boolean> {
  const { error } = await supabase.from("connected_accounts").delete().eq("id", id);
  if (error) {
    console.warn("removeAccount error", error);
    return false;
  }
  return true;
}
