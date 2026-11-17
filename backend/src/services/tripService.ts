import { prisma } from '../db/prisma';
import { CreateTripInput } from '../utils/validation';
import { AppError } from '../middleware/errorHandler';

export class TripService {
  async listUserTrips(userId: string) {
    const trips = await prisma.trip.findMany({
      where: {
        OR: [
          { userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        itineraries: {
          where: { isApproved: true },
          take: 1
        },
        _count: {
          select: {
            flightOptions: true,
            hotelOptions: true,
            bookings: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return trips;
  }

  async getTripById(tripId: string, userId: string) {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        itineraries: {
          include: {
            activities: {
              orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }]
            }
          }
        },
        flightOptions: {
          orderBy: { totalPrice: 'asc' }
        },
        hotelOptions: {
          orderBy: { totalPrice: 'asc' }
        },
        bookings: {
          include: { payment: true }
        }
      }
    });

    if (!trip) {
      throw new AppError('Trip not found or unauthorized access', 404, 'TRIP_NOT_FOUND');
    }

    return trip;
  }

  async createTrip(userId: string, input: CreateTripInput) {
    const trip = await prisma.trip.create({
      data: {
        userId,
        title: input.title,
        destination: input.destination,
        origin: input.origin,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        totalDays: input.totalDays,
        travelers: input.travelers,
        totalBudget: input.totalBudget as any,
        currency: input.currency,
        status: 'PLANNING',
        metadata: input.metadata ? (input.metadata as any) : undefined
      }
    });

    return trip;
  }

  async getDashboardSummary(userId: string) {
    const totalTrips = await prisma.trip.count({ where: { userId } });
    const upcomingTrips = await prisma.trip.count({
      where: {
        userId,
        startDate: { gte: new Date() },
        status: { not: 'CANCELLED' }
      }
    });
    const completedTrips = await prisma.trip.count({
      where: {
        userId,
        endDate: { lt: new Date() }
      }
    });
    const totalBookings = await prisma.booking.count({
      where: { userId, status: 'CONFIRMED' }
    });

    const recentTrips = await prisma.trip.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    return {
      stats: {
        totalTrips,
        upcomingTrips,
        completedTrips,
        totalBookings
      },
      recentTrips
    };
  }
}

export const tripService = new TripService();
