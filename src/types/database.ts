
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
                    "archived_at": string | null,"coach_id": string | null,"created_at": string,"equipment": string | null,"id": string,"is_bodyweight": boolean,"muscle_group": string,"name": string,"personal_owner_id": string | null,"personal_revision": number,"progression_increment_kg": number,"record_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"coach_id"?: string | null,"created_at"?: string,"equipment"?: string | null,"id"?: string,"is_bodyweight"?: boolean,"muscle_group": string,"name": string,"personal_owner_id"?: string | null,"personal_revision"?: number,"progression_increment_kg"?: number,"record_type"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"coach_id"?: string | null,"created_at"?: string,"equipment"?: string | null,"id"?: string,"is_bodyweight"?: boolean,"muscle_group"?: string,"name"?: string,"personal_owner_id"?: string | null,"personal_revision"?: number,"progression_increment_kg"?: number,"record_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_personal_owner_id_fkey"
      columns: ["personal_owner_id"]
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
                },"mobile_comment_receipts": {
                  Row: {
                    "author_id": string,"body_hash": string,"comment_id": string,"created_at": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body_hash": string,"comment_id": string,"created_at"?: string,"workout_id": string
                  }
                  Update: {
                    "author_id"?: string,"body_hash"?: string,"comment_id"?: string,"created_at"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mobile_comment_receipts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mobile_comment_receipts_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_exercise_receipts": {
                  Row: {
                    "created_at": string,"operation": string,"owner_id": string,"payload_hash": string,"request_id": string,"revision": number,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"operation": string,"owner_id": string,"payload_hash": string,"request_id": string,"revision": number,"target_id": string
                  }
                  Update: {
                    "created_at"?: string,"operation"?: string,"owner_id"?: string,"payload_hash"?: string,"request_id"?: string,"revision"?: number,"target_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_exercise_receipts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_folders": {
                  Row: {
                    "id": string,"name": string,"owner_id": string,"position": number,"revision": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"name": string,"owner_id": string,"position": number,"revision"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"owner_id"?: string,"position"?: number,"revision"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_folders_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_routine_items": {
                  Row: {
                    "exercise_id": string,"id": string,"note": string | null,"owner_id": string,"position": number,"prescription_sets": Json | null,"reps_max": number | null,"reps_min": number | null,"rest_seconds": number | null,"routine_id": string,"sets": number,"superset_id": string | null,"superset_rest_seconds": number | null,"target_weight_kg": number | null,"typed_prescription": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"id": string,"note"?: string | null,"owner_id": string,"position": number,"prescription_sets"?: Json | null,"reps_max"?: number | null,"reps_min"?: number | null,"rest_seconds"?: number | null,"routine_id": string,"sets": number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null,"typed_prescription"?: Json | null
                  }
                  Update: {
                    "exercise_id"?: string,"id"?: string,"note"?: string | null,"owner_id"?: string,"position"?: number,"prescription_sets"?: Json | null,"reps_max"?: number | null,"reps_min"?: number | null,"rest_seconds"?: number | null,"routine_id"?: string,"sets"?: number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null,"typed_prescription"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_routine_items_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "personal_routine_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "personal_routine_items_routine_id_owner_id_fkey"
      columns: ["routine_id","owner_id"]
isOneToOne: false
      referencedRelation: "personal_routines"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"personal_routines": {
                  Row: {
                    "created_at": string,"folder_id": string | null,"id": string,"name": string,"owner_id": string,"position": number,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"folder_id"?: string | null,"id": string,"name": string,"owner_id": string,"position": number,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"folder_id"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"position"?: number,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_routines_folder_id_owner_id_fkey"
      columns: ["folder_id","owner_id"]
isOneToOne: false
      referencedRelation: "personal_folders"
      referencedColumns: ["id","owner_id"]
    },{
      foreignKeyName: "personal_routines_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_training_receipts": {
                  Row: {
                    "created_at": string,"operation": string,"owner_id": string,"payload_hash": string,"request_id": string,"result": NonNullable<Json>,"target_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"operation": string,"owner_id": string,"payload_hash": string,"request_id": string,"result": NonNullable<Json>,"target_id": string
                  }
                  Update: {
                    "created_at"?: string,"operation"?: string,"owner_id"?: string,"payload_hash"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"target_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_training_receipts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_workout_receipts": {
                  Row: {
                    "created_at": string,"owner_id": string,"payload_hash": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"owner_id": string,"payload_hash": string,"workout_id": string
                  }
                  Update: {
                    "created_at"?: string,"owner_id"?: string,"payload_hash"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_workout_receipts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planning_mutations": {
                  Row: {
                    "coach_id": string,"created_at": string,"id": string,"payload": NonNullable<Json>,"program_id": string,"result": NonNullable<Json>,"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"id": string,"payload": NonNullable<Json>,"program_id": string,"result": NonNullable<Json>,"student_id"?: string | null
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"program_id"?: string,"result"?: NonNullable<Json>,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "planning_mutations_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planning_mutations_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planning_mutations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                },"program_copy_receipts": {
                  Row: {
                    "coach_id": string,"created_at": string,"id": string,"payload": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id": string,"created_at"?: string,"id": string,"payload": NonNullable<Json>
                  }
                  Update: {
                    "coach_id"?: string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_copy_receipts_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_copy_receipts_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"program_sessions": {
                  Row: {
                    "id": string,"label": string,"position": number,"program_id": string,"revision": number,"title": string | null,"week_number": number,"weekday": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"label": string,"position"?: number,"program_id": string,"revision"?: number,"title"?: string | null,"week_number": number,"weekday"?: number | null
                  }
                  Update: {
                    "id"?: string,"label"?: string,"position"?: number,"program_id"?: string,"revision"?: number,"title"?: string | null,"week_number"?: number,"weekday"?: number | null
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
                },"session_day_overrides": {
                  Row: {
                    "session_id": string,"student_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "session_id": string,"student_id": string,"weekday": number
                  }
                  Update: {
                    "session_id"?: string,"student_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_day_overrides_session_id_fkey"
      columns: ["session_id"]
isOneToOne: true
      referencedRelation: "program_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_day_overrides_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"session_exercise_alternatives": {
                  Row: {
                    "exercise_id": string,"id": string,"position": number,"prescription_sets": Json | null,"reps_max": number,"reps_min": number,"session_exercise_id": string,"sets": number,"target_weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"id"?: string,"position": number,"prescription_sets"?: Json | null,"reps_max": number,"reps_min": number,"session_exercise_id": string,"sets": number,"target_weight_kg"?: number | null
                  }
                  Update: {
                    "exercise_id"?: string,"id"?: string,"position"?: number,"prescription_sets"?: Json | null,"reps_max"?: number,"reps_min"?: number,"session_exercise_id"?: string,"sets"?: number,"target_weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_exercise_alternatives_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_exercise_alternatives_session_exercise_id_fkey"
      columns: ["session_exercise_id"]
isOneToOne: false
      referencedRelation: "session_exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"session_exercises": {
                  Row: {
                    "exercise_id": string,"id": string,"note": string | null,"position": number,"prescription_sets": Json | null,"program_session_id": string,"reps_max": number,"reps_min": number,"rest_seconds": number | null,"sets": number,"superset_id": string | null,"superset_rest_seconds": number | null,"target_weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"id"?: string,"note"?: string | null,"position"?: number,"prescription_sets"?: Json | null,"program_session_id": string,"reps_max": number,"reps_min": number,"rest_seconds"?: number | null,"sets": number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null
                  }
                  Update: {
                    "exercise_id"?: string,"id"?: string,"note"?: string | null,"position"?: number,"prescription_sets"?: Json | null,"program_session_id"?: string,"reps_max"?: number,"reps_min"?: number,"rest_seconds"?: number | null,"sets"?: number,"superset_id"?: string | null,"superset_rest_seconds"?: number | null,"target_weight_kg"?: number | null
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
                },"workout_recording_receipts": {
                  Row: {
                    "created_at": string,"owner_id": string,"payload_hash": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"owner_id": string,"payload_hash": string,"workout_id": string
                  }
                  Update: {
                    "created_at"?: string,"owner_id"?: string,"payload_hash"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_recording_receipts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_sets": {
                  Row: {
                    "distance_meters": number | null,"duration_seconds": number | null,"effort": number | null,"exercise_id": string,"exercise_name": string,"id": string,"is_warmup": boolean,"position": number,"prescribed_exercise_id": string | null,"prescribed_exercise_name": string | null,"record_type": string | null,"reps": number | null,"session_exercise_id": string | null,"set_number": number,"set_type": string | null,"student_id": string,"weight_kg": number | null,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "distance_meters"?: number | null,"duration_seconds"?: number | null,"effort"?: number | null,"exercise_id": string,"exercise_name": string,"id"?: string,"is_warmup"?: boolean,"position": number,"prescribed_exercise_id"?: string | null,"prescribed_exercise_name"?: string | null,"record_type"?: string | null,"reps"?: number | null,"session_exercise_id"?: string | null,"set_number": number,"set_type"?: string | null,"student_id": string,"weight_kg"?: number | null,"workout_id": string
                  }
                  Update: {
                    "distance_meters"?: number | null,"duration_seconds"?: number | null,"effort"?: number | null,"exercise_id"?: string,"exercise_name"?: string,"id"?: string,"is_warmup"?: boolean,"position"?: number,"prescribed_exercise_id"?: string | null,"prescribed_exercise_name"?: string | null,"record_type"?: string | null,"reps"?: number | null,"session_exercise_id"?: string | null,"set_number"?: number,"set_type"?: string | null,"student_id"?: string,"weight_kg"?: number | null,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_sets_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_sets_prescribed_exercise_id_fkey"
      columns: ["prescribed_exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_sets_session_exercise_id_fkey"
      columns: ["session_exercise_id"]
isOneToOne: false
      referencedRelation: "session_exercises"
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
                    "created_at": string,"duration_seconds": number,"exercise_notes": Json | null,"finished_at": string,"id": string,"note": string | null,"perceived_effort": number | null,"performed_on": string | null,"personal_routine_id": string | null,"personal_routine_revision": number | null,"program_id": string | null,"program_session_id": string | null,"session_label": string | null,"source_kind": string,"started_at": string,"structure": Json | null,"student_id": string,"title": string | null,"week_start": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_seconds": number,"exercise_notes"?: Json | null,"finished_at": string,"id": string,"note"?: string | null,"perceived_effort"?: number | null,"performed_on"?: never,"personal_routine_id"?: string | null,"personal_routine_revision"?: number | null,"program_id"?: string | null,"program_session_id"?: string | null,"session_label"?: string | null,"source_kind"?: string,"started_at": string,"structure"?: Json | null,"student_id": string,"title"?: string | null,"week_start"?: never
                  }
                  Update: {
                    "created_at"?: string,"duration_seconds"?: number,"exercise_notes"?: Json | null,"finished_at"?: string,"id"?: string,"note"?: string | null,"perceived_effort"?: number | null,"performed_on"?: never,"personal_routine_id"?: string | null,"personal_routine_revision"?: number | null,"program_id"?: string | null,"program_session_id"?: string | null,"session_label"?: string | null,"source_kind"?: string,"started_at"?: string,"structure"?: Json | null,"student_id"?: string,"title"?: string | null,"week_start"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "workouts_personal_owner_fk"
      columns: ["personal_routine_id","student_id"]
isOneToOne: false
      referencedRelation: "personal_routines"
      referencedColumns: ["id","owner_id"]
    },{
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
            "add_routine_exercises":
{ Args: { "p_expected_revision": number,"p_items": Json,"p_request_id": string,"p_session_id": string }; Returns: number
                           },
"assign_program":
{ Args: { "p_start_date": string,"p_student_id": string,"p_template_id": string }; Returns: string
                           },
"assign_program_reviewed":
{ Args: { "p_request": Json,"p_request_id": string,"p_template_id": string }; Returns: string
                           },
"auth_email_exists":
{ Args: { "p_email": string }; Returns: boolean
                           },
"can_edit_routine_session":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"check_personal_routine":
{ Args: { "p_owner": string,"p_routine": string }; Returns: undefined
                           },
"configure_session_alternatives":
{ Args: { "p_alternatives": Json,"p_exercise_row_id": string,"p_expected_revision": number,"p_request_id": string,"p_session_id": string }; Returns: number
                           },
"configure_session_layout":
{ Args: { "p_expected_revision": number,"p_layout": Json,"p_request_id": string,"p_session_id": string }; Returns: number
                           },
"copy_program_week":
{ Args: { "p_from": number,"p_program_id": string,"p_replace"?: boolean,"p_to": number }; Returns: number
                           },
"copy_program_weeks":
{ Args: { "p_program_id": string,"p_request": Json,"p_request_id": string }; Returns: number
                           },
"current_coach_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"duplicate_program":
{ Args: { "p_copy_id": string,"p_name": string,"p_source_id": string }; Returns: string
                           },
"duplicate_routine_item":
{ Args: { "p_copy_id": string,"p_exercise_id"?: string,"p_session_id": string }; Returns: string
                           },
"edit_window_start":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_personal_exercises":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_personal_library":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_training_library":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"mutate_personal_exercise":
{ Args: { "p_data": Json,"p_expected_revision": number,"p_operation": string,"p_request_id": string,"p_target_id": string }; Returns: Json
                           },
"mutate_personal_library":
{ Args: { "p_data": Json,"p_expected_revision": number,"p_operation": string,"p_request_id": string,"p_target_id": string }; Returns: Json
                           },
"mutate_routine_session":
{ Args: { "p_expected_revision": number,"p_ordered_ids"?: (string)[],"p_request_id": string,"p_rows"?: Json,"p_session_id": string,"p_title"?: string,"p_weekday"?: number }; Returns: number
                           },
"mutate_training_library":
{ Args: { "p_data": Json,"p_expected_revision": number,"p_operation": string,"p_request_id": string,"p_target_id": string,"p_version": number }; Returns: Json
                           },
"patch_prescription_series":
{ Args: { "p_fields": (string)[],"p_row": Json,"p_series": Json }; Returns: Json
                           },
"personal_training_prescription":
{ Args: { "p_item": Json }; Returns: Json
                           },
"planning_assignment_snapshot":
{ Args: { "p_end_date": string,"p_start_date": string,"p_student_id": string }; Returns: Json
                           },
"publish_mobile_comment":
{ Args: { "p_body": string,"p_comment_id": string,"p_workout_id": string }; Returns: string
                           },
"record_login_failure":
{ Args: { "p_email_hash": string }; Returns: undefined
                           },
"routine_program_snapshot":
{ Args: { "p_program_id": string }; Returns: Json
                           },
"routine_week_snapshot":
{ Args: { "p_program_id": string,"p_week": number }; Returns: Json
                           },
"save_personal_workout":
{ Args: { "p_workout": Json }; Returns: Json
                           },
"save_typed_workout_recording":
{ Args: { "p_recording": Json }; Returns: Json
                           },
"save_workout":
{ Args: { "p_workout": Json }; Returns: Json
                           },
"save_workout_recording":
{ Args: { "p_recording": Json }; Returns: Json
                           },
"training_metric_dimensions":
{ Args: { "p_kind": string }; Returns: (string)[]
                           },
"training_structure_legacy":
{ Args: { "s": Json }; Returns: Json
                           },
"unread_comments":
{ Args: Record<PropertyKey, never>; Returns: {
              "last_comment_at": string,"student_id": string,"unread_count": number,"workout_id": string
            }[]
                           },
"valid_prescription_series":
{ Args: { "p_max": number,"p_min": number,"p_series": Json,"p_sets": number,"p_weight": number }; Returns: boolean
                           },
"valid_training_exercise_notes":
{ Args: { "n": Json,"s": Json }; Returns: boolean
                           },
"valid_training_metrics":
{ Args: { "p_metrics": Json }; Returns: boolean
                           },
"valid_training_note":
{ Args: { "p_note": Json }; Returns: boolean
                           },
"valid_training_number":
{ Args: { "p_max": number,"p_min": number,"p_step": number,"p_value": Json }; Returns: boolean
                           },
"valid_training_prescription":
{ Args: { "p_prescription": Json }; Returns: boolean
                           },
"valid_training_set_details":
{ Args: { "p_details": Json }; Returns: boolean
                           },
"valid_training_target":
{ Args: { "p_kind": string,"p_target": Json }; Returns: boolean
                           },
"valid_training_uuid":
{ Args: { "v": Json }; Returns: boolean
                           },
"valid_typed_workout_recording":
{ Args: { "v": Json }; Returns: boolean
                           },
"valid_typed_workout_structure":
{ Args: { "v": Json }; Returns: boolean
                           },
"valid_workout_recording":
{ Args: { "p_recording": Json }; Returns: boolean
                           },
"valid_workout_structure":
{ Args: { "p_structure": Json }; Returns: boolean
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
