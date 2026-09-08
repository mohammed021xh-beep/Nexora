const db = require("./connect");

(async () => {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        guild_id TEXT PRIMARY KEY,
        text_enabled INTEGER DEFAULT 1,
        voice_enabled INTEGER DEFAULT 1,
        text_points INTEGER DEFAULT 1,
        voice_points INTEGER DEFAULT 1,
        voice_interval INTEGER DEFAULT 1,
        message_cooldown INTEGER DEFAULT 60,
        min_message_length INTEGER DEFAULT 3,
        messages_required INTEGER DEFAULT 30,
        purchase_channel TEXT
      )
    `);

    await db.exec(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS messages_required INTEGER DEFAULT 30
    `);

    await db.exec(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS purchase_channel TEXT
    `)

    await db.exec(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS log_channel TEXT
    `);

    console.log("✅ تم تجهيز جدول settings");
  } catch (err) {
    console.error("❌ SETTINGS INIT ERROR:", err);
  }
})();

module.exports = db;
