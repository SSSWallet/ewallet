const { Pool } = require('pg');

// Usiamo l'URL di connessione IPv4 diretto fornito da Supabase per evitare i blocchi DNS di Render
const connectionString = "postgresql://postgres:Bracciano.2026@db.rvsgbsnkurutsburxkwk.supabase.co:5432/postgres?sslmode=require";

const pool = new Pool({
  connectionString: connectionString,
  connectionTimeoutMillis: 20000 // Alziamo a 20 secondi per dare tempo al database di svegliarsi
});

module.exports = {
  getClient: () => pool.connect(),
  query: (text, params) => pool.query(text, params)
};
