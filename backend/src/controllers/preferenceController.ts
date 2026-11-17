import { Request, Response, NextFunction } from 'express';
import { preferenceService } from '../services/preferenceService';

export class PreferenceController {
  async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const preferences = await preferenceService.getPreferences(userId);
      res.status(200).json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const updated = await preferenceService.updatePreferences(userId, req.body);
      res.status(200).json({
        success: true,
        data: { preferences: updated }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const preferenceController = new PreferenceController();
