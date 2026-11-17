type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  message: string;
  level?: LogLevel;
  timestamp?: string;
  context?: string;
  data?: unknown;
  error?: unknown;
}

class Logger {
  private formatLog(level: LogLevel, message: string, context?: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? `[${context}]` : '';
    const serializedData = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${ctx} ${message}${serializedData}`;
  }

  info(message: string, context?: string, data?: unknown): void {
    console.log(this.formatLog('info', message, context, data));
  }

  warn(message: string, context?: string, data?: unknown): void {
    console.warn(this.formatLog('warn', message, context, data));
  }

  error(message: string, context?: string, error?: unknown): void {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
    console.error(this.formatLog('error', message, context, errorDetails));
  }

  debug(message: string, context?: string, data?: unknown): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatLog('debug', message, context, data));
    }
  }
}

export const logger = new Logger();
