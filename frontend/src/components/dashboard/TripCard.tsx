import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, Users, Wallet, ArrowRight, Plane, Building2 } from 'lucide-react';
import { Trip } from '../../types/trip';

interface TripCardProps {
  trip: Trip;
}

export const TripCard: React.FC<TripCardProps> = ({ trip }) => {
  const startDateStr = new Date(trip.startDate).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const endDateStr = new Date(trip.endDate).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const statusColors = {
    PLANNING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    CONFIRMED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    ACTIVE: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    COMPLETED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    CANCELLED: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700 transition-all duration-300 flex flex-col justify-between group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              statusColors[trip.status] || statusColors.PLANNING
            }`}
          >
            {trip.status}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{trip.totalDays} Days</span>
          </div>
        </div>

        <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition-colors line-clamp-1">
          {trip.title}
        </h3>

        <div className="flex items-center gap-2 text-sm text-slate-400 mt-2">
          <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="truncate">{trip.origin} → {trip.destination}</span>
        </div>

        <p className="text-xs text-slate-500 mt-1">
          {startDateStr} – {endDateStr}
        </p>

        {trip.itineraries && trip.itineraries[0] && (
          <p className="text-xs text-slate-300 mt-3 line-clamp-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
            {trip.itineraries[0].summary}
          </p>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>{trip.travelers} {trip.travelers === 1 ? 'Traveler' : 'Travelers'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span>₹{Number(trip.totalBudget).toLocaleString('en-IN')}</span>
          </div>
          {trip._count && (
            <div className="flex items-center gap-2 ml-auto text-slate-400">
              {trip._count.flightOptions > 0 && (
                <span className="flex items-center gap-0.5" title="Flights researched">
                  <Plane className="w-3 h-3 text-teal-400" />
                  {trip._count.flightOptions}
                </span>
              )}
              {trip._count.hotelOptions > 0 && (
                <span className="flex items-center gap-0.5" title="Hotels researched">
                  <Building2 className="w-3 h-3 text-cyan-400" />
                  {trip._count.hotelOptions}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-slate-800/60">
        <Link
          to={`/app?tripId=${trip.id}`}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-teal-500 hover:text-slate-950 text-slate-200 text-xs font-semibold transition-all duration-200 group/btn"
        >
          <span>Open Trip Workspace</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
};
