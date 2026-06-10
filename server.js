const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('<h1>eWallet API Live</h1><p>Il server del lido è online e configurato.</p>');
});

// 1. Endpoint Stato
app.get('/api/status', (req, res) => {
  res.json({ status: "Sistema eWallet Lido Attivo" });
});

// 2. Endpoint PAGAMENTO BAR (Ottimizzato per vincolo numeric)
app.post('/api/pay', async (req, res) => {
  const { uid, amount, description } = req.body;
  if (!uid || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Dati non validi o importo errato" });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const tagResult = await client.query(
      `SELECT t.customer_id, c.balance FROM nfc_tags t 
       JOIN customers c ON t.customer_id = c.id 
       WHERE t.uid = $1 AND t.status = 'active' FOR UPDATE`, [uid]
    );
    if (tagResult.rows.length === 0) throw new Error("Braccialetto non valido o non attivo");
    
    const customer = tagResult.rows[0];
    const currentBalance = parseFloat(customer.balance);
    const chargeAmount = parseFloat(amount);
    if (currentBalance < chargeAmount) throw new Error("Credito insufficiente");

    const newBalance = parseFloat((currentBalance - chargeAmount).toFixed(2));
    await client.query('UPDATE customers SET balance = $1 WHERE id = $2', [newBalance, customer.customer_id]);

    try {
      await client.query(
        'INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, $2, $3, $4)', 
        [customer.customer_id, 'purchase', chargeAmount, description || 'Consumazione Bar']
      );
    } catch (e) { console.error("Errore storico transazioni:", e.message); }

    await client.query('COMMIT');
    res.json({ success: true, message: "Pagamento completato", remaining_balance: newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally { client.release(); }
});

// 3. Endpoint REGISTRAZIONE CASSA
app.post('/api/register-tag', async (req, res) => {
  const { uid, name, initial_balance } = req.body;
  if (!uid) return res.status(400).json({ success: false, error: "L'UID della carta è obbligatorio" });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const checkTag = await client.query("SELECT uid FROM nfc_tags WHERE uid = $1", [uid]);
    if (checkTag.rows.length > 0) throw new Error("Questa tessera è già registrata!");

    const customerName = name || "Ospite Ombrellone";
    const balanceValue = parseFloat(parseFloat(initial_balance).toFixed(2)) || 0.00;

    const customerInsert = await client.query(
      "INSERT INTO customers (name, balance, is_active) VALUES ($1, $2, true) RETURNING id", 
      [customerName, balanceValue]
    );
    const customerId = customerInsert.rows[0].id;

    await client.query("INSERT INTO nfc_tags (uid, customer_id, status) VALUES ($1, $2, 'active')", [uid, customerId]);

    if (balanceValue > 0) {
      try {
        await client.query(
          "INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Carico Iniziale Cassa')", 
          [customerId, balanceValue]
        );
      } catch (e) { console.error("Errore tracciamento storico:", e.message); }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: "Tessera attivata con successo", customer_id: customerId });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally { client.release(); }
});

// 4. Endpoint RICARICA CASSA (Risolto bug arrotondamento e tipi)
app.post('/api/topup', async (req, res) => {
  const { uid, amount } = req.body;
  const topupAmount = parseFloat(amount);

  if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "UID o importo di ricarica non valido" });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Recuperiamo l'ID cliente associato al tag
    const tagResult = await client.query("SELECT customer_id FROM nfc_tags WHERE uid = $1 AND status = 'active'", [uid]);
    if (tagResult.rows.length === 0) throw new Error("Tessera non trovata o non attiva");
    
    const customerId = tagResult.rows[0].customer_id;

    // Recuperiamo il saldo e blocchiamo la riga per la transazione
    const customerResult = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    if (customerResult.rows.length === 0) throw new Error("Anagrafica cliente non trovata");

    const currentBalance = parseFloat(customerResult.rows[0].balance) || 0.00;
    
    // Forziamo l'arrotondamento matematico a due cifre decimali per non rompere il vincolo CHECK di Postgres
    const newBalance = parseFloat((currentBalance + topupAmount).toFixed(2));

    // Aggiorniamo il saldo del cliente
    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, customerId]);

    // Registriamo l'operazione nello storico transazioni
    try {
      await client.query(
        "INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Ricarica Cassa')", 
        [customerId, topupAmount]
      );
    } catch (txError) {
      console.error("Nota: Impossibile scrivere lo storico, ma ricarica salvata:", txError.message);
    }

    await client.query('COMMIT');
    res.json({ success: true, new_balance: newBalance });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("ERRORE DURANTE LA RICARICA:", error.message);
    res.status(400).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server eWallet in ascolto sulla porta ${PORT}`);
});
