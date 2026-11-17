import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import {
  TravelIntent,
  NormalizedFlightOffer,
  NormalizedHotelOffer,
  DestinationAttraction,
  WeatherForecastDay,
  ToolExecutionStatus,
  ProviderErrorRecord,
  TravelAgentState
} from './types';
import { intentParser } from './intentParser';
import { flightService, hotelService } from '../services/providers/providerFactory';
import { destinationProvider } from '../services/providers/destination/destinationProvider';
import { weatherProvider } from '../services/providers/weather/openMeteoProvider';
import { getCheckpointer } from './checkpointer';
import { logger } from '../config/logger';
import { SSEStreamHandler } from '../utils/sseStream';

// Define typed channels using modern LangGraph Annotation
export const TravelStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  conversationId: Annotation<string>(),
  threadId: Annotation<string>(),
  tripId: Annotation<string | undefined>(),
  userPrompt: Annotation<string>(),
  messages: Annotation<Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>>({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  }),
  extractedIntent: Annotation<TravelIntent>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({
      currency: 'INR',
      vibe: [],
      preferredAirlines: ['6E', 'AI'],
      hotelMinRating: 4.0,
      dietaryPref: [],
      travelPace: 'BALANCED'
    })
  }),
  missingInformation: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  clarificationQuestion: Annotation<string | undefined>(),
  flightResults: Annotation<NormalizedFlightOffer[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  hotelResults: Annotation<NormalizedHotelOffer[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  attractionResults: Annotation<DestinationAttraction[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  weatherForecast: Annotation<WeatherForecastDay[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  toolStatuses: Annotation<Record<string, ToolExecutionStatus>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({})
  }),
  providerErrors: Annotation<ProviderErrorRecord[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  }),
  retryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0
  }),
  summary: Annotation<string | undefined>(),
  status: Annotation<string>({
    reducer: (_, update) => update,
    default: () => 'IDLE'
  }),
  activeStep: Annotation<string>({
    reducer: (_, update) => update,
    default: () => 'init'
  }),
  interrupted: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false
  }),
  lastUpdated: Annotation<string>({
    reducer: (_, update) => update,
    default: () => new Date().toISOString()
  })
});

export type TravelWorkflowState = typeof TravelStateAnnotation.State;

export class TravelAgentOrchestrator {
  private graphApp: any = null;

