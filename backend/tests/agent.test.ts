import request from 'supertest';
import { createApp } from '../src/app';
import { travelAgentOrchestrator } from '../src/agent/travelWorkflow';
import { intentParser } from '../src/agent/intentParser';
import { flightService, hotelService } from '../src/services/providers/providerFactory';
import { destinationProvider } from '../src/services/providers/destination/destinationProvider';
import { optimizeBudget } from '../src/services/budgetOptimizer';
import { planItinerary } from '../src/services/itineraryPlanner';
import { prisma } from '../src/db/prisma';
import { signToken } from '../src/utils/jwt';

const app = createApp();

describe('Phase 3: Stateful Agent & Inventory Discovery Suite', () => {
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Ensure test users exist in database
    const userA = await prisma.user.upsert({
      where: { email: 'user_agent_a@example.com' },
      update: {},
      create: {
        email: 'user_agent_a@example.com',
        passwordHash: 'dummyhash',
        name: 'User Agent A'
      }
    });
    userAId = userA.id;
    userAToken = signToken({ userId: userA.id, email: userA.email, role: 'USER' });

    const userB = await prisma.user.upsert({
      where: { email: 'user_agent_b@example.com' },
      update: {},
      create: {
        email: 'user_agent_b@example.com',
        passwordHash: 'dummyhash',
        name: 'User Agent B'
      }
    });
    userBId = userB.id;
    userBToken = signToken({ userId: userB.id, email: userB.email, role: 'USER' });
  });

  describe('1. Comprehensive Intent Parser Testing', () => {
    it('should extract complete constraints from natural language prompt', () => {
      const prompt = "Plan a 5-day trip to Goa for two people from Kolkata starting 2026-12-10. Total budget is ₹50,000. I love beaches and seafood.";
      const { intent, missingFields, clarificationQuestion } = intentParser.parse(prompt);

      expect(intent.destination).toBe('Goa');
      expect(intent.origin).toBe('CCU');
      expect(intent.totalDays).toBe(5);
      expect(intent.travelers).toBe(2);
      expect(intent.totalBudget).toBe(50000);
      expect(intent.vibe).toContain('Beaches');
      expect(missingFields.length).toBe(0);
      expect(clarificationQuestion).toBeUndefined();
    });

    it('should identify missing origin and duration when ambiguous', () => {
      const prompt = "I want to visit Goa with a budget of ₹40,000";
      const { intent, missingFields, clarificationQuestion } = intentParser.parse(prompt);

      expect(intent.destination).toBe('Goa');
      expect(missingFields).toContain('origin');
      expect(missingFields).toContain('duration or dates');
      expect(clarificationQuestion).toBeDefined();
    });

    it('should extract unsupported destination cities correctly', () => {
      const prompt1 = "Trip to Paris from Delhi starting 2026-12-10 for 7 days with 2 Lakh budget";
      const res1 = intentParser.parse(prompt1);
      expect(res1.intent.destination).toBe('Paris');
      expect(res1.intent.origin).toBe('DEL');
      expect(res1.intent.totalBudget).toBe(200000);

      const prompt2 = "I want to visit Zurich starting 2026-12-15 for a week from Mumbai with ₹1.5 Lakh budget";
      const res2 = intentParser.parse(prompt2);
      expect(res2.intent.destination).toBe('Zurich');
      expect(res2.intent.origin).toBe('BOM');
      expect(res2.intent.totalBudget).toBe(150000);
    });

    it('should handle diverse budget formats (Lakhs, K, rupees, INR)', () => {
      expect(intentParser.parse("Goa trip budget ₹1.5 Lakh").intent.totalBudget).toBe(150000);
      expect(intentParser.parse("Goa trip budget 75k").intent.totalBudget).toBe(75000);
      expect(intentParser.parse("Goa trip with Rs. 80000").intent.totalBudget).toBe(80000);
      expect(intentParser.parse("Goa trip under 60000 rupees").intent.totalBudget).toBe(60000);
      expect(intentParser.parse("Goa trip with 120000 INR").intent.totalBudget).toBe(120000);
    });

    it('should handle diverse traveler counts (solo, couple, family, friends)', () => {
      expect(intentParser.parse("Solo trip to Goa").intent.travelers).toBe(1);
      expect(intentParser.parse("Goa trip by myself").intent.travelers).toBe(1);
      expect(intentParser.parse("Trip to Goa for my wife and I").intent.travelers).toBe(2);
      expect(intentParser.parse("Trip to Goa for me and my partner").intent.travelers).toBe(2);
      expect(intentParser.parse("Trip to Goa for a family of 5").intent.travelers).toBe(5);
      expect(intentParser.parse("Trip to Goa for me and 3 friends").intent.travelers).toBe(4);
    });

    it('should preserve month-only mentions without silently fabricating hard date numbers', () => {
      const monthRes = intentParser.parse("5-day trip to Goa from Kolkata in December with 50k budget");
      expect(monthRes.intent.tentativeMonth).toBe('December');
      expect(monthRes.intent.isApproximateDates).toBe(true);
      expect(monthRes.missingFields).toContain('exact dates in December');
      expect(monthRes.clarificationQuestion).toContain('December');
    });

    it('should detect ambiguous origins as missing fields and refuse arbitrary origin strings', () => {
      const res = intentParser.parse("Trip to Goa from somewhere nice for 5 days with 50000 budget");
      expect(res.missingFields).toContain('origin');
      expect(res.clarificationQuestion).toContain('Where will you be departing from');
    });

    it('should detect unknown destination and ask clarification', () => {
      const prompt = "Plan a 5-day trip from Kolkata starting 2026-12-10 with ₹50,000 budget";
      const { intent, missingFields, clarificationQuestion } = intentParser.parse(prompt);
      expect(intent.destination).toBeUndefined();
      expect(missingFields).toContain('destination');
      expect(clarificationQuestion).toBe('Which destination would you like to travel to?');
    });

    it('should detect ambiguous destination and ask clarification without fabricating names', () => {
      const prompt = "Plan a 5-day trip to somewhere nice from Kolkata starting 2026-12-10 with ₹50,000 budget";
      const { intent, missingFields, clarificationQuestion } = intentParser.parse(prompt);
      expect(intent.destination).toBeUndefined();
      expect(missingFields).toContain('destination');
      expect(clarificationQuestion).toBe('Which destination would you like to travel to?');
    });

    it('should correctly modify an existing travel plan in follow-up message', () => {
      const initialPrompt = "Plan a 5-day trip to Goa from Kolkata starting 2026-12-10 with ₹50,000 budget";
      const initial = intentParser.parse(initialPrompt);

      // Follow-up modifies budget, duration and switches destination
      const followUp = intentParser.parse(
        "Actually change budget to 80,000 and 7 days and switch destination to Jaipur",
        initial.intent
      );

      expect(followUp.intent.destination).toBe('Jaipur');
      expect(followUp.intent.origin).toBe('CCU'); // Preserved
      expect(followUp.intent.totalBudget).toBe(80000); // Modified
      expect(followUp.intent.totalDays).toBe(7); // Modified
      expect(followUp.intent.startDate).toBe('2026-12-10'); // Preserved
      expect(followUp.intent.endDate).toBe('2026-12-17'); // Recalculated for 7 days
      expect(followUp.missingFields.length).toBe(0);
    });
  });

  describe('2. Provider Abstraction & Inventory Normalization', () => {
    it('should return normalized flight offers with explicit provenance', async () => {
      const { results } = await flightService.searchFlights({
        originAirport: 'CCU',
        destAirport: 'GOI',
        departureDate: '2026-12-15',
        travelers: 2
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      const first = results[0];
      expect(first.originAirport).toBe('CCU');
      expect(first.destAirport).toBe('GOI');
      expect(first.totalPrice).toBeGreaterThan(0);
      expect(first.currency).toBe('INR');
      expect(first.source).toBeDefined();
      expect(first.isMockData).toBe(true);
      expect(first.notice).toContain('SIMULATED MOCK FIXTURE');
    });

    it('should return normalized hotel offers with verified coordinates and ratings', async () => {
      const { results } = await hotelService.searchHotels({
        destination: 'Goa',
        checkInDate: '2026-12-15',
        checkOutDate: '2026-12-20',
        guests: 2,
        minStarRating: 3.5
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      const first = results[0];
      expect(first.starRating).toBeGreaterThanOrEqual(3.5);
      expect(first.pricePerNight).toBeGreaterThan(0);
      expect(first.amenities.length).toBeGreaterThan(0);
      expect(first.isMockData).toBe(true);
    });

    it('should resolve coordinates for known and geocoded destinations and represent unknown ones as unresolved', async () => {
      // 1. Resolved destination with airport
      const goaCoords = await destinationProvider.getCoordinates('Goa');
      expect(goaCoords.isResolved).toBe(true);
      expect(goaCoords.latitude).toBeCloseTo(15.2993, 2);
      expect(goaCoords.longitude).toBeCloseTo(74.1240, 2);
      expect(goaCoords.iataCode).toBe('GOI');

      // 2. Resolved destination without airport (e.g. Coorg)
      const coorgCoords = await destinationProvider.getCoordinates('Coorg');
      expect(coorgCoords.isResolved).toBe(true);
      expect(coorgCoords.latitude).toBeCloseTo(12.3375, 2);
      expect(coorgCoords.longitude).toBeCloseTo(75.8069, 2);
      expect(coorgCoords.iataCode).toBeUndefined();

      // 3. Completely unresolved destination
      const unknownCoords = await destinationProvider.getCoordinates('NonExistentAtlantisXYZ999');
      expect(unknownCoords.isResolved).toBe(false);
      expect(unknownCoords.latitude).toBeUndefined();
      expect(unknownCoords.longitude).toBeUndefined();
      expect(unknownCoords.iataCode).toBeUndefined();
    });
  });

  describe('3. LangGraph Stateful Workflow Execution & Resumption', () => {
    const threadId = `test_thread_${Date.now()}`;

    it('should pause with NEED_INFO when initial prompt lacks origin', async () => {
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: threadId,
        threadId,
        userPrompt: "I want to take a 5-day trip to Goa starting 2026-12-10 with ₹50,000 budget"
      });

      expect(state.status).toBe('NEED_INFO');
      expect(state.missingInformation).toContain('origin');
      expect(state.clarificationQuestion).toBeDefined();
      expect(state.flightResults.length).toBe(0);
    });

    it('should resume workflow on same thread and execute research once origin is supplied', async () => {
      // Resume on same thread with follow-up
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: threadId,
        threadId,
        userPrompt: "I will be departing from Kolkata (CCU)"
      });

      expect(state.status).toBe('COMPLETED');
      expect(state.extractedIntent.destination).toBe('Goa'); // Preserved from turn 1
      expect(state.extractedIntent.origin).toBe('CCU'); // Extracted from turn 2
      expect(state.flightResults.length).toBeGreaterThan(0);
      expect(state.hotelResults.length).toBeGreaterThan(0);
      expect(state.summary).toContain('Goa');
    });

    it('should skip flight search when destination has no commercial airport code and return partial result with hotels and attractions', async () => {
      // Coorg has no commercial airport code in AIRPORT_REGISTRY or DESTINATION_REGISTRY
      const coorgThreadId = `test_thread_coorg_${Date.now()}`;
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: coorgThreadId,
        threadId: coorgThreadId,
        userPrompt: "Plan a 3-day trip to Coorg from Kolkata starting 2026-12-10 with ₹40,000 budget"
      });

      expect(state.status).toBe('COMPLETED');
      expect(state.extractedIntent.destination).toBe('Coorg');
      // Flights must NOT have searched for GOI or returned Goa flights!
      expect(state.flightResults.length).toBe(0);
      expect(state.toolStatuses.search_flights).toBe('SKIPPED');
      // Hotels and attractions should continue and succeed
      expect(state.hotelResults.length).toBeGreaterThan(0);
      expect(state.attractionResults.length).toBeGreaterThan(0);
      // Summary should note flight skipping and include transparent budget
      expect(state.summary).toContain('Coorg');
      expect(state.summary).toContain('Direct flight search skipped');
    });

    it('should handle completely unresolved destination without searching with fabricated coordinates', async () => {
      const unknownThreadId = `test_thread_unknown_${Date.now()}`;
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: unknownThreadId,
        threadId: unknownThreadId,
        userPrompt: "Plan a 3-day trip to AtlantisCity from Kolkata starting 2026-12-10 with ₹40,000 budget"
      });

      expect(state.status).toBe('COMPLETED');
      expect(state.extractedIntent.destination).toBe('AtlantisCity');
      // Flights, hotels, attractions skipped - zero fabricated coordinates
      expect(state.flightResults.length).toBe(0);
      expect(state.hotelResults.length).toBe(0);
      expect(state.attractionResults.length).toBe(0);
      expect(state.toolStatuses.search_flights).toBe('SKIPPED');
      expect(state.toolStatuses.search_hotels).toBe('SKIPPED');
      expect(state.toolStatuses.search_attractions).toBe('SKIPPED');
      // Summary includes transparent notice
      expect(state.summary).toContain('Location unresolved');
      expect(state.summary).toContain('fabricated coordinates');
    });
  });

  describe('4. Security & Access Control Enforcement', () => {
    it('should reject unauthorized user attempting to access another user conversation', async () => {
      // User A creates conversation
      const conv = await prisma.conversation.create({
        data: {
          userId: userAId,
          title: "User A Confidential Trip"
        }
      });

      // User B attempts to access it
      const res = await request(app)
        .get(`/api/chat/history/${conv.id}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject streaming request on empty message', async () => {
      const res = await request(app)
        .post('/api/chat/stream')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ message: "   " });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Reliable Failure Cleanup for AgentRun', () => {
    it('should ensure AgentRun does not remain RUNNING when an error occurs', async () => {
      const conv = await prisma.conversation.create({
        data: {
          userId: userAId,
          title: "Error Recovery Test"
        }
      });

      await request(app)
        .post('/api/chat/stream')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ conversationId: conv.id, message: "" });

      const runningRuns = await prisma.agentRun.findMany({
        where: {
          conversationId: conv.id,
          status: 'RUNNING'
        }
      });

      expect(runningRuns.length).toBe(0);
    });
  });

  describe('6. Direct Inventory Endpoints', () => {
    it('should search direct flights via POST /api/inventory/flights', async () => {
      const res = await request(app)
        .post('/api/inventory/flights')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          originAirport: 'CCU',
          destAirport: 'GOI',
          departureDate: '2026-12-10',
          travelers: 2
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results.length).toBeGreaterThan(0);
    });

    it('should search direct hotels via POST /api/inventory/hotels', async () => {
      const res = await request(app)
        .post('/api/inventory/hotels')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          destination: 'Goa',
          checkInDate: '2026-12-10',
          checkOutDate: '2026-12-15',
          guests: 2
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('7. Phase 4: Budget Optimization & Itinerary Planner', () => {
    it('should calculate 4 nights of hotel for a 5-day trip and detect UNDER_BUDGET status', () => {
      const mockFlight = {
        id: 'f1',
        airlineCode: '6E',
        airlineName: 'IndiGo',
        flightNumber: '6E-201',
        originAirport: 'CCU',
        destAirport: 'GOI',
        departureTime: '2026-12-10T10:00:00Z',
        arrivalTime: '2026-12-10T13:00:00Z',
        durationMins: 180,
        stops: 0,
        cabinClass: 'ECONOMY',
        pricePerPerson: 6000,
        totalPrice: 12000,
        currency: 'INR',
        offerReference: 'mock_ref',
        source: 'SIMULATED_MOCK_FIXTURE' as const,
        isMockData: true,
        retrievedAt: new Date().toISOString(),
        searchParams: {}
      };

      const mockHotel = {
        id: 'h1',
        hotelName: 'Taj Holiday Village',
        hotelId: 'taj_goa',
        address: 'Candolim',
        city: 'Goa',
        latitude: 15.5178,
        longitude: 73.7686,
        starRating: 5,
        userRating: 4.8,
        pricePerNight: 4000,
        totalPrice: 0, // Force pricePerNight * nights calculation
        currency: 'INR',
        roomType: 'Deluxe Sea View',
        amenities: ['Pool', 'Spa', 'WiFi'],
        imageUrl: null,
        source: 'SIMULATED_MOCK_FIXTURE' as const,
        isMockData: true,
        retrievedAt: new Date().toISOString(),
        searchParams: {}
      };

      const res = optimizeBudget({
        flightResults: [mockFlight],
        hotelResults: [mockHotel],
        attractionResults: [
          { title: 'Fort Aguada', description: 'Historic fort', locationName: 'Sinquerim', latitude: 15.4925, longitude: 73.7736, category: 'HERITAGE', estimatedCost: 500, recommendedDurationMins: 90 }
        ],
        targetBudget: 60000,
        totalDays: 5, // 5 days = 4 nights
        travelers: 2,
        currency: 'INR'
      });

      expect(res.flightsCost).toBe(12000);
      expect(res.hotelsCost).toBe(16000); // 4000 * 4 nights (5-day stay represents 4 nights)
      expect(res.activitiesCost).toBe(500);
      expect(res.contingencyBuffer).toBe(Math.round((12000 + 16000 + 500) * 0.10)); // 2850
      expect(res.totalProjectedSpend).toBe(12000 + 16000 + 500 + 2850); // 31350
      expect(res.status).toBe('UNDER_BUDGET');
      expect(res.categoryBreakdown.length).toBe(4);
      expect(res.recommendations.length).toBeGreaterThan(0);
    });

    it('should prefer provider actual quoted totalPrice when complete stay is represented', () => {
      const res = optimizeBudget({
        flightResults: [],
        hotelResults: [
          {
            id: 'h2',
            hotelName: 'Resort Package',
            pricePerNight: 5000,
            totalPrice: 17500, // Discounted 4-night package rate vs 20000
            isMockData: true
          } as any
        ],
        attractionResults: [],
        targetBudget: 30000,
        totalDays: 5,
        travelers: 2
      });

      expect(res.hotelsCost).toBe(17500);
    });

    it('should respect totalPrice contract and derive from pricePerPerson when totalPrice is omitted', () => {
      // 1. totalPrice provided -> respected directly without silent heuristic multiplication
      const res1 = optimizeBudget({
        flightResults: [
          {
            id: 'f_total',
            pricePerPerson: 5500,
            totalPrice: 5500,
            isMockData: true
          } as any
        ],
        hotelResults: [],
        attractionResults: [],
        targetBudget: 40000,
        totalDays: 3,
        travelers: 3
      });
      expect(res1.flightsCost).toBe(5500);

      // 2. totalPrice omitted/zero -> derived as pricePerPerson * travelers
      const res2 = optimizeBudget({
        flightResults: [
          {
            id: 'f_pax',
            pricePerPerson: 5500,
            totalPrice: 0,
            isMockData: true
          } as any
        ],
        hotelResults: [],
        attractionResults: [],
        targetBudget: 40000,
        totalDays: 3,
        travelers: 3
      });
      expect(res2.flightsCost).toBe(16500); // 5500 * 3 travelers
    });

    it('should include activity costs and avoid duplicate double-counting', () => {
      const res = optimizeBudget({
        flightResults: [],
        hotelResults: [],
        attractionResults: [
          { title: 'Scuba Diving', locationName: 'Grand Island', estimatedCost: 2500 } as any,
          { title: 'Museum Visit', locationName: 'Panaji', estimatedCost: 300 } as any,
          { title: 'Scuba Diving', locationName: 'Grand Island', estimatedCost: 2500 } as any // Duplicate
        ],
        targetBudget: 20000,
        totalDays: 2,
        travelers: 1
      });

      expect(res.activitiesCost).toBe(2800); // 2500 + 300
    });

    it('should detect OVER_BUDGET status and provide actionable downgrade suggestions', () => {
      const res = optimizeBudget({
        flightResults: [{ totalPrice: 30000 } as any],
        hotelResults: [{ pricePerNight: 8000 } as any],
        attractionResults: [],
        targetBudget: 40000,
        totalDays: 5, // 4 nights * 8000 = 32000
        travelers: 2,
        currency: 'INR'
      });

      // spend: 30000 + 32000 = 62000 + 10% contingency (6200) = 68200
      expect(res.status).toBe('OVER_BUDGET');
      expect(res.remainingSurplusOrDeficit).toBeLessThan(0);
      expect(res.recommendations.some(r => r.includes('exceeds target budget'))).toBe(true);
    });

    it('should implement genuine geographic clustering grouping nearby attractions into the same day', () => {
      // North Goa cluster (~15.5 lat, 73.76 lon) vs South Goa cluster (~15.0 lat, 74.0 lon) separated by ~60km
      const north1 = { title: 'Baga Beach', description: 'Famous beach', locationName: 'Baga', latitude: 15.5553, longitude: 73.7517, category: 'RELAXATION' as const, estimatedCost: 0, recommendedDurationMins: 90 };
      const north2 = { title: 'Anjuna Flea Market', description: 'Weekly market', locationName: 'Anjuna', latitude: 15.5800, longitude: 73.7420, category: 'SIGHTSEEING' as const, estimatedCost: 100, recommendedDurationMins: 90 };
      const south1 = { title: 'Palolem Beach', description: 'Scenic crescent beach', locationName: 'Canacona', latitude: 15.0100, longitude: 74.0232, category: 'RELAXATION' as const, estimatedCost: 0, recommendedDurationMins: 90 };
      const south2 = { title: 'Agonda Beach', description: 'Quiet pristine beach', locationName: 'Agonda', latitude: 15.0450, longitude: 73.9870, category: 'RELAXATION' as const, estimatedCost: 0, recommendedDurationMins: 90 };

      const days = planItinerary({
        attractionResults: [north1, south1, north2, south2], // Interleaved order
        hotelResults: [{ hotelName: 'North Goa Villa', latitude: 15.5500, longitude: 73.7500 } as any],
        weatherForecast: [],
        startDate: '2026-12-10',
        totalDays: 2,
        destinationName: 'Goa'
      });

      expect(days.length).toBe(2);
      // North attractions should be clustered together in one day, South in the other
      const day1Titles = days[0].activities.map(a => a.title);
      const day2Titles = days[1].activities.map(a => a.title);

      const northInDay1 = day1Titles.includes('Baga Beach') && day1Titles.includes('Anjuna Flea Market');
      const northInDay2 = day2Titles.includes('Baga Beach') && day2Titles.includes('Anjuna Flea Market');
      expect(northInDay1 || northInDay2).toBe(true);
    });

    it('should not fabricate hotel coordinates when hotel location is unresolved', () => {
      const days = planItinerary({
        attractionResults: [{ title: 'Sight', description: 'Historic sight', locationName: 'Town', latitude: 12.0, longitude: 75.0, category: 'HERITAGE', estimatedCost: 100, recommendedDurationMins: 60 }],
        hotelResults: [{ hotelName: 'Mystery Hotel' } as any], // No coordinates
        weatherForecast: [],
        startDate: '2026-12-10',
        totalDays: 1,
        destinationName: 'Unknown City'
      });

      const checkin = days[0].activities.find(a => a.title.includes('Check-in'));
      expect(checkin).toBeDefined();
      expect(checkin!.latitude).toBeNull();
      expect(checkin!.longitude).toBeNull();
    });

    it('should generate non-overlapping chronological activity schedules with travel gaps', () => {
      const days = planItinerary({
        attractionResults: [
          { title: 'Morning Spot', description: 'Morning activity', locationName: 'Loc 1', latitude: 15.5, longitude: 73.8, category: 'HERITAGE', estimatedCost: 100, recommendedDurationMins: 60 },
          { title: 'Afternoon Spot', description: 'Afternoon adventure', locationName: 'Loc 2', latitude: 15.51, longitude: 73.81, category: 'ADVENTURE', estimatedCost: 500, recommendedDurationMins: 90 },
          { title: 'Dinner Spot', description: 'Evening dinner', locationName: 'Loc 3', latitude: 15.52, longitude: 73.82, category: 'DINING', estimatedCost: 1000, recommendedDurationMins: 90 }
        ],
        hotelResults: [{ hotelName: 'Resort', latitude: 15.5, longitude: 73.8 } as any],
        weatherForecast: [],
        startDate: '2026-12-10',
        totalDays: 2,
        destinationName: 'Goa'
      });

      const timeToMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      days.forEach(day => {
        for (let i = 0; i < day.activities.length - 1; i++) {
          const currentEnd = timeToMins(day.activities[i].endTime);
          const nextStart = timeToMins(day.activities[i + 1].startTime);
          // Strict non-overlap: next activity starts on or after the previous activity ends
          expect(nextStart).toBeGreaterThanOrEqual(currentEnd);
        }
      });
    });

    it('should match weather forecast by exact date rather than array index', () => {
      const days = planItinerary({
        attractionResults: [],
        hotelResults: [],
        weatherForecast: [
          // Array in reverse order of dates
          { date: '2026-12-11', condition: 'Thunderstorm', maxTempC: 24, minTempC: 20, precipitationProbPercent: 80 },
          { date: '2026-12-10', condition: 'Clear Sky', maxTempC: 32, minTempC: 22, precipitationProbPercent: 0 }
        ],
        startDate: '2026-12-10',
        totalDays: 2,
        destinationName: 'Goa'
      });

      expect(days[0].date).toBe('2026-12-10');
      expect(days[0].theme).toContain('Clear Sky');
      expect(days[1].date).toBe('2026-12-11');
      expect(days[1].theme).toContain('Thunderstorm');
    });

    it('should include itinerary and budget breakdown in completed workflow execution', async () => {
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: 'phase4_test_conv',
        threadId: 'phase4_test_thread',
        userPrompt: 'Plan a 3-day trip to Goa from Kolkata starting 2026-12-10 with budget 50000 for 2 people'
      });

      expect(state.status).toBe('COMPLETED');
      expect(state.itinerary).toBeDefined();
      expect(state.itinerary!.length).toBe(3);
      expect(state.budgetBreakdown).toBeDefined();
      expect(state.budgetBreakdown!.totalProjectedSpend).toBeGreaterThan(0);
      expect(state.budgetBreakdown!.categoryBreakdown.length).toBe(4);
    }, 30000);

    it('should optimize existing trip budget and include saved itinerary activity expenses', async () => {
      const trip = await prisma.trip.create({
        data: {
          userId: userAId,
          title: 'Existing Trip with Activities',
          destination: 'Goa',
          origin: 'CCU',
          startDate: new Date('2026-12-10'),
          endDate: new Date('2026-12-14'),
          totalDays: 4,
          travelers: 2,
          totalBudget: 45000,
          currency: 'INR',
          status: 'PLANNING',
          itineraries: {
            create: {
              version: 1,
              summary: 'Saved Itinerary',
              totalCost: 15000,
              activities: {
                create: [
                  {
                    dayNumber: 1,
                    timeSlot: 'MORNING',
                    title: 'Dudhsagar Trek',
                    description: 'Waterfalls trek',
                    locationName: 'Dudhsagar',
                    latitude: 15.3144,
                    longitude: 74.3143,
                    estimatedCost: 3500,
                    category: 'ADVENTURE',
                    sortOrder: 0
                  }
                ]
              }
            }
          }
        }
      });

      const res = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ targetBudget: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.optimization).toBeDefined();
      // Saved activity cost should be included!
      expect(res.body.data.optimization.activitiesCost).toBe(3500);
      expect(res.body.data.optimization.targetBudget).toBe(50000);
    });

    it('should reject invalid parameters on trip optimization endpoint', async () => {
      const trip = await prisma.trip.create({
        data: {
          userId: userAId,
          title: 'Validation Test Trip',
          destination: 'Goa',
          origin: 'CCU',
          startDate: new Date('2026-12-10'),
          endDate: new Date('2026-12-14'),
          totalDays: 4,
          travelers: 2,
          totalBudget: 45000,
          currency: 'INR',
          status: 'PLANNING'
        }
      });

      const res1 = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ targetBudget: -100 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ totalDays: 0 });
      expect(res2.status).toBe(400);

      // Non-integer totalDays rejected
      const res3 = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ totalDays: 3.5 });
      expect(res3.status).toBe(400);

      // Non-integer travelers rejected
      const res4 = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ travelers: 2.2 });
      expect(res4.status).toBe(400);
    });

    it('should leave weather unavailable when no forecast matches exact date and never use index fallback', () => {
      const days = planItinerary({
        attractionResults: [],
        hotelResults: [],
        weatherForecast: [
          // Forecast dates do NOT match the itinerary dates (2026-12-10, 2026-12-11)
          { date: '2026-12-25', condition: 'Snow', maxTempC: -2, minTempC: -10, precipitationProbPercent: 90 }
        ],
        startDate: '2026-12-10',
        totalDays: 2,
        destinationName: 'Goa'
      });

      // Neither day should inherit the 2026-12-25 Snow forecast
      expect(days[0].theme).not.toContain('Snow');
      expect(days[1].theme).not.toContain('Snow');
      expect(days[0].theme).toBe('Day 1: Arrival, Hotel Check-in & Goa Central');
      expect(days[1].theme).toBe('Day 2: Leisure, Highlights & Farewell');
    });

    it('should prevent schedule overflow by moving excess activities to next day and avoiding 23:59 clamping', () => {
      // 8 activities each 120 minutes long. Total 960 mins + transit gaps = ~1200 mins.
      // Day 1 starts post-checkin at 15:30 (930m). Only 2 activities can fit before 22:00 (1320m).
      const heavyAttractions = Array.from({ length: 8 }, (_, idx) => ({
        title: `Heavy Attraction ${idx + 1}`,
        description: `Description ${idx + 1}`,
        locationName: `Location ${idx + 1}`,
        latitude: 15.4 + idx * 0.01,
        longitude: 73.8 + idx * 0.01,
        category: 'SIGHTSEEING' as const,
        estimatedCost: 100,
        recommendedDurationMins: 120
      }));

      const days = planItinerary({
        attractionResults: heavyAttractions,
        hotelResults: [{ hotelName: 'Central Resort', latitude: 15.4, longitude: 73.8 } as any],
        weatherForecast: [],
        startDate: '2026-12-10',
        totalDays: 2,
        destinationName: 'Goa'
      });

      expect(days.length).toBe(2);

      // Verify that no activity on any day is clamped to 23:59 or has end time past 22:00 (1320 mins)
      days.forEach((day) => {
        day.activities.forEach((act) => {
          if (act.startTime && act.endTime) {
            expect(act.startTime).not.toBe('23:59');
            expect(act.endTime).not.toBe('23:59');

            const [endH, endM] = act.endTime.split(':').map(Number);
            const endMins = endH * 60 + endM;
            expect(endMins).toBeLessThanOrEqual(1320); // Not past 22:00
          }
        });
      });

      // Excess activities from Day 1 should have been moved to Day 2 or marked flexible
      expect(days[1].activities.length).toBeGreaterThan(0);
    });
  });
});
