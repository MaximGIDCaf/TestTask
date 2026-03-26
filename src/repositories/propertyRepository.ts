import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { Property, PropertyId, SearchFilters, SearchResult, PropertyHistory } from '../models/types';
import { logError } from '../utils/logger';

export class PropertyRepository {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      max: config.database.poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      logError(err, 'PostgreSQL pool error');
    });
  }

  async getPropertiesByIds(ids: PropertyId[]): Promise<Property[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50) {
      throw new Error('Maximum 50 IDs allowed per request');
    }

    const query = `
      SELECT * FROM properties 
      WHERE id = ANY($1::uuid[])
    `;
    
    const result = await this.executeWithRetry(async (client) => {
      return await client.query(query, [ids]);
    });

    return result.rows;
  }

  async searchProperties(filters: SearchFilters): Promise<SearchResult> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (filters.district) {
      whereClauses.push(`district = $${paramCounter++}`);
      values.push(filters.district);
    }

    if (filters.minPrice !== undefined) {
      whereClauses.push(`price >= $${paramCounter++}`);
      values.push(filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
      whereClauses.push(`price <= $${paramCounter++}`);
      values.push(filters.maxPrice);
    }

    if (filters.type) {
      whereClauses.push(`type = $${paramCounter++}`);
      values.push(filters.type);
    }

    if (filters.minArea !== undefined) {
      whereClauses.push(`area >= $${paramCounter++}`);
      values.push(filters.minArea);
    }

    if (filters.maxArea !== undefined) {
      whereClauses.push(`area <= $${paramCounter++}`);
      values.push(filters.maxArea);
    }

    if (filters.rooms !== undefined) {
      whereClauses.push(`rooms = $${paramCounter++}`);
      values.push(filters.rooms);
    }

    const whereClause = whereClauses.length > 0 
      ? `WHERE ${whereClauses.join(' AND ')}` 
      : '';

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM properties 
      ${whereClause}
    `;

    const dataQuery = `
      SELECT * FROM properties 
      ${whereClause}
      ORDER BY price DESC
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;

    values.push(limit, offset);

    const client = await this.pool.connect();
    try {
      const [countResult, dataResult] = await Promise.all([
        client.query(countQuery, values.slice(0, -2)),
        client.query(dataQuery, values),
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      return {
        items: dataResult.rows,
        total,
        page,
        limit,
        totalPages,
      };
    } finally {
      client.release();
    }
  }

  async getPriceHistory(propertyId: PropertyId): Promise<PropertyHistory[]> {
    const query = `
      SELECT * FROM price_history 
      WHERE property_id = $1 
      ORDER BY change_date DESC
    `;
    
    const result = await this.pool.query(query, [propertyId]);
    return result.rows;
  }

  async addToFavorites(userId: string, propertyId: PropertyId): Promise<void> {
    const query = `
      INSERT INTO favorites (user_id, property_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, property_id) DO NOTHING
    `;
    
    await this.pool.query(query, [userId, propertyId]);
  }

  async removeFromFavorites(userId: string, propertyId: PropertyId): Promise<void> {
    const query = `
      DELETE FROM favorites 
      WHERE user_id = $1 AND property_id = $2
    `;
    
    await this.pool.query(query, [userId, propertyId]);
  }

  async getFavorites(userId: string, limit: number = 20, offset: number = 0): Promise<Property[]> {
    const query = `
      SELECT p.* FROM properties p
      INNER JOIN favorites f ON f.property_id = p.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  private async executeWithRetry<T extends QueryResultRow>(
    operation: (client: PoolClient) => Promise<QueryResult<T>>,
    maxAttempts: number = config.retry.maxAttempts
  ): Promise<QueryResult<T>> {
    let lastError: Error | null = null;
    let delay = config.retry.initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const client = await this.pool.connect();
      try {
        // Set statement timeout
        await client.query(`SET statement_timeout = ${config.timeouts.dbQuery}`);
        
        const result = await operation(client);
        return result;
      } catch (error) {
        lastError = error as Error;
        logError(lastError, `Database operation failed (attempt ${attempt}/${maxAttempts})`);
        
        if (attempt === maxAttempts) break;
        
        await this.sleep(delay);
        delay *= 2; // Exponential backoff
      } finally {
        client.release();
      }
    }
    
    throw lastError || new Error('Database operation failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}