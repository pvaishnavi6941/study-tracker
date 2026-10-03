export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type Owned = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};
export type Database = {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        display_name: string;
        avatar_url: string | null;
        daily_target_minutes: number;
        onboarding_done: boolean;
        active_timer: Json;
        revision: number;
        created_at: string;
        updated_at: string;
      }>;
      skills: Table<
        Owned & { name: string; color: string; target_hours: number }
      >;
      topics: Table<
        Owned & {
          skill_id: string;
          name: string;
          completed: boolean;
          completed_at: string | null;
          priority: "High" | "Medium" | "Low";
          sort_order: number;
        }
      >;
      study_sessions: Table<
        Owned & {
          skill_id: string;
          topic_id: string | null;
          topic_name: string;
          duration_minutes: number;
          notes: string;
          started_at: string;
          study_date: string;
          study_time: string;
          completed: boolean;
        }
      >;
      study_plans: Table<
        Owned & {
          topic_id: string;
          study_date: string;
          duration_minutes: number;
          session_id: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      cadence_snapshot: { Args: Record<string, never>; Returns: Json };
      cadence_apply_changes: {
        Args: { expected_revision: number; changes: Json };
        Returns: Json;
      };
      cadence_social: {
        Args: { today: string; week_start: string };
        Returns: Json;
      };
      cadence_friend_action: {
        Args: { target: string; action: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
