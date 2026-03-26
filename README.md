Backend сервис поиска и управления объектами недвижимости.

## Технологии
- Node.js + TypeScript
- PostgreSQL
- Redis
- Elasticsearch
- Express
- Jest

## Быстрый старт

### Предварительные требования
- Docker и Docker Compose
- Node.js 18+

### Установка

- git clone https://github.com/MaximGIDCaf/TestTask.git
- cd property-service
- npm install
- docker-compose up -d
- npm run migrate
- npm run dev

### API Документация
После запуска: http://localhost:3000/api-docs

## Эндпоинты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | /api/properties/search | Поиск объектов |
| GET | /api/properties/:id | Получить объект |
| GET | /api/properties/:id/history | История цен |
| POST | /api/properties/:id/favorites | Добавить в избранное |
| GET | /api/favorites | Избранное пользователя |

## Тестирование
npm test
