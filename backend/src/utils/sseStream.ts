import { Response, Request } from 'express';
import { SSEEventType } from '../agent/types';
import { logger } from '../config/logger';

export class SSEStreamHandler {
  private res: Response;
  private req: Request;
  private sequenceId = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private _isClosed = false;
  private disconnectListeners: Array<() => void> = [];

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;

    // Initialize SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Start 15-second heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        try {
          this.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
        } catch (err: any) {
          logger.warn('Failed to write heartbeat, closing stream', 'SSEStreamHandler', err.message);
          this.cleanup();
        }
      } else {
        this.cleanup();
      }
    }, 15000);

    const handleDisconnect = (reason: string) => {
      if (this._isClosed) return;
      logger.info(`SSE client disconnected [${reason}]`, 'SSEStreamHandler');
      this.cleanup();
    };

    // Listen to both response connection events and request events
    res.on('close', () => handleDisconnect('res:close'));
    res.on('finish', () => handleDisconnect('res:finish'));
    res.on('error', (err) => handleDisconnect(`res:error: ${err.message}`));
    req.on('close', () => handleDisconnect('req:close'));
    req.on('aborted', () => handleDisconnect('req:aborted'));
    if (res.socket) {
      res.socket.on('close', () => handleDisconnect('socket:close'));
      res.socket.on('error', (err) => handleDisconnect(`socket:error: ${err.message}`));
    }
  }

  public get isConnected(): boolean {
    if (this._isClosed) return false;
    if (this.res.writableEnded || this.res.destroyed) return false;
    if (this.res.socket && this.res.socket.destroyed) return false;
    return true;
  }

  public onDisconnect(listener: () => void): void {
    if (!this.isConnected) {
      listener();
    } else {
      this.disconnectListeners.push(listener);
    }
  }

  public emit(event: SSEEventType, data: Record<string, unknown>): boolean {
    if (!this.isConnected) {
      logger.warn(`Skipping SSE emit for '${event}' because client connection is closed`, 'SSEStreamHandler');
      return false;
    }

    try {
      this.sequenceId++;
      const payload = `id: ${this.sequenceId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return this.res.write(payload);
    } catch (err: any) {
      logger.warn(`SSE write error on event '${event}'`, 'SSEStreamHandler', err.message);
      this.cleanup();
      return false;
    }
  }

  private cleanup(): void {
    this._isClosed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const listeners = [...this.disconnectListeners];
    this.disconnectListeners = [];
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e: any) {
        logger.error('Error in SSE disconnect listener', 'SSEStreamHandler', e);
      }
    });
  }

  public close(): void {
    this.cleanup();
    try {
      if (!this.res.writableEnded) {
        this.res.end();
      }
    } catch {
      // socket already closed
    }
  }
}
