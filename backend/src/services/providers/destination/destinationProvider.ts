import axios from 'axios';
import { IDestinationProvider } from '../interfaces';
import { DestinationAttraction } from '../../../agent/types';
import { AIRPORT_REGISTRY } from '../../../agent/intentParser';
import { logger } from '../../../config/logger';

interface DestinationMetadata {
  latitude: number;
  longitude: number;
  iataCode?: string;
  attractions: DestinationAttraction[];
}

const DESTINATION_REGISTRY: Record<string, DestinationMetadata> = {
  goa: {
    latitude: 15.2993,
    longitude: 74.1240,
    iataCode: 'GOI',
    attractions: [
      {
        title: 'Basilica of Bom Jesus & Se Cathedral',
        description: 'UNESCO World Heritage 16th-century baroque churches holding the mortal remains of St. Francis Xavier.',
        locationName: 'Old Goa',
        latitude: 15.5009,
        longitude: 73.9116,
        category: 'HERITAGE',
        estimatedCost: 200,
        recommendedDurationMins: 180
      },
      {
        title: 'Baga & Calangute Water Sports Adventure',
        description: 'Parasailing, jet-skiing, bumper rides, and banana boat adventures along North Goa’s energetic coastline.',
        locationName: 'Baga Beach, North Goa',
        latitude: 15.5553,
        longitude: 73.7517,
        category: 'ADVENTURE',
        estimatedCost: 2500,
        recommendedDurationMins: 240
      },
      {
        title: 'Authentic Goan Seafood Dining at Martin’s Corner',
        description: 'Legendary culinary destination renowned for Goan prawn balchão, butter garlic lobster, and Kingfish rawa fry.',
        locationName: 'Betalbatim, South Goa',
        latitude: 15.2936,
        longitude: 73.9216,
        category: 'DINING',
        estimatedCost: 1500,
        recommendedDurationMins: 90
      },
      {
        title: 'Palolem Beach Sunset & Kayaking',
        description: 'Picturesque crescent-shaped beach surrounded by coconut palms, ideal for calm-water kayaking and cliffside views.',
        locationName: 'Palolem Beach, Canacona',
        latitude: 15.0100,
        longitude: 74.0232,
        category: 'RELAXATION',
        estimatedCost: 800,
        recommendedDurationMins: 180
      },
      {
        title: 'Fontainhas Latin Quarter Walking Tour',
        description: 'Vibrant Portuguese heritage district featuring colorful 18th-century mansions, historic bakeries, and art galleries.',
        locationName: 'Fontainhas, Panaji',
        latitude: 15.4989,
        longitude: 73.8315,
        category: 'HERITAGE',
        estimatedCost: 300,
        recommendedDurationMins: 120
      }
    ]
  },
  kolkata: {
    latitude: 22.5726,
    longitude: 88.3639,
    iataCode: 'CCU',
    attractions: [
      {
        title: 'Victoria Memorial & Maidan Walk',
        description: 'Grand marble architectural landmark built in British colonial era with lush gardens and art museum.',
        locationName: 'Queens Way, Kolkata',
        latitude: 22.5448,
        longitude: 88.3426,
        category: 'HERITAGE',
        estimatedCost: 150,
        recommendedDurationMins: 150
      }
    ]
  },
  delhi: {
    latitude: 28.6139,
    longitude: 77.2090,
    iataCode: 'DEL',
    attractions: [
      {
        title: 'Qutub Minar & Mehrauli Archaeological Park',
        description: 'UNESCO World Heritage 73-meter minaret built in 1193 with intricate medieval Islamic architecture.',
        locationName: 'Mehrauli, New Delhi',
        latitude: 28.5245,
        longitude: 77.1855,
        category: 'HERITAGE',
        estimatedCost: 250,
        recommendedDurationMins: 120
      }
    ]
  },
  mumbai: {
    latitude: 19.0760,
    longitude: 72.8777,
    iataCode: 'BOM',
    attractions: [
      {
        title: 'Gateway of India & Marine Drive Promenade',
        description: 'Historic waterfront monument facing the Arabian Sea followed by Queen’s Necklace evening sunset view.',
        locationName: 'Colaba, Mumbai',
        latitude: 18.9220,
        longitude: 72.8347,
        category: 'SIGHTSEEING',
        estimatedCost: 100,
        recommendedDurationMins: 180
      }
    ]
  },
  jaipur: {
    latitude: 26.9124,
    longitude: 75.7873,
    iataCode: 'JAI',
    attractions: [
      {
        title: 'Amber Palace & Fort',
        description: 'Historic hilltop fort built with red sandstone and marble featuring artistic Hindu style elements.',
        locationName: 'Devisinghpura, Amer, Jaipur',
        latitude: 26.9855,
        longitude: 75.8513,
        category: 'HERITAGE',
        estimatedCost: 500,
        recommendedDurationMins: 240
      }
    ]
  },
  coorg: {
    latitude: 12.3375,
    longitude: 75.8069,
    iataCode: undefined, // No commercial airport - flights will be skipped, hotels and nature activities proceed
    attractions: [
      {
        title: 'Abbey Falls & Coffee Estate Trail',
        description: 'Cascading waterfall amidst lush spice and coffee plantations in the Western Ghats.',
        locationName: 'Madikeri, Coorg',
        latitude: 12.4516,
        longitude: 75.7176,
        category: 'RELAXATION',
        estimatedCost: 150,
        recommendedDurationMins: 120
      }
    ]
  },
  paris: {
    latitude: 48.8566,
    longitude: 2.3522,
    iataCode: 'CDG',
    attractions: [
      {
        title: 'Eiffel Tower & Champ de Mars',
        description: 'Iconic wrought-iron lattice tower on the Champ de Mars offering panoramic views of Paris.',
        locationName: 'Champ de Mars, Paris',
        latitude: 48.8584,
        longitude: 2.2945,
        category: 'SIGHTSEEING',
        estimatedCost: 2500,
        recommendedDurationMins: 180
      }
    ]
  }
};