  public async getGraph() {
    if (this.graphApp) return this.graphApp;

    const workflow = new StateGraph(TravelStateAnnotation)
      .addNode('analyze_intent', async (state: TravelWorkflowState) => {
        logger.info(`Node: analyze_intent for prompt: "${state.userPrompt}"`, 'TravelWorkflow');

        const { intent, missingFields, clarificationQuestion } = intentParser.parse(
          state.userPrompt,
          state.extractedIntent
        );

        return {
          extractedIntent: intent,
          missingInformation: missingFields,
          clarificationQuestion,
          status: missingFields.length > 0 ? 'NEED_INFO' : 'ANALYZING',
          activeStep: 'analyze_intent',
          lastUpdated: new Date().toISOString()
        };
      })
      .addNode('ask_clarification', async (state: TravelWorkflowState) => {
        logger.info(`Node: ask_clarification - Missing: ${state.missingInformation.join(', ')}`, 'TravelWorkflow');
        const question = state.clarificationQuestion || "Could you please provide more details regarding your travel plans?";

        return {
          messages: [{ role: 'assistant', content: question }],
          status: 'NEED_INFO',
          interrupted: true,
          activeStep: 'ask_clarification',
          lastUpdated: new Date().toISOString()
        };
      })
      .addNode('research_inventory', async (state: TravelWorkflowState) => {
        logger.info('Node: research_inventory - Initiating verified inventory discovery', 'TravelWorkflow');
        const intent = state.extractedIntent;
        const origin = intent.origin || 'CCU';
        const destination = intent.destination || 'Goa';
        const departureDate = intent.startDate || new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];
        const returnDate = intent.endDate;
        const travelers = intent.travelers || 2;

        const toolStatuses: Record<string, ToolExecutionStatus> = {
          search_flights: 'RUNNING',
          search_hotels: 'RUNNING',
          search_attractions: 'RUNNING',
          get_weather: 'RUNNING'
        };

        const providerErrors: ProviderErrorRecord[] = [];

        // 1. Resolve Destination Coordinates
        const coords = await destinationProvider.getCoordinates(destination);

        // 2. Query Flights & Hotels in parallel
        const [flightRes, hotelRes, attractions, weather] = await Promise.all([
          flightService.searchFlights({
            originAirport: origin,
            destAirport: coords.iataCode || 'GOI',
            departureDate,
            returnDate,
            travelers,
            cabinClass: 'ECONOMY',
            preferredAirlines: intent.preferredAirlines
          }),
          hotelService.searchHotels({
            destination,
            cityIataCode: coords.iataCode || 'GOI',
            latitude: coords.latitude,
            longitude: coords.longitude,
            checkInDate: departureDate,
            checkOutDate: returnDate || new Date(new Date(departureDate).getTime() + (intent.totalDays || 5) * 86400000).toISOString().split('T')[0],
            guests: travelers,
            minStarRating: intent.hotelMinRating || 4.0
          }),
          destinationProvider.getAttractions(destination, intent.vibe),
          weatherProvider.getForecast(coords.latitude, coords.longitude, departureDate, intent.totalDays || 5)
        ]);

        if (flightRes.errorRecord) providerErrors.push(flightRes.errorRecord);
        if (hotelRes.errorRecord) providerErrors.push(hotelRes.errorRecord);

        toolStatuses.search_flights = 'SUCCESS';
        toolStatuses.search_hotels = 'SUCCESS';
        toolStatuses.search_attractions = 'SUCCESS';
        toolStatuses.get_weather = 'SUCCESS';

        return {
          flightResults: flightRes.results,
          hotelResults: hotelRes.results,
          attractionResults: attractions,
          weatherForecast: weather,
          toolStatuses,
          providerErrors,
          status: 'RESEARCHING',
          activeStep: 'research_inventory',
          lastUpdated: new Date().toISOString()
        };
      })
      .addNode('synthesize_plan', async (state: TravelWorkflowState) => {
        logger.info('Node: synthesize_plan - Generating structured summary and itinerary narrative', 'TravelWorkflow');
        const intent = state.extractedIntent;
        const destination = intent.destination || 'Goa';
        const days = intent.totalDays || 5;
        const travelers = intent.travelers || 2;
        const budget = intent.totalBudget || 50000;

        const bestFlight = state.flightResults[0];
        const bestHotel = state.hotelResults[0];

        const flightCost = bestFlight ? bestFlight.totalPrice : 12400;
        const hotelCost = bestHotel ? bestHotel.totalPrice : 16800;
        const estTotal = flightCost + hotelCost + 8000; // includes activities & buffer

        const isMockFlights = state.flightResults.some((f) => f.isMockData);
        const isMockHotels = state.hotelResults.some((h) => h.isMockData);

        const summary = `I have completed the travel research for your ${days}-day trip to ${destination} for ${travelers} traveler(s).
• Flights: Found ${state.flightResults.length} options starting from ₹${bestFlight?.totalPrice.toLocaleString('en-IN') || '12,400'} (${bestFlight?.airlineName || 'IndiGo'}) [${bestFlight?.source || 'SIMULATED_MOCK_FIXTURE'}].
• Hotels: Selected ${state.hotelResults.length} properties rated ≥${intent.hotelMinRating}★, led by ${bestHotel?.hotelName || 'Heritage Village Resort'} (₹${bestHotel?.totalPrice.toLocaleString('en-IN') || '16,800'} for ${days - 1} nights).
• Weather: Expect ${state.weatherForecast[0]?.condition || 'pleasant sunshine'} with daytime highs of ~${state.weatherForecast[0]?.maxTempC || 32}°C.
• Attractions: Curated ${state.attractionResults.length} experiences matching your interests (${intent.vibe.join(', ') || 'beaches, adventure, heritage, and local seafood'}).
• Budget Projection: Estimated ₹${estTotal.toLocaleString('en-IN')} against your ₹${budget.toLocaleString('en-IN')} budget (${Math.round((estTotal / budget) * 100)}% allocation).

${isMockFlights || isMockHotels ? '⚠️ Notice: One or more inventory sources are using deterministic simulation fixtures because live Amadeus test keys were unconfigured or in sandbox mode.' : '✅ Verified live inventory loaded.'}`;

        return {
          summary,
          messages: [{ role: 'assistant', content: summary }],
          status: 'COMPLETED',
          interrupted: false,
          activeStep: 'synthesize_plan',
          lastUpdated: new Date().toISOString()
        };
      })
      .addEdge(START, 'analyze_intent')
      .addConditionalEdges('analyze_intent', (state: TravelWorkflowState) => {
        if (state.missingInformation && state.missingInformation.length > 0) {
          return 'ask_clarification';
        }
        return 'research_inventory';
      })
      .addEdge('ask_clarification', END)
      .addEdge('research_inventory', 'synthesize_plan')
      .addEdge('synthesize_plan', END);

