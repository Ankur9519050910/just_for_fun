import {
  DestinationAttraction,
  NormalizedHotelOffer,
  WeatherForecastDay,
  DayItinerary,
  ItineraryActivityItem
} from '../agent/types';

export interface ItineraryPlannerInput {
  attractionResults: DestinationAttraction[];
  hotelResults: NormalizedHotelOffer[];
  weatherForecast: WeatherForecastDay[];
  startDate: string; // YYYY-MM-DD
  totalDays: number;
  vibe?: string[];
  destinationName?: string;
}

/**
 * Calculates Haversine great-circle distance between two coordinates in kilometers.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isValidCoord(lat?: number | null, lon?: number | null): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    (lat !== 0 || lon !== 0)
  );
}

function minsToTimeStr(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.floor(totalMinutes)));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function getTimeSlot(minutes: number): 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' {
  if (minutes < 720) return 'MORNING'; // Before 12:00
  if (minutes < 1020) return 'AFTERNOON'; // 12:00 - 17:00
  if (minutes < 1260) return 'EVENING'; // 17:00 - 21:00
  return 'NIGHT'; // 21:00 onwards
}

export function planItinerary(input: ItineraryPlannerInput): DayItinerary[] {
  const totalDays = Math.max(1, Math.floor(Number(input.totalDays)) || 1);
  const destination = input.destinationName || 'Destination';

  // Base date parsing
  let baseDate = new Date();
  if (input.startDate) {
    const parsed = new Date(input.startDate);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  // 1. Hotel coordinates — NO fabricated fallback coordinates!
  const primaryHotel = input.hotelResults && input.hotelResults.length > 0 ? input.hotelResults[0] : null;
  const hasValidHotelCoords = primaryHotel && isValidCoord(primaryHotel.latitude, primaryHotel.longitude);
  const hotelLat = hasValidHotelCoords ? primaryHotel.latitude : null;
  const hotelLng = hasValidHotelCoords ? primaryHotel.longitude : null;
  const hotelName = primaryHotel?.hotelName || 'Selected Accommodation';

  // 2. Separate attractions into valid coordinates vs unresolved
  const rawAttractions = input.attractionResults || [];
  const validAttractions: DestinationAttraction[] = [];
  const unlocatedAttractions: DestinationAttraction[] = [];

  rawAttractions.forEach((a) => {
    if (isValidCoord(a.latitude, a.longitude)) {
      validAttractions.push(a);
    } else {
      unlocatedAttractions.push(a);
    }
  });

  // 3. Genuine Geographic Clustering using Haversine Distance
  const dayBuckets: DestinationAttraction[][] = Array.from({ length: totalDays }, () => []);

  if (validAttractions.length > 0) {
    const k = Math.min(totalDays, validAttractions.length);
    const seeds: DestinationAttraction[] = [];

    // Seed 1: Attraction closest to hotel if hotel coordinates are valid, otherwise first attraction
    if (hasValidHotelCoords) {
      let closestIdx = 0;
      let minHotelDist = Infinity;
      validAttractions.forEach((a, idx) => {
        const d = haversineDistanceKm(hotelLat!, hotelLng!, a.latitude, a.longitude);
        if (d < minHotelDist) {
          minHotelDist = d;
          closestIdx = idx;
        }
      });
      seeds.push(validAttractions[closestIdx]);
    } else {
      seeds.push(validAttractions[0]);
    }

    // Seeds 2..K: Furthest-First selection to maximize inter-cluster separation across days
    while (seeds.length < k) {
      let furthestIdx = -1;
      let maxDistToExistingSeeds = -1;

      validAttractions.forEach((candidate, idx) => {
        if (seeds.includes(candidate)) return;

        // Minimum distance to any already-selected seed
        const minDistToAnySeed = Math.min(
          ...seeds.map((s) => haversineDistanceKm(s.latitude, s.longitude, candidate.latitude, candidate.longitude))
        );

        if (minDistToAnySeed > maxDistToExistingSeeds) {
          maxDistToExistingSeeds = minDistToAnySeed;
          furthestIdx = idx;
        }
      });

      if (furthestIdx >= 0) {
        seeds.push(validAttractions[furthestIdx]);
      } else {
        break;
      }
    }

    // Initialize day buckets with their cluster seeds
    seeds.forEach((seed, i) => {
      dayBuckets[i].push(seed);
    });

    // Assign each remaining attraction to the nearest cluster seed
    const remaining = validAttractions.filter((a) => !seeds.includes(a));
    remaining.forEach((attraction) => {
      let nearestDayIdx = 0;
      let minDistance = Infinity;

      seeds.forEach((seed, dayIdx) => {
        const dist = haversineDistanceKm(seed.latitude, seed.longitude, attraction.latitude, attraction.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          nearestDayIdx = dayIdx;
        }
      });

      dayBuckets[nearestDayIdx].push(attraction);
    });
  }

  // Distribute any unlocated attractions round-robin across days
  unlocatedAttractions.forEach((attraction, idx) => {
    const targetDay = idx % totalDays;
    dayBuckets[targetDay].push(attraction);
  });

  const itinerary: DayItinerary[] = [];

  // 4. Build Chronological, Non-Overlapping Daily Itinerary
  for (let d = 1; d <= totalDays; d++) {
    const dayDate = new Date(baseDate.getTime() + (d - 1) * 86400000).toISOString().split('T')[0];
    const dayAttractions = [...dayBuckets[d - 1]];

    // Sort day's attractions by nearest-neighbor chain to optimize intra-day transit
    if (dayAttractions.length > 1) {
      const sorted: DestinationAttraction[] = [dayAttractions.shift()!];
      while (dayAttractions.length > 0) {
        const last = sorted[sorted.length - 1];
        let nextIdx = 0;
        let bestDist = Infinity;

        dayAttractions.forEach((candidate, cIdx) => {
          if (isValidCoord(last.latitude, last.longitude) && isValidCoord(candidate.latitude, candidate.longitude)) {
            const dist = haversineDistanceKm(last.latitude, last.longitude, candidate.latitude, candidate.longitude);
            if (dist < bestDist) {
              bestDist = dist;
              nextIdx = cIdx;
            }
          }
        });

        sorted.push(dayAttractions.splice(nextIdx, 1)[0]);
      }
      dayAttractions.push(...sorted);
    }

    const activities: ItineraryActivityItem[] = [];

    // Scheduling clock: minutes from midnight
    if (d === 1) {
      // Day 1: Split between morning sights, 14:00 hotel check-in, and afternoon/evening activities
      const morningAttractions: DestinationAttraction[] = [];
      const postCheckinAttractions: DestinationAttraction[] = [];

      dayAttractions.forEach((a, idx) => {
        if (idx === 0 && dayAttractions.length > 2) {
          morningAttractions.push(a);
        } else {
          postCheckinAttractions.push(a);
        }
      });

      let currentMins = 570; // 09:30 AM

      // Morning Activity on Day 1 (if available)
      morningAttractions.forEach((attraction) => {
        const duration = attraction.recommendedDurationMins || 90;
        const startMins = currentMins;
        const endMins = Math.min(780, startMins + duration); // Must finish by 13:00 to leave buffer for 14:00 check-in

        activities.push({
          timeSlot: getTimeSlot(startMins),
          startTime: minsToTimeStr(startMins),
          endTime: minsToTimeStr(endMins),
          title: attraction.title,
          description: attraction.description,
          locationName: attraction.locationName,
          latitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.latitude : null,
          longitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.longitude : null,
          estimatedCost: attraction.estimatedCost || 0,
          category: attraction.category
        });

        currentMins = endMins + 30; // 30 min transit
      });

      // Day 1 Hotel Check-in: strictly scheduled at 14:00 - 15:00
      activities.push({
        timeSlot: 'AFTERNOON',
        startTime: '14:00',
        endTime: '15:00',
        title: 'Hotel Check-in & Orientation',
        description: `Check in at ${hotelName}, unpack, and freshen up before afternoon activities.`,
        locationName: hotelName,
        latitude: hotelLat,
        longitude: hotelLng,
        estimatedCost: 0,
        category: 'RELAXATION'
      });

      currentMins = 930; // 15:30 PM (after 15:00 check-in + 30m buffer)
      const MAX_DAY_MINS = 1320; // 22:00 (10:00 PM) maximum scheduled hour

      // Post-checkin Activities
      postCheckinAttractions.forEach((attraction) => {
        const duration = attraction.recommendedDurationMins || (attraction.category === 'DINING' ? 90 : 75);
        const startMins = currentMins;
        const endMins = startMins + duration;

        // Schedule overflow protection: prevent unrealistic night hours or 23:59 clamping
        if (endMins > MAX_DAY_MINS) {
          if (d < totalDays) {
            // Move remaining attraction to the next day
            dayBuckets[d].push(attraction);
            return;
          }

          // On final day, mark as unscheduled/self-paced rather than assigning invalid or clamped times
          activities.push({
            timeSlot: 'EVENING',
            startTime: '',
            endTime: '',
            title: attraction.title,
            description: `${attraction.description} (Self-paced / optional evening visit)`,
            locationName: attraction.locationName,
            latitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.latitude : null,
            longitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.longitude : null,
            estimatedCost: attraction.estimatedCost || 0,
            category: attraction.category
          });
          return;
        }

        activities.push({
          timeSlot: getTimeSlot(startMins),
          startTime: minsToTimeStr(startMins),
          endTime: minsToTimeStr(endMins),
          title: attraction.title,
          description: attraction.description,
          locationName: attraction.locationName,
          latitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.latitude : null,
          longitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.longitude : null,
          estimatedCost: attraction.estimatedCost || 0,
          category: attraction.category
        });

        currentMins = endMins + 30; // 30 min transit gap
      });
    } else {
      // Day 2..totalDays: Sequential chronological schedule with transit gaps
      let currentMins = 570; // 09:30 AM start
      const MAX_DAY_MINS = 1320; // 22:00 (10:00 PM)

      dayAttractions.forEach((attraction) => {
        const duration = attraction.recommendedDurationMins || (attraction.category === 'DINING' ? 90 : 75);
        const startMins = currentMins;
        const endMins = startMins + duration;

        // Schedule overflow protection: prevent unrealistic night hours or 23:59 clamping
        if (endMins > MAX_DAY_MINS) {
          if (d < totalDays) {
            // Move remaining attraction to the next day
            dayBuckets[d].push(attraction);
            return;
          }

          // On final day, mark as unscheduled/self-paced rather than assigning invalid or clamped times
          activities.push({
            timeSlot: 'EVENING',
            startTime: '',
            endTime: '',
            title: attraction.title,
            description: `${attraction.description} (Self-paced / optional evening visit)`,
            locationName: attraction.locationName,
            latitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.latitude : null,
            longitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.longitude : null,
            estimatedCost: attraction.estimatedCost || 0,
            category: attraction.category
          });
          return;
        }

        activities.push({
          timeSlot: getTimeSlot(startMins),
          startTime: minsToTimeStr(startMins),
          endTime: minsToTimeStr(endMins),
          title: attraction.title,
          description: attraction.description,
          locationName: attraction.locationName,
          latitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.latitude : null,
          longitude: isValidCoord(attraction.latitude, attraction.longitude) ? attraction.longitude : null,
          estimatedCost: attraction.estimatedCost || 0,
          category: attraction.category
        });

        currentMins = endMins + 30; // 30 min transit buffer between stops
      });
    }

    // 5. Geographic Cluster Naming — Organic based on real location names, not hardcoded latitude thresholds
    let geographicCluster = `${destination} Central`;
    const namedLocations = activities
      .map((a) => a.locationName)
      .filter((loc) => loc && loc !== hotelName && !loc.includes('Selected'));

    if (namedLocations.length > 0) {
      geographicCluster = `${namedLocations[0]} Area`;
    }

    // 6. Weather matched strictly by exact date (no array-index fallback)
    const forecast = input.weatherForecast?.find((f) => f.date === dayDate);
    let weatherNote = '';
    if (forecast) {
      weatherNote = ` (${forecast.maxTempC}°C, ${forecast.condition})`;
    }

    // Day Theme
    let theme = `Day ${d}: ${destination} Exploration${weatherNote}`;
    if (d === 1) {
      theme = `Day 1: Arrival, Hotel Check-in & ${geographicCluster}${weatherNote}`;
    } else if (d === totalDays) {
      theme = `Day ${d}: Leisure, Highlights & Farewell${weatherNote}`;
    }

    // Day total cost
    const dayTotalCost = activities.reduce((sum, a) => sum + (Number(a.estimatedCost) || 0), 0);

    itinerary.push({
      dayNumber: d,
      date: dayDate,
      theme,
      geographicCluster,
      activities,
      dayTotalCost
    });
  }

  return itinerary;
}