export class DestinationProvider implements IDestinationProvider {
  async getCoordinates(destination: string): Promise<{ latitude?: number; longitude?: number; iataCode?: string; isResolved: boolean }> {
    const key = destination.toLowerCase().trim();

    // 1. Check verified local registry
    for (const [cityKey, meta] of Object.entries(DESTINATION_REGISTRY)) {
      if (key.includes(cityKey)) {
        return {
          latitude: meta.latitude,
          longitude: meta.longitude,
          iataCode: meta.iataCode,
          isResolved: true
        };
      }
    }

    // 2. Reliable geocoding integration via Open-Meteo Geocoding API
    try {
      const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: destination,
          count: 1,
          language: 'en',
          format: 'json'
        },
        timeout: 4000
      });

      const results = response.data?.results;
      if (results && results.length > 0) {
        const top = results[0];
        const registeredIata = AIRPORT_REGISTRY[key];
        return {
          latitude: top.latitude,
          longitude: top.longitude,
          iataCode: registeredIata,
          isResolved: true
        };
      }
    } catch (err: any) {
      logger.warn(`Geocoding lookup failed for destination "${destination}": ${err.message}`, 'DestinationProvider');
    }

    // 3. If geocoding fails, represent destination as UNRESOLVED
    // Never fabricate India-centre or generic default coordinates
    return {
      latitude: undefined,
      longitude: undefined,
      iataCode: undefined,
      isResolved: false
    };
  }

  async getAttractions(destination: string, vibes: string[] = []): Promise<DestinationAttraction[]> {
    const key = destination.toLowerCase().trim();
    let registryEntry: DestinationMetadata | undefined;

    for (const [cityKey, meta] of Object.entries(DESTINATION_REGISTRY)) {
      if (key.includes(cityKey)) {
        registryEntry = meta;
        break;
      }
    }

    if (!registryEntry) {
      // Check if coordinates can be resolved through geocoding
      const coords = await this.getCoordinates(destination);
      if (!coords.isResolved || coords.latitude === undefined || coords.longitude === undefined) {
        // Do not fabricate attractions for unresolved destinations
        return [];
      }

      registryEntry = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        iataCode: coords.iataCode,
        attractions: [
          {
            title: `Discover ${destination} Local Heritage & Culture`,
            description: `Explore the premier cultural landmarks, museums, and historical districts in ${destination}.`,
            locationName: `Central ${destination}`,
            latitude: coords.latitude,
            longitude: coords.longitude,
            category: 'HERITAGE',
            estimatedCost: 500,
            recommendedDurationMins: 180
          },
          {
            title: `Scenic Highlights & City Walk of ${destination}`,
            description: `Guided tour through picturesque views, parks, and iconic architecture across ${destination}.`,
            locationName: `${destination} City Center`,
            latitude: coords.latitude,
            longitude: coords.longitude,
            category: 'SIGHTSEEING',
            estimatedCost: 300,
            recommendedDurationMins: 120
          },
          {
            title: `Authentic Local Cuisine Tasting in ${destination}`,
            description: `Experience famous local food markets, traditional restaurants, and regional culinary specialties in ${destination}.`,
            locationName: `${destination} Food District`,
            latitude: coords.latitude,
            longitude: coords.longitude,
            category: 'DINING',
            estimatedCost: 1200,
            recommendedDurationMins: 90
          }
        ]
      };
    }

    const allAttractions: DestinationAttraction[] = registryEntry.attractions;

    if (vibes.length === 0) {
      return allAttractions;
    }

    // Sort/boost attractions matching requested vibe
    const lowerVibes = vibes.map((v) => v.toLowerCase());
    return [...allAttractions].sort((a, b) => {
      const aMatches = lowerVibes.some((v) => 
        a.category.toLowerCase().includes(v) || a.description.toLowerCase().includes(v) || a.title.toLowerCase().includes(v)
      );
      const bMatches = lowerVibes.some((v) => 
        b.category.toLowerCase().includes(v) || b.description.toLowerCase().includes(v) || b.title.toLowerCase().includes(v)
      );
      return (bMatches ? 1 : 0) - (aMatches ? 1 : 0);
    });
  }
}

export const destinationProvider = new DestinationProvider();
