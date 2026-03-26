import { Client } from '@elastic/elasticsearch';
import { Property, SearchFilters } from '../models/types';
import { logError, logInfo } from '../utils/logger';
import { config } from '../config';

export class ElasticsearchService {
  private client: Client;
  private readonly indexName = 'properties';

  constructor() {
    this.client = new Client({
      node: config.elasticsearch.node || 'http://localhost:9200',
      maxRetries: 3,
      requestTimeout: 30000,
    });
    
    this.checkConnection();
  }

  private async checkConnection(): Promise<void> {
    try {
      const info = await this.client.info();
      logInfo('Elasticsearch connected', { version: info.version.number });
      await this.createIndexIfNotExists();
    } catch (error) {
      logError(error as Error, 'Elasticsearch connection failed');
    }
  }

  private async createIndexIfNotExists(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                title: { type: 'text' },
                price: { type: 'float' },
                area: { type: 'float' },
                district: { type: 'keyword' },
                type: { type: 'keyword' },
                rooms: { type: 'integer' },
                floor: { type: 'integer' },
                totalFloors: { type: 'integer' },
                yearBuilt: { type: 'integer' },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' }
              }
            }
          }
        });
        logInfo('Elasticsearch index created', { index: this.indexName });
      }
    } catch (error) {
      logError(error as Error, 'Failed to create index');
    }
  }

  async indexProperty(property: Property): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName,
        id: property.id,
        body: {
          id: property.id,
          title: property.title,
          price: property.price,
          area: property.area,
          district: property.district,
          type: property.type,
          rooms: property.rooms,
          floor: property.floor,
          totalFloors: property.totalFloors,
          yearBuilt: property.yearBuilt,
          createdAt: property.createdAt,
          updatedAt: property.updatedAt
        }
      });
    } catch (error) {
      logError(error as Error, `Failed to index property ${property.id}`);
      throw error;
    }
  }

  async search(filters: SearchFilters): Promise<Property[]> {
    try {
      const must: any[] = [];

      if (filters.district) {
        must.push({ term: { district: filters.district } });
      }

      if (filters.type) {
        must.push({ term: { type: filters.type } });
      }

      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        const range: any = {};
        if (filters.minPrice !== undefined) range.gte = filters.minPrice;
        if (filters.maxPrice !== undefined) range.lte = filters.maxPrice;
        must.push({ range: { price: range } });
      }

      if (filters.minArea !== undefined || filters.maxArea !== undefined) {
        const range: any = {};
        if (filters.minArea !== undefined) range.gte = filters.minArea;
        if (filters.maxArea !== undefined) range.lte = filters.maxArea;
        must.push({ range: { area: range } });
      }

      if (filters.rooms !== undefined) {
        must.push({ term: { rooms: filters.rooms } });
      }

      const body = must.length > 0 
        ? { query: { bool: { must } } }
        : { query: { match_all: {} } };

      const result = await this.client.search({
        index: this.indexName,
        body: body,
        size: filters.limit || 20,
        from: ((filters.page || 1) - 1) * (filters.limit || 20),
        sort: [{ price: { order: 'desc' } }]
      });

      const hits = result.hits.hits;
      return hits.map((hit: any) => hit._source as Property);

    } catch (error) {
      logError(error as Error, 'Elasticsearch search failed');
      return [];
    }
  }

  async deleteIndex(): Promise<void> {
    try {
      await this.client.indices.delete({ index: this.indexName });
      logInfo('Elasticsearch index deleted');
    } catch (error) {
      logError(error as Error, 'Failed to delete index');
    }
  }
}