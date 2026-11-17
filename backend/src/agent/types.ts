export type InventorySource = 
  | 'AMADEUS_TEST_SANDBOX'
  | 'AMADEUS_PRODUCTION'
  | 'SIMULATED_MOCK_FIXTURE';

export interface FlightSearchParams {
  originAirport: string; // 3-letter IATA code, e.g. "CCU"
  destAirport: string; // 3-letter IATA code, e.g. "GOI"
  departureDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD
  travelers: number;
  cabinClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  preferredAirlines?: string[];
}

export interface NormalizedFlightOffer {
  id: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  originAirport: string;
  destAirport: string;
  departureTime: string; // ISO String
  arrivalTime: string; // ISO String
  durationMins: number;
  stops: number;
  cabinClass: string;
  pricePerPerson: number;
  totalPrice: number;
  currency: string;
  offerReference: string;
  source: InventorySource;
  isMockData: boolean;
  retrievedAt: string; // ISO String
  searchParams: Record<string, unknown>;
  notice?: string;
}

export interface HotelSearchParams {
  destination: string;
  cityIataCode?: string; // e.g. "GOI"
  latitude?: number;
  longitude?: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  guests: number;
  minStarRating?: number;
}

export interface NormalizedHotelOffer {
  id: string;
  hotelName: string;
  hotelId: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  starRating: number;
  userRating: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  roomType: string;
  amenities: string[];
  imageUrl: string | null;
  source: InventorySource;
  isMockData: boolean;
  retrievedAt: string; // ISO String
  searchParams: Record<string, unknown>;
  notice?: string;
}

export interface DestinationAttraction {
  title: string;
  description: string;
  locationName: string;
  latitude: number;
  longitude: number;
  category: 'SIGHTSEEING' | 'DINING' | 'ADVENTURE' | 'RELAXATION' | 'HERITAGE';
  estimatedCost: number;
  recommendedDurationMins: number;
}

export interface WeatherForecastDay {
  date: string; // YYYY-MM-DD
  maxTempC: number;
  minTempC: number;
  precipitationProbPercent: number;
  condition: string;
}

export interface ProviderErrorRecord {
  provider: string;
  endpoint: string;
  errorCode: string;
  message: string;
  timestamp: string;
  fallbackTriggered: boolean;
}

export type ToolExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface TravelIntent {
  destination?: string;
  origin?: string; // Must be validated 3-letter IATA code, e.g. "CCU"
  startDate?: string; // YYYY-MM-DD (confirmed date)
  endDate?: string; // YYYY-MM-DD (confirmed date)
  tentativeMonth?: string; // e.g. "December" when exact date is not yet chosen
  isApproximateDates?: boolean;
  totalDays?: number;
  travelers?: number;
  totalBudget?: number;
  currency: string;
  vibe: string[];
  preferredAirlines: string[];
  hotelMinRating: number;
  dietaryPref: string[];
  travelPace: 'RELAXED' | 'BALANCED' | 'PACKED';
}

export interface TravelAgentState {
  userId: string;
  conversationId: string;
  threadId: string;
  tripId?: string;
  userPrompt: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp?: string;
  }>;
  extractedIntent: TravelIntent;
  missingInformation: string[];
  clarificationQuestion?: string;
  flightResults: NormalizedFlightOffer[];
  hotelResults: NormalizedHotelOffer[];
  attractionResults: DestinationAttraction[];
  weatherForecast: WeatherForecastDay[];
  toolStatuses: Record<string, ToolExecutionStatus>;
  providerErrors: ProviderErrorRecord[];
  retryCount: number;
  summary?: string;
  status: 'IDLE' | 'ANALYZING' | 'NEED_INFO' | 'RESEARCHING' | 'SYNTHESIZING' | 'COMPLETED' | 'ERROR';
  activeStep: string;
  interrupted: boolean;
  lastUpdated: string;
}

export type SSEEventType =
  | 'workflow_step'
  | 'intent_extracted'
  | 'need_clarification'
  | 'tool_start'
  | 'tool_complete'
  | 'provider_error'
  | 'flight_results'
  | 'hotel_results'
  | 'destination_results'
  | 'plan_ready'
  | 'done'
  | 'error';

export interface SSEMessage {
  id: number;
  event: SSEEventType;
  data: Record<string, unknown>;
}
