const { Pool } = require('pg');

// Sostituiamo l'URL con i parametri singoli, che è un sistema molto più robusto
const pool = new Pool({
  user: 'postgres',
  host: 'aws-0-eu-central-1.pooler.supabase.com', // Forziamo l'IPv4 del Pooler
  database: 'postgres',
  password: 'Bracciano.2026', // <--- NOTA: Ho tolto le parentesi quadre! Metti la tua password esatta qui
  port: 6543, // Porta del pooler
  ssl: {
    rejectUnauthorized: false // Obbligatorio per far dialogare Render e Supabase
  },
  connectionTimeoutMillis: 10000 // Aspetta fino a 10 secondi prima di dare errore
});

module.exports = {
  getClient: () => pool.connect(),
  query: (text, params) => pool.query(text, params)
};