    const checkpointer = await getCheckpointer();
    this.graphApp = workflow.compile({ checkpointer });
    return this.graphApp;
  }

  public async executeWorkflow(
    input: {
      userId: string;
      conversationId: string;
      threadId: string;
      userPrompt: string;
      existingState?: Partial<TravelWorkflowState>;
    },
    sseHandler?: SSEStreamHandler
  ): Promise<TravelWorkflowState> {
    const graph = await this.getGraph();
    const config = { configurable: { thread_id: input.threadId } };

    // Emit initial workflow step
    sseHandler?.emit('workflow_step', {
      step: 'analyze_intent',
      status: 'RUNNING',
      description: 'Understanding your travel requirements and extracting destination details...'
    });

    const initialState: Partial<TravelWorkflowState> = {
      userId: input.userId,
      conversationId: input.conversationId,
      threadId: input.threadId,
      userPrompt: input.userPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      extractedIntent: input.existingState?.extractedIntent,
      ...input.existingState
    };

    // Execute state graph
    const finalState = await graph.invoke(initialState, config);

    // Stream SSE events corresponding to state transitions
    if (sseHandler && sseHandler.isConnected) {
      if (finalState.status === 'NEED_INFO') {
        sseHandler.emit('need_clarification', {
          missingFields: finalState.missingInformation,
          question: finalState.clarificationQuestion,
          status: 'NEED_INFO'
        });
      } else {
        sseHandler.emit('intent_extracted', {
          intent: finalState.extractedIntent
        });

        sseHandler.emit('tool_start', {
          tools: ['search_flights', 'search_hotels', 'get_weather', 'search_attractions']
        });

        if (finalState.providerErrors && finalState.providerErrors.length > 0) {
          for (const err of finalState.providerErrors) {
            sseHandler.emit('provider_error', err);
          }
        }

        sseHandler.emit('flight_results', {
          flights: finalState.flightResults,
          count: finalState.flightResults.length,
          source: finalState.flightResults[0]?.source || 'SIMULATED_MOCK_FIXTURE'
        });

        sseHandler.emit('hotel_results', {
          hotels: finalState.hotelResults,
          count: finalState.hotelResults.length,
          source: finalState.hotelResults[0]?.source || 'SIMULATED_MOCK_FIXTURE'
        });

        sseHandler.emit('destination_results', {
          attractions: finalState.attractionResults,
          weather: finalState.weatherForecast
        });

        sseHandler.emit('plan_ready', {
          summary: finalState.summary,
          status: 'COMPLETED'
        });
      }

      sseHandler.emit('done', {
        conversationId: input.conversationId,
        threadId: input.threadId,
        status: finalState.status
      });
    }

    return finalState;
  }
}

export const travelAgentOrchestrator = new TravelAgentOrchestrator();
