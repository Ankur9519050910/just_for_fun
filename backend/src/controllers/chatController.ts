import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { travelAgentOrchestrator } from '../agent/travelWorkflow';
import { SSEStreamHandler } from '../utils/sseStream';
import { flightService, hotelService } from '../services/providers/providerFactory';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { DayItinerary, ItineraryActivityItem } from '../agent/types';

export class ChatController {
  async handleStreamMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId;
    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Message text is required' }
      });
      return;
    }

    let agentRunId: string | null = null;
    let runFinalStatus: string = 'FAILED';
    let sseHandler: SSEStreamHandler | null = null;

    try {
      // 1. Resolve or Create Conversation
      let activeConversationId = conversationId;

      if (activeConversationId) {
        const existing = await prisma.conversation.findUnique({
          where: { id: activeConversationId }
        });

        if (!existing) {
          throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        // Authorization check: User must own the conversation
        if (existing.userId !== userId) {
          throw new AppError('Unauthorized access to this conversation', 403, 'FORBIDDEN');
        }
      } else {
        const newConv = await prisma.conversation.create({
          data: {
            userId,
            title: message.slice(0, 40) + '...'
          }
        });
        activeConversationId = newConv.id;
      }

      // 2. Prevent duplicate concurrent execution if a run is currently active
      const runningCount = await prisma.agentRun.count({
        where: {
          conversationId: activeConversationId,
          status: 'RUNNING'
        }
      });

      if (runningCount > 0) {
        res.status(429).json({
          success: false,
          error: {
            code: 'CONCURRENT_RUN_IN_PROGRESS',
            message: 'A travel planning workflow is already running for this conversation. Please wait for it to complete.'
          }
        });
        return;
      }

      // 3. Create AgentRun entry in DB
      const agentRun = await prisma.agentRun.create({
        data: {
          userId,
          conversationId: activeConversationId,
          triggerPrompt: message,
          status: 'RUNNING'
        }
      });
      agentRunId = agentRun.id;

      // 4. Initialize SSE Stream with comprehensive disconnect detection
      sseHandler = new SSEStreamHandler(req, res);
      sseHandler.onDisconnect(async () => {
        if (agentRunId) {
          try {
            await prisma.agentRun.update({
              where: { id: agentRunId },
              data: {
                status: 'CANCELLED',
                completedAt: new Date()
              }
            });
          } catch (err: any) {
            logger.warn('Failed to update agentRun to CANCELLED on disconnect', 'ChatController', err.message);
          }
        }
      });

      // Save user prompt message to DB
      await prisma.message.create({
        data: {
          conversationId: activeConversationId,
          role: 'USER',
          content: message
        }
      });

      // 5. Execute LangGraph Agent with Checkpointer & Progressive SSE
      const finalState = await travelAgentOrchestrator.executeWorkflow(
        {
          userId,
          conversationId: activeConversationId,
          threadId: activeConversationId,
          userPrompt: message
        },
        sseHandler
      );

      runFinalStatus = finalState.status;

      // If client disconnected during execution, update status to CANCELLED
      if (!sseHandler.isConnected) {
        runFinalStatus = 'CANCELLED';
      }

      // 6. Persist Results & Assistant Message in DB
      const assistantMessage = finalState.summary || finalState.clarificationQuestion || 'I have analyzed your request.';
      await prisma.message.create({
        data: {
          conversationId: activeConversationId,
          role: 'ASSISTANT',
          content: assistantMessage,
          metadata: JSON.stringify({
            status: finalState.status,
            intent: finalState.extractedIntent,
            flightCount: finalState.flightResults.length,
            hotelCount: finalState.hotelResults.length
          }) as any
        }
      });

      // If planning succeeded, create or update Trip in DB
      if (finalState.status === 'COMPLETED' && finalState.extractedIntent.destination) {
        const intent = finalState.extractedIntent;
        const startDate = intent.startDate ? new Date(intent.startDate) : new Date(Date.now() + 21 * 86400000);
        const endDate = intent.endDate ? new Date(intent.endDate) : new Date(startDate.getTime() + (intent.totalDays || 5) * 86400000);

        const trip = await prisma.trip.create({
          data: {
            userId,
            title: `${intent.totalDays || 5}-Day Trip to ${intent.destination}`,
            destination: intent.destination!,
            origin: intent.origin || 'CCU',
            startDate,
            endDate,
            totalDays: intent.totalDays || 5,
            travelers: intent.travelers || 2,
            totalBudget: (intent.totalBudget || 50000) as any,
            currency: intent.currency || 'INR',
            status: 'PLANNING',
            flightOptions: {
              create: finalState.flightResults.map((f) => ({
                airlineCode: f.airlineCode,
                airlineName: f.airlineName,
                flightNumber: f.flightNumber,
                originAirport: f.originAirport,
                destAirport: f.destAirport,
                departureTime: new Date(f.departureTime),
                arrivalTime: new Date(f.arrivalTime),
                durationMins: f.durationMins,
                stops: f.stops,
                cabinClass: f.cabinClass,
                pricePerPerson: f.pricePerPerson as any,
                totalPrice: f.totalPrice as any,
                currency: f.currency,
                offerReference: f.offerReference,
                isMockData: f.isMockData,
                isSelected: false
              }))
            },
            hotelOptions: {
              create: finalState.hotelResults.map((h) => ({
                hotelName: h.hotelName,
                hotelId: h.hotelId,
                address: h.address,
                city: h.city,
                latitude: h.latitude,
                longitude: h.longitude,
                starRating: h.starRating,
                userRating: h.userRating,
                pricePerNight: h.pricePerNight as any,
                totalPrice: h.totalPrice as any,
                currency: h.currency,
                roomType: h.roomType,
                amenities: JSON.stringify(h.amenities) as any,
                imageUrl: h.imageUrl,
                isMockData: h.isMockData,
                isSelected: false
              }))
            }
          }
        });

        // Persist generated itinerary and activities if available
        if (finalState.itinerary && finalState.itinerary.length > 0) {
          const totalCost = finalState.budgetBreakdown?.totalProjectedSpend || 0;
          await prisma.itinerary.create({
            data: {
              tripId: trip.id,
              version: 1,
              isApproved: false,
              summary: finalState.summary || `${trip.title} Itinerary`,
              totalCost: totalCost as any,
              activities: {
                create: finalState.itinerary.flatMap((day: DayItinerary) =>
                  day.activities.map((a: ItineraryActivityItem, idx: number) => ({
                    dayNumber: day.dayNumber,
                    timeSlot: a.timeSlot,
                    startTime: a.startTime,
                    endTime: a.endTime,
                    title: a.title,
                    description: a.description,
                    locationName: a.locationName,
                    latitude: typeof a.latitude === 'number' && !isNaN(a.latitude) ? a.latitude : 0,
                    longitude: typeof a.longitude === 'number' && !isNaN(a.longitude) ? a.longitude : 0,
                    estimatedCost: a.estimatedCost as any,
                    category: a.category,
                    sortOrder: idx
                  }))
                )
              }
            }
          });
        }

        // Link trip to conversation
        await prisma.conversation.update({
          where: { id: activeConversationId },
          data: { tripId: trip.id }
        });
      }
    } catch (error: any) {
      logger.error('Error in handleStreamMessage', 'ChatController', error);
      runFinalStatus = 'FAILED';
      if (sseHandler && sseHandler.isConnected) {
        sseHandler.emit('error', {
          code: error.code || 'AGENT_EXECUTION_ERROR',
          message: error.message || 'An error occurred during workflow execution'
        });
      }
      next(error);
    } finally {
      // Guaranteed Cleanup: Always transition AgentRun out of RUNNING
      if (agentRunId) {
        try {
          const finalStatus = (sseHandler?.wasPrematurelyDisconnected || !sseHandler?.isConnected)
            ? 'CANCELLED'
            : runFinalStatus;
          await prisma.agentRun.update({
            where: { id: agentRunId },
            data: {
              status: finalStatus,
              completedAt: new Date()
            }
          });
        } catch (updateErr: any) {
          logger.error('Failed to update agent run status in finally block', 'ChatController', updateErr);
        }
      }

      if (sseHandler) {
        sseHandler.close();
      }
    }
  }

  async getConversationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          trip: {
            include: {
              flightOptions: true,
              hotelOptions: true
            }
          }
        }
      });

      if (!conversation) {
        throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
      }

      if (conversation.userId !== userId) {
        throw new AppError('Unauthorized access to this conversation', 403, 'FORBIDDEN');
      }

      res.status(200).json({
        success: true,
        data: { conversation }
      });
    } catch (error) {
      next(error);
    }
  }

  async directFlightSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { originAirport, destAirport, departureDate, returnDate, travelers, cabinClass } = req.body;
      const results = await flightService.searchFlights({
        originAirport: originAirport || 'CCU',
        destAirport: destAirport || 'GOI',
        departureDate: departureDate || new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
        returnDate,
        travelers: travelers || 1,
        cabinClass: cabinClass || 'ECONOMY'
      });

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  async directHotelSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { destination, checkInDate, checkOutDate, guests, minStarRating } = req.body;
      const results = await hotelService.searchHotels({
        destination: destination || 'Goa',
        checkInDate: checkInDate || new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
        checkOutDate: checkOutDate || new Date(Date.now() + 26 * 86400000).toISOString().split('T')[0],
        guests: guests || 2,
        minStarRating: minStarRating || 4.0
      });

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
