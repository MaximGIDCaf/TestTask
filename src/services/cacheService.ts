import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logError, logInfo } from '../utils/logger';

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
    });

    this.client.on('error', (err) => {
      logError(err, 'Redis connection error');
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logInfo('Redis connected');
      this.isConnected = true;
    });

    this.client.connect().catch(err => {
      logError(err, 'Failed to connect to Redis');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logError(error as Error, `Redis get error for key: ${key}`);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = config.redis.ttl): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logError(error as Error, `Redis set error for key: ${key}`);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logError(error as Error, `Redis delete error for key: ${key}`);
      return false;
    }
  }

  async clearPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logError(error as Error, `Redis clear pattern error: ${pattern}`);
    }
  }

  generateSearchKey(filters: any): string {
    return `search:${JSON.stringify(filters)}`;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isConnected) return false;
    
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

export default CacheService;