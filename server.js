const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('<h1>eWallet API Live</h1><p>Il server del lido è online.</p>');
});

app.get('/api/status', (req, res) => {
  res.json({ status: "Sistema eWallet Lido Attivo" });
});

// 2. PAGAMENTO BAR
app.post('/api/pay', async (req, res) => {
  const { uid, amount, description } = req.body;
  if (!uid || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Dati non validi o importo errato" });
  }

  let client;
  try {
    client = await db.getClient();
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
    if (client) await client.query('ROLLBACK');
    console.error("ERRORE PAY:", error.message);
    res.status(400).json({ success: false, error: error.message });
  } finally { 
    if (client) client.release(); 
  }
});

// 3. REGISTRAZIONE CASSA
app.post('/api/register-tag', async (req, res) => {
  const { uid, name, initial_balance } = req.body;
  if (!uid) return res.status(400).json({ success: false, error: "L'UID della carta è obbligatorio" });

  let client;
  try {
    client = await db.getClient();
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
    if (client) await client.query('ROLLBACK');
    console.error("ERRORE REGISTRAZIONE:", error.message);
    res.status(400).json({ success: false, error: error.message });
  } finally { 
    if (client) client.release(); 
  }
});

// 4. RICARICA CASSA
app.post('/api/topup', async (req, res) => {
  const { uid, amount } = req.body;
  const topupAmount = parseFloat(amount);

  if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "UID o importo di ricarica non valido" });
  }

  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');

    const tagResult = await client.query("SELECT customer_id FROM nfc_tags WHERE uid = $1 AND status = 'active'", [uid]);
    if (tagResult.rows.length === 0) throw new Error("Tessera non trovata o non attiva");
    
    const customerId = tagResult.rows[0].customer_id;

    const customerResult = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    if (customerResult.rows.length === 0) throw new Error("Anagrafica cliente non trovata");

    const currentBalance = parseFloat(customerResult.rows[0].balance) || 0.00;
    const newBalance = parseFloat((currentBalance + topupAmount).toFixed(2));

    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, customerId]);

    try {
      await client.query(
        "INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Ricarica Cassa')", 
        [customerId, topupAmount]
      );
    } catch (txError) { console.error("Errore storico:", txError.message); }

    await client.query('COMMIT');
    res.json({ success: true, new_balance: newBalance });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("ERRORE RICARICA:", error.message);
    res.status(400).json({ success: false, error: error.message });
  } finally { 
    if (client) client.release(); 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server eWallet in ascolto sulla porta ${PORT}`));
