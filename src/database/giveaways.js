const db = require("./connect");

db.exec(`
  CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prize TEXT NOT NULL,
    winners_count INTEGER NOT NULL,
    role_id TEXT,
    channel_id TEXT NOT NULL,
    type TEXT NOT NULL,
    entry_fee INTEGER DEFAULT 0,
    run_at BIGINT NOT NULL,
    status TEXT DEFAULT 'active',
    message_id TEXT,
    created_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaway_entries (
    id SERIAL PRIMARY KEY,
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    joined_at BIGINT NOT NULL,
    paid INTEGER DEFAULT 0,
    UNIQUE(giveaway_id,user_id)
  );

  CREATE TABLE IF NOT EXISTS giveaway_winners (
    id SERIAL PRIMARY KEY,
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL
  );
`);

console.log("✅ تم إنشاء جداول السحوبات");

module.exports = db;
