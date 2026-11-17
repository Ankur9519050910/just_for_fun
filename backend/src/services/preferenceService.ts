import { prisma } from '../db/prisma';
import { UpdatePreferencesInput } from '../utils/validation';
import { UserPreferencesDto } from '../types/auth';

export class PreferenceService {
  async getPreferences(userId: string): Promise<UserPreferencesDto | null> {
    const pref = await prisma.userPreference.findUnique({
      where: { userId }
    });

    if (!pref) return null;

    let preferredAirlines: any = pref.preferredAirlines;
    if (typeof preferredAirlines === 'string') {
      try {
        preferredAirlines = JSON.parse(preferredAirlines);
      } catch {
        preferredAirlines = [];
      }
    }

    let dietaryPref: any = pref.dietaryPref;
    if (typeof dietaryPref === 'string') {
      try {
        dietaryPref = JSON.parse(dietaryPref);
      } catch {
        dietaryPref = [];
      }
    }

    return {
      id: pref.id,
      homeAirport: pref.homeAirport,
      preferredAirlines: Array.isArray(preferredAirlines) ? preferredAirlines : [],
      hotelMinRating: Number(pref.hotelMinRating),
      dietaryPref: Array.isArray(dietaryPref) ? dietaryPref : [],
      travelPace: pref.travelPace,
      currency: pref.currency
    };
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<UserPreferencesDto> {
    const dataToSave: any = {
      homeAirport: input.homeAirport ?? null,
      hotelMinRating: input.hotelMinRating,
      travelPace: input.travelPace,
      currency: input.currency
    };

    // Handle both PostgreSQL (array) and SQLite (json string)
    try {
      dataToSave.preferredAirlines = JSON.stringify(input.preferredAirlines);
      dataToSave.dietaryPref = JSON.stringify(input.dietaryPref);

      const updated = await prisma.userPreference.upsert({
        where: { userId },
        update: dataToSave,
        create: {
          userId,
          ...dataToSave
        }
      });

      return {
        id: updated.id,
        homeAirport: updated.homeAirport,
        preferredAirlines: input.preferredAirlines,
        hotelMinRating: Number(updated.hotelMinRating),
        dietaryPref: input.dietaryPref,
        travelPace: updated.travelPace,
        currency: updated.currency
      };
    } catch {
      dataToSave.preferredAirlines = input.preferredAirlines;
      dataToSave.dietaryPref = input.dietaryPref;

      const updated = await prisma.userPreference.upsert({
        where: { userId },
        update: dataToSave,
        create: {
          userId,
          ...dataToSave
        }
      });

      return {
        id: updated.id,
        homeAirport: updated.homeAirport,
        preferredAirlines: Array.isArray(updated.preferredAirlines) ? (updated.preferredAirlines as string[]) : input.preferredAirlines,
        hotelMinRating: Number(updated.hotelMinRating),
        dietaryPref: Array.isArray(updated.dietaryPref) ? (updated.dietaryPref as string[]) : input.dietaryPref,
        travelPace: updated.travelPace,
        currency: updated.currency
      };
    }
  }
}

export const preferenceService = new PreferenceService();
