import { IFlightProvider } from '../interfaces';
import { FlightSearchParams, NormalizedFlightOffer, InventorySource } from '../../../agent/types';

interface FlightFixtureTemplate {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  depTime: string;
  arrTime: string;
  durationMins: number;
  stops: number;
  basePriceINR: number;
}

const ROUTE_FIXTURES: Record<string, FlightFixtureTemplate[]> = {
  // Kolkata (CCU) to Goa (GOI)
  'CCU-GOI': [
    {
      airlineCode: '6E',
      airlineName: 'IndiGo Airlines',
      flightNumber: '6E-205',
      depTime: '06:15',
      arrTime: '09:10',
      durationMins: 175,
      stops: 0,
      basePriceINR: 6200
    },
    {
      airlineCode: 'AI',
      airlineName: 'Air India',
      flightNumber: 'AI-780',
      depTime: '11:45',
      arrTime: '16:20',
      durationMins: 275,
      stops: 1,
      basePriceINR: 5800
    },
    {
      airlineCode: 'UK',
      airlineName: 'Vistara',
      flightNumber: 'UK-995',
      depTime: '14:30',
      arrTime: '17:40',
      durationMins: 190,
      stops: 0,
      basePriceINR: 7100
    }
  ],
  // Delhi (DEL) to Goa (GOI)
  'DEL-GOI': [
    {
      airlineCode: '6E',
      airlineName: 'IndiGo Airlines',
      flightNumber: '6E-512',
      depTime: '07:20',
      arrTime: '09:55',
      durationMins: 155,
      stops: 0,
      basePriceINR: 5200
    },
    {
      airlineCode: 'AI',
      airlineName: 'Air India',
      flightNumber: 'AI-840',
      depTime: '13:10',
      arrTime: '15:45',
      durationMins: 155,
      stops: 0,
      basePriceINR: 5500
    }
  ],
  // Mumbai (BOM) to Goa (GOI)
  'BOM-GOI': [
    {
      airlineCode: '6E',
      airlineName: 'IndiGo Airlines',
      flightNumber: '6E-344',
      depTime: '09:00',
      arrTime: '10:15',
      durationMins: 75,
      stops: 0,
      basePriceINR: 3200
    },
    {
      airlineCode: 'QP',
      airlineName: 'Akasa Air',
      flightNumber: 'QP-1302',
      depTime: '15:40',
      arrTime: '16:55',
      durationMins: 75,
      stops: 0,
      basePriceINR: 3100
    }
  ]
};

export class DeterministicMockFlightProvider implements IFlightProvider {
  public readonly providerName = 'DETERMINISTIC_MOCK_FIXTURE_ENGINE';
  public readonly defaultSource: InventorySource = 'SIMULATED_MOCK_FIXTURE';

  async searchFlights(params: FlightSearchParams): Promise<NormalizedFlightOffer[]> {
    const routeKey = `${params.originAirport.toUpperCase()}-${params.destAirport.toUpperCase()}`;
    const templates = ROUTE_FIXTURES[routeKey] || [
      {
        airlineCode: '6E',
        airlineName: 'IndiGo Airlines',
        flightNumber: `6E-${Math.floor(100 + Math.random() * 800)}`,
        depTime: '08:30',
        arrTime: '11:45',
        durationMins: 195,
        stops: 0,
        basePriceINR: 5900
      },
      {
        airlineCode: 'AI',
        airlineName: 'Air India',
        flightNumber: `AI-${Math.floor(100 + Math.random() * 800)}`,
        depTime: '14:00',
        arrTime: '18:15',
        durationMins: 255,
        stops: 1,
        basePriceINR: 5400
      }
    ];

    const pax = Math.max(1, params.travelers || 1);

    return templates.map((tpl, idx) => {
      const departureTime = `${params.departureDate}T${tpl.depTime}:00.000Z`;
      // Calculate arrival ISO string
      const depDateObj = new Date(departureTime);
      const arrDateObj = new Date(depDateObj.getTime() + (tpl.durationMins * 60000));
      const arrivalTime = arrDateObj.toISOString();

      return {
        id: `mock_flight_${tpl.airlineCode}_${idx}_${params.departureDate}`,
        airlineCode: tpl.airlineCode,
        airlineName: tpl.airlineName,
        flightNumber: tpl.flightNumber,
        originAirport: params.originAirport.toUpperCase(),
        destAirport: params.destAirport.toUpperCase(),
        departureTime,
        arrivalTime,
        durationMins: tpl.durationMins,
        stops: tpl.stops,
        cabinClass: params.cabinClass || 'ECONOMY',
        pricePerPerson: tpl.basePriceINR,
        totalPrice: tpl.basePriceINR * pax,
        currency: 'INR',
        offerReference: `MOCK_OFFER_${tpl.airlineCode}_${tpl.flightNumber}`,
        source: this.defaultSource,
        isMockData: true,
        retrievedAt: new Date().toISOString(),
        searchParams: params as unknown as Record<string, unknown>,
        notice: 'SIMULATED MOCK FIXTURE: Realistic route data for test and demonstration purposes only.'
      };
    });
  }
}
