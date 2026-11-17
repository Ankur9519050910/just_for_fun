export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  preferences?: UserPreferencesDto | null;
}

export interface UserPreferencesDto {
  id?: string;
  homeAirport?: string | null;
  preferredAirlines: string[];
  hotelMinRating: number;
  dietaryPref: string[];
  travelPace: string;
  currency: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUserResponse;
}
