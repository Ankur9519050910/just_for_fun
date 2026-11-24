import { IHotelProvider } from '../interfaces';
import { HotelSearchParams, NormalizedHotelOffer, InventorySource } from '../../../agent/types';

interface HotelFixtureTemplate {
  hotelName: string;
  hotelId: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  starRating: number;
  userRating: number;
  pricePerNightINR: number;
  roomType: string;
  amenities: string[];
  imageUrl: string;
}

const DESTINATION_HOTEL_FIXTURES: Record<string, HotelFixtureTemplate[]> = {
  goa: [
    {
      hotelName: 'Heritage Village Resort & Spa Goa',
      hotelId: 'MOCK_HOTEL_GOA_01',
      address: 'Arossim Beach Road, Cansaulim',
      city: 'South Goa',
      latitude: 15.3262,
      longitude: 73.9103,
      starRating: 4.5,
      userRating: 4.6,
      pricePerNightINR: 4200,
      roomType: 'Deluxe Heritage Room with Balcony',
      amenities: ['Free WiFi', 'Outdoor Swimming Pool', 'Ayurvedic Spa', 'Buffet Breakfast Included'],
      imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80'
    },
    {
      hotelName: 'Santana Beach Resort',
      hotelId: 'MOCK_HOTEL_GOA_02',
      address: 'Shop No 1, Candolim Beach Rd',
      city: 'North Goa',
      latitude: 15.5173,
      longitude: 73.7631,
      starRating: 3.8,
      userRating: 4.2,
      pricePerNightINR: 3100,
      roomType: 'Standard Garden View Room',
      amenities: ['Free WiFi', 'Direct Beachfront Access', 'Pool Bar', 'Air Conditioning'],
      imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
    },
    {
      hotelName: 'Taj Fort Aguada Resort & Spa',
      hotelId: 'MOCK_HOTEL_GOA_03',
      address: 'Sinquerim, Candolim',
      city: 'North Goa',
      latitude: 15.4925,
      longitude: 73.7738,
      starRating: 5.0,
      userRating: 4.8,
      pricePerNightINR: 9800,
      roomType: 'Superior Sea View Room',
      amenities: ['Historic Portuguese Fort Views', 'Infinity Pool', 'Fine Dining', 'Luxury Spa'],
      imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80'
    }
  ]
};

export class DeterministicMockHotelProvider implements IHotelProvider {
  public readonly providerName = 'DETERMINISTIC_MOCK_FIXTURE_ENGINE';
  public readonly defaultSource: InventorySource = 'SIMULATED_MOCK_FIXTURE';

  async searchHotels(params: HotelSearchParams): Promise<NormalizedHotelOffer[]> {
    const destKey = params.destination.toLowerCase().includes('goa') ? 'goa' : 'default';
    const templates = DESTINATION_HOTEL_FIXTURES[destKey] || [
      {
        hotelName: `${params.destination} Grand Heritage Hotel`,
        hotelId: 'MOCK_HOTEL_GEN_01',
        address: `Central Boulevard, ${params.destination}`,
        city: params.destination,
        latitude: typeof params.latitude === 'number' ? params.latitude : 0,
        longitude: typeof params.longitude === 'number' ? params.longitude : 0,
        starRating: 4.0,
        userRating: 4.3,
        pricePerNightINR: 3800,
        roomType: 'Executive Deluxe Room',
        amenities: ['Free WiFi', 'Complimentary Breakfast', 'Swimming Pool'],
        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
      }
    ];

    const checkIn = new Date(params.checkInDate);
    const checkOut = new Date(params.checkOutDate);
    const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
    const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Filter by min rating if specified
    const filtered = params.minStarRating
      ? templates.filter((t) => t.starRating >= params.minStarRating!)
      : templates;

    const selectedTemplates = filtered.length > 0 ? filtered : templates;

    return selectedTemplates.map((tpl) => ({
      id: `mock_hotel_${tpl.hotelId}_${params.checkInDate}`,
      hotelName: tpl.hotelName,
      hotelId: tpl.hotelId,
      address: tpl.address,
      city: tpl.city,
      latitude: tpl.latitude,
      longitude: tpl.longitude,
      starRating: tpl.starRating,
      userRating: tpl.userRating,
      pricePerNight: tpl.pricePerNightINR,
      totalPrice: tpl.pricePerNightINR * nights,
      currency: 'INR',
      roomType: tpl.roomType,
      amenities: tpl.amenities,
      imageUrl: tpl.imageUrl,
      source: this.defaultSource,
      isMockData: true,
      retrievedAt: new Date().toISOString(),
      searchParams: params as unknown as Record<string, unknown>,
      notice: 'SIMULATED MOCK FIXTURE: Realistic hotel data for test and demonstration purposes only.'
    }));
  }
}
