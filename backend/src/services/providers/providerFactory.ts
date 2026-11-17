import { IFlightProvider, IHotelProvider } from './interfaces';
import { AmadeusFlightProvider } from './amadeus/amadeusFlightProvider';
import { AmadeusHotelProvider } from './amadeus/amadeusHotelProvider';
import { DeterministicMockFlightProvider } from './fixtures/mockFlightProvider';
import { DeterministicMockHotelProvider } from './fixtures/mockHotelProvider';
import { amadeusClient } from './amadeus/amadeusClient';
import {
  FlightSearchParams,
  NormalizedFlightOffer,
  HotelSearchParams,
  NormalizedHotelOffer,
  ProviderErrorRecord
} from '../../agent/types';
import { logger } from '../../config/logger';

export class ResilientFlightService {
  private liveProvider: AmadeusFlightProvider;
  private mockFixtureProvider: DeterministicMockFlightProvider;

  constructor() {
    this.liveProvider = new AmadeusFlightProvider();
    this.mockFixtureProvider = new DeterministicMockFlightProvider();
  }

  async searchFlights(
    params: FlightSearchParams,
    allowFallback = true
  ): Promise<{ results: NormalizedFlightOffer[]; errorRecord?: ProviderErrorRecord }> {
    if (amadeusClient.isConfigured()) {
      try {
        logger.info('Querying live Amadeus Flight Offers API...', 'ResilientFlightService');
        const results = await this.liveProvider.searchFlights(params);
        if (results.length > 0) {
          return { results };
        }
        logger.warn('Amadeus returned 0 flight offers for test criteria, checking fallback...', 'ResilientFlightService');
      } catch (error: any) {
        const errorRecord: ProviderErrorRecord = {
          provider: 'AMADEUS_SELF_SERVICE',
          endpoint: '/v2/shopping/flight-offers',
          errorCode: error.response?.status ? `HTTP_${error.response.status}` : 'API_ERROR',
          message: error.message || 'Live Amadeus Flight search failed',
          timestamp: new Date().toISOString(),
          fallbackTriggered: allowFallback
        };

        logger.error('Live Amadeus Flight API error', 'ResilientFlightService', errorRecord);

        if (!allowFallback) {
          throw error;
        }

        // Explicit fallback to Deterministic Mock Fixture with provenance preservation
        const mockResults = await this.mockFixtureProvider.searchFlights(params);
        const annotatedResults = mockResults.map((item) => ({
          ...item,
          notice: `EXPLICIT FALLBACK: Live Amadeus API returned ${errorRecord.errorCode}. Using deterministic test fixture.`
        }));

        return { results: annotatedResults, errorRecord };
      }
    }

    // Amadeus not configured: use mock fixture directly
    logger.info('Amadeus credentials not supplied; using deterministic mock flight fixtures', 'ResilientFlightService');
    const results = await this.mockFixtureProvider.searchFlights(params);
    return { results };
  }
}

export class ResilientHotelService {
  private liveProvider: AmadeusHotelProvider;
  private mockFixtureProvider: DeterministicMockHotelProvider;

  constructor() {
    this.liveProvider = new AmadeusHotelProvider();
    this.mockFixtureProvider = new DeterministicMockHotelProvider();
  }

  async searchHotels(
    params: HotelSearchParams,
    allowFallback = true
  ): Promise<{ results: NormalizedHotelOffer[]; errorRecord?: ProviderErrorRecord }> {
    if (amadeusClient.isConfigured()) {
      try {
        logger.info('Querying live Amadeus Hotel API...', 'ResilientHotelService');
        const results = await this.liveProvider.searchHotels(params);
        if (results.length > 0) {
          return { results };
        }
        logger.warn('Amadeus returned 0 hotel offers, checking fallback...', 'ResilientHotelService');
      } catch (error: any) {
        const errorRecord: ProviderErrorRecord = {
          provider: 'AMADEUS_HOTEL_API',
          endpoint: '/v3/shopping/hotel-offers',
          errorCode: error.response?.status ? `HTTP_${error.response.status}` : 'API_ERROR',
          message: error.message || 'Live Amadeus Hotel search failed',
          timestamp: new Date().toISOString(),
          fallbackTriggered: allowFallback
        };

        logger.error('Live Amadeus Hotel API error', 'ResilientHotelService', errorRecord);

        if (!allowFallback) {
          throw error;
        }

        const mockResults = await this.mockFixtureProvider.searchHotels(params);
        const annotatedResults = mockResults.map((item) => ({
          ...item,
          notice: `EXPLICIT FALLBACK: Live Amadeus Hotel API returned ${errorRecord.errorCode}. Using deterministic test fixture.`
        }));

        return { results: annotatedResults, errorRecord };
      }
    }

    logger.info('Amadeus credentials not supplied; using deterministic mock hotel fixtures', 'ResilientHotelService');
    const results = await this.mockFixtureProvider.searchHotels(params);
    return { results };
  }
}

export const flightService = new ResilientFlightService();
export const hotelService = new ResilientHotelService();
