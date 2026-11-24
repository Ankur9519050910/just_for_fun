export interface TripActivity {
  id: string;
  dayNumber: number;
  timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  description: string;
  locationName: string;
  latitude: number;
  longitude: number;
  estimatedCost: number;
  category: string;
  bookingUrl?: string | null;
  sortOrder: number;
}

export interface TripItinerary {
  id: string;
  version: number;
  isApproved: boolean;
  summary: string;
  totalCost: number;
  activities: TripActivity[];
}

export interface FlightOption {
  id: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  originAirport: string;
  destAirport: string;
  departureTime: string;
  arrivalTime: string;
  durationMins: number;
  stops: number;
  cabinClass: string;
  pricePerPerson: number;
  totalPrice: number;
  currency: string;
  offerReference: string;
  source?: string;
  isMockData: boolean;
  notice?: string;
  isSelected?: boolean;
}

export type NormalizedFlightOffer = FlightOption;

export interface HotelOption {
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
  imageUrl?: string | null;
  source?: string;
  isMockData: boolean;
  notice?: string;
  isSelected?: boolean;
}

export type NormalizedHotelOffer = HotelOption;

export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  travelers: number;
  totalBudget: number;
  currency: string;
  status: 'PLANNING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  metadata?: Record<string, unknown>;
  itineraries?: TripItinerary[];
  flightOptions?: FlightOption[];
  hotelOptions?: HotelOption[];
  _count?: {
    flightOptions: number;
    hotelOptions: number;
    bookings: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryActivityItem {
  timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  locationName: string;
  latitude?: number | null;
  longitude?: number | null;
  estimatedCost: number;
  category: string;
  bookingUrl?: string;
}

export interface DayItinerary {
  dayNumber: number;
  date: string;
  theme: string;
  geographicCluster: string;
  activities: ItineraryActivityItem[];
  dayTotalCost: number;
}

export interface BudgetCategoryAllocation {
  category: string;
  amount: number;
  percentage: number;
}

export interface BudgetOptimizationResult {
  targetBudget: number;
  currency: string;
  totalQuotedInventory: number;
  flightsCost: number;
  hotelsCost: number;
  activitiesCost: number;
  contingencyBuffer: number;
  totalProjectedSpend: number;
  remainingSurplusOrDeficit: number;
  status: 'OPTIMAL' | 'UNDER_BUDGET' | 'OVER_BUDGET';
  categoryBreakdown: BudgetCategoryAllocation[];
  recommendations: string[];
}

export interface DashboardSummary {
  stats: {
    totalTrips: number;
    upcomingTrips: number;
    completedTrips: number;
    totalBookings: number;
  };
  recentTrips: Trip[];
}
