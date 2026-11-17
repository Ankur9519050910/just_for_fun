import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, Plane, Utensils, Star, DollarSign, Gauge } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { useAuth } from '../context/AuthContext';

const AVAILABLE_AIRLINES = [
  { code: '6E', name: 'IndiGo' },
  { code: 'AI', name: 'Air India' },
  { code: 'UK', name: 'Vistara' },
  { code: 'SG', name: 'SpiceJet' },
  { code: 'QP', name: 'Akasa Air' },
  { code: 'EK', name: 'Emirates' }
];

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Seafood Lover',
  'Halal',
  'Jain Friendly',
  'Authentic Local Food'
];

export const ProfilePage: React.FC = () => {
  const { user, updatePreferences } = useAuth();
  const prefs = user?.preferences;

  const [homeAirport, setHomeAirport] = useState(prefs?.homeAirport || 'CCU');
  const [preferredAirlines, setPreferredAirlines] = useState<string[]>(prefs?.preferredAirlines || ['6E', 'AI']);
  const [hotelMinRating, setHotelMinRating] = useState<number>(prefs?.hotelMinRating || 4.0);
  const [dietaryPref, setDietaryPref] = useState<string[]>(prefs?.dietaryPref || ['Seafood Lover', 'Authentic Local Food']);
  const [travelPace, setTravelPace] = useState<'RELAXED' | 'BALANCED' | 'PACKED'>(prefs?.travelPace || 'BALANCED');
  const [currency, setCurrency] = useState(prefs?.currency || 'INR');

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  const toggleAirline = (code: string) => {
    setPreferredAirlines((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleDiet = (diet: string) => {
    setDietaryPref((prev) =>
      prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(false);

    try {
      await updatePreferences({
        homeAirport: homeAirport.toUpperCase().trim(),
        preferredAirlines,
        hotelMinRating,
        dietaryPref,
        travelPace,
        currency
      });
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 3000);
    } catch (err) {
      console.error('Failed to update preferences', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-teal-400" />
              <span>Traveler Profile & Preferences</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Your autonomous AI agent leverages these defaults when planning flights, hotels, and itineraries.
            </p>
          </div>

          {successMessage && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>Preferences Saved</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="mt-8 space-y-8">
          {/* User Account Details */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
              Account Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200">
                  {user?.name}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Email</label>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200">
                  {user?.email}
                </div>
              </div>
            </div>
          </div>

          {/* Flight Preferences */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Plane className="w-4 h-4 text-teal-400" />
              <span>Flight & Departure Defaults</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Home Airport (IATA 3-Letter Code)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={homeAirport}
                  onChange={(e) => setHomeAirport(e.target.value.toUpperCase())}
                  placeholder="CCU"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">E.g., CCU (Kolkata), DEL (Delhi), BOM (Mumbai)</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Preferred Currency</span>
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="INR">INR (₹ - Indian Rupee)</option>
                  <option value="USD">USD ($ - US Dollar)</option>
                  <option value="EUR">EUR (€ - Euro)</option>
                  <option value="GBP">GBP (£ - British Pound)</option>
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Preferred Airlines
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_AIRLINES.map((airline) => {
                  const isSelected = preferredAirlines.includes(airline.code);
                  return (
                    <button
                      type="button"
                      key={airline.code}
                      onClick={() => toggleAirline(airline.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {airline.name} ({airline.code})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Hotel & Experience Preferences */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span>Hotel & Pace Preferences</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Minimum Star / User Rating: <span className="text-teal-400">{hotelMinRating.toFixed(1)} ★</span>
                </label>
                <input
                  type="range"
                  min="3.0"
                  max="5.0"
                  step="0.1"
                  value={hotelMinRating}
                  onChange={(e) => setHotelMinRating(parseFloat(e.target.value))}
                  className="w-full accent-teal-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>3.0 (Budget)</span>
                  <span>4.0 (Comfort)</span>
                  <span>5.0 (Luxury)</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Travel Pace</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['RELAXED', 'BALANCED', 'PACKED'] as const).map((pace) => (
                    <button
                      type="button"
                      key={pace}
                      onClick={() => setTravelPace(pace)}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border text-center transition-all ${
                        travelPace === pace
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {pace}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-orange-400" />
                <span>Dietary & Culinary Preferences</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((diet) => {
                  const isSelected = dietaryPref.includes(diet);
                  return (
                    <button
                      type="button"
                      key={diet}
                      onClick={() => toggleDiet(diet)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {diet}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all duration-200 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
