const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '54.93.53.117', // <--- L'IP IPv4 diretto di Supabase (Francoforte / AWS)
  database: 'postgres',
  password: 'Bracciano.2026', 
  port: 5432, 
  ssl: {
    rejectUnauthorized: false 
  },
  connectionTimeoutMillis: 15000 // Aumentiamo a 15 secondi per sicurezza
});

module.exports = {
  getClient: () => pool.connect(),
  query: (text, params) => pool.query(text, params)
};
