import { EnrichmentService } from '../src/services/enrichmentService';
import { Property, PropertyId } from '../src/models/types';

describe('EnrichmentService', () => {
  let service: EnrichmentService;
  let mockProperty: Property;

  beforeEach(() => {
    service = new EnrichmentService();
    mockProperty = {
      id: '123' as PropertyId,
      title: 'Test Property',
      price: 100000,
      area: 50,
      district: 'Central',
      type: 'apartment',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Заменяем реальные методы на моки для предсказуемого поведения
    (service as any).fetchRealtorRating = jest.fn().mockResolvedValue({
      propertyId: '123',
      rating: 4.5,
      reviewsCount: 100
    });
    
    (service as any).fetchPhotos = jest.fn().mockResolvedValue([
      { propertyId: '123', url: 'http://example.com/photo.jpg', isMain: true }
    ]);
    
    (service as any).fetchTaxData = jest.fn().mockResolvedValue({
      propertyId: '123',
      taxAmount: 5000,
      taxYear: 2024
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should enrich property with all data when all sources succeed', async () => {
    const result = await service.enrichProperty(mockProperty);
    
    expect(result).toBeDefined();
    expect(result.property).toBeDefined();
    expect(result.property.id).toBe('123');
    expect(result.hasTax).toBe(true);
    expect(result.hasRealtorRating).toBe(true);
    expect(result.hasPhotos).toBe(true);
  });

  it('should handle non-critical source failures', async () => {
    // Мокаем некритичный источник с ошибкой
    (service as any).fetchRealtorRating = jest.fn().mockRejectedValue(new Error('Failed'));
    
    const result = await service.enrichProperty(mockProperty);
    
    expect(result).toBeDefined();
    expect(result.hasRealtorRating).toBe(false);
    expect(result.property.realtorRating).toBeUndefined();
    expect(result.hasTax).toBe(true);
    expect(result.hasPhotos).toBe(true);
  });

  it('should throw error when critical source fails', async () => {
    // Мокаем критичный источник с ошибкой
    (service as any).fetchTaxData = jest.fn().mockRejectedValue(new Error('Tax service failed'));
    
    await expect(service.enrichProperty(mockProperty)).rejects.toThrow();
  });

  it('should enrich multiple properties', async () => {
    const property2 = { 
      ...mockProperty, 
      id: '456' as PropertyId,
      title: 'Second Property'
    };
    const properties = [mockProperty, property2];
    
    const results = await service.enrichProperties(properties);
    
    expect(results).toHaveLength(2);
    expect(results[0].property.id).toBe('123');
    expect(results[1].property.id).toBe('456');
  });
});