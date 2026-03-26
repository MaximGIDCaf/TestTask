import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'property_user',
    password: process.env.DB_PASSWORD || 'property_pass',
    database: process.env.DB_NAME || 'property_db',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '20'),
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    ttl: parseInt(process.env.REDIS_TTL || '3600'),
  },
  
  elasticsearch: {
    node: process.env.ES_NODE || 'http://localhost:9200',
  },
  
  timeouts: {
    dbQuery: parseInt(process.env.DB_QUERY_TIMEOUT || '5000'),
    externalApi: parseInt(process.env.EXTERNAL_API_TIMEOUT || '3000'),
  },
  
  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3'),
    initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY || '1000'),
  },
};

export default config;