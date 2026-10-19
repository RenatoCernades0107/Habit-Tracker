// Placeholder written by hand for the Phase 0 schema (docs/spec/04-data-model.md).
// Regenerate from the local database with `npm run db:types` once migrations change.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          locale: string;
          timezone: string;
          day_start_hour: number;
          week_start: number;
          reminder_lead_min: number;
          daily_report_enabled: boolean;
          daily_report_time: string;
          weekly_review_enabled: boolean;
          weekly_review_dow: number;
          weekly_review_time: string;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          muted_until: string | null;
          retro_edit_days: number;
          max_skips_per_month: number;
          theme: string;
          plan_dirty: boolean;
          planned_through: string | null;
          last_health_sync_at: string | null;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          locale?: string;
          timezone?: string;
          day_start_hour?: number;
          week_start?: number;
          reminder_lead_min?: number;
          daily_report_enabled?: boolean;
          daily_report_time?: string;
          weekly_review_enabled?: boolean;
          weekly_review_dow?: number;
          weekly_review_time?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          muted_until?: string | null;
          retro_edit_days?: number;
          max_skips_per_month?: number;
          theme?: string;
          plan_dirty?: boolean;
          planned_through?: string | null;
          last_health_sync_at?: string | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          platform: string | null;
          device_label: string | null;
          created_at: string;
          last_success_at: string | null;
          failure_count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          platform?: string | null;
          device_label?: string | null;
          created_at?: string;
          last_success_at?: string | null;
          failure_count?: number;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      scheduled_notifications: {
        Row: {
          id: number;
          user_id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          habit_id: string | null;
          routine_id: string | null;
          local_date: string;
          send_at: string;
          status: Database["public"]["Enums"]["notification_status"];
          suppressed_reason: string | null;
          attempts: number;
          last_error: string | null;
          sent_at: string | null;
          dedupe_key: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          habit_id?: string | null;
          routine_id?: string | null;
          local_date: string;
          send_at: string;
          status?: Database["public"]["Enums"]["notification_status"];
          suppressed_reason?: string | null;
          attempts?: number;
          last_error?: string | null;
          sent_at?: string | null;
          dedupe_key: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scheduled_notifications"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      srv_user_today: {
        Args: { p_user_id: string };
        Returns: string;
      };
      srv_claim_due_notifications: {
        Args: { p_max: number };
        Returns: Database["public"]["Tables"]["scheduled_notifications"]["Row"][];
      };
      srv_tick_if_due: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      notification_kind:
        | "habit_reminder"
        | "routine_digest"
        | "daily_report"
        | "weekly_review"
        | "test";
      notification_status: "pending" | "sending" | "sent" | "suppressed" | "failed";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
