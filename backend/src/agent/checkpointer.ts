import { BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { env } from '../config/env';
import { logger } from '../config/logger';

let checkpointerInstance: BaseCheckpointSaver | null = null;

export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const isPostgres = env.DATABASE_URL.startsWith('postgres://') || env.DATABASE_URL.startsWith('postgresql://');

  if (isPostgres) {
    try {
      logger.info('Initializing PostgresSaver for LangGraph checkpoints...', 'Checkpointer');
      const saver = PostgresSaver.fromConnString(env.DATABASE_URL);
      await saver.setup();
      checkpointerInstance = saver;
      logger.info('PostgresSaver initialized successfully', 'Checkpointer');
      return checkpointerInstance;
    } catch (error: any) {
      logger.warn('Failed to connect to PostgresSaver, falling back to in-memory checkpointer', 'Checkpointer', error.message);
    }
  }

  logger.info('Using durable MemorySaver for LangGraph workflow threads', 'Checkpointer');
  checkpointerInstance = new MemorySaver();
  return checkpointerInstance;
}
