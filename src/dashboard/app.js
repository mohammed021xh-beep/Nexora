const express = require("express");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/connect");
const dashboardProtect = require("./protect");


const COMMAND_DISPLAY_NAMES = {
  balance: "💰 أمر عرض الرصيد",
  leaderboard: "🏆 أمر قائمة المتصدرين",
  shop: "🛒 أمر عرض المتجر",
  givepoints: "🎁 أمر إعطاء النقاط",
  removepoints: "📉 أمر سحب النقاط",
  resetpoints: "🔄 أمر تصفير النقاط",
  "staff-add": "👤➕ أمر إضافة إداري",
  "staff-remove": "👤➖ أمر إزالة إداري",
  "staff-list": "👥 أمر قائمة الإداريين",
  "تحويل": "💸 أمر تحويل النقاط"
};

const app = express();
app.use(require("./session"));
app.use(require("./oauth"));

function dashboardAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect("/auth/discord");
  }

  req.session.lastActivity = Date.now();

  next();
}


app.use("/dashboard/:guildId", dashboardAuth, dashboardProtect);
app.use("/settings/:guildId", dashboardAuth, dashboardProtect);
app.use("/shop/:guildId", dashboardAuth, dashboardProtect);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", "./views");

const dashboardGuildCache = new Map();
const DASHBOARD_GUILD_CACHE_MS = 5 * 60 * 1000;

