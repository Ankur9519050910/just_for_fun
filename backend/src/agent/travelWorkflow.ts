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

// Define typed channels using LangGraph Annotation
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
        logger.info('Node: research_inventory - Initiating inventory discovery', 'TravelWorkflow');
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

        // 2. Query Flights & Hotels concurrently
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
        const destination = intent.destination || 'Selected Destination';
        const days = intent.totalDays || 5;
        const travelers = intent.travelers || 2;
        const budget = intent.totalBudget || 50000;

        const bestFlight = state.flightResults && state.flightResults.length > 0 ? state.flightResults[0] : null;
        const bestHotel = state.hotelResults && state.hotelResults.length > 0 ? state.hotelResults[0] : null;

        // Compute spend exclusively from actual found inventory - NEVER hardcode placeholder prices
        const flightCost = bestFlight ? bestFlight.totalPrice : 0;
        const hotelCost = bestHotel ? bestHotel.totalPrice : 0;
        const estimatedActivities = state.attractionResults.reduce((acc, curr) => acc + (curr.estimatedCost || 0), 0);
        const bufferEst = 5000;
        const actualCommittedCost = flightCost + hotelCost;
        const projectedTotal = actualCommittedCost + (estimatedActivities > 0 ? estimatedActivities : 3000) + bufferEst;

        const isMockFlights = state.flightResults.some((f) => f.isMockData);
        const isMockHotels = state.hotelResults.some((h) => h.isMockData);

        const flightSummary = bestFlight
          ? `• Flights: Discovered ${state.flightResults.length} options. Recommended: ${bestFlight.airlineName} (${bestFlight.flightNumber}) at ₹${bestFlight.totalPrice.toLocaleString('en-IN')} (${bestFlight.source}).`
          : `• Flights: No flights found matching the exact criteria. (Flight cost allocation: ₹0).`;

        const hotelSummary = bestHotel
          ? `• Hotels: Discovered ${state.hotelResults.length} properties (≥${intent.hotelMinRating}★). Recommended: ${bestHotel.hotelName} at ₹${bestHotel.totalPrice.toLocaleString('en-IN')} for stay (${bestHotel.source}).`
          : `• Hotels: No hotel inventory available for specified dates. (Hotel cost allocation: ₹0).`;

        const weatherDesc = state.weatherForecast.length > 0
          ? `• Weather: Expect ${state.weatherForecast[0].condition} with daytime highs around ${state.weatherForecast[0].maxTempC}°C.`
          : `• Weather: Forecast data pending for dates.`;

        const attractionsDesc = state.attractionResults.length > 0
          ? `• Experiences: Curated ${state.attractionResults.length} activities matching interests (${intent.vibe.length > 0 ? intent.vibe.join(', ') : 'sightseeing and culture'}).`
          : `• Experiences: Exploring local sights.`;

        const budgetDesc = `• Budget Projection: Estimated total ₹${projectedTotal.toLocaleString('en-IN')} against target ₹${budget.toLocaleString('en-IN')} (${Math.round((projectedTotal / budget) * 100)}% allocation).`;

        let provenanceNotice = '';
        if (isMockFlights || isMockHotels) {
          provenanceNotice = '\n\n⚠️ Inventory Notice: One or more inventory options are using deterministic simulation fixtures (SIMULATED_MOCK_FIXTURE) because live Amadeus test keys were unconfigured or sandbox criteria required simulated routes.';
        } else if (state.flightResults.length > 0 || state.hotelResults.length > 0) {
          provenanceNotice = '\n\n✅ Verified inventory loaded from live provider APIs.';
        }

        const summary = `I have completed the travel research for your ${days}-day trip to ${destination} for ${travelers} traveler(s).\n${flightSummary}\n${hotelSummary}\n${weatherDesc}\n${attractionsDesc}\n${budgetDesc}${provenanceNotice}`;

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

    // Progressive SSE: Emit initial workflow step
    sseHandler?.emit('workflow_step', {
      step: 'analyze_intent',
      status: 'RUNNING',
      description: 'Understanding your travel requirements and parsing constraints...'
    });

    // Check existing state from checkpointer to guarantee multi-turn continuity
    let mergedIntent = input.existingState?.extractedIntent;
    try {
      const savedState = await graph.getState(config);
      if (savedState?.values?.extractedIntent) {
        mergedIntent = {
          ...savedState.values.extractedIntent,
          ...(input.existingState?.extractedIntent || {})
        };
        logger.info(`Loaded existing thread intent from checkpointer: ${JSON.stringify(mergedIntent)}`, 'TravelWorkflow');
      }
    } catch (err: any) {
      logger.warn('Could not read existing state from checkpointer', 'TravelWorkflow', err.message);
    }

    const initialState: Partial<TravelWorkflowState> = {
      userId: input.userId,
      conversationId: input.conversationId,
      threadId: input.threadId,
      userPrompt: input.userPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      extractedIntent: mergedIntent,
      ...input.existingState
    };

    let latestState: TravelWorkflowState = initialState as TravelWorkflowState;

    // Genuine Progressive SSE Streaming:
    // We stream node updates in real-time as each node finishes execution!
    try {
      const streamIterable = await graph.stream(initialState, {
        ...config,
        streamMode: 'updates'
      });

      for await (const chunk of streamIterable) {
        // chunk is an object with { [nodeName]: nodeOutput }
        const nodeName = Object.keys(chunk)[0];
        const nodeOutput = chunk[nodeName];

        logger.info(`Node completed [stream update]: ${nodeName}`, 'TravelWorkflow');

        if (nodeName === 'analyze_intent') {
          if (nodeOutput.missingInformation && nodeOutput.missingInformation.length > 0) {
            sseHandler?.emit('workflow_step', {
              step: 'ask_clarification',
              status: 'RUNNING',
              description: 'Identifying missing details and formulating follow-up clarification...'
            });
          } else {
            sseHandler?.emit('intent_extracted', {
              intent: nodeOutput.extractedIntent
            });
            sseHandler?.emit('workflow_step', {
              step: 'research_inventory',
              status: 'RUNNING',
              description: 'Searching flights, hotels, weather, and curated attractions...'
            });
            sseHandler?.emit('tool_start', {
              tools: ['search_flights', 'search_hotels', 'get_weather', 'search_attractions']
            });
          }
        } else if (nodeName === 'ask_clarification') {
          sseHandler?.emit('need_clarification', {
            missingFields: nodeOutput.missingInformation || latestState.missingInformation,
            question: nodeOutput.messages?.[0]?.content || "Could you please provide more details?",
            status: 'NEED_INFO'
          });
        } else if (nodeName === 'research_inventory') {
          if (nodeOutput.providerErrors && nodeOutput.providerErrors.length > 0) {
            for (const err of nodeOutput.providerErrors) {
              sseHandler?.emit('provider_error', err);
            }
          }

          sseHandler?.emit('flight_results', {
            flights: nodeOutput.flightResults || [],
            count: (nodeOutput.flightResults || []).length,
            source: nodeOutput.flightResults?.[0]?.source || 'SIMULATED_MOCK_FIXTURE'
          });

          sseHandler?.emit('hotel_results', {
            hotels: nodeOutput.hotelResults || [],
            count: (nodeOutput.hotelResults || []).length,
            source: nodeOutput.hotelResults?.[0]?.source || 'SIMULATED_MOCK_FIXTURE'
          });

          sseHandler?.emit('destination_results', {
            attractions: nodeOutput.attractionResults || [],
            weather: nodeOutput.weatherForecast || []
          });

          sseHandler?.emit('workflow_step', {
            step: 'synthesize_plan',
            status: 'RUNNING',
            description: 'Synthesizing travel plan and calculating budget allocations...'
          });
        } else if (nodeName === 'synthesize_plan') {
          sseHandler?.emit('plan_ready', {
            summary: nodeOutput.summary,
            status: 'COMPLETED'
          });
        }

        // Keep local state up to date
        latestState = { ...latestState, ...nodeOutput };
      }
    } catch (streamError: any) {
      logger.error('Error during LangGraph stream execution', 'TravelWorkflow', streamError);
      throw streamError;
    }

    // Retrieve final snapshot from checkpointer
    const finalSnapshot = await graph.getState(config);
    const finalState = (finalSnapshot?.values || latestState) as TravelWorkflowState;

    sseHandler?.emit('done', {
      conversationId: input.conversationId,
      threadId: input.threadId,
      status: finalState.status
    });

    return finalState;
  }
}

export const travelAgentOrchestrator = new TravelAgentOrchestrator();
