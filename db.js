const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Richiesto da Supabase per le connessioni sicure
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect() // Ci servirà per le transazioni sicure
};
