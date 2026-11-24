import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation } from 'lucide-react';
import { DayItinerary, NormalizedHotelOffer, ItineraryActivityItem } from '../../types/trip';

// Fix Leaflet's default marker icon paths in Vite bundles
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

interface MapTabProps {
  itinerary: DayItinerary[];
  hotels: NormalizedHotelOffer[];
  destinationCoords?: { lat: number; lng: number } | null;
  destinationName?: string;
}

export const MapTab: React.FC<MapTabProps> = ({
  itinerary,
  hotels,
  destinationCoords,
  destinationName
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Collect all unique activity coordinates from the itinerary
  const allActivities: Array<{ activity: ItineraryActivityItem; dayNumber: number }> = [];
  itinerary.forEach((day) => {
    day.activities.forEach((act) => {
      if (act.latitude && act.longitude) {
        allActivities.push({ activity: act, dayNumber: day.dayNumber });
      }
    });
  });

  const hasPins = allActivities.length > 0 || hotels.length > 0;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Determine initial center
    let centerLat = destinationCoords?.lat ?? 15.2993;
    let centerLng = destinationCoords?.lng ?? 74.1240;

    if (hotels.length > 0 && hotels[0].latitude && hotels[0].longitude) {
      centerLat = hotels[0].latitude;
      centerLng = hotels[0].longitude;
    } else if (allActivities.length > 0) {
      centerLat = allActivities[0].activity.latitude;
      centerLng = allActivities[0].activity.longitude;
    }

    // Initialize Map
    const map = L.map(mapContainerRef.current).setView([centerLat, centerLng], 11);
    mapInstanceRef.current = map;

    // Dark-themed CartoDB tile layer for sleek dark UI
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    // 1. Plot Hotel Markers (Blue pin marker)
    hotels.forEach((hotel) => {
      if (!hotel.latitude || !hotel.longitude) return;
      const latLng = L.latLng(hotel.latitude, hotel.longitude);
      bounds.extend(latLng);

      const hotelIcon = L.divIcon({
        className: 'custom-hotel-pin',
        html: `
          <div style="background-color: #0284c7; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); border: 2px solid white; font-weight: bold; font-size: 14px;">
            🏨
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const popupContent = `
        <div style="font-family: sans-serif; min-width: 180px; padding: 2px;">
          <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold; color: #0f172a;">${hotel.hotelName}</h4>
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #475569;">${hotel.address || hotel.city}</p>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: #0369a1; border-top: 1px solid #e2e8f0; padding-top: 4px;">
            <span>★ ${hotel.starRating || 4} Stars</span>
            <span>₹${hotel.pricePerNight?.toLocaleString('en-IN') || '4,000'}/night</span>
          </div>
        </div>
      `;

      L.marker(latLng, { icon: hotelIcon }).bindPopup(popupContent).addTo(map);
    });

    // 2. Plot Attraction / Activity Markers (Color-coded circles)
    allActivities.forEach(({ activity, dayNumber }) => {
      const latLng = L.latLng(activity.latitude, activity.longitude);
      bounds.extend(latLng);

      let pinColor = '#14b8a6'; // teal default
      const cat = (activity.category || '').toUpperCase();
      if (cat === 'HERITAGE') pinColor = '#f59e0b'; // amber
      else if (cat === 'DINING') pinColor = '#10b981'; // emerald
      else if (cat === 'ADVENTURE') pinColor = '#f43f5e'; // rose
      else if (cat === 'RELAXATION') pinColor = '#06b6d4'; // cyan
      else if (cat === 'SIGHTSEEING') pinColor = '#8b5cf6'; // violet

      const activityIcon = L.divIcon({
        className: 'custom-activity-pin',
        html: `
          <div style="background-color: ${pinColor}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4); border: 2px solid white; font-weight: bold; font-size: 11px;">
            ${dayNumber}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const popupContent = `
        <div style="font-family: sans-serif; min-width: 180px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: 700; color: ${pinColor}; text-transform: uppercase;">Day ${dayNumber} • ${activity.timeSlot}</span>
            <span style="font-size: 10px; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; color: #475569;">${activity.category}</span>
          </div>
          <h4 style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #0f172a;">${activity.title}</h4>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b; line-height: 1.3;">${activity.locationName}</p>
          <div style="font-size: 11px; font-weight: 600; color: #059669; border-top: 1px solid #e2e8f0; padding-top: 4px;">
            Est. Cost: ${activity.estimatedCost > 0 ? `₹${activity.estimatedCost.toLocaleString('en-IN')}` : 'Free Entry'}
          </div>
        </div>
      `;

      L.marker(latLng, { icon: activityIcon }).bindPopup(popupContent).addTo(map);
    });

    // Fit map view to bounds if pins exist
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [allActivities.length, hotels.length, destinationCoords?.lat, destinationCoords?.lng]);

  return (
    <div className="space-y-4">
      {/* Map Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Navigation className="w-4 h-4 text-teal-400" />
            <span>Interactive Geographical Map</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {destinationName
              ? `Visualizing hotels and activities for ${destinationName}`
              : 'Visualize your hotel accommodation and geographically clustered itinerary activities'}
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-sky-600 border border-white inline-block" />
            <span>Hotel</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 border border-white inline-block" />
            <span>Heritage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white inline-block" />
            <span>Dining</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 border border-white inline-block" />
            <span>Adventure</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-cyan-500 border border-white inline-block" />
            <span>Relaxation</span>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="rounded-2xl border border-slate-800 overflow-hidden shadow-2xl relative">
        <div
          ref={mapContainerRef}
          style={{ height: '520px', width: '100%', zIndex: 10 }}
          className="bg-slate-900"
        />

        {!hasPins && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-3">
              <MapPin className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">Awaiting Inventory Discovery</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Your hotels and itinerary attractions will automatically render here with custom category pins once the agent completes research.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
