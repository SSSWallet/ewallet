const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres.rvsgbsnkurutsburxkwk', // 1. MODIFICA: Aggiungiamo l'ID progetto all'utente
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Bracciano.2026', 
  port: 6543, 
  ssl: {
    rejectUnauthorized: false 
  },
  // 2. MODIFICA: Diciamo esplicitamente al pooler a quale database puntare
  options: '--project=rvsgbsnkurutsburxkwk',
  connectionTimeoutMillis: 10000 
});

module.exports = {
  getClient: () => pool.connect(),
  query: (text, params) => pool.query(text, params)
};