async function getDiscordUserGuilds(req) {
  const userId = req.session?.userId;
  const accessToken = req.session?.accessToken;

  if (!userId || !accessToken) return [];

  const cached = dashboardGuildCache.get(userId);

  if (cached && Date.now() - cached.time < DASHBOARD_GUILD_CACHE_MS) {
    return cached.guilds;
  }

  try {
    const response = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      if (cached) return cached.guilds;
      return [];
    }

    const guilds = await response.json();

    dashboardGuildCache.set(userId, {
      time: Date.now(),
      guilds
    });

    return guilds;
  } catch (err) {
    console.error("DISCORD GUILDS FETCH ERROR:", err);

    if (cached) return cached.guilds;

    return [];
  }
}
async function checkDashboardGuildAccess(req, res, next) {
  const guildId = req.params.guildId;

  if (!req.session || !req.session.userId) {
    return res.redirect("/auth/discord");
  }

  const userId = req.session.userId;

  /*
   * ⭐ Staff أولاً
   *
   * لا نعتمد على Discord OAuth guilds API
   * لتحديد Staff لأن Staff محفوظ أصلًا في قاعدة البيانات.
   * هذا يجعل دخول Staff للداشبورد أسرع وأكثر ثباتًا.
   */
  try {
    const staff = await new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM staff WHERE guild_id=? AND user_id=?",
        [guildId, userId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (staff) {
      req.dashboardPermission = "staff";
      req.dashboardCanEdit = true;

      console.log(
        "⭐ DASHBOARD STAFF ACCESS:",
        userId,
        "GUILD:",
        guildId
      );

      return next();
    }

  } catch (err) {
    console.error("DASHBOARD STAFF ACCESS ERROR:", err);

    return res.status(500).send(
      "❌ حدث خطأ أثناء التحقق من صلاحيات Staff."
    );
  }

  /*
   * إذا لم يكن Staff، نتحقق من Discord.
   */
  if (!req.session.accessToken) {
    return res.redirect("/auth/discord");
  }

  try {
    const guilds = await getDiscordUserGuilds(req);
    const guild = guilds.find(g => g.id === guildId);

    if (!guild) {
      return res.status(403).send(
        "❌ هذا السيرفر غير موجود ضمن سيرفرات حسابك."
      );
    }

    const client = req.app.get("client");
    const botGuild = client?.guilds.cache.get(guildId);

    /*
     * 👑 Owner
     */
    if (
      guild.owner === true ||
      (botGuild && botGuild.ownerId === userId)
    ) {
      req.dashboardPermission = "owner";
      req.dashboardCanEdit = true;

      return next();
    }

    /*
     * 🛡️ Administrator بدون Staff
     */
    const permissions = BigInt(guild.permissions || "0");
    const isAdministrator =
      (permissions & 0x8n) === 0x8n;

    if (isAdministrator) {
      req.dashboardPermission = "administrator";
      req.dashboardCanEdit = false;

      return res.status(403).send(
        "❌ Administrator يحتاج Staff أو Owner لتعديل لوحة التحكم."
      );
    }

    req.dashboardPermission = "member";
    req.dashboardCanEdit = false;

    return res.status(403).send(
      "❌ ليس لديك صلاحية تعديل لوحة التحكم."
    );

  } catch (err) {
    console.error("DASHBOARD ACCESS ERROR:", err);

    return res.status(500).send(
      "❌ حدث خطأ أثناء التحقق من صلاحيات السيرفر."
    );
  }
}

app.get("/", async (req, res) => {
  if (!req.session || !req.session.userId || !req.session.accessToken) {
    return res.redirect("/login");
  }

  try {
    const response = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`
        }
      }
    );

    if (!response.ok) {
      return res.status(401).send(
        "❌ انتهت جلسة Discord، سجل الدخول مرة ثانية."
      );
    }

    const guilds = await response.json();
    const client = app.get("client");
    const userId = req.session.userId;

    // ⚡ جلب Staff للمستخدم باستعلام واحد بدل استعلام لكل سيرفر
    const staffGuildIds = new Set();

    try {
      const staffRows = await new Promise((resolve, reject) => {
        db.all(
          "SELECT guild_id FROM staff WHERE user_id=?",
          [userId],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

      for (const row of staffRows) {
        staffGuildIds.add(String(row.guild_id));
      }
    } catch (err) {
      console.error("STAFF BULK CHECK ERROR:", err);
    }

    const guildData = guilds.map(guild => {
      const botGuild = client?.guilds.cache.get(guild.id);

      const isStaff = staffGuildIds.has(String(guild.id));

      const isOwner =
        guild.owner === true ||
        (botGuild && botGuild.ownerId === userId);

      const permissions = BigInt(guild.permissions || "0");
      const isAdministrator =
        (permissions & 0x8n) === 0x8n;

      const canEdit = isOwner || isStaff;
      const canView = isOwner || isStaff || isAdministrator;

      let roleLabel = "👤 عضو";
      let roleClass = "member";

      if (isOwner) {
        roleLabel = "👑 Owner";
        roleClass = "owner";
      } else if (isStaff) {
        roleLabel = "⭐ Staff";
        roleClass = "staff";
      } else if (isAdministrator) {
        roleLabel = "🛡️ Administrator";
        roleClass = "admin";
      }

      const icon = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
        : "https://cdn.discordapp.com/embed/avatars/0.png";

      let action = "";

      if (!botGuild) {
        const inviteUrl =
          `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}` +
          `&scope=bot%20applications.commands` +
          `&permissions=8` +
          `&guild_id=${guild.id}`;

        action = `
          <a class="guild-action add"
             href="${inviteUrl}">
            <span>＋</span>
            إضافة البوت
          </a>
        `;
      } else if (canEdit) {
        action = `
          <a class="guild-action open"
             href="/dashboard/${guild.id}">
            فتح لوحة التحكم
            <span>←</span>
          </a>
        `;
      } else {
        action = `
          <div class="guild-action disabled">
            🔒 ليس لديك صلاحية التعديل
          </div>
        `;
      }

      return {
        name: guild.name,
        icon,
        roleLabel,
        roleClass,
        botGuild: !!botGuild,
        canEdit,
        canView,
        action
      };
    });
    const manageableGuildData = guildData.filter(guild =>
      guild.canView
    );

    const cards = manageableGuildData.map(guild => `
      <div class="guild-card">

        <div class="guild-top">

          <img
            class="guild-icon"
            src="${guild.icon}"
            alt=""
          >

          <div class="guild-info">
            <h3>${guild.name}</h3>

            <span class="permission ${guild.roleClass}">
              ${guild.roleLabel}
            </span>
          </div>

        </div>

        <div class="guild-status">
          ${
            guild.botGuild
              ? `<span class="online">● البوت موجود في السيرفر</span>`
              : `<span class="offline">● البوت غير موجود في السيرفر</span>`
          }
        </div>

        ${guild.action}

      </div>
    `).join("");

    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>Nexora • السيرفرات</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  background:
    radial-gradient(circle at top right, #293b83 0, transparent 35%),
    radial-gradient(circle at bottom left, #3c1e69 0, transparent 35%),
    #090d18;
  color: #fff;
}

.container {
  width: min(1200px, 94%);
  margin: auto;
  padding: 45px 0 60px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 35px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 15px;
}

.logo {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #5865f2, #8b5cf6);
  font-size: 28px;
  box-shadow: 0 12px 35px rgba(88,101,242,.35);
}

.brand h1 {
  margin: 0;
  font-size: 25px;
}

.brand p {
  margin: 5px 0 0;
  color: #9ca3b8;
}

.logout {
  text-decoration: none;
  color: #cbd5e1;
  padding: 11px 16px;
  border: 1px solid #27304a;
  border-radius: 12px;
  background: rgba(15,20,35,.7);
}

.hero {
  margin-bottom: 28px;
}

.hero h2 {
  margin: 0 0 8px;
  font-size: 32px;
}

.hero p {
  margin: 0;
  color: #9ca3b8;
}

.guild-grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.guild-card {
  padding: 20px;
  border-radius: 22px;
  background: rgba(17,23,40,.86);
  border: 1px solid #252d46;
  box-shadow: 0 18px 45px rgba(0,0,0,.2);
  transition: transform .2s ease,
              border-color .2s ease,
              box-shadow .2s ease;
}

.guild-card:hover {
  transform: translateY(-4px);
  border-color: #5865f2;
  box-shadow: 0 22px 55px rgba(0,0,0,.3);
}

.guild-top {
  display: flex;
  align-items: center;
  gap: 15px;
}

.guild-icon {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  object-fit: cover;
}

.guild-info {
  min-width: 0;
}

.guild-info h3 {
  margin: 0 0 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.permission {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: bold;
}

.permission.owner {
  background: rgba(245,158,11,.15);
  color: #fbbf24;
}

.permission.staff {
  background: rgba(139,92,246,.15);
  color: #a78bfa;
}

.permission.admin {
  background: rgba(59,130,246,.15);
  color: #60a5fa;
}

.permission.member {
  background: rgba(148,163,184,.12);
  color: #94a3b8;
}

.guild-status {
  margin: 20px 0 15px;
  color: #9ca3b8;
  font-size: 13px;
}

.online {
  color: #4ade80;
}

.offline {
  color: #f87171;
}

.guild-action {
  width: 100%;
  min-height: 45px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-decoration: none;
  font-weight: bold;
}

.guild-action.open {
  background: linear-gradient(135deg, #5865f2, #7c3aed);
  color: white;
}

.guild-action.add {
  background: linear-gradient(135deg, #16a34a, #22c55e);
  color: white;
}

.guild-action.disabled {
  background: #171d2d;
  border: 1px solid #2a334c;
  color: #6b7280;
  cursor: not-allowed;
}

.empty {
  padding: 45px;
  text-align: center;
  border: 1px dashed #303952;
  border-radius: 20px;
  color: #9ca3b8;
}

@media(max-width:600px) {

  .container {
    padding-top: 25px;
  }

  .header {
    align-items: flex-start;
  }

  .logout {
    font-size: 12px;
  }

  .hero h2 {
    font-size: 25px;
  }

}

</style>

</head>

<body>

<div class="container">

  <header class="header">

    <div class="brand">

      <div class="logo">
  <img src="https://i.ibb.co/21NMDT7Z/nexora.png"
       alt="Nexora"
       style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">
</div>

      <div>
        <h1>Nexora</h1>
        <p>
          مرحباً ${req.session.username || "بك"}
        </p>
      </div>

    </div>

    <a class="logout" href="/logout">
      🚪 تسجيل الخروج
    </a>

  </header>

  <section class="hero">

    <h2>السيرفرات</h2>

    <p>
      اختر السيرفر الذي تريد إدارة Nexora فيه
    </p>

  </section>

  ${
    cards
      ? `<div class="guild-grid">${cards}</div>`
      : `
        <div class="empty">
          ❌ لا توجد سيرفرات متاحة في حسابك.
        </div>
      `
  }

</div>

</body>

</html>
    `);

  } catch (err) {
    console.error("GUILDS PAGE ERROR:", err);

    return res.status(500).send(
      "❌ حدث خطأ أثناء جلب السيرفرات."
    );
  }
});

