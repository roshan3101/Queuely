export type ApiResponse<T> = { success: boolean; data: T; request_id?: string | null };

export type SessionRecord = {
  id: string;
  title: string;
  status: string;
  model_name: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRecord = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  sequence_number: number;
  created_at: string;
  referenced_files: string[];
};

export type FileRecord = {
  id: string;
  session_id: string | null;
  original_name: string;
  language: string | null;
  status: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  storage_provider: string | null;
  storage_url: string | null;
};

export type FileUploadResponse = {
  file_id: string;
  status: string;
  original_name: string;
  size_bytes: number;
  storage_provider: string | null;
  storage_url: string | null;
  cloudinary_public_id: string | null;
};

export type FileDeleteResponse = {
  file_id: string;
  deleted: boolean;
};

export type QueueDepth = { name: string; depth: number };

export type WorkerRecord = {
  worker_name: string;
  queue_name: string;
  hostname: string;
  process_id: number;
  last_seen_at: string;
  active_jobs: number;
  healthy: boolean;
};

export type JobRecord = {
  id: string;
  job_type: string;
  status: string;
  queue_name: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

export type RateLimitBucketRecord = {
  user_id: string;
  bucket_name: string;
  capacity: number;
  refill_rate: number;
  tokens: number;
  last_refill_at: string;
};
