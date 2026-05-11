import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    client_id TEXT,
    rt TEXT,
    provider TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
  );
`);

// Create trigger to update updated_at automatically
db.exec(`
  CREATE TRIGGER IF NOT EXISTS update_accounts_updated_at
  AFTER UPDATE ON accounts
  FOR EACH ROW
  BEGIN
    UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`);

// Check if admin exists
const adminExists = db.prepare("SELECT * FROM accounts WHERE role = 'admin' AND email = 'admin'").get();

if (!adminExists) {
  const randomPassword = Math.random().toString(36).slice(-8); // Generate random 8 char password
  
  db.prepare(`
    INSERT INTO accounts (email, password, role)
    VALUES (?, ?, ?)
  `).run('admin', randomPassword, 'admin');
  
  console.log('====================================================');
  console.log('🚀 SYSTEM INITIALIZED');
  console.log('👑 Admin Account Created');
  console.log(`👤 Username: admin`);
  console.log(`🔑 Password: ${randomPassword}`);
  console.log('====================================================');
}

export default db;
