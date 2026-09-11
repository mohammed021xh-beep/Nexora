const express = require("express");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/connect");


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




app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", "./views");

function checkDashboardGuildAccess(req, res, next) {
  req.dashboardPermission = "public";
  req.dashboardCanEdit = true;
  return next();
}

app.get("/", (req, res) => {
  return res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nexora Dashboard</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #090d18;
          color: #fff;
          font-family: Arial, sans-serif;
          text-align: center;
        }
        .box {
          padding: 30px;
        }
        a {
          display: inline-block;
          margin-top: 15px;
          padding: 12px 22px;
          border-radius: 10px;
          background: #5865f2;
          color: #fff;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>⚡ Nexora Dashboard</h1>
        <p>لوحة التحكم مفتوحة مباشرة عبر رابط السيرفر.</p>
      </div>
    </body>
    </html>
  `);
});

app.get("/settings/:guildId", checkDashboardGuildAccess, (req, res) => {
  const guildId = req.params.guildId;

  db.get(
    "SELECT * FROM settings WHERE guild_id = ?",
    [guildId],
    (err, settings) => {
      if (!settings) {
        settings = {
          text_points: 1,
          voice_points: 1,
          voice_interval: 1,
          voice_enabled: 1,
          min_message_length: 3,
          messages_required: 30
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

app.post("/dashboard/:guildId/commands", checkDashboardGuildAccess, async (req, res) => {
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


app.post("/dashboard/:guildId/commands/settings", checkDashboardGuildAccess, async(req, res) => {
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

app.post("/dashboard/:guildId/commands/delete/:id", checkDashboardGuildAccess, async (req, res) => {
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


app.get("/dashboard/:guildId", checkDashboardGuildAccess, async (req, res) => {
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
     * الداشبورد مفتوح بالرابط مباشرة.
     * لا نعتمد على Discord OAuth أو Session لتحديد السيرفرات.
     */
    const manageableGuilds = [{
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({
        size: 128,
        extension: "png"
      }),
      owner: false,
      staff: false,
      administrator: false,
      canEdit: true,
      botInstalled: true
    }];

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

app.get("/shop/:guildId", checkDashboardGuildAccess, (req,res)=>{
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

    if (req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.json({
        success: true,
        message: "✅ تم حفظ الإعدادات بنجاح"
      });
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


app.post("/dashboard/:guildId/shop/edit/:id", checkDashboardGuildAccess, (req,res)=>{
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


app.get("/dashboard/:guildId/giveaways", checkDashboardGuildAccess, (req, res) => {

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

app.post("/dashboard/:guildId/giveaways", checkDashboardGuildAccess, (req,res)=>{

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

  const createdBy = "dashboard";

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

        if (!channel.isTextBased()) {
          creatingGiveaways.delete(guildId);
          return res.status(400).send("❌ قناة السحب يجب أن تكون قناة نصية");
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
app.get("/dashboard/:guildId/giveaways/delete/:id", checkDashboardGuildAccess, (req,res)=>{
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


app.post("/dashboard/:guildId/giveaways/edit/:id", checkDashboardGuildAccess, (req,res)=>{

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


app.get("/dashboard/:guildId/giveaways/reroll/:id", checkDashboardGuildAccess, async (req, res) => {

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
