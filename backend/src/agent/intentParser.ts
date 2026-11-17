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
  hyderabad: 'HYD',
  jaipur: 'JAI',
  coimbatore: 'CJB',
  ahmedabad: 'AMD',
  pune: 'PNQ',
  kochi: 'COK',
  paris: 'CDG',
  london: 'LHR',
  zurich: 'ZRH'
};

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const AMBIGUOUS_ORIGIN_WORDS = [
  'somewhere',
  'anywhere',
  'nowhere',
  'home',
  'here',
  'place',
  'undecided',
  'unknown'
];

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
    let destFound = false;
    for (const city of Object.keys(CITY_AIRPORT_MAP)) {
      if (text.includes(city) && !text.includes(`from ${city}`) && !text.includes(`departing ${city}`) && !text.includes(`leaving ${city}`)) {
        intent.destination = city.charAt(0).toUpperCase() + city.slice(1);
        destFound = true;
        break;
      }
    }

    if (!destFound) {
      const destRegex = /(?:trip|travel|holiday|vacation|tour|visit|going|heading)\s+(?:to|in|for)\s+([a-zA-Z\s]{2,25}?)(?=[,\.\?\!]|\s+(?:from|for|with|in|on|at|during|departing)|$)/i;
      const match = prompt.match(destRegex);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (!['a', 'the', 'my', 'two', 'three', 'four', 'us', 'me'].includes(candidate.toLowerCase())) {
          intent.destination = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }
      }
    }

    // 2. Origin Extraction
    for (const [city, iata] of Object.entries(CITY_AIRPORT_MAP)) {
      if (text.includes(`from ${city}`) || text.includes(`departing ${city}`) || text.includes(`leaving ${city}`)) {
        intent.origin = iata;
        break;
      }
    }

    const iataMatches = prompt.match(/\b([A-Z]{3})\b/g);
    if (iataMatches) {
      for (const iata of iataMatches) {
        if (Object.values(CITY_AIRPORT_MAP).includes(iata) && iata !== 'GOI') {
          intent.origin = iata;
          break;
        }
      }
    }

    if (!intent.origin) {
      const originMatch = prompt.match(/(?:from|departing|leaving)\s+([a-zA-Z\s]{2,20}?)(?=[,\.\?\!]|\s+(?:to|for|with|in|on|at)|$)/i);
      if (originMatch && originMatch[1]) {
        const rawPlace = originMatch[1].trim().toLowerCase();
        const isAmbiguous = AMBIGUOUS_ORIGIN_WORDS.some((word) => rawPlace.includes(word));
        if (!isAmbiguous) {
          if (CITY_AIRPORT_MAP[rawPlace]) {
            intent.origin = CITY_AIRPORT_MAP[rawPlace];
          } else if (rawPlace.length >= 3) {
            intent.origin = rawPlace.toUpperCase();
          }
        }
      }
    }

    // 3. Travelers Extraction
    if (text.includes('solo') || text.includes('by myself') || text.includes('just me') || text.includes('alone') || text.includes('1 person')) {
      intent.travelers = 1;
    } else if (text.includes('my wife and i') || text.includes('me and my partner') || text.includes('me and my friend') || text.includes('two of us') || text.includes('two people') || text.includes('2 people') || text.includes('for two') || text.includes('couple') || text.includes('for 2')) {
      intent.travelers = 2;
    } else if (text.includes('three people') || text.includes('3 people') || text.includes('for 3') || text.includes('three of us')) {
      intent.travelers = 3;
    } else if (text.includes('four people') || text.includes('4 people') || text.includes('for 4') || text.includes('four of us')) {
      intent.travelers = 4;
    } else {
      const familyMatch = text.match(/family\s+of\s+(\d+)/i);
      if (familyMatch) {
        intent.travelers = parseInt(familyMatch[1], 10);
      } else {
        const friendsMatch = text.match(/me\s+and\s+(\d+)\s+friends?/i);
        if (friendsMatch) {
          intent.travelers = 1 + parseInt(friendsMatch[1], 10);
        } else {
          const paxMatch = text.match(/(\d+)\s*(?:travelers?|people|passengers?|adults?|guests?)/i);
          if (paxMatch) {
            intent.travelers = parseInt(paxMatch[1], 10);
          }
        }
      }
    }

    // 4. Duration & Days Extraction
    const daysMatch = text.match(/(\d+)[ -]days?/i);
    if (daysMatch) {
      intent.totalDays = parseInt(daysMatch[1], 10);
    } else {
      const weeksMatch = text.match(/(\d+)[ -]weeks?/i);
      if (weeksMatch) {
        intent.totalDays = parseInt(weeksMatch[1], 10) * 7;
      } else if (text.includes('weekend')) {
        intent.totalDays = 3;
      } else if (text.includes('one week') || text.includes('a week')) {
        intent.totalDays = 7;
      }
    }

    // 5. Explicit Dates / Month Extraction
    const isoDateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoDateMatch) {
      intent.startDate = isoDateMatch[1];
      if (intent.totalDays) {
        const endObj = new Date(intent.startDate);
        endObj.setDate(endObj.getDate() + intent.totalDays);
        intent.endDate = endObj.toISOString().split('T')[0];
      }
    } else {
      for (const [mName, mIdx] of Object.entries(MONTH_NAMES)) {
        if (text.includes(`in ${mName}`) || text.includes(`during ${mName}`) || text.includes(`for ${mName}`)) {
          const now = new Date();
          let targetYear = now.getFullYear();
          if (mIdx < now.getMonth()) {
            targetYear += 1;
          }
          const startObj = new Date(targetYear, mIdx, 15);
          intent.startDate = startObj.toISOString().split('T')[0];
          if (intent.totalDays) {
            const endObj = new Date(startObj);
            endObj.setDate(endObj.getDate() + intent.totalDays);
            intent.endDate = endObj.toISOString().split('T')[0];
          }
          break;
        }
      }
    }

    if (intent.totalDays && !intent.startDate) {
      const start = new Date();
      start.setDate(start.getDate() + 21);
      const end = new Date(start);
      end.setDate(end.getDate() + intent.totalDays);

      intent.startDate = start.toISOString().split('T')[0];
      intent.endDate = end.toISOString().split('T')[0];
    }

    // 6. Budget Extraction
    const budgetPatterns = [
      /(?:₹|rs\.?|inr|budget\s*(?:is|of)?\s*)?\s*(\d+(?:\.\d+)?)\s*(?:lakhs?|l\b)/i,
      /(?:budget|cost|spending|total)\s*(?:is|of)?\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand)?/i,
      /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand)?/i,
      /(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand)?\s*(?:₹|rs\.?|inr|rupees|budget)/i
    ];

    for (const pattern of budgetPatterns) {
      const match = text.match(pattern);
      if (match) {
        let amount = 0;
        if (pattern.source.includes('lakh')) {
          amount = parseFloat(match[1]) * 100000;
        } else {
          const valStr = match[1].replace(/,/g, '');
          amount = parseFloat(valStr);
          const multiplier = (match[2] || '').toLowerCase();
          if (multiplier === 'k' || multiplier === 'thousand') {
            amount *= 1000;
          }
        }
        if (amount >= 500) {
          intent.totalBudget = amount;
          break;
        }
      }
    }

    // 7. Vibes & Preferences
    const vibesFound: string[] = [];
    if (text.includes('beach') || text.includes('beaches')) vibesFound.push('Beaches');
    if (text.includes('adventure') || text.includes('water sports')) vibesFound.push('Adventure');
    if (text.includes('heritage') || text.includes('history') || text.includes('culture') || text.includes('temple')) vibesFound.push('Heritage');
    if (text.includes('food') || text.includes('seafood') || text.includes('cuisine') || text.includes('dining')) vibesFound.push('Local Food');
    if (text.includes('relaxation') || text.includes('chill') || text.includes('spa') || text.includes('peaceful')) vibesFound.push('Relaxation');
    intent.vibe = Array.from(new Set([...intent.vibe, ...vibesFound]));

    // 8. Missing Information Analysis
    const missingFields: string[] = [];
    if (!intent.destination) {
      missingFields.push('destination');
    }
    const isOriginMissing = !intent.origin || AMBIGUOUS_ORIGIN_WORDS.some((w) => intent.origin?.toLowerCase().includes(w));
    if (isOriginMissing) {
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