app.get("/settings/:guildId", dashboardAuth, checkDashboardGuildAccess, (req, res) => {
  const guildId = req.params.guildId;

  db.get(
    "SELECT * FROM settings WHERE guild_id = ?",
    [guildId],
    (err, settings) => {
      if (!settings) {
        settings = {
          text_points: 1,
          voice_points: 1,
          voice_interval: 10,
          voice_enabled: 1,
          min_message_length: 10,
          messages_required: 1
        };
      }

      res.render("settings", { settings, guildId });
    }
  );
});

app.post("/settings/:guildId", (req, res) => {
  const guildId = req.params.guildId;

  const {
    text_points,
    voice_points,
    voice_interval,
    text_enabled,
    voice_enabled,
    min_message_length,
    messages_required,
    purchase_channel,
    log_channel
  } = req.body;

  console.log("BODY:", req.body);

  db.run(
    `INSERT INTO settings
    (guild_id, text_enabled, voice_enabled, text_points, voice_points, voice_interval, min_message_length, messages_required, purchase_channel, log_channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
    text_enabled=?,
    voice_enabled=?,
    text_points=?,
    voice_points=?,
    voice_interval=?,
    min_message_length=?,
    messages_required=?,
    purchase_channel=?,
    log_channel=?`,
    [
      guildId,
      text_enabled === "1" ? 1 : 0,
      voice_enabled === "1" ? 1 : 0,
      text_points,
      voice_points,
      voice_interval,
      min_message_length,
      messages_required,
      purchase_channel,
      log_channel,
      text_enabled === "1" ? 1 : 0,
      voice_enabled === "1" ? 1 : 0,
      text_points,
      voice_points,
      voice_interval,
      min_message_length,
      messages_required,
      purchase_channel,
      log_channel
    ]
  );

  res.send("✅ تم حفظ الإعدادات");
});


// ============================================================
// ⚡ إدارة اختصارات الأوامر
// ============================================================

app.get(
  "/dashboard/:guildId/commands",
  dashboardAuth,
  checkDashboardGuildAccess,
  async (req, res) => {

    try {

      const guildId = req.params.guildId;

      const aliases = await db.all(
        "SELECT * FROM command_aliases WHERE guild_id = ? ORDER BY id DESC",
        [guildId]
      );

      const commandSettingsRows = await db.all(
        "SELECT * FROM command_settings WHERE guild_id = ? ORDER BY id ASC",
        [guildId]
      );

      const commandSettings = commandSettingsRows.map(row => ({
        ...row,
        enabled_channels: JSON.parse(row.enabled_channels || "[]"),
        disabled_channels: JSON.parse(row.disabled_channels || "[]"),
        allowed_roles: JSON.parse(row.allowed_roles || "[]"),
        blocked_roles: JSON.parse(row.blocked_roles || "[]")
      }));

      const fs = require("fs");
      const path = require("path");

      const commandsPath = path.join(__dirname, "../commands");

      const files = fs
        .readdirSync(commandsPath)
        .filter(file =>
          file.endsWith(".js") &&
          !file.includes(".backup") &&
          !file.includes(".before") &&
          !file.includes(".bak")
        );

      const commands = [];

      for (const file of files) {

        try {

          const command = require(
            path.join(commandsPath, file)
          );

          if (command?.data?.name) {

            commands.push({
              name: command.data.name,
              description: command.data.description || ""
            });

          }

        } catch (err) {

          console.error(
            "COMMAND LOAD ERROR:",
            file,
            err.message
          );

        }

      }

      commands.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      const guild = req.app.get("client")?.guilds.cache.get(guildId);

      if (!guild) {
        return res.status(404).send("❌ البوت غير موجود في هذا السيرفر.");
      }

      const roles = [...guild.roles.cache.values()]
        .filter(role => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => ({
          id: role.id,
          name: role.name
        }));

      const channels = [...guild.channels.cache.values()]
        .filter(channel =>
          channel.isTextBased() &&
          !channel.isThread()
        )
        .sort((a, b) => a.position - b.position)
        .map(channel => ({
          id: channel.id,
          name: channel.name
        }));

      commands.forEach(command => {
        command.displayName =
          COMMAND_DISPLAY_NAMES[command.name] ||
          "⚡ أمر " + command.name;
      });

      res.render("commands", {
        guildId,
        commands,
        aliases,
        commandSettings,
        roles,
        channels
      });

    } catch (error) {

      console.error(
        "❌ COMMANDS PAGE ERROR:",
        error
      );

      res.status(500).send(
        "حدث خطأ أثناء عرض القائمة"
      );

    }

  }
);

