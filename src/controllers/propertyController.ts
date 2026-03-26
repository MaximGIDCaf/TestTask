import { Request, Response, NextFunction } from 'express';
import { PropertyRepository } from '../repositories/propertyRepository';
import { SearchService } from '../services/searchService';
import { EnrichmentService } from '../services/enrichmentService';
import { SearchFilters, PropertyId } from '../models/types';
import { logError } from '../utils/logger';

// Расширяем тип Request для добавления user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

export class PropertyController {
  constructor(
    private propertyRepo: PropertyRepository,
    private searchService: SearchService,
    private enrichmentService: EnrichmentService
  ) {}

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters: SearchFilters = {
        district: req.query.district as string,
        minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
        type: req.query.type as any,
        minArea: req.query.minArea ? parseInt(req.query.minArea as string) : undefined,
        maxArea: req.query.maxArea ? parseInt(req.query.maxArea as string) : undefined,
        rooms: req.query.rooms ? parseInt(req.query.rooms as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await this.searchService.search(filters);
      res.json(result);
    } catch (error) {
      logError(error as Error, 'Search endpoint error');
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as PropertyId;
      const properties = await this.propertyRepo.getPropertiesByIds([id]);
      
      if (properties.length === 0) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }

      const enriched = await this.enrichmentService.enrichProperties(properties);
      res.json(enriched[0]);
    } catch (error) {
      logError(error as Error, `Get property error for ${req.params.id}`);
      next(error);
    }
  };

  getPriceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as PropertyId;
      const history = await this.propertyRepo.getPriceHistory(id);
      res.json(history);
    } catch (error) {
      logError(error as Error, `Get price history error for ${req.params.id}`);
      next(error);
    }
  };

  addToFavorites = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const propertyId = req.params.id as PropertyId;
      
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await this.propertyRepo.addToFavorites(userId, propertyId);
      res.status(201).json({ message: 'Added to favorites' });
    } catch (error) {
      logError(error as Error, 'Add to favorites error');
      next(error);
    }
  };

  getFavorites = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const favorites = await this.propertyRepo.getFavorites(userId, limit, offset);
      res.json(favorites);
    } catch (error) {
      logError(error as Error, 'Get favorites error');
      next(error);
    }
  };
}