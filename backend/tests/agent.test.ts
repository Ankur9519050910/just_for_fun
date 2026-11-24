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
    it('should compute deterministic budget breakdown and detect UNDER_BUDGET status', () => {
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
        totalPrice: 20000,
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
        totalDays: 5,
        travelers: 2,
        currency: 'INR'
      });

      expect(res.flightsCost).toBe(12000);
      expect(res.hotelsCost).toBe(20000); // 4000 * 5 days
      expect(res.activitiesCost).toBe(500);
      expect(res.contingencyBuffer).toBe(Math.round((12000 + 20000 + 500) * 0.10)); // 3250
      expect(res.totalProjectedSpend).toBe(12000 + 20000 + 500 + 3250); // 35750
      expect(res.status).toBe('UNDER_BUDGET');
      expect(res.categoryBreakdown.length).toBe(4);
      expect(res.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect OVER_BUDGET status and provide actionable downgrade suggestions', () => {
      const res = optimizeBudget({
        flightResults: [{ totalPrice: 30000 } as any],
        hotelResults: [{ pricePerNight: 8000 } as any],
        attractionResults: [],
        targetBudget: 40000,
        totalDays: 5,
        travelers: 2,
        currency: 'INR'
      });

      // spend: 30000 + 40000 = 70000 + 10% contingency = 77000
      expect(res.status).toBe('OVER_BUDGET');
      expect(res.remainingSurplusOrDeficit).toBeLessThan(0);
      expect(res.recommendations.some(r => r.includes('exceeds target budget'))).toBe(true);
    });

    it('should generate geographically clustered itinerary with Day 1 hotel check-in', () => {
      const days = planItinerary({
        attractionResults: [
          { title: 'Fort Aguada', description: 'Fort', locationName: 'Sinquerim', latitude: 15.4925, longitude: 73.7736, category: 'HERITAGE', estimatedCost: 300, recommendedDurationMins: 90 },
          { title: 'Basilica of Bom Jesus', description: 'Church', locationName: 'Old Goa', latitude: 15.5009, longitude: 73.9116, category: 'HERITAGE', estimatedCost: 200, recommendedDurationMins: 60 },
          { title: 'Palolem Beach', description: 'Beach', locationName: 'Canacona', latitude: 15.0100, longitude: 74.0232, category: 'RELAXATION', estimatedCost: 0, recommendedDurationMins: 120 },
          { title: 'Fishermans Wharf', description: 'Dining', locationName: 'Cavelossim', latitude: 15.1700, longitude: 73.9400, category: 'DINING', estimatedCost: 1500, recommendedDurationMins: 90 }
        ],
        hotelResults: [
          { hotelName: 'Goa Marriott Resort', latitude: 15.4889, longitude: 73.8117 } as any
        ],
        weatherForecast: [
          { date: '2026-12-10', condition: 'Sunny', maxTempC: 30, minTempC: 22, precipitationProbPercent: 0 }
        ],
        startDate: '2026-12-10',
        totalDays: 3,
        destinationName: 'Goa'
      });

      expect(days.length).toBe(3);
      expect(days[0].dayNumber).toBe(1);
      expect(days[0].date).toBe('2026-12-10');
      // Day 1 has hotel check-in as first activity
      expect(days[0].activities[0].title).toContain('Hotel Check-in');
      expect(days[0].activities[0].locationName).toBe('Goa Marriott Resort');
      // Weather note included in theme
      expect(days[0].theme).toContain('Sunny');
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

    it('should optimize existing trip budget via POST /api/trips/:tripId/optimize', async () => {
      const trip = await prisma.trip.create({
        data: {
          userId: userAId,
          title: 'Existing Trip to Goa',
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

      const res = await request(app)
        .post(`/api/trips/${trip.id}/optimize`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ targetBudget: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.optimization).toBeDefined();
      expect(res.body.data.optimization.targetBudget).toBe(50000);
      expect(res.body.data.optimization.currency).toBe('INR');
    });
  });
});
