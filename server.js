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

// 1. STATO
app.get('/api/status', (req, res) => {
  res.json({ status: "Sistema eWallet Lido Attivo" });
});

// 2. PAGAMENTO BAR
app.post('/api/pay', async (req, res) => {
  const { uid, amount, description } = req.body;
  if (!uid || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Dati non validi" });
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

    const newBalance = currentBalance - chargeAmount;
    await client.query('UPDATE customers SET balance = $1 WHERE id = $2', [newBalance, customer.customer_id]);

    // Storico protetto da try/catch per evitare blocchi 500
    try {
      await client.query('INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, $2, $3, $4)', 
        [customer.customer_id, 'purchase', chargeAmount, description || 'Consumazione Bar']);
    } catch (e) { console.error("Errore storico (ignorato):", e.message); }

    await client.query('COMMIT');
    res.json({ success: true, message: "Pagamento completato", remaining_balance: newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally { client.release(); }
});

// 3. REGISTRAZIONE CASSA (Super-Tolerant)
app.post('/api/register-tag', async (req, res) => {
  const { uid, name, initial_balance } = req.body;
  if (!uid) return res.status(400).json({ success: false, error: "UID mancante" });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const checkTag = await client.query("SELECT uid FROM nfc_tags WHERE uid = $1", [uid]);
    if (checkTag.rows.length > 0) throw new Error("Tessera già registrata!");

    const customerName = name || "Ospite Ombrellone";
    const balanceValue = parseFloat(initial_balance) || 0.00;

    const customerInsert = await client.query(
      "INSERT INTO customers (name, balance) VALUES ($1, $2) RETURNING id", [customerName, balanceValue]
    );
    const customerId = customerInsert.rows[0].id;

    await client.query("INSERT INTO nfc_tags (uid, customer_id, status) VALUES ($1, $2, 'active')", [uid, customerId]);

    // Storico protetto da try/catch
    if (balanceValue > 0) {
      try {
        await client.query("INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Carico Iniziale')", [customerId, balanceValue]);
      } catch (e) { console.error("Errore storico (ignorato):", e.message); }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: "Tessera attivata", customer_id: customerId });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally { client.release(); }
});

// 4. RICARICA CASSA (Super-Tolerant)
app.post('/api/topup', async (req, res) => {
  const { uid, amount } = req.body;
  const topupAmount = parseFloat(amount);
  if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "Dati ricarica non validi" });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const tagResult = await client.query(
      `SELECT t.customer_id, c.balance FROM nfc_tags t 
       JOIN customers c ON t.customer_id = c.id 
       WHERE t.uid = $1 AND t.status = 'active' FOR UPDATE`, [uid]
    );
    if (tagResult.rows.length === 0) throw new Error("Tessera non trovata o non attiva");

    const customer = tagResult.rows[0];
    const newBalance = parseFloat(customer.balance) + topupAmount;

    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, customer.customer_id]);

    // Storico protetto da try/catch per non rompere la ricarica
    try {
      await client.query("INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Ricarica Cassa')", [customer.customer_id, topupAmount]);
    } catch (e) { console.error("Errore storico ricarica (ignorato):", e.message); }

    await client.query('COMMIT');
    res.json({ success: true, new_balance: newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: error.message });
  } finally { client.release(); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server online sulla porta ${PORT}`));
