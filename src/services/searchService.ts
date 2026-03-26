import { PropertyRepository } from '../repositories/propertyRepository';
import { CacheService } from './cacheService';
import { ElasticsearchService } from './elasticsearchService';
import { Property, SearchFilters, SearchResult, PropertyId } from '../models/types';
import { logError } from '../utils/logger';

export class SearchService {
  private esService: ElasticsearchService;

  constructor(
    private propertyRepo: PropertyRepository,
    private cacheService: CacheService,
    esService?: ElasticsearchService
  ) {
    this.esService = esService || new ElasticsearchService();
  }

  async search(filters: SearchFilters): Promise<SearchResult> {
    const cacheKey = this.cacheService.generateSearchKey(filters);
    
    // Try to get from cache
    const cached = await this.cacheService.get<SearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Parallel search from multiple sources
    const sources = await Promise.allSettled([
      this.propertyRepo.searchProperties(filters),
      this.esService.search(filters),
      this.cacheService.get<Property[]>(`search:recent:${filters.type}`),
    ]);

    // Combine results from all available sources
    const allProperties = new Map<PropertyId, Property>();
    
    sources.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        let properties: Property[] = [];
        
        if (data && typeof data === 'object') {
          if ('items' in data) {
            properties = (data as SearchResult).items;
          } else if (Array.isArray(data)) {
            properties = data;
          }
        }
        
        properties.forEach(prop => {
          const existing = allProperties.get(prop.id);
          if (!existing || this.isMoreRecent(prop, existing)) {
            allProperties.set(prop.id, prop);
          }
        });
      } else {
        logError(result.reason, `Source ${index} failed`);
      }
    });

    const items = Array.from(allProperties.values());
    const total = items.length;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    
    const result: SearchResult = {
      items: items.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Cache the result
    await this.cacheService.set(cacheKey, result);
    
    return result;
  }

  private isMoreRecent(prop1: Property, prop2: Property): boolean {
    return new Date(prop1.updatedAt) > new Date(prop2.updatedAt);
  }
}