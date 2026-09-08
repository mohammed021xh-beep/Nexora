const db = require("../database/connect");

module.exports = function dashboardProtect(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(403).send("❌ غير مسجل دخول");
  }

  const userId = req.session.userId;
  const guildId = req.params.guildId;

  const client = req.app.get("client");
  const guild = client?.guilds.cache.get(guildId);

  // 👑 Owner لديه تحكم كامل دائمًا
  if (guild && guild.ownerId === userId) {
    req.dashboardPermission = "owner";
    req.dashboardCanEdit = true;
    return next();
  }

  // ⭐ Staff لديه تحكم كامل
  db.get(
    "SELECT * FROM staff WHERE guild_id=? AND user_id=?",
    [guildId, userId],
    (err, staff) => {
      if (err) {
        console.error("DASHBOARD STAFF CHECK ERROR:", err);
        return res.status(500).send("❌ حدث خطأ أثناء التحقق من الصلاحيات.");
      }

      if (staff) {
        req.dashboardPermission = "staff";
        req.dashboardCanEdit = true;
        return next();
      }

      // 🛡️ Administrator وحده لا يكفي
      req.dashboardPermission = "administrator";
      req.dashboardCanEdit = false;

      return res.status(403).send(
        "❌ ليس لديك صلاحية تعديل لوحة التحكم. يجب أن تكون Owner أو Staff في البوت."
      );
    }
  );
};
