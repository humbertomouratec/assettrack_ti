import { apiClient as api } from './client';

export interface BackupStatus {
  is_running: boolean;
  progress: string;
  error?: string;
}

export interface BackupFile {
  filename: string;
  size: number;
  date: string;
}

export const backupApi = {
  list: async (): Promise<BackupFile[]> => {
    const res = await api.get<BackupFile[]>('/backups');
    return res.data;
  },

  getStatus: async (): Promise<BackupStatus> => {
    const res = await api.get<BackupStatus>('/backups/status');
    return res.data;
  },

  generate: async (): Promise<{ message: string }> => {
    const res = await api.post<{ message: string }>('/backups/generate');
    return res.data;
  },

  delete: async (filename: string): Promise<void> => {
    await api.delete(`/backups/${filename}`);
  },

  restore: async (file: File): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('backup_file', file);
    formData.append('restore_confirmation', 'RESTAURAR');

    const res = await api.post<{ message: string }>('/backups/restore', formData, {
      // Let Axios/browser set the multipart boundary automatically.
      // Manually setting this header can make the API reject the upload.
    });
    return res.data;
  },

  downloadUrl: (filename: string): string => {
    return `${api.defaults.baseURL}/backups/download/${filename}`;
  },
};
