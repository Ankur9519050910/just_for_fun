import { Request, Response, NextFunction } from 'express';
import { tripService } from '../services/tripService';
import { prisma } from '../db/prisma';
import { optimizeBudget } from '../services/budgetOptimizer';
import { NormalizedFlightOffer, NormalizedHotelOffer, DestinationAttraction } from '../agent/types';

export class TripController {
  async listUserTrips(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const trips = await tripService.listUserTrips(userId);
      res.status(200).json({
        success: true,
        data: { trips }
      });
    } catch (error) {
      next(error);
    }
  }

  async getTripById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { tripId } = req.params;
      const trip = await tripService.getTripById(tripId, userId);
      res.status(200).json({
        success: true,
        data: { trip }
      });
    } catch (error) {
      next(error);
    }
  }

  async createTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const trip = await tripService.createTrip(userId, req.body);
      res.status(201).json({
        success: true,
        data: { trip }
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const summary = await tripService.getDashboardSummary(userId);
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async optimizeTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { tripId } = req.params;

      if (!tripId || typeof tripId !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Valid tripId parameter is required' }
        });
        return;
      }

      const { targetBudget, totalDays, travelers } = req.body || {};

      if (targetBudget !== undefined && (typeof targetBudget !== 'number' || isNaN(targetBudget) || targetBudget <= 0)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'targetBudget must be a positive number' }
        });
        return;
      }

      if (totalDays !== undefined && (typeof totalDays !== 'number' || isNaN(totalDays) || totalDays < 1)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'totalDays must be a positive integer' }
        });
        return;
      }

      if (travelers !== undefined && (typeof travelers !== 'number' || isNaN(travelers) || travelers < 1)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'travelers must be a positive integer' }
        });
        return;
      }

      const trip = await prisma.trip.findFirst({
        where: { id: tripId, userId },
        include: {
          flightOptions: true,
          hotelOptions: true,
          itineraries: {
            include: { activities: true },
            orderBy: { version: 'desc' }
          }
        }
      });

      if (!trip) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Trip not found' }
        });
        return;
      }

      const resolvedBudget = targetBudget !== undefined ? targetBudget : Number(trip.totalBudget);
      const resolvedDays = totalDays !== undefined ? totalDays : trip.totalDays;
      const resolvedTravelers = travelers !== undefined ? travelers : trip.travelers;

      const flightResults: NormalizedFlightOffer[] = trip.flightOptions.map((f: any) => ({
        ...f,
        isMockData: f.isMockData ?? true
      } as NormalizedFlightOffer));

      const hotelResults: NormalizedHotelOffer[] = trip.hotelOptions.map((h: any) => ({
        ...h,
        amenities: typeof h.amenities === 'string' ? JSON.parse(h.amenities || '[]') : (h.amenities || []),
        isMockData: h.isMockData ?? true
      } as NormalizedHotelOffer));

      // Retrieve saved activities from the latest itinerary to include activity expenses
      const latestItinerary = trip.itineraries?.[0];
      const savedActivities = latestItinerary?.activities || [];
      const attractionResults: DestinationAttraction[] = savedActivities.map((a: any) => ({
        title: a.title,
        description: a.description,
        locationName: a.locationName,
        latitude: a.latitude,
        longitude: a.longitude,
        category: a.category as any,
        estimatedCost: Number(a.estimatedCost) || 0,
        recommendedDurationMins: 90
      }));

      const result = optimizeBudget({
        flightResults,
        hotelResults,
        attractionResults,
        targetBudget: resolvedBudget,
        totalDays: resolvedDays,
        travelers: resolvedTravelers,
        currency: trip.currency || 'INR'
      });

      res.status(200).json({
        success: true,
        data: { optimization: result }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const tripController = new TripController();
