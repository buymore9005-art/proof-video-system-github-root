export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'admin' | 'operator';
export type SessionStatus = 'recording' | 'completed' | 'interrupted' | 'cancelled';
export type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed' | 'deleted';
export type ProcessingStatus = 'ready' | 'failed' | 'deleted';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackingSession {
  id: string;
  operator_id: string;
  operator_name: string;
  status: SessionStatus;
  started_at: string;
  heartbeat_at: string;
  ended_at: string | null;
  camera_label: string | null;
  user_agent: string | null;
  segment_count: number;
  created_at: string;
  updated_at: string;
}

export interface VideoRecord {
  id: string;
  client_id: string;
  session_id: string;
  operator_id: string;
  operator_name: string;
  order_number: string;
  barcode: string;
  sequence_no: number;
  start_time: string;
  end_time: string;
  duration_ms: number;
  filename: string;
  mime_type: string;
  filesize: number;
  storage_bucket: string;
  storage_path: string;
  upload_status: UploadStatus;
  processing_status: ProcessingStatus;
  upload_progress: number;
  retry_count: number;
  last_error: string | null;
  uploaded_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSetting {
  setting_key: string;
  setting_value: Json;
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Json;
  created_at: string;
}

export interface SystemState {
  state_key: string;
  initial_setup_status: 'pending' | 'claimed' | 'completed';
  setup_claim_token: string | null;
  setup_claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_videos_today: number;
  total_orders_today: number;
  total_duration_ms_today: number;
  uploads_completed_today: number;
  uploads_failed: number;
  active_operators: number;
  storage_bytes_total: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at' | 'last_seen_at'> & {
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string | null;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      packing_sessions: {
        Row: PackingSession;
        Insert: Partial<PackingSession> & Pick<PackingSession, 'operator_id' | 'operator_name'>;
        Update: Partial<PackingSession>;
        Relationships: [];
      };
      videos: {
        Row: VideoRecord;
        Insert: Partial<VideoRecord> &
          Pick<
            VideoRecord,
            | 'client_id'
            | 'session_id'
            | 'operator_id'
            | 'operator_name'
            | 'order_number'
            | 'barcode'
            | 'sequence_no'
            | 'start_time'
            | 'end_time'
            | 'duration_ms'
            | 'filename'
            | 'mime_type'
            | 'filesize'
            | 'storage_path'
          >;
        Update: Partial<VideoRecord>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSetting;
        Insert: AppSetting;
        Update: Partial<AppSetting>;
        Relationships: [];
      };
      activity_logs: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, 'id' | 'created_at'> & { created_at?: string };
        Update: Partial<ActivityLog>;
        Relationships: [];
      };
      system_state: {
        Row: SystemState;
        Insert: Partial<SystemState> & Pick<SystemState, 'state_key'>;
        Update: Partial<SystemState>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_initial_setup: {
        Args: Record<string, never>;
        Returns: string;
      };
      complete_initial_setup: {
        Args: { p_claim_token: string };
        Returns: undefined;
      };
      release_initial_setup: {
        Args: { p_claim_token: string };
        Returns: undefined;
      };
      start_packing_session: {
        Args: { p_camera_label?: string | null; p_user_agent?: string | null };
        Returns: PackingSession[];
      };
      heartbeat_packing_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      finish_packing_session: {
        Args: { p_session_id: string; p_status?: SessionStatus };
        Returns: PackingSession[];
      };
      register_video_segment: {
        Args: {
          p_client_id: string;
          p_session_id: string;
          p_order_number: string;
          p_barcode: string;
          p_sequence_no: number;
          p_start_time: string;
          p_end_time: string;
          p_duration_ms: number;
          p_filename: string;
          p_mime_type: string;
          p_filesize: number;
          p_storage_path: string;
        };
        Returns: VideoRecord[];
      };
      mark_video_uploading: {
        Args: { p_client_id: string; p_progress?: number };
        Returns: undefined;
      };
      complete_video_upload: {
        Args: { p_client_id: string; p_filesize: number; p_mime_type: string };
        Returns: VideoRecord[];
      };
      fail_video_upload: {
        Args: { p_client_id: string; p_error: string; p_retry_count: number };
        Returns: undefined;
      };
      cancel_video_segment: {
        Args: { p_client_id: string };
        Returns: undefined;
      };
      get_dashboard_stats: {
        Args: Record<string, never>;
        Returns: DashboardStats[];
      };
      save_app_settings: {
        Args: { p_settings: Json };
        Returns: AppSetting[];
      };
      log_activity: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id?: string | null;
          p_details?: Json;
        };
        Returns: number;
      };
    };
    Enums: {
      user_role: UserRole;
      packing_session_status: SessionStatus;
      video_upload_status: UploadStatus;
      video_processing_status: ProcessingStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
