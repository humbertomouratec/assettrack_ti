export interface SystemVersionInfo {
  commit_hash: string;
  full_hash: string;
  branch: string;
  commit_date: string;
  commit_message: string;
  commit_author: string;
  repo_path?: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface UpdateCheckResult {
  has_updates: boolean;
  behind_count: number;
  current_branch: string;
  checked_at: string;
  commits: CommitInfo[];
}

export interface UpdateJobResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface UpdateStatusResponse {
  job_id: string;
  is_running: boolean;
  status: 'idle' | 'checking' | 'updating' | 'completed' | 'error';
  logs: string[];
  error?: string;
}
