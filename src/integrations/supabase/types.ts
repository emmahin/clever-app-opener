export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      connected_accounts: {
        Row: {
          account_label: string
          connected_at: string
          credentials: Json
          id: string
          last_used_at: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          account_label?: string
          connected_at?: string
          credentials?: Json
          id?: string
          last_used_at?: string | null
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          account_label?: string
          connected_at?: string
          credentials?: Json
          id?: string
          last_used_at?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_pricing: {
        Row: {
          action: string
          active: boolean
          credits_per_1k_input: number
          credits_per_1k_output: number
          fixed_cost: number
          id: string
          model: string
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          action?: string
          active?: boolean
          credits_per_1k_input?: number
          credits_per_1k_output?: number
          fixed_cost?: number
          id?: string
          model: string
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          active?: boolean
          credits_per_1k_input?: number
          credits_per_1k_output?: number
          fixed_cost?: number
          id?: string
          model?: string
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          action: string | null
          amount: number
          balance_after: number
          created_at: string
          id: string
          input_tokens: number | null
          kind: string
          metadata: Json
          model: string | null
          output_tokens: number | null
          user_id: string
        }
        Insert: {
          action?: string | null
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          input_tokens?: number | null
          kind: string
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          user_id: string
        }
        Update: {
          action?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          input_tokens?: number | null
          kind?: string
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          purchased_credits: number
          subscription_credits: number
          subscription_renews_at: string | null
          subscription_tier: string
          total_consumed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          purchased_credits?: number
          subscription_credits?: number
          subscription_renews_at?: string | null
          subscription_tier?: string
          total_consumed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          purchased_credits?: number
          subscription_credits?: number
          subscription_renews_at?: string | null
          subscription_tier?: string
          total_consumed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_name: string
          custom_instructions: string
          detail_level: string
          language: string
          notification_prefs: Json
          typewriter: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_name?: string
          custom_instructions?: string
          detail_level?: string
          language?: string
          notification_prefs?: Json
          typewriter?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_name?: string
          custom_instructions?: string
          detail_level?: string
          language?: string
          notification_prefs?: Json
          typewriter?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: {
          _amount: number
          _bucket?: string
          _kind: string
          _metadata?: Json
          _user_id: string
        }
        Returns: Json
      }
      consume_credits: {
        Args: {
          _action?: string
          _amount: number
          _input_tokens?: number
          _metadata?: Json
          _model?: string
          _output_tokens?: number
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
