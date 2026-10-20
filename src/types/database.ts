
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "achievements": {
                  Row: {
                    "earned_at": string,"id": string,"kind": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "earned_at"?: string,"id"?: string,"kind": string,"student_id": string
                  }
                  Update: {
                    "earned_at"?: string,"id"?: string,"kind"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "achievements_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"body_measurements": {
                  Row: {
                    "arm_cm": number | null,"chest_cm": number | null,"created_at": string,"id": string,"measured_on": string,"student_id": string,"waist_cm": number | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arm_cm"?: number | null,"chest_cm"?: number | null,"created_at"?: string,"id"?: string,"measured_on": string,"student_id": string,"waist_cm"?: number | null,"weight_kg"?: number | null
                  }
                  Update: {
                    "arm_cm"?: number | null,"chest_cm"?: number | null,"created_at"?: string,"id"?: string,"measured_on"?: string,"student_id"?: string,"waist_cm"?: number | null,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "body_measurements_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comment_reads": {
                  Row: {
                    "read_at": string,"user_id": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "read_at"?: string,"user_id": string,"workout_id": string
                  }
                  Update: {
                    "read_at"?: string,"user_id"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comment_reads_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"workout_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "archived_at": string | null,"coach_id": string | null,"created_at": string,"equipment": string | null,"id": string,"is_bodyweight": boolean,"muscle_group": string,"name": string,"progression_increment_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"coach_id"?: string | null,"created_at"?: string,"equipment"?: string | null,"id"?: string,"is_bodyweight"?: boolean,"muscle_group": string,"name": string,"progression_increment_kg"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"coach_id"?: string | null,"created_at"?: string,"equipment"?: string | null,"id"?: string,"is_bodyweight"?: boolean,"muscle_group"?: string,"name"?: string,"progression_increment_kg"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "coach_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"token_hash": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"token_hash": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"token_hash"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_used_by_fkey"
      columns: ["used_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"login_attempts": {
                  Row: {
                    "email_hash": string,"failed_count": number,"locked_until": string | null,"window_started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email_hash": string,"failed_count"?: number,"locked_until"?: string | null,"window_started_at"?: string
                  }
                  Update: {
                    "email_hash"?: string,"failed_count"?: number,"locked_until"?: string | null,"window_started_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "coach_id": string,"created_at": string,"full_name": string,"id": string,"is_active": boolean,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"role": Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"program_sessions": {
                  Row: {
                    "id": string,"label": string,"position": number,"program_id": string,"revision": number,"week_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"label": string,"position"?: number,"program_id": string,"revision"?: number,"week_number": number
                  }
                  Update: {
                    "id"?: string,"label"?: string,"position"?: number,"program_id"?: string,"revision"?: number,"week_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_sessions_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "coach_id": string,"created_at": string,"ends_on": string | null,"id": string,"name": string,"source_program_id": string | null,"start_date": string | null,"student_id": string | null,"weeks_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"name": string,"source_program_id"?: string | null,"start_date"?: string | null,"student_id"?: string | null,"weeks_count": number
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"name"?: string,"source_program_id"?: string | null,"start_date"?: string | null,"student_id"?: string | null,"weeks_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_source_program_id_fkey"
      columns: ["source_program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"progress_photos": {
                  Row: {
                    "created_at": string,"id": string,"size_bytes": number,"storage_path": string,"student_id": string,"tag": string | null,"taken_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"size_bytes": number,"storage_path": string,"student_id": string,"tag"?: string | null,"taken_on": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"size_bytes"?: number,"storage_path"?: string,"student_id"?: string,"tag"?: string | null,"taken_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_photos_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_mutations": {
                  Row: {
                    "coach_id": string,"created_at": string,"id": string,"payload": NonNullable<Json>,"revision": number,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"id": string,"payload": NonNullable<Json>,"revision": number,"session_id": string
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"revision"?: number,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_mutations_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routine_mutations_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "program_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"session_exercises": {
                  Row: {
                    "exercise_id": string,"id": string,"note": string | null,"position": number,"program_session_id": string,"reps_max": number,"reps_min": number,"rest_seconds": number | null,"sets": number,"superset_id": string | null,"superset_rest_seconds": number | null,"target_weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"id"?: string,"note"?: string | null,"position"?: number,"program_session_id": string,"reps_max": number,"reps_min": number,"rest_seconds"?: number | null,"sets": number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null
                  }
                  Update: {
                    "exercise_id"?: string,"id"?: string,"note"?: string | null,"position"?: number,"program_session_id"?: string,"reps_max"?: number,"reps_min"?: number,"rest_seconds"?: number | null,"sets"?: number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_exercises_program_session_id_fkey"
      columns: ["program_session_id"]
isOneToOne: false
      referencedRelation: "program_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_sets": {
                  Row: {
                    "exercise_id": string,"exercise_name": string,"id": string,"is_warmup": boolean,"position": number,"reps": number,"set_number": number,"student_id": string,"weight_kg": number,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"exercise_name": string,"id"?: string,"is_warmup"?: boolean,"position": number,"reps": number,"set_number": number,"student_id": string,"weight_kg": number,"workout_id": string
                  }
                  Update: {
                    "exercise_id"?: string,"exercise_name"?: string,"id"?: string,"is_warmup"?: boolean,"position"?: number,"reps"?: number,"set_number"?: number,"student_id"?: string,"weight_kg"?: number,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_sets_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_sets_workout_fk"
      columns: ["workout_id","student_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id","student_id"]
    }
                  ]
                },"workouts": {
                  Row: {
                    "created_at": string,"duration_seconds": number,"finished_at": string,"id": string,"performed_on": string | null,"program_id": string | null,"program_session_id": string | null,"session_label": string | null,"started_at": string,"student_id": string,"week_start": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_seconds": number,"finished_at": string,"id": string,"performed_on"?: never,"program_id"?: string | null,"program_session_id"?: string | null,"session_label"?: string | null,"started_at": string,"student_id": string,"week_start"?: never
                  }
                  Update: {
                    "created_at"?: string,"duration_seconds"?: number,"finished_at"?: string,"id"?: string,"performed_on"?: never,"program_id"?: string | null,"program_session_id"?: string | null,"session_label"?: string | null,"started_at"?: string,"student_id"?: string,"week_start"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "workouts_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workouts_program_session_id_fkey"
      columns: ["program_session_id"]
isOneToOne: false
      referencedRelation: "program_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workouts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assign_program":
{ Args: { "p_start_date": string,"p_student_id": string,"p_template_id": string }; Returns: string
                           },
"auth_email_exists":
{ Args: { "p_email": string }; Returns: boolean
                           },
"copy_program_week":
{ Args: { "p_from": number,"p_program_id": string,"p_replace"?: boolean,"p_to": number }; Returns: number
                           },
"current_coach_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"duplicate_routine_item":
{ Args: { "p_copy_id": string,"p_exercise_id"?: string,"p_session_id": string }; Returns: string
                           },
"edit_window_start":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_coach":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_coach_of":
{ Args: { "student": string }; Returns: boolean
                           },
"mark_comments_read":
{ Args: { "p_workout_id": string }; Returns: undefined
                           },
"mutate_routine_session":
{ Args: { "p_expected_revision": number,"p_ordered_ids"?: (string)[],"p_request_id": string,"p_rows"?: Json,"p_session_id": string }; Returns: number
                           },
"record_login_failure":
{ Args: { "p_email_hash": string }; Returns: undefined
                           },
"save_workout":
{ Args: { "p_workout": Json }; Returns: Json
                           },
"unread_comments":
{ Args: Record<PropertyKey, never>; Returns: {
              "last_comment_at": string,"student_id": string,"unread_count": number,"workout_id": string
            }[]
                           },
"validate_invitation":
{ Args: { "p_token_hash": string }; Returns: {
              "email": string,"status": string
            }[]
                           }
          }
          Enums: {
            "user_role": "coach"|"student"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "user_role": ["coach", "student"]
          }
        }
} as const
