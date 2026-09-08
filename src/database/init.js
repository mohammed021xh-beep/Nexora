const db = require("./connect");

db.exec(`
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
`);


  db.exec(`
    CREATE TABLE IF NOT EXISTS command_aliases (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      command_name TEXT NOT NULL,
      UNIQUE(guild_id, alias)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS command_settings (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,

      alias TEXT DEFAULT '',

      enabled_channels TEXT DEFAULT '[]',
      disabled_channels TEXT DEFAULT '[]',

      allowed_roles TEXT DEFAULT '[]',
      blocked_roles TEXT DEFAULT '[]',

      UNIQUE(guild_id, command_name)
    );
  `);


console.log("✅ تم إنشاء جداول قاعدة البيانات");

module.exports = db;

