import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import {
  TravelIntent,
  NormalizedFlightOffer,
  NormalizedHotelOffer,
  DestinationAttraction,
  WeatherForecastDay,
  ToolExecutionStatus,
  ProviderErrorRecord,
  TravelAgentState,
  DayItinerary,
  BudgetOptimizationResult
} from './types';
import { intentParser } from './intentParser';
import { flightService, hotelService } from '../services/providers/providerFactory';
import { destinationProvider } from '../services/providers/destination/destinationProvider';
import { weatherProvider } from '../services/providers/weather/openMeteoProvider';
import { planItinerary } from '../services/itineraryPlanner';
import { optimizeBudget } from '../services/budgetOptimizer';
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
  itinerary: Annotation<DayItinerary[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined
  }),
  budgetBreakdown: Annotation<BudgetOptimizationResult | undefined>({
    reducer: (_, update) => update,
    default: () => undefined
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
        logger.info('Node: research_inventory - Initiating isolated inventory discovery', 'TravelWorkflow');
        const intent = state.extractedIntent;
        const origin = intent.origin || 'CCU';
        const destination = intent.destination || 'Goa';
        const departureDate = intent.startDate || new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];
        const returnDate = intent.endDate;
        const travelers = intent.travelers || 2;

        // 1. Resolve Destination Coordinates & Airport IATA
        const coords = await destinationProvider.getCoordinates(destination);
        const destIata = coords.iataCode;
        const hasValidCoords = coords.isResolved && coords.latitude !== undefined && coords.longitude !== undefined;

        const toolStatuses: Record<string, ToolExecutionStatus> = {
          search_flights: destIata ? 'PENDING' : 'SKIPPED',
          search_hotels: hasValidCoords ? 'PENDING' : 'SKIPPED',
          search_attractions: hasValidCoords ? 'PENDING' : 'SKIPPED',
          get_weather: hasValidCoords ? 'PENDING' : 'SKIPPED'
        };

        const providerErrors: ProviderErrorRecord[] = [];

        if (!coords.isResolved) {
          providerErrors.push({
            provider: 'DESTINATION_PROVIDER',
            endpoint: '/destination/geocode',
            errorCode: 'LOCATION_UNRESOLVED',
            message: `Could not verify or geocode geographical coordinates for destination "${destination}". Hotel and activity searches were skipped to avoid fabricated results.`,
            timestamp: new Date().toISOString(),
            fallbackTriggered: false
          });
        }

        // 2. Query Providers with Complete Failure Isolation (Promise.allSettled)
        // If destIata cannot be resolved, DO NOT substitute GOI or search flights for an unrelated destination!
        const flightPromise = destIata
          ? flightService.searchFlights({
              originAirport: origin,
              destAirport: destIata,
              departureDate,
              returnDate,
              travelers,
              cabinClass: 'ECONOMY',
              preferredAirlines: intent.preferredAirlines
            })
          : Promise.resolve({
              results: [] as NormalizedFlightOffer[],
              errorRecord: {
                provider: 'FLIGHT_SERVICE',
                endpoint: '/inventory/flights',
                errorCode: 'DESTINATION_AIRPORT_UNRESOLVED',
                message: `No commercial airport code (IATA) could be resolved for destination "${destination}". Flight discovery was skipped to prevent unrelated routing.`,
                timestamp: new Date().toISOString(),
                fallbackTriggered: false
              }
            });

        // Hotels: Only query if destination coordinates are verified
        const hotelPromise = hasValidCoords
          ? hotelService.searchHotels({
              destination,
              cityIataCode: destIata,
              latitude: coords.latitude!,
              longitude: coords.longitude!,
              checkInDate: departureDate,
              checkOutDate: returnDate || new Date(new Date(departureDate).getTime() + (intent.totalDays || 5) * 86400000).toISOString().split('T')[0],
              guests: travelers,
              minStarRating: intent.hotelMinRating || 4.0
            })
          : Promise.resolve({
              results: [] as NormalizedHotelOffer[],
              errorRecord: {
                provider: 'HOTEL_SERVICE',
                endpoint: '/inventory/hotels',
                errorCode: 'DESTINATION_UNRESOLVED',
                message: `Destination "${destination}" has unverified coordinates. Hotel search was skipped to prevent fabricated inventory.`,
                timestamp: new Date().toISOString(),
                fallbackTriggered: false
              }
            });

        // Attractions & Weather: Only query if destination coordinates are verified
        const attractionPromise = hasValidCoords
          ? destinationProvider.getAttractions(destination, intent.vibe)
          : Promise.resolve([] as DestinationAttraction[]);

        const weatherPromise = hasValidCoords
          ? weatherProvider.getForecast(coords.latitude!, coords.longitude!, departureDate, intent.totalDays || 5)
          : Promise.resolve([] as WeatherForecastDay[]);

        const [flightSettled, hotelSettled, attractionSettled, weatherSettled] = await Promise.allSettled([
          flightPromise,
          hotelPromise,
          attractionPromise,
          weatherPromise
        ]);

        // Process Flights with Isolation
        let flightResults: NormalizedFlightOffer[] = [];
        if (flightSettled.status === 'fulfilled') {
          flightResults = flightSettled.value.results;
          if (flightSettled.value.errorRecord) {
            providerErrors.push(flightSettled.value.errorRecord);
          }
          toolStatuses.search_flights = destIata ? 'SUCCESS' : 'SKIPPED';
        } else {
          logger.error('Flight provider failed completely', 'TravelWorkflow', flightSettled.reason);
          toolStatuses.search_flights = 'FAILED';
          providerErrors.push({
            provider: 'FLIGHT_SERVICE',
            endpoint: '/inventory/flights',
            errorCode: 'PROVIDER_FATAL',
            message: flightSettled.reason?.message || 'Flight research service failed',
            timestamp: new Date().toISOString(),
            fallbackTriggered: false
          });
        }

        // Process Hotels with Isolation
        let hotelResults: NormalizedHotelOffer[] = [];
        if (hotelSettled.status === 'fulfilled') {
          hotelResults = hotelSettled.value.results;
          if (hotelSettled.value.errorRecord) {
            providerErrors.push(hotelSettled.value.errorRecord);
          }
          toolStatuses.search_hotels = hasValidCoords ? 'SUCCESS' : 'SKIPPED';
        } else {
          logger.error('Hotel provider failed completely', 'TravelWorkflow', hotelSettled.reason);
          toolStatuses.search_hotels = 'FAILED';
          providerErrors.push({
            provider: 'HOTEL_SERVICE',
            endpoint: '/inventory/hotels',
            errorCode: 'PROVIDER_FATAL',
            message: hotelSettled.reason?.message || 'Hotel research service failed',
            timestamp: new Date().toISOString(),
            fallbackTriggered: false
          });
        }

        // Process Attractions with Isolation
        let attractionResults: DestinationAttraction[] = [];
        if (attractionSettled.status === 'fulfilled') {
          attractionResults = attractionSettled.value;
          toolStatuses.search_attractions = hasValidCoords ? 'SUCCESS' : 'SKIPPED';
        } else {
          logger.error('Attraction provider failed', 'TravelWorkflow', attractionSettled.reason);
          toolStatuses.search_attractions = 'FAILED';
        }

        // Process Weather with Isolation
        let weatherForecast: WeatherForecastDay[] = [];
        if (weatherSettled.status === 'fulfilled') {
          weatherForecast = weatherSettled.value;
          toolStatuses.get_weather = hasValidCoords ? 'SUCCESS' : 'SKIPPED';
        } else {
          logger.error('Weather provider failed', 'TravelWorkflow', weatherSettled.reason);
          toolStatuses.get_weather = 'FAILED';
        }

        return {
          flightResults,
          hotelResults,
          attractionResults,
          weatherForecast,
          toolStatuses,
          providerErrors,
          status: 'RESEARCHING',
          activeStep: 'research_inventory',
          lastUpdated: new Date().toISOString()
        };
      })
      .addNode('synthesize_plan', async (state: TravelWorkflowState) => {
        logger.info('Node: synthesize_plan - Generating transparent budget breakdown and itinerary narrative', 'TravelWorkflow');
        const intent = state.extractedIntent;
        const destination = intent.destination || 'Selected Destination';
        const days = intent.totalDays || 5;
        const travelers = intent.travelers || 2;
        const targetBudget = intent.totalBudget || 50000;

        const bestFlight = state.flightResults && state.flightResults.length > 0 ? state.flightResults[0] : null;
        const bestHotel = state.hotelResults && state.hotelResults.length > 0 ? state.hotelResults[0] : null;

        // Explicit Budget Transparency: Delineate quoted inventory vs estimated activities vs contingency
        const quotedFlightCost = bestFlight ? bestFlight.totalPrice : 0;
        const quotedHotelCost = bestHotel ? bestHotel.totalPrice : 0;
        const totalQuotedInventory = quotedFlightCost + quotedHotelCost;

        const estimatedActivitiesCost = state.attractionResults.reduce((acc, curr) => acc + (curr.estimatedCost || 0), 0);
        const estimatedContingencyBuffer = 5000; // transportation, tips, incidental buffer
        const totalProjectedSpend = totalQuotedInventory + (estimatedActivitiesCost > 0 ? estimatedActivitiesCost : 3000) + estimatedContingencyBuffer;

        const isMockFlights = state.flightResults.some((f) => f.isMockData);
        const isMockHotels = state.hotelResults.some((h) => h.isMockData);

        const flightNarrative = bestFlight
          ? `• Flights [Quoted]: ${bestFlight.airlineName} (${bestFlight.flightNumber}) at ₹${bestFlight.totalPrice.toLocaleString('en-IN')} (${bestFlight.source}).`
          : `• Flights: Direct flight search skipped or unavailable for "${destination}" (no commercial airport code resolved). Hotels and activities researched successfully.`;

        const hotelNarrative = bestHotel
          ? `• Accommodation [Quoted]: ${bestHotel.hotelName} (≥${intent.hotelMinRating}★) at ₹${bestHotel.totalPrice.toLocaleString('en-IN')} for stay (${bestHotel.source}).`
          : `• Accommodation: No hotel offers found. Quoted cost: ₹0 (requires date refinement).`;

        const weatherDesc = state.weatherForecast.length > 0
          ? `• Weather: Expect ${state.weatherForecast[0].condition} with daytime highs around ${state.weatherForecast[0].maxTempC}°C.`
          : `• Weather: Weather forecast pending for destination.`;

        const attractionsDesc = state.attractionResults.length > 0
          ? `• Experiences [Curated]: ${state.attractionResults.length} activities matching interests (${intent.vibe.length > 0 ? intent.vibe.join(', ') : 'sightseeing'}).`
          : `• Experiences: Exploring local sights.`;

        const budgetTransparencyTable = 
`• Budget Breakdown (Transparent Accounting):
  - Actual Quoted Inventory: ₹${totalQuotedInventory.toLocaleString('en-IN')} (Flights: ₹${quotedFlightCost.toLocaleString('en-IN')}, Hotels: ₹${quotedHotelCost.toLocaleString('en-IN')})
  - Estimated Unbooked Activities: ~₹${(estimatedActivitiesCost > 0 ? estimatedActivitiesCost : 3000).toLocaleString('en-IN')} (Estimated local entry & guide expenses)
  - Recommended Contingency Buffer: ₹${estimatedContingencyBuffer.toLocaleString('en-IN')} (Local transfers, meals & buffer)
  - Total Projected Trip Cost: ₹${totalProjectedSpend.toLocaleString('en-IN')} against target budget ₹${targetBudget.toLocaleString('en-IN')} (${Math.round((totalProjectedSpend / targetBudget) * 100)}% allocation).`;

        let provenanceNotice = '';
        if (isMockFlights || isMockHotels) {
          provenanceNotice = '\n\n⚠️ Provenance Notice: One or more inventory quotes are derived from deterministic simulation fixtures (SIMULATED_MOCK_FIXTURE) because Amadeus test credentials were unconfigured or live route was unavailable.';
        } else if (state.flightResults.length > 0 || state.hotelResults.length > 0) {
          provenanceNotice = '\n\n✅ Provenance Verified: Inventory quotes retrieved from live provider APIs.';
        }

        const isCompletelyUnresolved = state.flightResults.length === 0 && state.hotelResults.length === 0 && state.attractionResults.length === 0;

        let summary = '';
        if (isCompletelyUnresolved) {
          summary = `I was unable to verify the geographical location for destination "${destination}".\n• Status: Location unresolved.\n• Notice: To prevent booking to incorrect or simulated regions, searches for flights, hotels, and attractions were omitted rather than using fabricated coordinates.\n• Recommendation: Please clarify the specific city or destination name (e.g., Goa, Jaipur, Paris, etc.) to proceed with travel discovery.`;
        } else {
          summary = `I have completed the travel research for your ${days}-day trip to ${destination} for ${travelers} traveler(s).\n${flightNarrative}\n${hotelNarrative}\n${weatherDesc}\n${attractionsDesc}\n\n${budgetTransparencyTable}${provenanceNotice}`;
        }

        return {
          summary,
          messages: [{ role: 'assistant', content: summary }],
          status: 'COMPLETED',
          interrupted: false,
          activeStep: 'synthesize_plan',
          lastUpdated: new Date().toISOString()
        };
      })
      .addNode('generate_itinerary', async (state: TravelWorkflowState) => {
        logger.info('Node: generate_itinerary - Generating day-by-day itinerary and optimizing budget', 'TravelWorkflow');
        const intent = state.extractedIntent;
        const destination = intent.destination || 'Goa';
        const totalDays = intent.totalDays || 5;
        const startDate = intent.startDate || new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];
        const targetBudget = intent.totalBudget || 50000;
        const travelers = intent.travelers || 2;

        const itinerary = planItinerary({
          attractionResults: state.attractionResults,
          hotelResults: state.hotelResults,
          weatherForecast: state.weatherForecast,
          startDate,
          totalDays,
          vibe: intent.vibe,
          destinationName: destination
        });

        const budgetBreakdown = optimizeBudget({
          flightResults: state.flightResults,
          hotelResults: state.hotelResults,
          attractionResults: state.attractionResults,
          targetBudget,
          totalDays,
          travelers,
          currency: intent.currency || 'INR'
        });

        return {
          itinerary,
          budgetBreakdown,
          status: 'COMPLETED',
          activeStep: 'generate_itinerary',
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
      .addEdge('synthesize_plan', 'generate_itinerary')
      .addEdge('generate_itinerary', END);

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

    // Genuine Progressive SSE Streaming via LangGraph streamMode: 'updates'
    try {
      const streamIterable = await graph.stream(initialState, {
        ...config,
        streamMode: 'updates'
      });

      for await (const chunk of streamIterable) {
        const nodeName = Object.keys(chunk)[0];
        const nodeOutput = chunk[nodeName];

        logger.info(`Node completed [stream update]: ${nodeName}`, 'TravelWorkflow');

        if (nodeName === 'analyze_intent') {
          if (nodeOutput.missingInformation && nodeOutput.missingInformation.length > 0) {
            sseHandler?.emit('workflow_step', {
              step: 'ask_clarification',
              status: 'RUNNING',
              description: 'Formulating clarification query for missing travel parameters...'
            });
          } else {
            sseHandler?.emit('intent_extracted', {
              intent: nodeOutput.extractedIntent
            });
            sseHandler?.emit('workflow_step', {
              step: 'research_inventory',
              status: 'RUNNING',
              description: 'Concurrently researching flights, hotels, weather, and curated attractions...'
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
            description: 'Synthesizing travel plan and calculating transparent budget allocation...'
          });
        } else if (nodeName === 'synthesize_plan') {
          sseHandler?.emit('plan_ready', {
            summary: nodeOutput.summary,
            status: 'COMPLETED'
          });
          sseHandler?.emit('workflow_step', {
            step: 'generate_itinerary',
            status: 'RUNNING',
            description: 'Generating geographically clustered itinerary and optimizing budget breakdown...'
          });
        } else if (nodeName === 'generate_itinerary') {
          sseHandler?.emit('itinerary_ready', {
            days: nodeOutput.itinerary || [],
            budget: nodeOutput.budgetBreakdown
          });
        }

        latestState = { ...latestState, ...nodeOutput };
      }
    } catch (streamError: any) {
      logger.error('Error during LangGraph stream execution', 'TravelWorkflow', streamError);
      throw streamError;
    }

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
