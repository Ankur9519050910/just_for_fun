import React from 'react';
import {
  Calendar,
  MapPin,
  Landmark,
  Utensils,
  Zap,
  Waves,
  Eye
} from 'lucide-react';
import { DayItinerary, ItineraryActivityItem } from '../../types/trip';

interface ItineraryTabProps {
  itinerary: DayItinerary[];
}

export const ItineraryTab: React.FC<ItineraryTabProps> = ({ itinerary }) => {
  if (!itinerary || itinerary.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-3">
          <Calendar className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">No Itinerary Generated Yet</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Once the autonomous travel agent finishes researching flights and hotels, your day-by-day geographically clustered plan will appear here.
        </p>
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    const cat = category.toUpperCase();
    if (cat === 'HERITAGE') return <Landmark className="w-3.5 h-3.5 text-amber-400" />;
    if (cat === 'DINING') return <Utensils className="w-3.5 h-3.5 text-emerald-400" />;
    if (cat === 'ADVENTURE') return <Zap className="w-3.5 h-3.5 text-rose-400" />;
    if (cat === 'RELAXATION') return <Waves className="w-3.5 h-3.5 text-cyan-400" />;
    if (cat === 'SIGHTSEEING') return <Eye className="w-3.5 h-3.5 text-indigo-400" />;
    return <MapPin className="w-3.5 h-3.5 text-teal-400" />;
  };

  const getTimeSlotColor = (slot: string) => {
    switch (slot) {
      case 'MORNING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'AFTERNOON':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'EVENING':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'NIGHT':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      default:
        return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-400" />
            <span>Day-by-Day Geographically Clustered Itinerary</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Optimized for minimal intra-day transit times and realistic travel pacing
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">
          {itinerary.length} Days Planned
        </span>
      </div>

      <div className="space-y-6">
        {itinerary.map((day) => (
          <div
            key={day.dayNumber}
            className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg shadow-black/20"
          >
            {/* Day Header */}
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-300 font-bold text-sm flex items-center justify-center border border-teal-500/20">
                  D{day.dayNumber}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{day.theme}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{day.date}</span>
                    <span>•</span>
                    <span className="text-teal-400 font-medium">{day.geographicCluster}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Est. Day Spend</span>
                <span className="text-xs font-bold text-emerald-400">
                  {day.dayTotalCost > 0 ? `₹${day.dayTotalCost.toLocaleString('en-IN')}` : 'Included / Free'}
                </span>
              </div>
            </div>

            {/* Activities Timeline */}
            <div className="p-4 space-y-3">
              {day.activities.map((activity: ItineraryActivityItem, idx: number) => (
                <div
                  key={idx}
                  className="flex gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors"
                >
                  {/* Category Indicator Icon */}
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    {getCategoryIcon(activity.category)}
                  </div>

                  {/* Activity Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <h5 className="text-xs font-bold text-slate-200">{activity.title}</h5>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getTimeSlotColor(
                            activity.timeSlot
                          )}`}
                        >
                          {activity.timeSlot} {activity.startTime && `(${activity.startTime} - ${activity.endTime})`}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {activity.category}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed mb-2">{activity.description}</p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                      <div className="flex items-center gap-1.5 text-slate-400 truncate">
                        <MapPin className="w-3 h-3 text-teal-400 shrink-0" />
                        <span className="truncate">{activity.locationName}</span>
                      </div>
                      <span className="text-emerald-400 font-semibold shrink-0">
                        {activity.estimatedCost > 0
                          ? `₹${activity.estimatedCost.toLocaleString('en-IN')}`
                          : 'No entry charge'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
