const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h1>eWallet API Live</h1><p>Il server del lido è online e pronto a ricevere transazioni.</p>');
});

// 1. Endpoint di Controllo Stato / Test
app.get('/api/status', (req, res) => {
  res.json({ status: "Sistema eWallet Lido Attivo" });
});

// 2. Endpoint di PAGAMENTO (Il barista scala i soldi dal braccialetto)
app.post('/api/pay', async (req, res) => {
  const { uid, amount, description } = req.body;

  if (!uid || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Dati non validi o importo errato" });
  }

  // Prendiamo un client dedicato dal pool per gestire la transazione
  const client = await db.getClient();

  try {
    // Inizia la transazione
    await client.query('BEGIN');

    // Trova il cliente associato al braccialetto NFC e blocca la riga (FOR UPDATE)
    const tagQuery = `
      SELECT t.customer_id, c.balance, c.is_active 
      FROM nfc_tags t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.uid = $1 AND t.status = 'active'
      FOR UPDATE;
    `;
    const tagResult = await client.query(tagQuery, [uid]);

    if (tagResult.rows.length === 0) {
      throw new Error("Braccialetto non valido, non associato o bloccato");
    }

    const customer = tagResult.rows[0];

    if (!customer.is_active) {
      throw new Error("Conto cliente disattivato");
    }

    // Controllo del Saldo
    const currentBalance = parseFloat(customer.balance);
    const chargeAmount = parseFloat(amount);

    if (currentBalance < chargeAmount) {
      throw new Error("Credito insufficiente");
    }

    // Calcola il nuovo saldo
    const newBalance = currentBalance - chargeAmount;

    // Aggiorna il saldo del cliente
    await client.query(
      'UPDATE customers SET balance = $1 WHERE id = $2',
      [newBalance, customer.customer_id]
    );

    // Registra la transazione nello storico
    await client.query(
      'INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, $2, $3, $4)',
      [customer.customer_id, 'purchase', chargeAmount, description || 'Consumazione Bar']
    );

    // Se tutto è andato bene, conferma i cambiamenti nel database
    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Pagamento effettuato con successo",
      remaining_balance: newBalance
    });

  } catch (error) {
    // Se qualcosa fallisce, annulla tutto (il saldo non viene toccato)
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally {
    // Rilascia il client nel pool
    client.release();
  }
});

// Avvio del Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server eWallet in ascolto sulla porta ${PORT}`);
});
