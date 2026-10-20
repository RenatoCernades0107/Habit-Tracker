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
      categories: {
        Row: {
          color: string;
          created_at: string;
          deleted_at: string | null;
          icon: string | null;
          id: string;
          name: string | null;
          sort_order: number;
          system_key: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          name?: string | null;
          sort_order?: number;
          system_key?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          deleted_at?: string | null;
          icon?: string | null;
          id?: string;
          name?: string | null;
          sort_order?: number;
          system_key?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      check_in_events: {
        Row: {
          created_at: string;
          habit_id: string;
          local_date: string;
          op: string;
          op_id: string;
          payload: NonNullable<Json>;
          prev_state: Json | null;
          source: Database["public"]["Enums"]["check_in_source"];
          undone_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          habit_id: string;
          local_date: string;
          op: string;
          op_id: string;
          payload?: NonNullable<Json>;
          prev_state?: Json | null;
          source: Database["public"]["Enums"]["check_in_source"];
          undone_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          habit_id?: string;
          local_date?: string;
          op?: string;
          op_id?: string;
          payload?: NonNullable<Json>;
          prev_state?: Json | null;
          source?: Database["public"]["Enums"]["check_in_source"];
          undone_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_in_events_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      check_ins: {
        Row: {
          auto_dismissed: boolean;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          habit_id: string;
          health_verified: boolean;
          id: string;
          local_date: string;
          note: string | null;
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        ComputedFields: never;
        Insert: {
          auto_dismissed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          habit_id: string;
          health_verified?: boolean;
          id?: string;
          local_date: string;
          note?: string | null;
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at?: string;
          user_id: string;
          value?: number | null;
        };
        Update: {
          auto_dismissed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          habit_id?: string;
          health_verified?: boolean;
          id?: string;
          local_date?: string;
          note?: string | null;
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null;
          source?: Database["public"]["Enums"]["check_in_source"];
          status?: Database["public"]["Enums"]["check_in_status"];
          updated_at?: string;
          user_id?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "check_ins_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_versions: {
        Row: {
          days_of_week: number[] | null;
          habit_id: string;
          kind: Database["public"]["Enums"]["habit_kind"];
          schedule_type: Database["public"]["Enums"]["schedule_type"];
          target_value: number | null;
          times_per_week: number | null;
          updated_at: string;
          user_id: string;
          valid_from: string;
        };
        ComputedFields: never;
        Insert: {
          days_of_week?: number[] | null;
          habit_id: string;
          kind: Database["public"]["Enums"]["habit_kind"];
          schedule_type: Database["public"]["Enums"]["schedule_type"];
          target_value?: number | null;
          times_per_week?: number | null;
          updated_at?: string;
          user_id: string;
          valid_from: string;
        };
        Update: {
          days_of_week?: number[] | null;
          habit_id?: string;
          kind?: Database["public"]["Enums"]["habit_kind"];
          schedule_type?: Database["public"]["Enums"]["schedule_type"];
          target_value?: number | null;
          times_per_week?: number | null;
          updated_at?: string;
          user_id?: string;
          valid_from?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_versions_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      habits: {
        Row: {
          archived_on: string | null;
          calendar_sync: boolean;
          category_id: string | null;
          color: string | null;
          created_at: string;
          cue: string | null;
          days_of_week: number[] | null;
          deleted_at: string | null;
          description: string | null;
          duration_min: number | null;
          icon: string | null;
          id: string;
          increment_step: number;
          kind: Database["public"]["Enums"]["habit_kind"];
          name: string;
          reminder_enabled: boolean;
          reminder_lead_min: number | null;
          routine_id: string | null;
          schedule_type: Database["public"]["Enums"]["schedule_type"];
          sort_order: number;
          start_date: string;
          target_value: number | null;
          time_of_day: string | null;
          times_per_week: number | null;
          unit: string | null;
          updated_at: string;
          user_id: string;
          voice_aliases: string[];
        };
        ComputedFields: never;
        Insert: {
          archived_on?: string | null;
          calendar_sync?: boolean;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          cue?: string | null;
          days_of_week?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_min?: number | null;
          icon?: string | null;
          id?: string;
          increment_step?: number;
          kind?: Database["public"]["Enums"]["habit_kind"];
          name: string;
          reminder_enabled?: boolean;
          reminder_lead_min?: number | null;
          routine_id?: string | null;
          schedule_type?: Database["public"]["Enums"]["schedule_type"];
          sort_order?: number;
          start_date: string;
          target_value?: number | null;
          time_of_day?: string | null;
          times_per_week?: number | null;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          voice_aliases?: string[];
        };
        Update: {
          archived_on?: string | null;
          calendar_sync?: boolean;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          cue?: string | null;
          days_of_week?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_min?: number | null;
          icon?: string | null;
          id?: string;
          increment_step?: number;
          kind?: Database["public"]["Enums"]["habit_kind"];
          name?: string;
          reminder_enabled?: boolean;
          reminder_lead_min?: number | null;
          routine_id?: string | null;
          schedule_type?: Database["public"]["Enums"]["schedule_type"];
          sort_order?: number;
          start_date?: string;
          target_value?: number | null;
          time_of_day?: string | null;
          times_per_week?: number | null;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          voice_aliases?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "habits_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "habits_routine_id_fkey";
            columns: ["routine_id"];
            isOneToOne: false;
            referencedRelation: "routines";
            referencedColumns: ["id"];
          },
        ];
      };
      pauses: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          end_date: string | null;
          habit_id: string | null;
          id: string;
          reason: Database["public"]["Enums"]["skip_reason"] | null;
          start_date: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          end_date?: string | null;
          habit_id?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["skip_reason"] | null;
          start_date: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          end_date?: string | null;
          habit_id?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["skip_reason"] | null;
          start_date?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pauses_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
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
      routines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          digest_enabled: boolean;
          end_time: string | null;
          icon: string | null;
          id: string;
          name: string | null;
          sort_order: number;
          start_time: string;
          system_key: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          digest_enabled?: boolean;
          end_time?: string | null;
          icon?: string | null;
          id?: string;
          name?: string | null;
          sort_order?: number;
          start_time: string;
          system_key?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          digest_enabled?: boolean;
          end_time?: string | null;
          icon?: string | null;
          id?: string;
          name?: string | null;
          sort_order?: number;
          start_time?: string;
          system_key?: string | null;
          updated_at?: string;
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
        Relationships: [
          {
            foreignKeyName: "scheduled_notifications_habit_fk";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_notifications_routine_fk";
            columns: ["routine_id"];
            isOneToOne: false;
            referencedRelation: "routines";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_check_in_op: {
        Args: {
          p_habit_id: string;
          p_local_date: string;
          p_op: string;
          p_op_id: string;
          p_payload?: Json;
          p_source?: Database["public"]["Enums"]["check_in_source"];
        };
        Returns: {
          auto_dismissed: boolean;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          habit_id: string;
          health_verified: boolean;
          id: string;
          local_date: string;
          note: string | null;
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "check_ins";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      seed_user_defaults: { Args: { p_user_id: string }; Returns: undefined };
      srv_apply_check_in_op: {
        Args: {
          p_habit_id: string;
          p_local_date: string;
          p_op: string;
          p_op_id: string;
          p_payload: Json;
          p_source: Database["public"]["Enums"]["check_in_source"];
          p_user_id: string;
        };
        Returns: {
          auto_dismissed: boolean;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          habit_id: string;
          health_verified: boolean;
          id: string;
          local_date: string;
          note: string | null;
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "check_ins";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      undo_last_op: {
        Args: Record<PropertyKey, never>;
        Returns: {
          auto_dismissed: boolean;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          habit_id: string;
          health_verified: boolean;
          id: string;
          local_date: string;
          note: string | null;
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "check_ins";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      undo_op: {
        Args: { p_op_id: string };
        Returns: {
          auto_dismissed: boolean;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          habit_id: string;
          health_verified: boolean;
          id: string;
          local_date: string;
          note: string | null;
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null;
          source: Database["public"]["Enums"]["check_in_source"];
          status: Database["public"]["Enums"]["check_in_status"];
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "check_ins";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      user_today: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: {
      check_in_source: "app" | "routine_mode" | "siri" | "notification" | "health" | "import";
      check_in_status: "done" | "partial" | "skipped";
      habit_kind: "boolean" | "measurable";
      notification_kind:
        "habit_reminder" | "routine_digest" | "daily_report" | "weekly_review" | "test";
      notification_status: "pending" | "sending" | "sent" | "suppressed" | "failed";
      schedule_type: "daily" | "days_of_week" | "times_per_week";
      skip_reason: "sick" | "travel" | "rest" | "other";
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
      check_in_source: ["app", "routine_mode", "siri", "notification", "health", "import"],
      check_in_status: ["done", "partial", "skipped"],
      habit_kind: ["boolean", "measurable"],
      notification_kind: [
        "habit_reminder",
        "routine_digest",
        "daily_report",
        "weekly_review",
        "test",
      ],
      notification_status: ["pending", "sending", "sent", "suppressed", "failed"],
      schedule_type: ["daily", "days_of_week", "times_per_week"],
      skip_reason: ["sick", "travel", "rest", "other"],
    },
  },
} as const;
