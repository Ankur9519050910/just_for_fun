import {
  FlightSearchParams,
  NormalizedFlightOffer,
  HotelSearchParams,
  NormalizedHotelOffer,
  DestinationAttraction,
  WeatherForecastDay,
  InventorySource
} from '../../agent/types';

export interface IFlightProvider {
  readonly providerName: string;
  readonly defaultSource: InventorySource;
  searchFlights(params: FlightSearchParams): Promise<NormalizedFlightOffer[]>;
}

export interface IHotelProvider {
  readonly providerName: string;
  readonly defaultSource: InventorySource;
  searchHotels(params: HotelSearchParams): Promise<NormalizedHotelOffer[]>;
}

export interface IDestinationProvider {
  getAttractions(destination: string, vibes?: string[]): Promise<DestinationAttraction[]>;
  getCoordinates(destination: string): Promise<{ latitude: number; longitude: number; iataCode?: string }>;
}

export interface IWeatherProvider {
  getForecast(latitude: number, longitude: number, startDate?: string, days?: number): Promise<WeatherForecastDay[]>;
}