app.post("/dashboard/:guildId/commands", dashboardAuth, checkDashboardGuildAccess, async (req, res) => {
  try {

    const guildId = req.params.guildId;

    const commandName = String(req.body.command_name || "").trim();
    const alias = String(req.body.alias || "").trim();

    if (!commandName || !alias) {
      return res.status(400).send("الأمر والاختصار مطلوبان");
    }

    if (!/^[\p{L}\p{N}_-]+$/u.test(alias)) {
      return res.status(400).send("الاختصار يجب أن يحتوي على أحرف أو أرقام فقط");
    }

    await db.run(
      `INSERT INTO command_aliases
       (guild_id, alias, command_name)
       VALUES (?, ?, ?)
       ON CONFLICT (guild_id, alias)
       DO UPDATE SET command_name = EXCLUDED.command_name`,
      [guildId, alias, commandName]
    );

    res.redirect(`/dashboard/${guildId}/commands`);

  } catch (error) {
    console.error("❌ ADD COMMAND ALIAS ERROR:", error);
    res.status(500).send("حدث خطأ أثناء حفظ الاختصار");
  }
});


app.post("/dashboard/:guildId/commands/settings", dashboardAuth, checkDashboardGuildAccess, async(req, res) => {
  try {
    const guildId = req.params.guildId;

    const commandName = String(req.body.command_name || "").trim();

    if (!commandName) {
      return res.status(400).send("❌ اسم الأمر غير موجود");
    }

    const toArray = value => {
      if (!value) return [];
      return Array.isArray(value)
        ? value.filter(Boolean)
        : [value].filter(Boolean);
    };

    const cleanSelection = value => {
      const values = toArray(value);

      if (values.includes("NONE")) {
        return [];
      }

      return [...new Set(values)];
    };

    const enabledChannels = cleanSelection(req.body.enabled_channels);
    const disabledChannels = cleanSelection(req.body.disabled_channels);
    const allowedRoles = cleanSelection(req.body.allowed_roles);
    const blockedRoles = cleanSelection(req.body.blocked_roles);

    // ============================================================
    // ⌨️ الاختصارات المتعددة
    // ============================================================

    let aliases = toArray(req.body.aliases)
      .map(alias => String(alias).trim())
      .filter(Boolean);

    aliases = [...new Set(aliases)];

    console.log("🧪 COMMAND SETTINGS FORM:");
    console.log("   command:", commandName);
    console.log("   aliases:", aliases);
    console.log("   enabled channels:", enabledChannels);
    console.log("   disabled channels:", disabledChannels);
    console.log("   allowed roles:", allowedRoles);
    console.log("   blocked roles:", blockedRoles);

    // حفظ إعدادات الأمر
    await db.run(
      `INSERT INTO command_settings
       (
         guild_id,
         command_name,
         alias,
         enabled_channels,
         disabled_channels,
         allowed_roles,
         blocked_roles
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, command_name)
       DO UPDATE SET
         alias = EXCLUDED.alias,
         enabled_channels = EXCLUDED.enabled_channels,
         disabled_channels = EXCLUDED.disabled_channels,
         allowed_roles = EXCLUDED.allowed_roles,
         blocked_roles = EXCLUDED.blocked_roles`,
      [
        guildId,
        commandName,
        aliases[0] || "",
        JSON.stringify(enabledChannels),
        JSON.stringify(disabledChannels),
        JSON.stringify(allowedRoles),
        JSON.stringify(blockedRoles)
      ]
    );

    // حذف الاختصارات القديمة لهذا الأمر
    await db.run(
      `DELETE FROM command_aliases
       WHERE guild_id = ? AND command_name = ?`,
      [guildId, commandName]
    );

    // إضافة جميع الاختصارات الجديدة
    for (const alias of aliases) {
      try {
        await db.run(
          `INSERT INTO command_aliases
           (guild_id, alias, command_name)
           VALUES (?, ?, ?)
           ON CONFLICT (guild_id, alias)
           DO UPDATE SET command_name = EXCLUDED.command_name`,
          [guildId, alias, commandName]
        );
      } catch (aliasError) {
        console.error(
          "❌ ALIAS SAVE ERROR:",
          alias,
          aliasError.message
        );
      }
    }

    console.log(
      "✅ COMMAND SETTINGS SAVED:",
      guildId,
      commandName,
      "ALIASES:",
      aliases.length
    );

    res.redirect(`/dashboard/${guildId}/commands`);

  } catch (error) {
    console.error("❌ COMMAND SETTINGS SAVE ERROR:", error);
    res.status(500).send("حدث خطأ أثناء حفظ إعدادات الأمر");
  }
});

