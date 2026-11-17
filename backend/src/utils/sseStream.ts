import { Response, Request } from 'express';
import { SSEEventType } from '../agent/types';
import { logger } from '../config/logger';

export class SSEStreamHandler {
  private res: Response;
  private req: Request;
  private sequenceId = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public isConnected = true;

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;

    // Initialize SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for nginx
    res.flushHeaders?.();

    // Start 15-second heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      }
    }, 15000);

    // Detect client disconnection
    req.on('close', () => {
      this.isConnected = false;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      logger.info('SSE client connection closed by user', 'SSEStreamHandler');
    });
  }

  public emit(event: SSEEventType, data: Record<string, unknown>): boolean {
    if (!this.isConnected) {
      logger.warn(`Skipping SSE emit for '${event}' because client disconnected`, 'SSEStreamHandler');
      return false;
    }

    this.sequenceId++;
    const payload = `id: ${this.sequenceId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.res.write(payload);
    return true;
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.isConnected) {
      this.res.end();
      this.isConnected = false;
    }
  }
}
