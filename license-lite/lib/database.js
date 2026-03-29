const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function openDatabase(config) {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeDatabase(db);
  return db;
}

function initializeDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      license_key TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      duration_days INTEGER,
      activated_at TEXT,
      expires_at TEXT,
      activation_limit INTEGER NOT NULL,
      status TEXT NOT NULL,
      buyer_id TEXT,
      order_id TEXT,
      wechat_note TEXT,
      order_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      hardware_id TEXT NOT NULL,
      first_activated_at TEXT NOT NULL,
      last_validated_at TEXT NOT NULL,
      released_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(license_key) REFERENCES licenses(license_key)
    );

    CREATE TABLE IF NOT EXISTS license_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(license_key) REFERENCES licenses(license_key)
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_order_buyer
      ON licenses (order_id, buyer_id);

    CREATE INDEX IF NOT EXISTS idx_activations_lookup
      ON activations (license_key, hardware_id, released_at);

    CREATE INDEX IF NOT EXISTS idx_license_events_lookup
      ON license_events (license_key, created_at);
  `);

  ensureColumn(db, "licenses", "activated_at", "TEXT");
  ensureColumn(db, "licenses", "wechat_note", "TEXT");
  ensureColumn(db, "licenses", "order_note", "TEXT");
  ensureColumn(db, "licenses", "revoked_at", "TEXT");
  ensureColumn(db, "activations", "updated_at", "TEXT");
}

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

module.exports = {
  openDatabase,
};