app.post("/dashboard/:guildId/commands/delete/:id", dashboardAuth, checkDashboardGuildAccess, async (req, res) => {
  try {

    const guildId = req.params.guildId;
    const id = Number(req.params.id);

    await db.run(
      "DELETE FROM command_aliases WHERE id = ? AND guild_id = ?",
      [id, guildId]
    );

    res.redirect(`/dashboard/${guildId}/commands`);

  } catch (error) {
    console.error("❌ DELETE COMMAND ALIAS ERROR:", error);
    res.status(500).send("حدث خطأ أثناء حذف الاختصار");
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


app.get("/dashboard/:guildId", dashboardAuth, checkDashboardGuildAccess, async (req, res) => {
  const dashboardTimer = Date.now();
  const guildId = req.params.guildId;
  const client = req.app.get("client");

  console.log("⏱️ DASHBOARD START");

  try {
    const guild = client?.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).send("❌ البوت غير موجود في هذا السيرفر.");
    }

    // تجهيز الرولات والقنوات من كاش Discord المحلي
    const roles = [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position
      }));

    const channels = [...guild.channels.cache.values()]
      .filter(channel =>
        channel.isTextBased() &&
        !channel.isThread()
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type - b.type;
        return a.position - b.position;
      })
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));

    console.log(`⏱️ ROLES+CHANNELS: ${Date.now() - dashboardTimer}ms`);

    /*
     * السيرفرات التي يستطيع المستخدم رؤيتها.
     *
     * getDiscordUserGuilds فيها Cache لمدة 60 ثانية،
     * لذلك لن نطلب Discord في كل تحميل للداشبورد.
     */
    const discordGuilds = await getDiscordUserGuilds(req);

    console.log("🔎 DISCORD GUILDS COUNT:", discordGuilds.length);

    /*
     * بدل db.get لكل سيرفر:
     * نجلب Staff الخاص بالمستخدم مرة واحدة فقط.
     */
    const staffRows = await db.all(
      "SELECT guild_id FROM staff WHERE user_id=?",
      [req.session.userId]
    );

    const staffGuilds = new Set(
      (staffRows || []).map(row => String(row.guild_id))
    );

    const manageableGuilds = [];

    for (const g of discordGuilds) {
      const isOwner = g.owner === true;

      const permissions = BigInt(g.permissions || "0");
      const isAdministrator =
        (permissions & 0x8n) === 0x8n;

      const isStaff = staffGuilds.has(String(g.id));

      const canView =
        isOwner ||
        isAdministrator ||
        isStaff;

      if (!canView) {
        continue;
      }

      const canEdit =
        isOwner ||
        isStaff;

      const botGuild = client.guilds.cache.get(g.id);

      manageableGuilds.push({
        id: g.id,
        name: g.name,
        icon: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
          : "https://cdn.discordapp.com/embed/avatars/0.png",
        owner: isOwner,
        staff: isStaff,
        administrator: isAdministrator,
        canEdit,
        botInstalled: !!botGuild
      });
    }

    /*
     * جميع بيانات الداشبورد المستقلة يتم جلبها بالتوازي.
     * هذا يقلل وقت الانتظار بشكل كبير.
     */
    console.log(`⏱️ GUILD LIST: ${Date.now() - dashboardTimer}ms`);

    const dbTimer = Date.now();

    const [
      settings,
      currency,
      items,
      giveaways,
      winners,
      entries
    ] = await Promise.all([
      db.get(
        "SELECT * FROM settings WHERE guild_id=?",
        [guildId]
      ),

      db.get(
        "SELECT * FROM currencies WHERE guild_id=? LIMIT 1",
        [guildId]
      ),

      db.all(
        "SELECT * FROM shop_items WHERE guild_id=?",
        [guildId]
      ),

      db.all(
        "SELECT * FROM giveaways WHERE guild_id=? ORDER BY id DESC",
        [guildId]
      ),

      db.all(
        `SELECT gw.*
         FROM giveaway_winners gw
         INNER JOIN giveaways g ON g.id = gw.giveaway_id
         WHERE g.guild_id=?`,
        [guildId]
      ),

      db.all(
        `SELECT ge.*
         FROM giveaway_entries ge
         INNER JOIN giveaways g ON g.id = ge.giveaway_id
         WHERE g.guild_id=?`,
        [guildId]
      )
    ]);

    console.log(`⏱️ DB TOTAL: ${Date.now() - dbTimer}ms`);

    console.log(`⏱️ DATABASE: ${Date.now() - dashboardTimer}ms`);

    console.log(
      "🌐 DASHBOARD LOADED:",
      guild.name,
      "| SERVERS:",
      manageableGuilds.length
    );

    console.log(`⚡ DASHBOARD SERVER DATA: ${Date.now() - dashboardTimer}ms`);

    return res.render("dashboard", {
      guildId,

      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({
          size: 128,
          extension: "png"
        })
      },

      permission: req.dashboardPermission,
      canEdit: req.dashboardCanEdit,

      roles,
      channels,
      manageableGuilds,
      clientId: process.env.CLIENT_ID,

      settings,
      currency,
      items: items || [],
      giveaways: giveaways || [],
      winners: winners || [],
      entries: entries || []
    });

  } catch (err) {
    console.error("DASHBOARD PAGE ERROR:", err);

    return res.status(500).send(
      "❌ حدث خطأ أثناء تحميل لوحة التحكم."
    );
  }
});

app.get("/shop/:guildId", dashboardAuth, checkDashboardGuildAccess, (req,res)=>{
  const guildId = req.params.guildId;

  db.all(
    "SELECT * FROM shop_items WHERE guild_id=?",
    [guildId],
    (err, items)=>{
      res.render("shop",{items});
    }
  );
});


