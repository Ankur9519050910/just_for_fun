import { Request, Response, NextFunction } from 'express';
import { tripService } from '../services/tripService';
import { prisma } from '../db/prisma';
import { optimizeBudget } from '../services/budgetOptimizer';
import { NormalizedFlightOffer, NormalizedHotelOffer } from '../agent/types';

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
      const trip = await prisma.trip.findFirst({
        where: { id: tripId, userId },
        include: { flightOptions: true, hotelOptions: true }
      });

      if (!trip) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Trip not found' }
        });
        return;
      }

      const { targetBudget = trip.totalBudget, totalDays = trip.totalDays, travelers = trip.travelers } = req.body || {};

      const flightResults: NormalizedFlightOffer[] = trip.flightOptions.map((f: any) => ({
        ...f,
        isMockData: f.isMockData ?? true
      } as NormalizedFlightOffer));

      const hotelResults: NormalizedHotelOffer[] = trip.hotelOptions.map((h: any) => ({
        ...h,
        amenities: typeof h.amenities === 'string' ? JSON.parse(h.amenities || '[]') : (h.amenities || []),
        isMockData: h.isMockData ?? true
      } as NormalizedHotelOffer));

      const result = optimizeBudget({
        flightResults,
        hotelResults,
        attractionResults: [],
        targetBudget,
        totalDays,
        travelers,
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
