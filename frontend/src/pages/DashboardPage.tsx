import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Compass, Sparkles, AlertCircle } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { StatsOverview } from '../components/dashboard/StatsOverview';
import { TripCard } from '../components/dashboard/TripCard';
import { tripsApi } from '../api/tripsApi';
import { Trip, DashboardSummary } from '../types/trip';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [tripsData, summaryData] = await Promise.all([
          tripsApi.listUserTrips(),
          tripsApi.getDashboardSummary()
        ]);
        setTrips(tripsData);
        setSummary(summaryData);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Header with Welcome and New Trip Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Welcome back, {user?.name.split(' ')[0] || 'Traveler'}</span>
              <span className="text-xl">✨</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Your autonomous travel orchestrator is ready to plan, optimize, and book.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              <span>Launch AI Workspace</span>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-8">
          <StatsOverview
            stats={
              summary?.stats || {
                totalTrips: trips.length,
                upcomingTrips: trips.filter((t) => new Date(t.startDate) >= new Date()).length,
                completedTrips: trips.filter((t) => new Date(t.endDate) < new Date()).length,
                totalBookings: 0
              }
            }
          />
        </div>

        {/* Trips List Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-teal-400" />
                <span>Your Planned Itineraries</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage upcoming journeys, review flight/hotel options, and track budgets
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-slate-900/60 rounded-2xl border border-slate-800" />
              ))}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 border border-slate-800/80 rounded-2xl px-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto mb-4 border border-teal-500/20">
                <Compass className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">No trips planned yet</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                Ready to explore? Tell our AI travel agent where you want to go and let it do the research.
              </p>
              <Link
                to="/app"
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Trip</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
