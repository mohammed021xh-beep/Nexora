const db = require("../database/connect");

function isStaff(guildId, userId) {
  return new Promise((resolve) => {
    db.get(
      "SELECT * FROM staff WHERE guild_id=? AND user_id=?",
      [guildId, userId],
      (err, row) => {
        if (err) return resolve(false);
        resolve(!!row);
      }
    );
  });
}

module.exports = isStaff;
