import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100)
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required')
});

export const updatePreferencesSchema = z.object({
  homeAirport: z.string().trim().length(3, 'IATA code must be exactly 3 uppercase letters').toUpperCase().optional().nullable(),
  preferredAirlines: z.array(z.string().trim()).default([]),
  hotelMinRating: z.number().min(1).max(5).default(3.5),
  dietaryPref: z.array(z.string().trim()).default([]),
  travelPace: z.enum(['RELAXED', 'BALANCED', 'PACKED']).default('BALANCED'),
  currency: z.string().trim().length(3).default('INR')
});

export const createTripSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters'),
  destination: z.string().trim().min(2, 'Destination is required'),
  origin: z.string().trim().min(2, 'Origin is required'),
  startDate: z.string().datetime({ message: 'Invalid start date ISO string' }),
  endDate: z.string().datetime({ message: 'Invalid end date ISO string' }),
  totalDays: z.number().int().min(1).max(60),
  travelers: z.number().int().min(1).max(20).default(1),
  totalBudget: z.number().positive('Budget must be positive'),
  currency: z.string().trim().length(3).default('INR'),
  metadata: z.record(z.unknown()).optional()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