app.post("/shop/:guildId", (req,res)=>{
  const guildId = req.params.guildId;

  const {
    name,
    price,
    type,
    value,
    stock
  } = req.body;

  console.log("BODY:", req.body);

  db.run(
    `INSERT INTO shop_items
    (guild_id,name,price,type,value,stock)
    VALUES (?,?,?,?,?,?)`,
    [guildId,name,price,type,value,stock || -1]
  );

  res.redirect("/shop/"+guildId);
});
app.post("/dashboard/:guildId", async (req, res) => {
  const guildId = req.params.guildId;

  const {
    text_points,
    voice_points,
    voice_interval,
    min_message_length,
    messages_required,
    purchase_channel,
    log_channel,
    text_enabled,
    voice_enabled
  } = req.body;

  console.log("BODY:", req.body);

  try {
    const newInterval = Number(voice_interval || 0);

    if (newInterval <= 0) {
      return res.status(400).send(
        "voice_interval must be greater than 0"
      );
    }

    /*
     * قراءة الإعداد القديم قبل التعديل.
     */

    const oldSettings = await db.get(
      `SELECT voice_interval
       FROM settings
       WHERE guild_id=?`,
      [guildId]
    );


    const oldInterval =
      Number(oldSettings?.voice_interval || 0);


    console.log(
      "OLD INTERVAL:",
      oldInterval,
      "NEW INTERVAL:",
      newInterval
    );

    /*
     * حفظ الإعدادات الجديدة.
     */
    await db.run(
      `UPDATE settings SET
        text_enabled=?,
        voice_enabled=?,
        text_points=?,
        voice_points=?,
        voice_interval=?,
        min_message_length=?,
        messages_required=?,
        purchase_channel=?,
        log_channel=?
       WHERE guild_id=?`,
      [
        Number(text_enabled === "1" ? 1 : 0),
        Number(voice_enabled === "1" ? 1 : 0),
        Number(text_points || 0),
        Number(voice_points || 0),
        newInterval,
        Number(min_message_length || 0),
        Number(messages_required || 0),
        purchase_channel || null,
        log_channel || null,
        guildId
      ]
    );

    console.log(
      "SETTINGS UPDATED:",
      guildId,
      `${oldInterval} -> ${newInterval} MIN`
    );

    /*
     * إذا تغيرت مدة الصوت:
     *
     * 1. نحذف كل الوقت المتراكم.
     * 2. نبدأ جلسة جديدة من الآن.
     * 3. نحفظ المدة الجديدة.
     *
     * لا يتم تحويل الوقت القديم إلى نقاط.
     */
    if (
      oldInterval > 0 &&
      oldInterval !== newInterval
    ) {
      const now = Date.now();

      const result = await db.run(
        `UPDATE users
         SET
           voice_started_at=?,
           voice_accumulated=0,
           voice_interval_minutes=?
         WHERE guild_id=?`,
        [
          now,
          newInterval,
          guildId
        ]
      );

      console.log(
        "🎙️ ALL VOICE SESSIONS RESET:",
        guildId,
        "USERS:",
        result?.rowCount ?? 0,
        `${oldInterval} -> ${newInterval} MIN`,
        "OLD TIME DISCARDED"
      );
    }

    return res.redirect(
      "/dashboard/" + guildId
    );

  } catch (err) {
    console.error(
      "❌ DASHBOARD SETTINGS ERROR:",
      err
    );

    return res
      .status(500)
      .send(
        err.message ||
        "Dashboard settings error"
      );
  }
});

app.post("/dashboard/:guildId/shop", (req,res)=>{
 const guildId=req.params.guildId;
 const {
  name,
  price,
  description,
  stock,
  required_role_id,
  requires_input,
  input_name
} = req.body;
 console.log("SHOP DATA:", req.body);
 db.run(
 `INSERT INTO shop_items
  (guild_id,name,description,price,type,value,requires_input,input_name,stock,required_role_id)
  VALUES (?,?,?,?,?,?,?,?,?,?)`,
 [
   guildId,
   name,
   description || "",
   Number(price || 0),
   "text",
   "",
   requires_input ? 1 : 0,
   input_name || "",
   stock === "" || stock == null ? -1 : Number(stock),
   required_role_id || null
 ],
 (err)=>{
   if (err) {
     console.error("❌ SHOP INSERT ERROR:", err);
     return res.status(500).send("❌ فشل حفظ الصنف: " + err.message);
   }

   console.log("✅ SHOP ITEM SAVED:", guildId, name);
   res.redirect("/dashboard/"+guildId);
 }
 );
});

app.get("/dashboard/:guildId/shop/delete/:id", (req,res)=>{
 const guildId=req.params.guildId;
 const id=req.params.id;

 db.run(
 "DELETE FROM shop_items WHERE id=? AND guild_id=?",
 [id,guildId],
 ()=>res.redirect("/dashboard/"+guildId)
 );
});


app.get("/dashboard/:guildId/shop/edit/:id", (req,res)=>{
 const guildId=req.params.guildId;
 const id=req.params.id;

 db.get(
  "SELECT * FROM shop_items WHERE id=? AND guild_id=?",
  [id,guildId],
  (err,item)=>{
    res.send(`
    <form method="POST" action="/dashboard/${guildId}/shop/edit/${id}">
      الاسم:
      <input name="name" value="${item.name}">
      <br>
      السعر:
      <input name="price" value="${item.price}">
      <br>
      الوصف:
      <textarea name="description" rows="4" style="width:300px;">${item.description || ""}</textarea>
      <br><br>
      <button>حفظ</button>
    </form>
    `);
  }
 );
});


app.post("/dashboard/:guildId/shop/edit/:id", dashboardAuth, checkDashboardGuildAccess, (req,res)=>{
  const guildId = req.params.guildId;
  const id = req.params.id;

  const {
    name,
    price,
    stock,
    description,
    required_role_id,
    requires_input,
    input_name
  } = req.body;

  db.run(
    `UPDATE shop_items SET
      name=?,
      price=?,
      stock=?,
      description=?,
      type=?,
      required_role_id=?,
      requires_input=?,
      input_name=?
     WHERE id=? AND guild_id=?`,
    [
      name,
      Number(price || 0),
      Number(stock ?? -1),
      description || "",
      "text",
      required_role_id || null,
      requires_input === "1" ? 1 : 0,
      input_name || null,
      id,
      guildId
    ],
    (err) => {
      if (err) {
        console.error("❌ SHOP EDIT ERROR:", err);
        return res.status(500).send("❌ حدث خطأ أثناء تعديل المنتج.");
      }

      res.redirect("/dashboard/" + guildId);
    }
  );
});

