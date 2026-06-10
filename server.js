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

// 4. Endpoint di RICARICA (Versione Investigativa Separata)
app.post('/api/topup', async (req, res) => {
  const { uid, amount } = req.body;
  const topupAmount = parseFloat(amount);

  if (!uid || isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ success: false, error: "Dati ricarica non validi" });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // STEP 1: Cerca il tag NFC (senza fare JOIN)
    console.log(`[TOPUP] Cerco il tag con UID: ${uid}`);
    const tagResult = await client.query("SELECT customer_id FROM nfc_tags WHERE uid = $1", [uid]);
    
    if (tagResult.rows.length === 0) {
      throw new Error(`Il braccialetto con UID ${uid} non è registrato nella tabella nfc_tags`);
    }

    const customerId = tagResult.rows[0].customer_id;
    if (!customerId) {
      throw new Error(`Il braccialetto esiste ma non è associato a nessun ID cliente (customer_id è null)`);
    }

    // STEP 2: Recupera il saldo del cliente dalla tabella customers
    console.log(`[TOPUP] Tag trovato. ID Cliente associato: ${customerId}. Recupero il saldo...`);
    
    // NOTA: Se si pianta qui, la colonna 'balance' o la tabella 'customers' ha un nome diverso!
    const customerResult = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    
    if (customerResult.rows.length === 0) {
      throw new Error(`Cliente ID ${customerId} non trovato nella tabella customers`);
    }

    const currentBalance = parseFloat(customerResult.rows[0].balance) || 0;
    const newBalance = currentBalance + topupAmount;

    // STEP 3: Aggiorna il saldo
    console.log(`[TOPUP] Saldo attuale: €${currentBalance}. Nuovo saldo calcolato: €${newBalance}. Aggiorno...`);
    await client.query("UPDATE customers SET balance = $1 WHERE id = $2", [newBalance, customerId]);

    // STEP 4: Tenta lo storico (protetto)
    try {
      await client.query("INSERT INTO transactions (customer_id, type, amount, description) VALUES ($1, 'topup', $2, 'Ricarica Cassa')", [customerId, topupAmount]);
    } catch (e) {
      console.error("[TOPUP WARNING] Errore inserimento transazione (ignorato):", e.message);
    }

    await client.query('COMMIT');
    console.log(`[TOPUP SUCCESS] Ricarica completata per cliente ${customerId}. Nuovo saldo: €${newBalance}`);
    
    res.json({ success: true, new_balance: newBalance });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("[TOPUP CRITICAL ERROR]:", error.message);
    // Ti restituiamo l'errore esatto di Postgres direttamente sul browser nel Toast!
    res.status(500).json({ success: false, error: `Errore Database: ${error.message}` });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server online sulla porta ${PORT}`));
