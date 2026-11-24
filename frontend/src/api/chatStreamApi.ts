import { NormalizedFlightOffer, NormalizedHotelOffer, DayItinerary, BudgetOptimizationResult } from '../types/trip';

export interface ChatStreamCallbacks {
  onWorkflowStep?: (step: { step: string; status: string; description: string }) => void;
  onIntentExtracted?: (intent: Record<string, unknown>) => void;
  onNeedClarification?: (data: { missingFields: string[]; question: string }) => void;
  onToolStart?: (data: { tools: string[] }) => void;
  onProviderError?: (error: { provider: string; errorCode: string; message: string; fallbackTriggered: boolean }) => void;
  onFlightResults?: (data: { flights: NormalizedFlightOffer[]; count: number; source: string }) => void;
  onHotelResults?: (data: { hotels: NormalizedHotelOffer[]; count: number; source: string }) => void;
  onDestinationResults?: (data: { attractions: any[]; weather: any[] }) => void;
  onItineraryReady?: (data: { days: DayItinerary[]; budget: BudgetOptimizationResult }) => void;
  onPlanReady?: (plan: { summary: string; status: string }) => void;
  onDone?: (data: { conversationId: string; threadId: string; status: string }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

export async function sendChatMessageStream(
  params: {
    message: string;
    conversationId?: string;
  },
  callbacks: ChatStreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('travel_companion_token');
  const apiUrl = import.meta.env.VITE_API_URL || '/api';

  const response = await fetch(`${apiUrl}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params),
    signal: abortSignal
  });

  if (!response.ok) {
    let errData = { code: 'HTTP_ERROR', message: `Request failed with status ${response.status}` };
    try {
      const parsed = await response.json();
      if (parsed.error) errData = parsed.error;
    } catch {
      // ignore
    }
    callbacks.onError?.(errData);
    throw new Error(errData.message);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported by browser');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const block of lines) {
      if (!block.trim() || block.startsWith(':')) {
        // Heartbeat or comment line
        continue;
      }

      let eventName = 'message';
      let eventData = '';

      const eventLines = block.split('\n');
      for (const line of eventLines) {
        if (line.startsWith('event:')) {
          eventName = line.replace('event:', '').trim();
        } else if (line.startsWith('data:')) {
          eventData = line.replace('data:', '').trim();
        }
      }

      if (!eventData) continue;

      try {
        const parsed = JSON.parse(eventData);

        switch (eventName) {
          case 'workflow_step':
            callbacks.onWorkflowStep?.(parsed);
            break;
          case 'intent_extracted':
            callbacks.onIntentExtracted?.(parsed);
            break;
          case 'need_clarification':
            callbacks.onNeedClarification?.(parsed);
            break;
          case 'tool_start':
            callbacks.onToolStart?.(parsed);
            break;
          case 'provider_error':
            callbacks.onProviderError?.(parsed);
            break;
          case 'flight_results':
            callbacks.onFlightResults?.(parsed);
            break;
          case 'hotel_results':
            callbacks.onHotelResults?.(parsed);
            break;
          case 'destination_results':
            callbacks.onDestinationResults?.(parsed);
            break;
          case 'itinerary_ready':
            callbacks.onItineraryReady?.(parsed);
            break;
          case 'plan_ready':
            callbacks.onPlanReady?.(parsed);
            break;
          case 'done':
            callbacks.onDone?.(parsed);
            break;
          case 'error':
            callbacks.onError?.(parsed);
            break;
        }
      } catch {
        // JSON parse error on chunk
      }
    }
  }
}