app.get("/login", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/");
  }

  return res.redirect("/auth/discord");
});

app.get("/logout",(req,res)=>{
  req.session.destroy(()=>{
    res.send("✅ تم تسجيل الخروج");
  });
});


app.get("/dashboard/:guildId/giveaways", dashboardAuth, checkDashboardGuildAccess, (req, res) => {

  const guildId = req.params.guildId;

  db.all(
    "SELECT * FROM giveaways WHERE guild_id=? ORDER BY id DESC",
    [guildId],
    (err, giveaways) => {

      if (err) {
        console.error(err);
        return res.send("Database Error");
      }

      db.all(
        "SELECT * FROM giveaway_winners",
        [],
        (e, winners) => {

          res.render("giveaways", {
            guildId,
            giveaways,
            winners: winners || []
          });

        }
      );

    }
  );

});


const creatingGiveaways = new Set();

app.post("/dashboard/:guildId/giveaways", dashboardAuth, checkDashboardGuildAccess, (req,res)=>{

  const guildId = req.params.guildId;

  if (creatingGiveaways.has(guildId)) {
    return res.status(429).send("⏳ يوجد سحب قيد الإنشاء، انتظر لحظة.");
  }

  creatingGiveaways.add(guildId);

  const {
    name,
    prize,
    winners_count,
    type,
    entry_fee,
    role_id,
    channel_id,
    run_at
  } = req.body;

  const time = run_at
    ? new Date(run_at).getTime()
    : Date.now();

  if (!Number.isFinite(time)) {
    creatingGiveaways.delete(guildId);
    return res.status(400).send("❌ موعد السحب غير صالح");
  }

  const createdBy =
    req.user?.id ||
    req.session?.user?.id ||
    req.session?.userId ||
    req.session?.discordUserId ||
    "dashboard";

  db.run(
    `INSERT INTO giveaways
     (guild_id,name,prize,winners_count,role_id,channel_id,type,entry_fee,run_at,status,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,'active',?)
     RETURNING id`,
    [
      guildId,
      name,
      prize,
      Number(winners_count || 1),
      role_id || null,
      channel_id,
      type,
      Number(entry_fee || 0),
      time,
      createdBy
    ],
    async function(err, result){

      if (err) {
        console.error("❌ GIVEAWAY CREATE DB ERROR:", err);
        creatingGiveaways.delete(guildId);
        return res.status(500).send("❌ خطأ أثناء إنشاء السحب");
      }

      const giveawayId = result.rows[0].id;
      const client = req.app.get("client");

      if (!client) {
        creatingGiveaways.delete(guildId);
        return res.status(500).send("❌ البوت غير متصل");
      }

      if (!channel_id) {
        creatingGiveaways.delete(guildId);
        return res.status(400).send("❌ لم يتم تحديد قناة السحب");
      }

      try {

        const channel = await client.channels.fetch(channel_id);

        if (!channel) {
          creatingGiveaways.delete(guildId);
          return res.status(404).send("❌ قناة السحب غير موجودة");
        }

        const fee = Number(entry_fee || 0);

        const feeText = fee > 0
          ? `

💰 **رسوم المشاركة: ${fee} نقطة**
⚠️ سيتم خصم **${fee} نقطة** من رصيدك عند المشاركة.`
          : "";

        const message = {
          content:
`🎁 **سحب جديد**

📌 الاسم: ${name}

🎁 الجائزة: ${prize}

🏆 عدد الفائزين: ${Number(winners_count || 1)}${feeText}`
        };

        if (type !== "forced") {

          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`join_giveaway_${giveawayId}`)
                .setLabel("🎉 مشاركة")
                .setStyle(ButtonStyle.Primary)
            );

          message.components = [row];

        } else {

          message.content += `

⚡ **سحب إجباري**
سيتم اختيار الفائزين تلقائيًا من الأعضاء المؤهلين.`;

        }

        const sentMessage = await channel.send(message);

        await db.run(
          `UPDATE giveaways
           SET message_id=?
           WHERE id=? AND guild_id=?`,
          [
            sentMessage.id,
            giveawayId,
            guildId
          ]
        );

        console.log(
          "🎁 GIVEAWAY CREATED:",
          giveawayId,
          "| TYPE:",
          type,
          "| FEE:",
          fee,
          "| ROLE:",
          role_id || "NONE",
          "| MESSAGE:",
          sentMessage.id
        );

        creatingGiveaways.delete(guildId);

        return res.redirect(
          "/dashboard/" + guildId
        );

      } catch(err) {

        console.error(
          "❌ GIVEAWAY DISCORD ERROR:",
          err
        );

        creatingGiveaways.delete(guildId);

        return res.status(500).send(
          "❌ حدث خطأ أثناء إرسال السحب إلى Discord"
        );
      }

    }
  );

});
app.get("/dashboard/:guildId/giveaways/delete/:id", dashboardAuth, checkDashboardGuildAccess, (req,res)=>{
 const client = req.app.get("client");
 console.log("DELETE GIVEAWAY:", req.params);

 const {guildId,id}=req.params;

 db.run(
  "DELETE FROM giveaways WHERE id=? AND guild_id=?",
  [id,guildId],
  ()=>{
    res.redirect("/dashboard/"+guildId+"/giveaways");
  }
 );

});


