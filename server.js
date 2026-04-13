require('dotenv').config();
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(__dirname));

function getEnvValue(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function buildDbConfig() {
  const dbUrl = getEnvValue(['DATABASE_URL', 'MYSQL_URL', 'MYSQL_PUBLIC_URL']);

  if (dbUrl) {
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }
  const port = Number(getEnvValue(['DB_PORT', 'MYSQLPORT']) || 3306);
  return {
    host: getEnvValue(['DB_HOST', 'MYSQLHOST']) || 'localhost',
    port: Number.isFinite(port) && port > 0 ? port : 3306,
    user: getEnvValue(['DB_USER', 'MYSQLUSER']) || 'root',
    password: getEnvValue(['DB_PASSWORD', 'MYSQLPASSWORD']) || '',
    database: getEnvValue(['DB_NAME', 'MYSQLDATABASE']) || 'trustpay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

function escapeIdentifier(identifier) {
  return String(identifier).replace(/`/g, '``');
}

const dbConfig = buildDbConfig();
const pool = mysql.createPool(dbConfig);

async function ensureDatabaseExists() {
  if (!dbConfig.database) {
    throw new Error('Database name is missing. Set DB_NAME or MYSQLDATABASE.');
  }

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${escapeIdentifier(dbConfig.database)}\``);
  } finally {
    await connection.end();
  }
}

async function initDatabase() {
  await ensureDatabaseExists();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_phone (phone)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      type ENUM('add_money','cashout','transfer_in','transfer_out','bonus','bill_pay') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      reference_phone VARCHAR(20) NULL,
      note VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_transactions_user_id (user_id),
      CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await pool.execute(`
    ALTER TABLE transactions
    MODIFY COLUMN type ENUM('add_money','cashout','transfer_in','transfer_out','bonus','bill_pay') NOT NULL
  `);
}

function cleanPhone(phone) {
  return String(phone || '').trim();
}

function validPhone(phone) {
  return /^\d{11}$/.test(phone);
}

function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) return null;
  return Number(amount.toFixed(2));
}

const validBillTypes = new Set(['electricity', 'gas', 'water', 'internet', 'phone']);

function validBillType(billType) {
  return validBillTypes.has(String(billType || '').trim().toLowerCase());
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const phone = cleanPhone(req.body.phone);
    const pin = String(req.body.pin || '').trim();

    if (!fullName) {
      return res.status(400).json({ message: 'Full name is required.' });
    }
    if (!validPhone(phone)) {
      return res.status(400).json({ message: 'Phone must be 11 digits.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const [result] = await pool.execute(
      'INSERT INTO users (full_name, phone, pin_hash, balance) VALUES (?, ?, ?, 0.00)',
      [fullName, phone, pinHash]
    );

    return res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: result.insertId,
        fullName,
        phone,
        balance: 0
      }
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Phone number already registered.' });
    }
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Database schema is missing. Please redeploy and try again.' });
    }
    console.error('Register error:', error);
    const msg = error?.message || 'Failed to create account.';
    return res.status(500).json({ message: msg, debug: msg });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const phone = cleanPhone(req.body.phone);
    const pin = String(req.body.pin || '').trim();

    if (!validPhone(phone) || !validPin(pin)) {
      return res.status(400).json({ message: 'Invalid phone or PIN format.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, full_name, phone, pin_hash, balance FROM users WHERE phone = ?',
      [phone]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid phone or PIN.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid phone or PIN.' });
    }

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        balance: Number(user.balance)
      }
    });
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Database schema is missing. Please redeploy and try again.' });
    }
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Failed to sign in.' });
  }
});

app.get('/api/users/:id/balance', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, full_name, phone, balance FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    return res.json({
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        balance: Number(user.balance)
      }
    });
  } catch (error) {
    console.error('Balance error:', error);
    return res.status(500).json({ message: 'Failed to fetch balance.' });
  }
});

app.post('/api/transactions/add-money', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.body.userId);
    const amount = parseAmount(req.body.amount);
    const pin = String(req.body.pin || '').trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    if (!amount) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, pin_hash FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      await connection.rollback();
      return res.status(401).json({ message: 'Wrong PIN.' });
    }

    await connection.execute(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [amount, userId]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, note) VALUES (?, ?, ?, ?)',
      [userId, 'add_money', amount, 'Balance top-up']
    );

    const [updatedRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    await connection.commit();

    return res.json({
      message: 'Money added successfully.',
      balance: Number(updatedRows[0].balance)
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add money error:', error);
    return res.status(500).json({ message: 'Failed to add money.' });
  } finally {
    connection.release();
  }
});

app.post('/api/transactions/cashout', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.body.userId);
    const amount = parseAmount(req.body.amount);
    const pin = String(req.body.pin || '').trim();
    const agentPhone = cleanPhone(req.body.agentPhone);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    if (!amount) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }
    if (!validPhone(agentPhone)) {
      return res.status(400).json({ message: 'Agent number must be 11 digits.' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, pin_hash, balance FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      await connection.rollback();
      return res.status(401).json({ message: 'Wrong PIN.' });
    }

    if (Number(user.balance) < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance.' });
    }

    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, userId]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, reference_phone, note) VALUES (?, ?, ?, ?, ?)',
      [userId, 'cashout', amount, agentPhone, 'Cash out from account']
    );

    const [updatedRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    await connection.commit();

    return res.json({
      message: 'Cash out successful.',
      balance: Number(updatedRows[0].balance)
    });
  } catch (error) {
    await connection.rollback();
    console.error('Cashout error:', error);
    return res.status(500).json({ message: 'Failed to cash out.' });
  } finally {
    connection.release();
  }
});

