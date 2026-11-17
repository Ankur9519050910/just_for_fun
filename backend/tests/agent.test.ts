import request from 'supertest';
import { createApp } from '../src/app';
import { travelAgentOrchestrator } from '../src/agent/travelWorkflow';
import { intentParser } from '../src/agent/intentParser';
import { flightService, hotelService } from '../src/services/providers/providerFactory';
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

  describe('1. Intent Parser & Missing Information Detection', () => {
    it('should extract complete constraints from natural language prompt', () => {
      const prompt = "Plan a 5-day trip to Goa for two people from Kolkata. Total budget is ₹50,000. I love beaches and seafood.";
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
      expect(first.isMockData).toBe(true); // Sandbox mock fixture
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
  });

  describe('3. LangGraph Stateful Workflow Execution & Resumption', () => {
    const threadId = `test_thread_${Date.now()}`;

    it('should pause with NEED_INFO when initial prompt lacks origin', async () => {
      const state = await travelAgentOrchestrator.executeWorkflow({
        userId: userAId,
        conversationId: threadId,
        threadId,
        userPrompt: "I want to take a 5-day trip to Goa with ₹50,000 budget"
      });

      expect(state.status).toBe('NEED_INFO');
      expect(state.missingInformation).toContain('origin');
      expect(state.clarificationQuestion).toBeDefined();
      expect(state.flightResults.length).toBe(0); // Did not query prematurely
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

  describe('5. Direct Inventory Endpoints', () => {
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
});
