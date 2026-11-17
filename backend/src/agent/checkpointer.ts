import { BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { env } from '../config/env';
import { logger } from '../config/logger';

let checkpointerInstance: BaseCheckpointSaver | null = null;

/**
 * Retrieves the checkpointer for LangGraph state persistence.
 *
 * PRODUCTION REQUIREMENT:
 * In production environments, DATABASE_URL must point to a live PostgreSQL database
 * (e.g. postgresql://user:pass@host:5432/ai_travel_companion) to ensure durable,
 * persistent checkpoints that survive process restarts.
 *
 * DEVELOPMENT / TESTING FALLBACK:
 * When DATABASE_URL does not point to PostgreSQL (e.g. file:./dev.db for SQLite or testing),
 * an in-memory MemorySaver is used. NOTE: MemorySaver is an in-memory fallback that
 * stores state in process memory and DOES NOT persist across process or server restarts.
 */
export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const isPostgres = env.DATABASE_URL.startsWith('postgres://') || env.DATABASE_URL.startsWith('postgresql://');

  if (isPostgres) {
    try {
      logger.info('Initializing production PostgresSaver for LangGraph checkpoints...', 'Checkpointer');
      const saver = PostgresSaver.fromConnString(env.DATABASE_URL);
      await saver.setup();
      checkpointerInstance = saver;
      logger.info('Durable PostgresSaver initialized successfully', 'Checkpointer');
      return checkpointerInstance;
    } catch (error: any) {
      logger.warn('Failed to connect to PostgresSaver, falling back to in-memory checkpointer (MemorySaver)', 'Checkpointer', error.message);
    }
  }

  logger.warn(
    'PostgreSQL connection string not detected. Using ephemeral in-memory fallback (MemorySaver). NOTE: Checkpoints will not persist across server restarts. For production persistence, configure DATABASE_URL with PostgreSQL.',
    'Checkpointer'
  );
  checkpointerInstance = new MemorySaver();
  return checkpointerInstance;
}
