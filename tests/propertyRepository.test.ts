import { PropertyRepository } from '../src/repositories/propertyRepository';
import { PropertyId } from '../src/models/types';

// Мок для pg
jest.mock('pg', () => {
  const mPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('PropertyRepository', () => {
  let repository: PropertyRepository;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    repository = new PropertyRepository();
    mockPool = (repository as any).pool;
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPropertiesByIds', () => {
    it('should return properties for valid IDs', async () => {
      const mockProperties = [
        { id: '123', title: 'Test Property', price: 100000, area: 50, district: 'Central', type: 'apartment' },
      ];
      
      // Мокаем: сначала SET, потом основной запрос
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
        .mockResolvedValueOnce({ rows: mockProperties }); // основной запрос
      
      const ids = ['123'] as PropertyId[];
      const result = await repository.getPropertiesByIds(ids);
      
      expect(result).toEqual(mockProperties);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      
      // Проверяем первый вызов (SET)
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'SET statement_timeout = 5000');
      
      // Проверяем второй вызов (основной запрос) - сравниваем строки без учета пробелов
      const actualQuery = mockClient.query.mock.calls[1][0];
      const expectedQuery = 'SELECT * FROM properties WHERE id = ANY($1::uuid[])';
      
      // Убираем лишние пробелы и переносы строк для сравнения
      expect(actualQuery.replace(/\s+/g, ' ').trim()).toBe(expectedQuery);
      expect(mockClient.query.mock.calls[1][1]).toEqual([ids]);
    });

    it('should throw error when more than 50 IDs provided', async () => {
      const ids = Array(51).fill('id') as PropertyId[];
      
      await expect(repository.getPropertiesByIds(ids)).rejects.toThrow(
        'Maximum 50 IDs allowed per request'
      );
    });

    it('should retry on database error', async () => {
      const ids = ['123'] as PropertyId[];
      
      // Первая попытка: SET + SELECT с ошибкой
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // SET 1
        .mockRejectedValueOnce(new Error('Database error')) // SELECT 1 - ошибка
        // Вторая попытка: SET + SELECT успешно
        .mockResolvedValueOnce({ rows: [] }) // SET 2
        .mockResolvedValueOnce({ rows: [] }); // SELECT 2
      
      const result = await repository.getPropertiesByIds(ids);
      
      expect(result).toEqual([]);
      expect(mockClient.query).toHaveBeenCalledTimes(4);
    });
  });

  describe('searchProperties', () => {
    it('should search with filters', async () => {
      const mockRows = [
        { id: '1', title: 'Test', price: 100000, area: 50, district: 'Central', type: 'apartment' }
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: mockRows }); // data query
      
      const filters = { district: 'Central', limit: 10, page: 1 };
      const result = await repository.searchProperties(filters);
      
      expect(result.items).toEqual(mockRows);
      expect(result.total).toBe(1);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });
});