import { apiClient } from './apiClient';
import { Trip, DashboardSummary } from '../types/trip';

export const tripsApi = {
  async listUserTrips(): Promise<Trip[]> {
    const res = await apiClient.get('/trips');
    return res.data.data.trips;
  },

  async getTripById(tripId: string): Promise<Trip> {
    const res = await apiClient.get(`/trips/${tripId}`);
    return res.data.data.trip;
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await apiClient.get('/trips/summary');
    return res.data.data;
  },

  async createTrip(tripData: Partial<Trip>): Promise<Trip> {
    const res = await apiClient.post('/trips', tripData);
    return res.data.data.trip;
  }
};