app.post('/api/transactions/transfer', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const senderId = Number(req.body.userId);
    const receiverPhone = cleanPhone(req.body.receiverPhone);
    const amount = parseAmount(req.body.amount);
    const pin = String(req.body.pin || '').trim();

    if (!Number.isInteger(senderId) || senderId <= 0) {
      return res.status(400).json({ message: 'Invalid sender user ID.' });
    }
    if (!validPhone(receiverPhone)) {
      return res.status(400).json({ message: 'Receiver number must be 11 digits.' });
    }
    if (!amount) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }

    await connection.beginTransaction();

    const [senderRows] = await connection.execute(
      'SELECT id, phone, pin_hash, balance FROM users WHERE id = ? FOR UPDATE',
      [senderId]
    );

    if (!senderRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sender not found.' });
    }

    const sender = senderRows[0];
    const pinMatch = await bcrypt.compare(pin, sender.pin_hash);
    if (!pinMatch) {
      await connection.rollback();
      return res.status(401).json({ message: 'Wrong PIN.' });
    }

    if (sender.phone === receiverPhone) {
      await connection.rollback();
      return res.status(400).json({ message: 'Cannot transfer to your own account.' });
    }

    if (Number(sender.balance) < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance.' });
    }

    const [receiverRows] = await connection.execute(
      'SELECT id, phone FROM users WHERE phone = ? FOR UPDATE',
      [receiverPhone]
    );

    if (!receiverRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Receiver account not found.' });
    }

    const receiver = receiverRows[0];

    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, senderId]
    );

    await connection.execute(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [amount, receiver.id]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, reference_phone, note) VALUES (?, ?, ?, ?, ?)',
      [senderId, 'transfer_out', amount, receiver.phone, 'Transfer sent']
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, reference_phone, note) VALUES (?, ?, ?, ?, ?)',
      [receiver.id, 'transfer_in', amount, sender.phone, 'Transfer received']
    );

    const [updatedRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [senderId]
    );

    await connection.commit();

    return res.json({
      message: 'Transfer successful.',
      balance: Number(updatedRows[0].balance)
    });
  } catch (error) {
    await connection.rollback();
    console.error('Transfer error:', error);
    return res.status(500).json({ message: 'Failed to transfer money.' });
  } finally {
    connection.release();
  }
});

app.post('/api/transactions/get-bonus', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.body.userId);
    const bonusCode = String(req.body.bonusCode || '').trim();
    const pin = String(req.body.pin || '').trim();
    const bonusAmount = 500;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    if (bonusCode.length < 6) {
      return res.status(400).json({ message: 'Bonus code must be at least 6 characters.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, pin_hash FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      await connection.rollback();
      return res.status(401).json({ message: 'Wrong PIN.' });
    }

    await connection.execute(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [bonusAmount, userId]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, note) VALUES (?, ?, ?, ?)',
      [userId, 'bonus', bonusAmount, `Bonus code redeemed: ${bonusCode}`]
    );

    const [updatedRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    await connection.commit();

    return res.json({
      message: 'Bonus added successfully.',
      balance: Number(updatedRows[0].balance)
    });
  } catch (error) {
    await connection.rollback();
    console.error('Get bonus error:', error);
    return res.status(500).json({ message: 'Failed to add bonus.' });
  } finally {
    connection.release();
  }
});

app.post('/api/transactions/pay-bill', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.body.userId);
    const billType = String(req.body.billType || '').trim().toLowerCase();
    const billNumber = String(req.body.billNumber || '').trim();
    const amount = parseAmount(req.body.amount);
    const pin = String(req.body.pin || '').trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    if (!validBillType(billType)) {
      return res.status(400).json({ message: 'Invalid bill type.' });
    }
    if (billNumber.length < 6 || billNumber.length > 20) {
      return res.status(400).json({ message: 'Bill number must be between 6 and 20 characters.' });
    }
    if (!amount) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }
    if (!validPin(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, pin_hash, balance FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      await connection.rollback();
      return res.status(401).json({ message: 'Wrong PIN.' });
    }

    if (Number(user.balance) < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance.' });
    }

    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, userId]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, reference_phone, note) VALUES (?, ?, ?, ?, ?)',
      [userId, 'bill_pay', amount, billNumber, `Paid ${billType} bill`]
    );

    const [updatedRows] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    await connection.commit();

    return res.json({
      message: 'Bill paid successfully.',
      balance: Number(updatedRows[0].balance)
    });
  } catch (error) {
    await connection.rollback();
    console.error('Pay bill error:', error);
    return res.status(500).json({ message: 'Failed to pay bill.' });
  } finally {
    connection.release();
  }
});

app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, type, amount, reference_phone AS referencePhone, note, created_at AS createdAt
       FROM transactions
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [userId]
    );

    return res.json({
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        referencePhone: row.referencePhone,
        note: row.note,
        createdAt: row.createdAt
      }))
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ message: 'Failed to fetch transactions.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database init error:', error);
    process.exit(1);
  });
