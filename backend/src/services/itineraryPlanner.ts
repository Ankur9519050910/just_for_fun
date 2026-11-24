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

export function planItinerary(input: ItineraryPlannerInput): DayItinerary[] {
  const totalDays = Math.max(1, input.totalDays || 1);
  const destination = input.destinationName || 'Destination';

  // Base date parsing
  let baseDate = new Date();
  if (input.startDate) {
    const parsed = new Date(input.startDate);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    }
  }

  // Primary hotel details if available
  const primaryHotel = input.hotelResults && input.hotelResults.length > 0 ? input.hotelResults[0] : null;
  const hotelLat = primaryHotel?.latitude ?? 15.2993;
  const hotelLng = primaryHotel?.longitude ?? 74.1240;
  const hotelName = primaryHotel?.hotelName ?? 'Selected Hotel';

  // Distribute attractions across the days
  const attractions = [...(input.attractionResults || [])];
  const dayBuckets: DestinationAttraction[][] = Array.from({ length: totalDays }, () => []);

  // Round-robin distribution
  attractions.forEach((attraction, index) => {
    const dayIndex = index % totalDays;
    dayBuckets[dayIndex].push(attraction);
  });

  const itinerary: DayItinerary[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dayDate = new Date(baseDate.getTime() + (d - 1) * 86400000).toISOString().split('T')[0];
    const dayAttractions = dayBuckets[d - 1] || [];

    // Geographic Proximity Sorting within the day (sort by latitude as proximity cluster heuristic)
    dayAttractions.sort((a, b) => a.latitude - b.latitude);

    const activities: ItineraryActivityItem[] = [];

    // Day 1: Include Hotel Check-in as first activity in early afternoon
    if (d === 1) {
      activities.push({
        timeSlot: 'AFTERNOON',
        startTime: '14:00',
        endTime: '15:00',
        title: `Hotel Check-in & Orientation`,
        description: `Check in at ${hotelName}, unpack, and freshen up before beginning the itinerary.`,
        locationName: hotelName,
        latitude: hotelLat,
        longitude: hotelLng,
        estimatedCost: 0,
        category: 'RELAXATION'
      });
    }

    // Assign time slots to day attractions
    dayAttractions.forEach((attraction, idx) => {
      let timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' = 'MORNING';
      let startTime = '10:00';
      let endTime = '12:30';

      const cat = (attraction.category || '').toUpperCase();
      if (cat === 'HERITAGE' || cat === 'SIGHTSEEING') {
        timeSlot = 'MORNING';
        startTime = idx === 0 ? '09:00' : '11:00';
        endTime = idx === 0 ? '11:00' : '13:00';
      } else if (cat === 'ADVENTURE') {
        timeSlot = 'AFTERNOON';
        startTime = '14:30';
        endTime = '17:00';
      } else if (cat === 'RELAXATION') {
        timeSlot = 'AFTERNOON';
        startTime = '16:30';
        endTime = '18:30';
      } else if (cat === 'DINING') {
        timeSlot = 'EVENING';
        startTime = '19:30';
        endTime = '21:30';
      } else {
        // Fallback distribution by index
        if (idx % 3 === 0) {
          timeSlot = 'MORNING';
          startTime = '09:30';
          endTime = '12:00';
        } else if (idx % 3 === 1) {
          timeSlot = 'AFTERNOON';
          startTime = '14:30';
          endTime = '17:00';
        } else {
          timeSlot = 'EVENING';
          startTime = '19:00';
          endTime = '21:00';
        }
      }

      activities.push({
        timeSlot,
        startTime,
        endTime,
        title: attraction.title,
        description: attraction.description,
        locationName: attraction.locationName,
        latitude: attraction.latitude,
        longitude: attraction.longitude,
        estimatedCost: attraction.estimatedCost || 0,
        category: attraction.category
      });
    });

    // Determine geographic cluster based on average latitude
    let geographicCluster = `Central ${destination}`;
    if (dayAttractions.length > 0) {
      const avgLat = dayAttractions.reduce((sum, a) => sum + a.latitude, 0) / dayAttractions.length;
      if (avgLat > 15.5) {
        geographicCluster = `North ${destination}`;
      } else if (avgLat < 15.2) {
        geographicCluster = `South ${destination}`;
      }
    }

    // Determine weather note if forecast available
    const forecast = input.weatherForecast?.[d - 1];
    let weatherNote = '';
    if (forecast) {
      weatherNote = ` (${forecast.maxTempC}°C, ${forecast.condition})`;
    }

    // Day Theme
    let theme = `Day ${d}: ${destination} Exploration${weatherNote}`;
    if (d === 1) {
      theme = `Day 1: Arrival, Check-in & ${geographicCluster} Sights${weatherNote}`;
    } else if (d === totalDays) {
      theme = `Day ${d}: Leisure, Souvenirs & Farewell${weatherNote}`;
    }

    // Day total cost
    const dayTotalCost = activities.reduce((sum, a) => sum + a.estimatedCost, 0);

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
