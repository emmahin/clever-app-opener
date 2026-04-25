/**
 * Twin voice service — récupère un token de session ElevenLabs Conversational AI.
 * Le token est short-lived et obtenu côté serveur (clé API ne quitte jamais le backend).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ITwinVoiceService {
  getConversationToken(agentId: string): Promise<string>;
}

class TwinVoiceService implements ITwinVoiceService {
  async getConversationToken(agentId: string): Promise<string> {
    if (!agentId?.trim()) {
      throw new Error("Agent ID ElevenLabs requis. Configurez-le dans Réglages.");
    }
    const { data, error } = await supabase.functions.invoke("elevenlabs-twin-token", {
      body: { agent_id: agentId.trim() },
    });
    if (error) throw new Error(error.message || "Échec de la récupération du token vocal.");
    if (!data?.token) throw new Error(data?.error || "Token vocal introuvable.");
    return data.token as string;
  }
}

export const twinVoiceService: ITwinVoiceService = new TwinVoiceService();