import { TravelIntent } from './types';
import { UserPreferencesDto } from '../types/auth';

const CITY_AIRPORT_MAP: Record<string, string> = {
  kolkata: 'CCU',
  calcutta: 'CCU',
  goa: 'GOI',
  delhi: 'DEL',
  newdelhi: 'DEL',
  mumbai: 'BOM',
  bombay: 'BOM',
  bangalore: 'BLR',
  bengaluru: 'BLR',
  chennai: 'MAA',
  hyderabad: 'HYD'
};

export class IntentParser {
  public parse(
    prompt: string,
    existingIntent?: Partial<TravelIntent>,
    userPrefs?: UserPreferencesDto | null
  ): { intent: TravelIntent; missingFields: string[]; clarificationQuestion?: string } {
    const text = prompt.toLowerCase();
    const intent: TravelIntent = {
      destination: existingIntent?.destination,
      origin: existingIntent?.origin || userPrefs?.homeAirport || undefined,
      startDate: existingIntent?.startDate,
      endDate: existingIntent?.endDate,
      totalDays: existingIntent?.totalDays,
      travelers: existingIntent?.travelers || 1,
      totalBudget: existingIntent?.totalBudget,
      currency: existingIntent?.currency || userPrefs?.currency || 'INR',
      vibe: existingIntent?.vibe ? [...existingIntent.vibe] : [],
      preferredAirlines: existingIntent?.preferredAirlines || userPrefs?.preferredAirlines || ['6E', 'AI'],
      hotelMinRating: existingIntent?.hotelMinRating || userPrefs?.hotelMinRating || 4.0,
      dietaryPref: existingIntent?.dietaryPref || userPrefs?.dietaryPref || [],
      travelPace: existingIntent?.travelPace || (userPrefs?.travelPace as any) || 'BALANCED'
    };

    // 1. Destination Extraction
    for (const city of ['goa', 'kolkata', 'delhi', 'mumbai', 'bangalore', 'chennai', 'hyderabad']) {
      if (text.includes(city) && !text.includes(`from ${city}`)) {
        intent.destination = city.charAt(0).toUpperCase() + city.slice(1);
        break;
      }
    }

    // 2. Origin Extraction
    for (const [city, iata] of Object.entries(CITY_AIRPORT_MAP)) {
      if (text.includes(`from ${city}`) || text.includes(`departing ${city}`) || text.includes(`leaving ${city}`)) {
        intent.origin = iata;
        break;
      }
    }

    // If text mentions "from CCU" or 3-letter IATA bare
    const iataMatches = prompt.match(/\b([A-Z]{3})\b/g);
    if (iataMatches) {
      for (const iata of iataMatches) {
        if (Object.values(CITY_AIRPORT_MAP).includes(iata)) {
          if (!intent.origin && iata !== 'GOI') {
            intent.origin = iata;
          }
        }
      }
    }

    // 3. Travelers Extraction
    if (text.includes('two people') || text.includes('2 people') || text.includes('for two') || text.includes('couple') || text.includes('for 2')) {
      intent.travelers = 2;
    } else if (text.includes('three people') || text.includes('3 people') || text.includes('for 3')) {
      intent.travelers = 3;
    } else if (text.includes('four people') || text.includes('4 people') || text.includes('for 4') || text.includes('family')) {
      intent.travelers = 4;
    } else {
      const paxMatch = text.match(/(\d+)\s*(?:travelers?|people|passengers?|adults?)/);
      if (paxMatch) {
        intent.travelers = parseInt(paxMatch[1], 10);
      }
    }

    // 4. Duration & Days Extraction
    const daysMatch = text.match(/(\d+)[ -]days?/);
    if (daysMatch) {
      intent.totalDays = parseInt(daysMatch[1], 10);
    } else if (text.includes('weekend')) {
      intent.totalDays = 3;
    } else if (text.includes('one week') || text.includes('a week')) {
      intent.totalDays = 7;
    }

    // 5. Budget Extraction (Precise targeting of budget keywords & currency symbols)
    const budgetPatterns = [
      /(?:budget|cost|spending|total)\s*(?:is|of)?\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?/i,
      /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?/i,
      /(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?\s*(?:₹|rs\.?|inr|budget)/i
    ];

    for (const pattern of budgetPatterns) {
      const match = text.match(pattern);
      if (match) {
        const valStr = match[1].replace(/,/g, '');
        let amount = parseFloat(valStr);
        const multiplier = (match[2] || '').toLowerCase();
        if (multiplier === 'k' || multiplier === 'thousand') {
          amount *= 1000;
        } else if (multiplier === 'lakh') {
          amount *= 100000;
        }
        if (amount >= 500) {
          intent.totalBudget = amount;
          break;
        }
      }
    }

    // 6. Dates Computation (if totalDays is known but dates are not explicitly supplied)
    if (intent.totalDays && !intent.startDate) {
      const start = new Date();
      start.setDate(start.getDate() + 21);
      const end = new Date(start);
      end.setDate(end.getDate() + intent.totalDays);

      intent.startDate = start.toISOString().split('T')[0];
      intent.endDate = end.toISOString().split('T')[0];
    }

    // 7. Vibes & Preferences
    const vibesFound: string[] = [];
    if (text.includes('beach') || text.includes('beaches')) vibesFound.push('Beaches');
    if (text.includes('adventure') || text.includes('water sports')) vibesFound.push('Adventure');
    if (text.includes('heritage') || text.includes('history') || text.includes('culture')) vibesFound.push('Heritage');
    if (text.includes('food') || text.includes('seafood') || text.includes('cuisine') || text.includes('dining')) vibesFound.push('Local Food');
    if (text.includes('relaxation') || text.includes('chill') || text.includes('spa')) vibesFound.push('Relaxation');
    intent.vibe = Array.from(new Set([...intent.vibe, ...vibesFound]));

    // 8. Missing Information Analysis
    const missingFields: string[] = [];
    if (!intent.destination) {
      missingFields.push('destination');
    }
    if (!intent.origin) {
      missingFields.push('origin');
    }
    if (!intent.totalDays && !intent.startDate) {
      missingFields.push('duration or dates');
    }
    if (!intent.totalBudget) {
      missingFields.push('total budget');
    }

    // 9. Clarification Question Generation
    let clarificationQuestion: string | undefined;
    if (missingFields.length > 0) {
      if (missingFields.includes('destination')) {
        clarificationQuestion = "Which destination would you like to travel to?";
      } else if (missingFields.includes('origin')) {
        clarificationQuestion = `Where will you be departing from for your trip to ${intent.destination}? (e.g. Kolkata, Delhi, Mumbai)`;
      } else if (missingFields.includes('duration or dates')) {
        clarificationQuestion = `How many days are you planning to spend in ${intent.destination}, or do you have specific travel dates in mind?`;
      } else if (missingFields.includes('total budget')) {
        clarificationQuestion = `What is your estimated total budget for this trip (including flights and hotels)?`;
      } else {
        clarificationQuestion = `Could you please clarify: ${missingFields.join(', ')}?`;
      }
    }

    return { intent, missingFields, clarificationQuestion };
  }
}

export const intentParser = new IntentParser();
