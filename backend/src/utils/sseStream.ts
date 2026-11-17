import { Response, Request } from 'express';
import { SSEEventType } from '../agent/types';
import { logger } from '../config/logger';

export class SSEStreamHandler {
  private res: Response;
  private req: Request;
  private sequenceId = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private _isCleanedUp = false;
  private _isPrematureDisconnect = false;
  private disconnectListeners: Array<(reason: string) => void> = [];

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
          logger.warn('Failed to write heartbeat, marking disconnect', 'SSEStreamHandler', err.message);
          this.handleClientDisconnect('heartbeat_write_failed');
        }
      } else {
        this.cleanup();
      }
    }, 15000);

    // 1. Detect PREMATURE client disconnect via response close
    // In Node.js HTTP, res.on('close') fires when the underlying connection terminates.
    // If res.writableFinished is false, the client disconnected BEFORE normal completion (res.end).
    res.on('close', () => {
      if (!this.res.writableFinished && !this._isCleanedUp) {
        this.handleClientDisconnect('res:premature_close');
      } else {
        this.cleanup();
      }
    });

    // 2. Normal response completion - NOT an abnormal disconnect
    res.on('finish', () => {
      this.cleanup();
    });

    // 3. Response error
    res.on('error', (err) => {
      this.handleClientDisconnect(`res:error: ${err.message}`);
    });

    // 4. Request explicit abortion
    req.on('aborted', () => {
      this.handleClientDisconnect('req:aborted');
    });

    // 5. Socket-level inspection
    if (res.socket) {
      res.socket.on('close', (hadError) => {
        if (!this.res.writableFinished && !this._isCleanedUp) {
          this.handleClientDisconnect(`socket:close_before_finish (hadError=${hadError})`);
        } else {
          this.cleanup();
        }
      });
      res.socket.on('error', (err) => {
        this.handleClientDisconnect(`socket:error: ${err.message}`);
      });
    }

    // IMPORTANT ARCHITECTURAL NOTE:
    // We intentionally DO NOT listen to req.on('close') as a client disconnect.
    // In Node.js HTTP for POST-based SSE, req.on('close') fires when the incoming
    // request body has been fully read and consumed by body parsers, while the response
    // socket remains completely open and active for streaming events to the client.
  }

  public get isConnected(): boolean {
    if (this._isCleanedUp || this._isPrematureDisconnect) return false;
    if (this.res.writableEnded || this.res.writableFinished || this.res.destroyed) return false;
    if (this.res.socket && this.res.socket.destroyed) return false;
    return true;
  }

  public get wasPrematurelyDisconnected(): boolean {
    return this._isPrematureDisconnect;
  }

  public onDisconnect(listener: (reason: string) => void): void {
    if (this._isPrematureDisconnect) {
      listener('already_disconnected');
    } else {
      this.disconnectListeners.push(listener);
    }
  }

  public emit(event: SSEEventType, data: Record<string, unknown>): boolean {
    if (!this.isConnected) {
      logger.warn(`Skipping SSE emit for '${event}' because connection is not writable`, 'SSEStreamHandler');
      return false;
    }

    try {
      this.sequenceId++;
      const payload = `id: ${this.sequenceId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return this.res.write(payload);
    } catch (err: any) {
      logger.warn(`SSE write error on event '${event}'`, 'SSEStreamHandler', err.message);
      this.handleClientDisconnect('write_error');
      return false;
    }
  }

  private handleClientDisconnect(reason: string): void {
    if (this._isPrematureDisconnect || this._isCleanedUp) return;
    this._isPrematureDisconnect = true;
    logger.info(`SSE client disconnected prematurely: ${reason}`, 'SSEStreamHandler');

    this.cleanup();

    const listeners = [...this.disconnectListeners];
    this.disconnectListeners = [];
    listeners.forEach((fn) => {
      try {
        fn(reason);
      } catch (e: any) {
        logger.error('Error in SSE disconnect listener', 'SSEStreamHandler', e);
      }
    });
  }

  private cleanup(): void {
    if (this._isCleanedUp) return;
    this._isCleanedUp = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public close(): void {
    this.cleanup();
    try {
      if (!this.res.writableEnded) {
        this.res.end();
      }
    } catch {
      // response already ended or destroyed
    }
  }
}
