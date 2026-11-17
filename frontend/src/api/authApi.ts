import { apiClient } from './apiClient';
import { AuthResponse, LoginCredentials, RegisterCredentials, User, UserPreferences } from '../types/auth';

export const authApi = {
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const res = await apiClient.post('/auth/register', credentials);
    return res.data.data;
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const res = await apiClient.post('/auth/login', credentials);
    return res.data.data;
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get('/auth/me');
    return res.data.data.user;
  },

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const res = await apiClient.put('/preferences', preferences);
    return res.data.data.preferences;
  }
};
