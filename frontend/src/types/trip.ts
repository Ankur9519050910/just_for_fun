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
  isMockData: boolean;
  isSelected: boolean;
}

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
  isMockData: boolean;
  isSelected: boolean;
}

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

export interface DashboardSummary {
  stats: {
    totalTrips: number;
    upcomingTrips: number;
    completedTrips: number;
    totalBookings: number;
  };
  recentTrips: Trip[];
}
