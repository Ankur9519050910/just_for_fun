import { prisma } from '../db/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { RegisterInput, LoginInput } from '../utils/validation';
import { AuthUserResponse, LoginResponse, UserPreferencesDto } from '../types/auth';

function normalizePreferences(raw: any): UserPreferencesDto | null {
  if (!raw) return null;
  
  let preferredAirlines: any = raw.preferredAirlines;
  if (typeof preferredAirlines === 'string') {
    try {
      preferredAirlines = JSON.parse(preferredAirlines);
    } catch {
      preferredAirlines = [];
    }
  }

  let dietaryPref: any = raw.dietaryPref;
  if (typeof dietaryPref === 'string') {
    try {
      dietaryPref = JSON.parse(dietaryPref);
    } catch {
      dietaryPref = [];
    }
  }

  return {
    id: raw.id,
    homeAirport: raw.homeAirport,
    preferredAirlines: Array.isArray(preferredAirlines) ? preferredAirlines : [],
    hotelMinRating: Number(raw.hotelMinRating) || 3.5,
    dietaryPref: Array.isArray(dietaryPref) ? dietaryPref : [],
    travelPace: raw.travelPace || 'BALANCED',
    currency: raw.currency || 'INR'
  };
}

export class AuthService {
  async register(input: RegisterInput): Promise<LoginResponse> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email }
    });

    if (existing) {
      throw new AppError('An account with this email address already exists', 409, 'EMAIL_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);

    // Create user and initialize default preferences
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: 'USER',
        preferences: {
          create: {
            preferredAirlines: JSON.stringify([]),
            dietaryPref: JSON.stringify([]),
            travelPace: 'BALANCED',
            currency: 'INR',
            hotelMinRating: 3.5
          }
        }
      },
      include: {
        preferences: true
      }
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        preferences: normalizePreferences(user.preferences)
      }
    };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { preferences: true }
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isValid = await comparePassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        preferences: normalizePreferences(user.preferences)
      }
    };
  }

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      preferences: normalizePreferences(user.preferences)
    };
  }
}

export const authService = new AuthService();
