import { SearchService } from '../src/services/searchService';
import { PropertyRepository } from '../src/repositories/propertyRepository';
import { CacheService } from '../src/services/cacheService';
import { Property, SearchResult, PropertyId } from '../src/models/types';

// Мок для Property
const createMockProperty = (id: string, title: string, updatedAt: Date = new Date()): Property => ({
  id: id as PropertyId,
  title,
  price: 100000,
  area: 50,
  district: 'Central',
  type: 'apartment',
  rooms: 2,
  createdAt: new Date(),
  updatedAt,
});

describe('SearchService', () => {
  let searchService: SearchService;
  let mockPropertyRepo: jest.Mocked<PropertyRepository>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockESService: any;

  beforeEach(() => {
    mockPropertyRepo = {
      searchProperties: jest.fn(),
    } as any;
    
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      generateSearchKey: jest.fn((filters) => `search:${JSON.stringify(filters)}`),
    } as any;
    
    mockESService = {
      search: jest.fn(),
    };
    
    searchService = new SearchService(
      mockPropertyRepo,
      mockCacheService,
      mockESService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return cached results if available', async () => {
    const cachedResult: SearchResult = { 
      items: [], 
      total: 0, 
      page: 1, 
      limit: 20, 
      totalPages: 0 
    };
    mockCacheService.get.mockResolvedValue(cachedResult);
    
    const result = await searchService.search({});
    
    expect(result).toEqual(cachedResult);
    expect(mockPropertyRepo.searchProperties).not.toHaveBeenCalled();
  });

  it('should combine results from multiple sources', async () => {
    mockCacheService.get.mockResolvedValue(null);
    
    const mockProperty = createMockProperty('1', 'From DB');
    
    const dbResult: SearchResult = {
      items: [mockProperty],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    
    mockPropertyRepo.searchProperties.mockResolvedValue(dbResult);
    mockESService.search.mockResolvedValue([]);
    mockCacheService.set.mockResolvedValue(true);
    
    const result = await searchService.search({});
    
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('From DB');
  });

  it('should handle when one source fails', async () => {
    mockCacheService.get.mockResolvedValue(null);
    
    const mockProperty = createMockProperty('1', 'From DB');
    const dbResult: SearchResult = {
      items: [mockProperty],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    
    mockPropertyRepo.searchProperties.mockResolvedValue(dbResult);
    mockESService.search.mockRejectedValue(new Error('ES unavailable'));
    mockCacheService.set.mockResolvedValue(true);
    
    const result = await searchService.search({});
    
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('From DB');
  });

  it('should deduplicate results from multiple sources', async () => {
    mockCacheService.get.mockResolvedValue(null);
    
    const mockProperty = createMockProperty('1', 'Same Property', new Date('2024-01-01'));
    const newerProperty = createMockProperty('1', 'Same Property Updated', new Date('2024-01-02'));
    
    const dbResult: SearchResult = {
      items: [mockProperty],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    
    mockPropertyRepo.searchProperties.mockResolvedValue(dbResult);
    mockESService.search.mockResolvedValue([newerProperty]);
    mockCacheService.set.mockResolvedValue(true);
    
    const result = await searchService.search({});
    
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Same Property Updated');
  });
});