app.post("/dashboard/:guildId/giveaways/edit/:id", dashboardAuth, checkDashboardGuildAccess, (req,res)=>{

  const { guildId, id } = req.params;

  const {
    name,
    prize,
    winners_count,
    type,
    entry_fee,
    role_id,
    channel_id,
    run_at
  } = req.body;

  db.run(
    `UPDATE giveaways SET
      name=?,
      prize=?,
      winners_count=?,
      type=?,
      entry_fee=?,
      role_id=?,
      channel_id=?,
      run_at=?
     WHERE id=? AND guild_id=?`,
    [
      name,
      prize,
      Number(winners_count || 1),
      type,
      Number(entry_fee || 0),
      role_id || null,
      channel_id || null,
      run_at ? new Date(run_at).getTime() : null,
      id,
      guildId
    ],
    (err) => {

      if (err) {
        console.error("❌ GIVEAWAY EDIT ERROR:", err);
        return res.status(500).send("❌ حدث خطأ أثناء تعديل السحب.");
      }

      res.redirect("/dashboard/" + guildId);
    }
  );

});


app.get("/dashboard/:guildId/giveaways/reroll/:id", dashboardAuth, checkDashboardGuildAccess, async (req, res) => {

  const { guildId, id } = req.params;
  const client = req.app.get("client");

  if (!client) {
    return res.status(500).send("❌ البوت غير متصل");
  }

  try {

    const g = await db.get(
      "SELECT * FROM giveaways WHERE id=? AND guild_id=?",
      [id, guildId]
    );

    if (!g) {
      return res.send("❌ السحب غير موجود");
    }

    /*
     * 🔄 إعادة السحب تعتمد فقط على المشاركين الحقيقيين
     * الموجودين في giveaway_entries.
     *
     * هذا مهم جدًا للسحب الإجباري برسوم:
     * الشخص لا يعتبر مشاركًا إلا إذا كان مؤهلًا
     * وتم خصم الرسوم منه وتسجيله في entries.
     */

    let users = await db.all(
      `SELECT user_id
       FROM giveaway_entries
       WHERE giveaway_id=?`,
      [id]
    );

    users = users.map(row => row.user_id);

    /*
     * إزالة التكرار احتياطياً.
     */
    users = [...new Set(users)];

    /*
     * إعادة فحص الرتبة.
     * إذا لم توجد رتبة محددة، يبقى المشارك مؤهلًا.
     */
    if (g.role_id) {

      const guild = await client.guilds
        .fetch(g.guild_id)
        .catch(() => null);

      if (!guild) {
        return res.status(500).send(
          "❌ تعذر الوصول إلى السيرفر لإعادة السحب."
        );
      }

      const eligible = [];

      for (const userId of users) {

        const member = await guild.members
          .fetch(userId)
          .catch(() => null);

        if (
          member &&
          !member.user.bot &&
          member.roles.cache.has(g.role_id)
        ) {
          eligible.push(userId);
        }
      }

      users = eligible;
    } else {

      /*
       * بدون رتبة:
       * المشاركون المسجلون فقط.
       * لا نضيف أعضاء جدد بعد انتهاء السحب.
       */
      const guild = await client.guilds
        .fetch(g.guild_id)
        .catch(() => null);

      if (guild) {

        const eligible = [];

        for (const userId of users) {

          const member = await guild.members
            .fetch(userId)
            .catch(() => null);

          if (member && !member.user.bot) {
            eligible.push(userId);
          }
        }

        users = eligible;
      }
    }

    /*
     * جلب الفائزين السابقين حتى لا يفوزوا مرة ثانية
     * في نفس عملية إعادة السحب.
     */
    const oldWinners = await db.all(
      `SELECT user_id
       FROM giveaway_winners
       WHERE giveaway_id=?`,
      [id]
    );

    const oldIds = oldWinners.map(row => row.user_id);

    users = users.filter(
      userId => !oldIds.includes(userId)
    );

    console.log(
      "🔄 GIVEAWAY REROLL:",
      id,
      "| TYPE:",
      g.type,
      "| ENTRIES:",
      users.length,
      "| OLD WINNERS:",
      oldIds.length
    );

    if (!users.length) {

      console.log(
        "❌ REROLL NO ELIGIBLE PARTICIPANTS:",
        id
      );

      return res.send(
        "❌ لا يوجد مشاركين مؤهلين لإعادة السحب."
      );
    }

    /*
     * عدد الفائزين نفسه الموجود في إعدادات السحب.
     */
    const winnersCount = Math.max(
      1,
      Number(g.winners_count || 1)
    );

    const winners = [];

    while (
      winners.length < winnersCount &&
      users.length
    ) {

      const index = Math.floor(
        Math.random() * users.length
      );

      winners.push(users[index]);

      users.splice(index, 1);
    }

    /*
     * الاحتفاظ بكل الفائزين السابقين حتى لا يفوز
     * أي شخص أكثر من مرة في نفس السحب.
     */

    /*
     * حفظ الفائزين الجدد.
     */
    for (const winner of winners) {

      await db.run(
        `INSERT INTO giveaway_winners
         (giveaway_id,user_id,created_at)
         VALUES (?,?,?)`,
        [
          id,
          winner,
          Date.now()
        ]
      );
    }

    /*
     * إرسال النتيجة إلى قناة السحب.
     */
    const channel = await client.channels
      .fetch(g.channel_id)
      .catch(() => null);

    if (channel) {

      await channel.send(
`🔄 **تم إعادة السحب**

📌 **${g.name}**

🎁 الجائزة: ${g.prize}

🏆 **الفائزون الجدد:**
${winners.map(userId => `<@${userId}>`).join(", ")}`
      );
    }

    console.log(
      "✅ REROLL FINISHED:",
      id,
      "| WINNERS:",
      winners.join(", ")
    );

    return res.redirect(
      "/dashboard/" + guildId + "/giveaways"
    );

  } catch (err) {

    console.error(
      "❌ REROLL ERROR:",
      err
    );

    return res.status(500).send(
      "❌ حدث خطأ أثناء إعادة السحب."
    );
  }

});

module.exports = app;
