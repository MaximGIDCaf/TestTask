import express, { Application, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { PropertyRepository } from './repositories/propertyRepository';
import { CacheService } from './services/cacheService';
import { SearchService } from './services/searchService';
import { EnrichmentService } from './services/enrichmentService';
import { PropertyController } from './controllers/propertyController';
import { config } from './config';
import { logError, logInfo } from './utils/logger';

// Initialize services
const propertyRepo = new PropertyRepository();
const cacheService = new CacheService();
const enrichmentService = new EnrichmentService();
const searchService = new SearchService(propertyRepo, cacheService);
const propertyController = new PropertyController(propertyRepo, searchService, enrichmentService);

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Слишком много запросов с этого IP',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
const router = express.Router();

router.get('/properties/search', propertyController.search);
router.get('/properties/:id', propertyController.getById);
router.get('/properties/:id/history', propertyController.getPriceHistory);
router.post('/properties/:id/favorites', propertyController.addToFavorites);
router.get('/favorites', propertyController.getFavorites);

app.use('/api', router);

// Swagger документация на русском языке
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'API Сервиса поиска недвижимости',
    version: '1.0.0',
    description: `
      Сервис для управления и поиска объектов недвижимости.
      
      ## Возможности:
      - Поиск объектов с фильтрацией и сортировкой
      - Просмотр истории изменения цен
      - Добавление объектов в избранное
      - Получение детальной информации об объекте
      
      ## Технологии:
      - Node.js + TypeScript
      - PostgreSQL
      - Redis (кэширование)
    `,
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Локальный сервер разработки'
    }
  ],
  tags: [
    {
      name: 'Поиск',
      description: 'Операции поиска объектов недвижимости'
    },
    {
      name: 'Объекты',
      description: 'Управление объектами недвижимости'
    },
    {
      name: 'Избранное',
      description: 'Управление избранными объектами пользователя'
    },
    {
      name: 'История',
      description: 'Просмотр истории изменений цен'
    }
  ],
  paths: {
    '/api/properties/search': {
      get: {
        tags: ['Поиск'],
        summary: 'Поиск объектов недвижимости',
        description: 'Выполняет поиск объектов с возможностью фильтрации по различным параметрам. Результаты кэшируются в Redis на 1 час.',
        operationId: 'searchProperties',
        parameters: [
          {
            name: 'district',
            in: 'query',
            description: 'Район города (например: Советский, Центральный, Западный)',
            schema: {
              type: 'string',
              example: 'Советский'
            }
          },
          {
            name: 'minPrice',
            in: 'query',
            description: 'Минимальная цена в рублях',
            schema: {
              type: 'number',
              minimum: 0,
              example: 1000000
            }
          },
          {
            name: 'maxPrice',
            in: 'query',
            description: 'Максимальная цена в рублях',
            schema: {
              type: 'number',
              minimum: 0,
              example: 5000000
            }
          },
          {
            name: 'type',
            in: 'query',
            description: 'Тип недвижимости',
            schema: {
              type: 'string',
              enum: ['apartment', 'house', 'commercial'],
              example: 'apartment'
            }
          },
          {
            name: 'minArea',
            in: 'query',
            description: 'Минимальная площадь в м²',
            schema: {
              type: 'number',
              minimum: 0,
              example: 30
            }
          },
          {
            name: 'maxArea',
            in: 'query',
            description: 'Максимальная площадь в м²',
            schema: {
              type: 'number',
              minimum: 0,
              example: 100
            }
          },
          {
            name: 'rooms',
            in: 'query',
            description: 'Количество комнат (для квартир и домов)',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              example: 2
            }
          },
          {
            name: 'page',
            in: 'query',
            description: 'Номер страницы (начиная с 1)',
            schema: {
              type: 'integer',
              default: 1,
              minimum: 1,
              example: 1
            }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Количество объектов на странице (макс. 100)',
            schema: {
              type: 'integer',
              default: 20,
              minimum: 1,
              maximum: 100,
              example: 20
            }
          }
        ],
        responses: {
          '200': {
            description: 'Успешный ответ. Возвращает список объектов и метаинформацию.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      description: 'Список найденных объектов',
                      items: {
                        $ref: '#/components/schemas/Property'
                      }
                    },
                    total: {
                      type: 'integer',
                      description: 'Общее количество объектов, соответствующих фильтрам',
                      example: 42
                    },
                    page: {
                      type: 'integer',
                      description: 'Текущая страница',
                      example: 1
                    },
                    limit: {
                      type: 'integer',
                      description: 'Количество объектов на странице',
                      example: 20
                    },
                    totalPages: {
                      type: 'integer',
                      description: 'Общее количество страниц',
                      example: 3
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Некорректные параметры запроса',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '429': {
            description: 'Превышен лимит запросов',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '500': {
            description: 'Внутренняя ошибка сервера',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/properties/{id}': {
      get: {
        tags: ['Объекты'],
        summary: 'Получить объект по ID',
        description: 'Возвращает детальную информацию об объекте недвижимости, включая обогащенные данные (рейтинг риелтора, фотографии, налоги)',
        operationId: 'getPropertyById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'UUID объекта недвижимости',
            schema: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Успешный ответ. Возвращает объект с обогащенными данными.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/EnrichedProperty'
                }
              }
            }
          },
          '404': {
            description: 'Объект не найден',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/properties/{id}/history': {
      get: {
        tags: ['История'],
        summary: 'История изменения цены',
        description: 'Возвращает историю изменения цены объекта недвижимости за все время',
        operationId: 'getPriceHistory',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'UUID объекта недвижимости',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Успешный ответ. Возвращает историю цен.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/PriceHistory'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/properties/{id}/favorites': {
      post: {
        tags: ['Избранное'],
        summary: 'Добавить в избранное',
        description: 'Добавляет объект недвижимости в избранное текущего пользователя',
        operationId: 'addToFavorites',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'UUID объекта недвижимости',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '201': {
            description: 'Объект успешно добавлен в избранное',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Добавлено в избранное'
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Не авторизован',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/api/favorites': {
      get: {
        tags: ['Избранное'],
        summary: 'Получить избранное',
        description: 'Возвращает список избранных объектов текущего пользователя',
        operationId: 'getFavorites',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Количество объектов (макс. 100)',
            schema: {
              type: 'integer',
              default: 20,
              minimum: 1,
              maximum: 100
            }
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Смещение для пагинации',
            schema: {
              type: 'integer',
              default: 0,
              minimum: 0
            }
          }
        ],
        responses: {
          '200': {
            description: 'Успешный ответ. Возвращает список избранных объектов.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Property'
                  }
                }
              }
            }
          },
          '401': {
            description: 'Не авторизован',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    },
    '/health': {
      get: {
        tags: ['Система'],
        summary: 'Проверка здоровья сервиса',
        description: 'Возвращает статус сервиса для мониторинга',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Сервис работает нормально',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok'
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                      example: '2024-01-15T10:30:00Z'
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Property: {
        type: 'object',
        description: 'Объект недвижимости',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Уникальный идентификатор',
            example: '123e4567-e89b-12d3-a456-426614174000'
          },
          title: {
            type: 'string',
            description: 'Название объекта',
            example: 'Уютная квартира в центре'
          },
          price: {
            type: 'number',
            description: 'Цена в рублях',
            example: 3500000
          },
          area: {
            type: 'number',
            description: 'Площадь в квадратных метрах',
            example: 45.5
          },
          district: {
            type: 'string',
            description: 'Район города',
            example: 'Советский'
          },
          type: {
            type: 'string',
            description: 'Тип недвижимости',
            enum: ['apartment', 'house', 'commercial'],
            example: 'apartment'
          },
          rooms: {
            type: 'integer',
            description: 'Количество комнат (для квартир и домов)',
            example: 2
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Дата создания записи',
            example: '2024-01-15T10:30:00Z'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Дата последнего обновления',
            example: '2024-01-15T10:30:00Z'
          }
        }
      },
      EnrichedProperty: {
        type: 'object',
        description: 'Объект недвижимости с обогащенными данными',
        properties: {
          property: {
            $ref: '#/components/schemas/Property'
          },
          hasRealtorRating: {
            type: 'boolean',
            description: 'Доступен ли рейтинг риелтора',
            example: true
          },
          hasPhotos: {
            type: 'boolean',
            description: 'Доступны ли фотографии',
            example: true
          },
          hasTax: {
            type: 'boolean',
            description: 'Доступны ли данные о налогах',
            example: true
          }
        }
      },
      PriceHistory: {
        type: 'object',
        description: 'Запись истории изменения цены',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Уникальный идентификатор записи'
          },
          propertyId: {
            type: 'string',
            format: 'uuid',
            description: 'ID объекта недвижимости'
          },
          price: {
            type: 'number',
            description: 'Цена на момент записи',
            example: 3500000
          },
          changeDate: {
            type: 'string',
            format: 'date-time',
            description: 'Дата изменения цены',
            example: '2024-01-15T10:30:00Z'
          },
          changePercent: {
            type: 'number',
            description: 'Процент изменения цены',
            example: -5.5
          }
        }
      },
      Error: {
        type: 'object',
        description: 'Стандартный формат ошибки',
        properties: {
          error: {
            type: 'string',
            description: 'Краткое описание ошибки',
            example: 'Некорректные параметры запроса'
          },
          message: {
            type: 'string',
            description: 'Детальное описание ошибки',
            example: 'Параметр limit не может быть больше 100'
          }
        }
      }
    }
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logError(err, 'Unhandled error');
  
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Batch upload endpoint
app.post('/api/properties/batch', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      res.status(400).json({ error: 'Неверный запрос, требуется массив ids' });
      return;
    }
    
    const properties = await propertyRepo.getPropertiesByIds(ids);
    res.json({ properties, found: properties.length, total: ids.length });
  } catch (error) {
    logError(error as Error, 'Batch upload error');
    res.status(500).json({ error: 'Не удалось загрузить объекты' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logInfo('SIGTERM получен, закрытие сервера...');
  await propertyRepo.close();
  process.exit(0);
});

// Start server
const port = config.port;
app.listen(port, () => {
  logInfo(`Сервер запущен на порту ${port}`);
  logInfo(`Документация API доступна по адресу http://localhost:${port}/api-docs`);
});

export default app;