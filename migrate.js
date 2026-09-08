
require("dotenv").config();
const { Client } = require("pg");
const Database = require("better-sqlite3");

const sqlite = new Database("./database/database.db");

const pg = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await pg.connect();

  console.log("Connected PostgreSQL");

  await pg.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text_points INTEGER DEFAULT 0,
    voice_points INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    last_message BIGINT DEFAULT 0,
    last_voice BIGINT DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    UNIQUE(guild_id,user_id)
  );

  CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    UNIQUE(guild_id,user_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    text_enabled INTEGER DEFAULT 1,
    voice_enabled INTEGER DEFAULT 1,
    text_points INTEGER DEFAULT 1,
    voice_points INTEGER DEFAULT 1,
    voice_interval INTEGER DEFAULT 600,
    message_cooldown INTEGER DEFAULT 60,
    min_message_length INTEGER DEFAULT 10,
    messages_required INTEGER DEFAULT 1,
    purchase_channel TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS currencies (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT,
    earn_from_text INTEGER DEFAULT 1,
    earn_from_voice INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    input_name TEXT DEFAULT '',
    requires_input INTEGER DEFAULT 0,
    stock INTEGER DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS shop_items (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    type TEXT DEFAULT 'text',
    value TEXT,
    enabled INTEGER DEFAULT 1,
    input_name TEXT DEFAULT '',
    requires_input INTEGER DEFAULT 0,
    stock INTEGER DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    user_input TEXT,
    created_at BIGINT DEFAULT 0
  );
  `);

  console.log("Tables created");

  const tables = [
    "users",
    "staff",
    "settings",
    "currencies",
    "shop_items",
    "purchases"
  ];

  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();

    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);

      const params = values.map((_,i)=>`$${i+1}`).join(",");

      await pg.query(
        `INSERT INTO ${table} (${keys.join(",")})
         VALUES (${params})
         ON CONFLICT DO NOTHING`,
        values
      );
    }

    console.log(table, rows.length);
  }

  await pg.end();
  console.log("Migration finished");
}

run().catch(console.error);
