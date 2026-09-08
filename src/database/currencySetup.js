const db = require("./connect");

(async () => {
  try {
    await db.run(
      `
      INSERT INTO currencies
      (guild_id, name, symbol)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, name) DO NOTHING
      `,
      [
        "1501492672781877339",
        "Coins",
        "🪙"
      ]
    );

    console.log("✅ تم تجهيز العملة الافتراضية");

  } catch (err) {
    console.error("Currency setup error:", err.message);
  }
})();

module.exports = db;
