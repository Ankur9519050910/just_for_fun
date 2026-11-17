import { Request, Response, NextFunction } from 'express';
import { tripService } from '../services/tripService';

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
}

export const tripController = new TripController();
