export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          daily_report_enabled: boolean;
          daily_report_time: string;
          day_start_hour: number;
          display_name: string | null;
          id: string;
          last_health_sync_at: string | null;
          locale: string;
          max_skips_per_month: number;
          muted_until: string | null;
          onboarding_completed_at: string | null;
          plan_dirty: boolean;
          planned_through: string | null;
          quiet_hours_end: string | null;
          quiet_hours_start: string | null;
          reminder_lead_min: number;
          retro_edit_days: number;
          theme: string;
          timezone: string;
          updated_at: string;
          week_start: number;
          weekly_review_dow: number;
          weekly_review_enabled: boolean;
          weekly_review_time: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          daily_report_enabled?: boolean;
          daily_report_time?: string;
          day_start_hour?: number;
          display_name?: string | null;
          id: string;
          last_health_sync_at?: string | null;
          locale?: string;
          max_skips_per_month?: number;
          muted_until?: string | null;
          onboarding_completed_at?: string | null;
          plan_dirty?: boolean;
          planned_through?: string | null;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          reminder_lead_min?: number;
          retro_edit_days?: number;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
          weekly_review_dow?: number;
          weekly_review_enabled?: boolean;
          weekly_review_time?: string;
        };
        Update: {
          created_at?: string;
          daily_report_enabled?: boolean;
          daily_report_time?: string;
          day_start_hour?: number;
          display_name?: string | null;
          id?: string;
          last_health_sync_at?: string | null;
          locale?: string;
          max_skips_per_month?: number;
          muted_until?: string | null;
          onboarding_completed_at?: string | null;
          plan_dirty?: boolean;
          planned_through?: string | null;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          reminder_lead_min?: number;
          retro_edit_days?: number;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
          weekly_review_dow?: number;
          weekly_review_enabled?: boolean;
          weekly_review_time?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          device_label: string | null;
          endpoint: string;
          failure_count: number;
          id: string;
          last_success_at: string | null;
          p256dh: string;
          platform: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          device_label?: string | null;
          endpoint: string;
          failure_count?: number;
          id?: string;
          last_success_at?: string | null;
          p256dh: string;
          platform?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          device_label?: string | null;
          endpoint?: string;
          failure_count?: number;
          id?: string;
          last_success_at?: string | null;
          p256dh?: string;
          platform?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      scheduled_notifications: {
        Row: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string;
          habit_id: string | null;
          id: number;
          kind: Database["public"]["Enums"]["notification_kind"];
          last_error: string | null;
          local_date: string;
          routine_id: string | null;
          send_at: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          suppressed_reason: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key: string;
          habit_id?: string | null;
          id?: never;
          kind: Database["public"]["Enums"]["notification_kind"];
          last_error?: string | null;
          local_date: string;
          routine_id?: string | null;
          send_at: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          suppressed_reason?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string;
          habit_id?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["notification_kind"];
          last_error?: string | null;
          local_date?: string;
          routine_id?: string | null;
          send_at?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          suppressed_reason?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      srv_claim_due_notifications: {
        Args: { p_max: number };
        Returns: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string;
          habit_id: string | null;
          id: number;
          kind: Database["public"]["Enums"]["notification_kind"];
          last_error: string | null;
          local_date: string;
          routine_id: string | null;
          send_at: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          suppressed_reason: string | null;
          user_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "scheduled_notifications";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      srv_local_date: {
        Args: { p_at: string; p_day_start_hour: number; p_timezone: string };
        Returns: string;
      };
      srv_nightly_cleanup: { Args: Record<PropertyKey, never>; Returns: number };
      srv_tick_if_due: { Args: Record<PropertyKey, never>; Returns: undefined };
      srv_user_today: { Args: { p_user_id: string }; Returns: string };
    };
    Enums: {
      notification_kind:
        "habit_reminder" | "routine_digest" | "daily_report" | "weekly_review" | "test";
      notification_status: "pending" | "sending" | "sent" | "suppressed" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      notification_kind: [
        "habit_reminder",
        "routine_digest",
        "daily_report",
        "weekly_review",
        "test",
      ],
      notification_status: ["pending", "sending", "sent", "suppressed", "failed"],
    },
  },
} as const;
