const db = require("./connect");

db.exec(`
  CREATE TABLE IF NOT EXISTS shop_items (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    type TEXT DEFAULT 'text',
    value TEXT,
    enabled INTEGER DEFAULT 1,
    input_name TEXT DEFAULT '',
    requires_input INTEGER DEFAULT 0,
    stock INTEGER DEFAULT -1,
    required_role_id TEXT
  )
`);

console.log("✅ تم إنشاء جدول المتجر");

module.exports = db;
