const { Pool } = require('pg');
const { Client } = require('@elastic/elasticsearch');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'property_user',
  password: 'property_pass',
  database: 'property_db',
});

const esClient = new Client({ 
  node: 'http://localhost:9200'
});

async function ensureIndexExists() {
  try {
    console.log('Checking if index exists...');
    const exists = await esClient.indices.exists({ index: 'properties' });
    
    if (!exists) {
      console.log('Creating index with mappings...');
      await esClient.indices.create({
        index: 'properties',
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
              total_floors: { type: 'integer' },
              year_built: { type: 'integer' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' }
            }
          }
        }
      });
      console.log('Index created successfully');
    } else {
      console.log('Index already exists');
    }
  } catch (error) {
    console.error('Error with index:', error.meta?.body?.error?.reason || error.message);
    throw error;
  }
}

async function indexAllProperties() {
  try {
    // Проверяем подключение
    console.log('Checking Elasticsearch connection...');
    const info = await esClient.info();
    console.log('Elasticsearch version:', info.version.number);
    
    // Создаем индекс
    await ensureIndexExists();
    
    // Получаем данные из PostgreSQL
    console.log('Fetching properties from PostgreSQL...');
    const result = await pool.query('SELECT * FROM properties');
    const properties = result.rows;
    
    console.log(`Found ${properties.length} properties to index`);
    
    let indexed = 0;
    let errors = 0;
    
    for (const property of properties) {
      try {
        await esClient.index({
          index: 'properties',
          id: property.id,
          body: {
            id: property.id,
            title: property.title,
            price: parseFloat(property.price),
            area: parseFloat(property.area),
            district: property.district,
            type: property.type,
            rooms: property.rooms,
            floor: property.floor,
            total_floors: property.total_floors,
            year_built: property.year_built,
            created_at: property.created_at,
            updated_at: property.updated_at
          }
        });
        indexed++;
        if (indexed % 5 === 0) {
          console.log(`Indexed ${indexed} properties...`);
        }
      } catch (error) {
        errors++;
        console.error(`Failed to index property ${property.id}:`, error.meta?.body?.error?.reason || error.message);
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Successfully indexed: ${indexed}`);
    console.log(`Errors: ${errors}`);
    
    // Проверяем количество
    const count = await esClient.count({ index: 'properties' });
    console.log(`Total documents in Elasticsearch: ${count.count}`);
    
  } catch (error) {
    console.error('Error:', error.meta?.body?.error?.reason || error.message);
  } finally {
    await pool.end();
    await esClient.close();
  }
}

indexAllProperties();