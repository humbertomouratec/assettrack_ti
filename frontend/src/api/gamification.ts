import { apiClient } from './client';
import type { UserProfileSummary, LeaderboardEntry, LeaderboardResponse } from '../types/gamification';

export const getMyGamificationProfile = async (): Promise<UserProfileSummary> => {
  const response = await apiClient.get<UserProfileSummary>('/gamification/me');
  return response.data;
};

export const getGamificationLeaderboard = async (
  period: 'all' | 'weekly' | 'monthly' = 'all',
  limit: number = 30,
  offset: number = 0
): Promise<LeaderboardEntry[]> => {
  const response = await apiClient.get<LeaderboardResponse | LeaderboardEntry[]>(
    `/gamification/leaderboard?period=${period}&limit=${limit}&offset=${offset}`
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.entries || [];
};

export const getUserGamificationProfile = async (userId: number): Promise<UserProfileSummary> => {
  const response = await apiClient.get<UserProfileSummary>(`/gamification/user/${userId}`);
  return response.data;
};
