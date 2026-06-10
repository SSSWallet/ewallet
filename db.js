const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // Torna l'utente semplice
  host: 'db.rvsgbsnkurutsburxkwk.supabase.co', // Il tuo host originale
  database: 'postgres',
  password: 'Bracciano.2026', 
  port: 5432, // Torniamo alla porta standard
  ssl: {
    rejectUnauthorized: false 
  },
  connectionTimeoutMillis: 10000 
});

module.exports = {
  getClient: () => pool.connect(),
  query: (text, params) => pool.query(text, params)
};
