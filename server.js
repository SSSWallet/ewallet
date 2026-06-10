const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

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

    const currentBalance = parseFloat(customer.balance);
    const chargeAmount = parseFloat(amount);

    if (currentBalance < chargeAmount) {
      throw new Error("Credito insufficiente");
    }

    const newBalance = currentBalance - chargeAmount;

    await client.query(
      'UPDATE customers SET balance = $1 WHERE id = $2',
      [newBalance, customer.customer_id]
    );

    await client.query(
      'INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, $2, $3, $4)',
      [customer.customer_id, 'purchase', chargeAmount, description || 'Consumazione Bar']
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Pagamento effettuato con successo",
      remaining_balance: newBalance
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// 3. Endpoint di REGISTRAZIONE (Associa una nuova carta a un cliente)
app.post('/api/register-tag', async (req, res) => {
  const { uid, name, initial_balance } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: "L'UID della carta è obbligatorio" });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Controlla se l'UID è già associato a una scheda attiva
    const checkTag = await client.query("SELECT id FROM nfc_tags WHERE uid = $1 AND status = 'active'", [uid]);
    if (checkTag.rows.length > 0) {
      throw new Error("Questa tessera è già associata a un cliente attivo!");
    }

    // 1. Crea il cliente nella tabella 'customers'
    const customerName = name || "Ospite Ombrellone";
    const balanceValue = parseFloat(initial_balance) || 0.00;

    const customerInsert = await client.query(
      "INSERT INTO customers (name, balance, is_active) VALUES ($1, $2, true) RETURNING id",
      [customerName, balanceValue]
    );
    const customerId = customerInsert.rows[0].id;

    // 2. Associa l'UID della tessera al cliente appena creato nella tabella 'nfc_tags'
    await client.query(
      "INSERT INTO nfc_tags (uid, customer_id, status) VALUES ($1, $2, 'active')",
      [uid, customerId]
    );

    // 3. Se c'è un carico iniziale, registra la transazione come 'topup'
    if (balanceValue > 0) {
      await client.query(
        "INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Carico Iniziale Cassa')",
        [customerId, balanceValue]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: "Tessera attivata", customer_id: customerId });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// 4. Endpoint di RICARICA (Aggiunge soldi a una tessera esistente)
app.post('/api/topup', async (req, res) => {
  const { uid, amount } = req.body;
  const topupAmount = parseFloat(amount);

  if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "UID o importo di ricarica non valido" });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Trova il cliente associato alla tessera attiva
    const tagQuery = `
      SELECT t.customer_id, c.balance 
      FROM nfc_tags t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.uid = $1 AND t.status = 'active'
      FOR UPDATE;
    `;
    const tagResult = await client.query(tagQuery, [uid]);

    if (tagResult.rows.length === 0) {
      throw new Error("Tessera non trovata o non attiva");
    }

    const customer = tagResult.rows[0];
    const newBalance = parseFloat(customer.balance) + topupAmount;

    // Aggiorna il saldo
    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, customer.customer_id]);

    // Registra lo storico
    await client.query(
      "INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Ricarica Cassa')",
      [customer.customer_id, topupAmount]
    );

    await client.query('COMMIT');
    res.json({ success: true, new_balance: newBalance });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Avvio del Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server eWallet in ascolto sulla porta ${PORT}`);
});
