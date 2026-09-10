const checkStaffPermission = require("./utils/checkStaffPermission");
const checkCommandSettings = require("./utils/checkCommandSettings");
require("dotenv").config();
process.env.TZ = "Asia/Baghdad";

const fs = require("fs");
const path = require("path");
const { 
  Client, 
  GatewayIntentBits, 
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

require("./database/connect");
require("./database/init");
require("./database/currencies");
require("./database/settings");
require("./database/shop");
require("./database/giveaways");

const messageCreate = require("./events/messageCreate");
const voiceStateUpdate = require("./events/voiceStateUpdate");


async function sendShopLog(guild, data) {
  try {
    const db = require("./database/connect");

    const settings = await db.get(
      "SELECT log_channel FROM settings WHERE guild_id=?",
      [guild.id]
    );

    if (!settings?.log_channel) return;

    const channel = guild.channels.cache.get(settings.log_channel);

    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(data.title || "📋 سجل المتجر")
      .setDescription(data.description || "")
      .setTimestamp();

    if (data.fields?.length) {
      embed.addFields(data.fields);
    }

    await channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("❌ SHOP LOG ERROR:", err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
  }
}

client.once("clientReady", async () => {
  const db = require("./database/connect");

  console.log(`🤖 تم تسجيل الدخول باسم ${client.user.tag}`);
  console.log("🌍 تجهيز إعدادات جميع السيرفرات...");

  for (const guild of client.guilds.cache.values()) {
    try {
      await db.run(
        `INSERT INTO settings
         (guild_id, text_enabled, voice_enabled, text_points, voice_points,
          voice_interval, message_cooldown, min_message_length, messages_required)
         VALUES (?,1,1,1,1,30,60,3,30)
         ON CONFLICT (guild_id) DO UPDATE SET
           voice_enabled = COALESCE(settings.voice_enabled, 1),
           voice_points = COALESCE(settings.voice_points, 1),
           voice_interval = COALESCE(settings.voice_interval, 30)`,
        [guild.id]
      );

      console.log(`✅ SETTINGS OK: ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`❌ SETTINGS ERROR ${guild.id}:`, err);
    }
  }
});

client.on("messageCreate", message => console.log("🧪 RAW MESSAGE:", message.author?.tag, JSON.stringify(message.content)));
client.on(messageCreate.name, (...args) => messageCreate.execute(...args));
client.on(voiceStateUpdate.name, (...args) => voiceStateUpdate.execute(...args));

client.on("interactionCreate", async interaction => {

  console.log("🔎 TYPE:", interaction.type);
  console.log("🔎 CUSTOM_ID:", interaction.customId || "NONE");
  console.log("🔎 COMMAND:", interaction.commandName || "NONE");
  console.log("🔎 REPLIED:", interaction.replied);
  console.log("🔎 DEFERRED:", interaction.deferred);

  console.log(
    "🔔 INTERACTION:",
    interaction.type,
    interaction.isButton() ? "BUTTON" : "",
    interaction.isStringSelectMenu() ? "SELECT" : "",
    interaction.isChatInputCommand() ? "SLASH" : "",
    interaction.customId || interaction.commandName || "NO_ID"
  );

  if (interaction.replied || interaction.deferred) {
    console.log("⚠️ INTERACTION SKIPPED:", interaction.customId || interaction.commandName || "NO_ID", "REPLIED:", interaction.replied, "DEFERRED:", interaction.deferred, "TYPE:", interaction.type);
    return;
  }

    if (interaction.isStringSelectMenu() && interaction.customId === "shop_select") {

      console.log("🛒 SHOP SELECT START:", interaction.values[0]);

      const itemId = interaction.values[0];
      const db = require("./database/connect");

      try {
        const item = await db.get(
          "SELECT * FROM shop_items WHERE id=? AND guild_id=? AND enabled=1",
          [itemId, interaction.guild.id]
        );

        if (!item) {
          return interaction.update({
            content: "❌ المنتج غير موجود.",
            embeds: [],
            components: []
          });
        }

        const stockText =
          item.stock === -1 || item.stock === null
            ? "متوفر"
            : item.stock > 0
              ? `${item.stock} قطعة`
              : "❌ نفدت الكمية";

        const embed = new EmbedBuilder()
          .setTitle(`📦 ${item.name}`)
          .setDescription(item.description || "متجر المنتجات")
          .addFields(
            { name: "💰 السعر", value: `${item.price} 🪙`, inline: true },
            { name: "📦 الكمية", value: stockText, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${item.id}`)
            .setLabel("🛒 شراء المنتج")
            .setStyle(ButtonStyle.Success)
        );

        console.log("🛒 SHOP PRODUCT SENT:", item.id, `buy_${item.id}`);

        return interaction.update({
          content: "",
          embeds: [embed],
          components: [row]
        });

      } catch (err) {
        console.error("❌ SHOP SELECT ERROR:", err);

        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: "❌ حدث خطأ أثناء تحميل المنتج.",
            ephemeral: true
          });
        }

        return interaction.editReply({
          content: "❌ حدث خطأ أثناء تحميل المنتج."
        });
      }
    }

    if (interaction.isButton() && interaction.customId?.startsWith("buy_")) {

      console.log("🚨 BUY HANDLER REACHED:", interaction.customId);
    

      const itemId = interaction.customId.split("_")[1];
      const db = require("./database/connect");
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      console.log("🛒 BUY BUTTON:", itemId, userId);

      // تأكيد تفاعل زر الشراء فوراً
      try {
        await interaction.deferReply({ ephemeral: true });
        console.log("✅ BUY DEFERRED");
      } catch (deferErr) {
        console.error("❌ BUY DEFER ERROR:", deferErr);
        return;
      }


      // تأكيد تفاعل زر الشراء فوراً
      try {
        console.log("✅ BUY DEFERRED");
      } catch (deferErr) {
        console.error("❌ BUY DEFER ERROR:", deferErr);
        return;
      }


      // تأكيد تفاعل زر الشراء فوراً
      try {
        console.log("✅ BUY DEFERRED");
      } catch (deferErr) {
        console.error("❌ BUY DEFER ERROR:", deferErr);
        return;
      }


      try {

        db.get(
          "SELECT * FROM shop_items WHERE id=? AND guild_id=? AND enabled=1",
          [itemId, guildId],
          async (err, item) => {

            if (err) {
              console.error("❌ BUY ITEM DB ERROR:", err);
              if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                  content: "❌ حدث خطأ أثناء جلب المنتج.",
                  ephemeral: true
                });
              }
              return;
            }

            if (!item) {
              return interaction.reply({
                content: "❌ المنتج غير موجود.",
                ephemeral: true
              });
            }

            console.log(
              "🛒 BUY ITEM:",
              item.name,
              "PRICE:",
              item.price,
              "STOCK:",
              item.stock,
              "INPUT:",
              item.requires_input
            );

            if (item.stock === 0) {
              return interaction.reply({
                content: "❌ نفذت الكمية.",
                ephemeral: true
              });
            }

            // التحقق من الرتبة قبل تأكيد التفاعل
            if (item.required_role_id) {

              const member = await interaction.guild.members
                .fetch(userId)
                .catch(() => null);

              if (!member || !member.roles.cache.has(item.required_role_id)) {
                return interaction.reply({
                  content: "❌ لا يمكنك شراء هذا المنتج، يجب أن تمتلك الرتبة المطلوبة.",
                  ephemeral: true
                });
              }
            }

            // المنتجات التي تحتاج معلومات يجب أن تفتح Modal مباشرة
            if (item.requires_input) {

              const modal = new ModalBuilder()
                .setCustomId(`buy_input_${item.id}`)
                .setTitle(`شراء ${item.name}`.slice(0, 45));

              const input = new TextInputBuilder()
                .setCustomId("user_input")
                .setLabel(
                  (item.input_name || "المعلومات المطلوبة").slice(0, 45)
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              modal.addComponents(
                new ActionRowBuilder().addComponents(input)
              );

              console.log("📝 OPENING BUY MODAL:", item.id);

              return interaction.showModal(modal);
            }

            db.get(
              "SELECT * FROM users WHERE guild_id=? AND user_id=?",
              [guildId, userId],
              (userErr, user) => {

                if (userErr) {
                  console.error("❌ BUY USER DB ERROR:", userErr);

                  return interaction.editReply({
                    content: "❌ حدث خطأ أثناء قراءة رصيدك."
                  });
                }

                if (!user || Number(user.total_points) < Number(item.price)) {
                  return interaction.editReply({
                    content:
                      `❌ رصيدك غير كافٍ.\n` +
                      `💰 السعر: ${item.price} 🪙`
                  });
                }

                // خصم النقاط
                db.run(
                  `UPDATE users
                   SET total_points = total_points - ?
                   WHERE guild_id=? AND user_id=? AND total_points >= ?`,
                  [
                    item.price,
                    guildId,
                    userId,
                    item.price
                  ],
                  function(pointErr, pointResult) {

                    if (
                      pointErr ||
                      !pointResult ||
                      pointResult.rowCount === 0
                    ) {
                      console.error(
                        "❌ BUY POINTS ERROR:",
                        pointErr,
                        pointResult
                      );

                      return interaction.editReply({
                        content: "❌ تعذر خصم النقاط، حاول مرة أخرى."
                      });
                    }

                    const continuePurchase = () => {

                      db.get(
                        "SELECT purchase_channel FROM settings WHERE guild_id=?",
                        [guildId],
                        async (settingsErr, settings) => {

                          if (
                            settingsErr ||
                            !settings ||
                            !settings.purchase_channel
                          ) {

                            db.run(
                              "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                              [item.price, guildId, userId]
                            );

                            if (item.stock > 0) {
                              db.run(
                                "UPDATE shop_items SET stock=stock+1 WHERE id=? AND guild_id=?",
                                [item.id, guildId]
                              );
                            }

                            return interaction.editReply({
                              content:
                                "❌ لم يتم تحديد قناة الطلبات، وتمت إعادة نقاطك."
                            });
                          }

                          const channel =
                            interaction.guild.channels.cache.get(
                              settings.purchase_channel
                            );

                          if (!channel) {

                            db.run(
                              "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                              [item.price, guildId, userId]
                            );

                            if (item.stock > 0) {
                              db.run(
                                "UPDATE shop_items SET stock=stock+1 WHERE id=? AND guild_id=?",
                                [item.id, guildId]
                              );
                            }

                            return interaction.editReply({
                              content:
                                "❌ قناة الطلبات غير موجودة، وتمت إعادة نقاطك."
                            });
                          }

                          const row = new ActionRowBuilder().addComponents(

                            new ButtonBuilder()
                              .setCustomId(
                                `deliver_${userId}_${item.id}_${item.price}`
                              )
                              .setLabel("✅ تم التسليم")
                              .setStyle(ButtonStyle.Success),

                            new ButtonBuilder()
                              .setCustomId(
                                `reject_${userId}_${item.id}_${item.price}`
                              )
                              .setLabel("❌ رفض")
                              .setStyle(ButtonStyle.Danger)

                          );

                          try {

                            await channel.send({
                              content:
`🛒 **طلب شراء جديد**

👤 العضو: <@${userId}>
🆔 ID: ${userId}

📦 المنتج: ${item.name}
💰 السعر: ${item.price}

🟡 الحالة: قيد المراجعة`,
                              components: [row]
                            });

                            db.run(
                              `INSERT INTO purchases
                               (guild_id,user_id,item_id,item_name,price,user_input,created_at)
                               VALUES (?,?,?,?,?,?,?)`,
                              [
                                guildId,
                                userId,
                                item.id,
                                item.name,
                                item.price,
                                null,
                                Date.now()
                              ],
                              async (purchaseErr) => {

                                if (purchaseErr) {
                                  console.error(
                                    "❌ PURCHASE INSERT ERROR:",
                                    purchaseErr
                                  );
                                }

                                await sendShopLog(interaction.guild, {
                                  title: "🛒 طلب شراء جديد",
                                  fields: [
                                    {
                                      name: "👤 العضو",
                                      value: `<@${userId}>`,
                                      inline: true
                                    },
                                    {
                                      name: "📦 المنتج",
                                      value: item.name,
                                      inline: true
                                    },
                                    {
                                      name: "💰 السعر",
                                      value: `${item.price} 🪙`,
                                      inline: true
                                    }
                                  ]
                                });

                                return interaction.editReply({
                                  content:
`✅ تم تسجيل طلبك بنجاح.

📦 المنتج: ${item.name}
💰 تم خصم: ${item.price} 🪙

🟡 الطلب بانتظار مراجعة الإدارة.`
                                });

                              }
                            );

                          } catch (sendErr) {

                            console.error(
                              "❌ BUY CHANNEL SEND ERROR:",
                              sendErr
                            );

                            db.run(
                              "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                              [item.price, guildId, userId]
                            );

                            if (item.stock > 0) {
                              db.run(
                                "UPDATE shop_items SET stock=stock+1 WHERE id=? AND guild_id=?",
                                [item.id, guildId]
                              );
                            }

                            return interaction.editReply({
                              content:
                                "❌ تعذر إرسال طلب الشراء، وتمت إعادة نقاطك."
                            });
                          }

                        }
                      );

                    };

                    // المخزون غير محدود
                    if (item.stock === -1 || item.stock === null) {
                      return continuePurchase();
                    }

                    // المخزون محدود
                    db.run(
                      `UPDATE shop_items
                       SET stock=stock-1
                       WHERE id=? AND guild_id=? AND stock>0`,
                      [item.id, guildId],
                      function(stockErr, stockResult) {

                        if (
                          stockErr ||
                          !stockResult ||
                          stockResult.rowCount === 0
                        ) {

                          console.error(
                            "❌ BUY STOCK ERROR:",
                            stockErr,
                            stockResult
                          );

                          db.run(
                            "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                            [item.price, guildId, userId]
                          );

                          return interaction.editReply({
                            content:
                              "❌ نفذت الكمية وتمت إعادة نقاطك."
                          });
                        }

                        continuePurchase();
                      }
                    );

                  }
                );

              }
            );

          }
        );

      } catch (error) {

        console.error("❌ BUY BUTTON ERROR:", error);

        if (interaction.deferred) {
          return interaction.editReply({
            content: "❌ حدث خطأ أثناء تنفيذ عملية الشراء."
          }).catch(console.error);
        }

        if (!interaction.replied) {
          return interaction.reply({
            content: "❌ حدث خطأ أثناء تنفيذ عملية الشراء.",
            ephemeral: true
          }).catch(console.error);
        }
      }

      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("deliver_")) {

      if (!(await checkStaffPermission(interaction)))
        return;

      await interaction.update({
        content: interaction.message.content + "\n\n✅ **تم التسليم**",
        components:[]
      });

      await sendShopLog(interaction.guild, {
        title: "✅ تم تسليم طلب",
        description: "تم تسليم طلب شراء بنجاح",
        fields: [
          {
            name: "👤 العضو",
            value: `<@${interaction.customId.split("_")[1]}>`,
            inline: true
          },
          {
            name: "👮 الموظف",
            value: `<@${interaction.user.id}>`,
            inline: true
          }
        ]
      });

      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("reject_")) {

      if (!(await checkStaffPermission(interaction)))
        return;

      const db=require("./database/connect");

      const data=interaction.customId.split("_");
      const userId=data[1];
      const price=parseInt(data[3]);

      db.run(
        "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
        [price,interaction.guild.id,userId]
      );

      const rejectItemId = data[2];

      const rejectItem = await db.get(
        "SELECT name FROM shop_items WHERE id=? AND guild_id=?",
        [rejectItemId, interaction.guild.id]
      );

      await sendShopLog(interaction.guild, {
        title: "❌ تم رفض طلب",
        fields: [
          { name: "👤 العضو", value: `<@${userId}> (${userId})`, inline: true },
          { name: "📦 المنتج", value: rejectItem?.name || "غير معروف", inline: true },
          { name: "💰 المبلغ المسترجع", value: `${price} 🪙`, inline: true },
          { name: "👮 الموظف", value: `<@${interaction.user.id}>` }
        ]
      });

      await interaction.update({
        content: interaction.message.content + "\n\n❌ **تم رفض الطلب وإرجاع النقاط**",
        components:[]
      });

      await sendShopLog(interaction.guild, {
        title: "❌ تم رفض طلب",
        description: "تم رفض طلب الشراء وإرجاع النقاط للعضو",
        fields: [
          {
            name: "👤 العضو",
            value: `<@${userId}>`,
            inline: true
          },
          {
            name: "👮 الموظف",
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: "💰 النقاط المُعادة",
            value: `${price} نقطة`,
            inline: true
          }
        ]
      });

      Promise.resolve(interaction.guild.members.cache.get(userId)).then(member=>{
        member.send("❌ تم رفض طلبك وتمت إعادة نقاطك.").catch(()=>{});
      }).catch(()=>{});

      return;
    }



  if (interaction.isModalSubmit()) {

    if (interaction.customId.startsWith("buy_input_")) {

      const db = require("./database/connect");

      const itemId = interaction.customId.split("_")[2];
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const userInput = interaction.fields.getTextInputValue("user_input");

      db.get(
        "SELECT * FROM shop_items WHERE id=? AND guild_id=?",
        [itemId, guildId],
        async (err, item) => {

          if (err || !item) {
            return interaction.reply({
              content: "❌ المنتج غير موجود",
              ephemeral: true
            });
          }

          if (item.stock === 0) {
            return interaction.reply({
              content: "❌ نفذت الكمية",
              ephemeral: true
            });
          }

          // إعادة التحقق من رتبة الشراء عند تأكيد الـModal
          if (item.required_role_id) {
            const member = await interaction.guild.members
              .fetch(userId)
              .catch(() => null);

            if (!member || !member.roles.cache.has(item.required_role_id)) {
              return interaction.reply({
                content: "❌ لا يمكنك شراء هذا المنتج، يجب أن تمتلك الرتبة المطلوبة.",
                ephemeral: true
              });
            }
          }

          db.run(
            `UPDATE users
             SET total_points = total_points - ?
             WHERE guild_id=? AND user_id=? AND total_points >= ?`,
            [item.price, guildId, userId, item.price],
            function(err, result) {

              if (err || !result || result.rowCount === 0) {
                return interaction.reply({
                  content: "❌ رصيدك لا يكفي أو تعذر خصم النقاط.",
                  ephemeral: true
                });
              }

              // إنقاص المخزون بشكل آمن
              db.run(
                `UPDATE shop_items
                 SET stock = stock - 1
                 WHERE id=? AND guild_id=? AND stock > 0`,
                [item.id, guildId],
                function(stockErr, stockResult) {

                  if (stockErr || (item.stock > 0 && (!stockResult || stockResult.rowCount === 0))) {

                    // إعادة النقاط إذا فشل حجز الكمية
                    db.run(
                      "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                      [item.price, guildId, userId]
                    );

                    return interaction.reply({
                      content: stockErr
                        ? "❌ حدث خطأ أثناء تحديث كمية المنتج وتمت إعادة النقاط."
                        : "❌ نفذت الكمية وتمت إعادة النقاط.",
                      ephemeral: true
                    });
                  }

                  db.run(
                `INSERT INTO purchases
                (guild_id,user_id,item_id,item_name,price,user_input,created_at)
                VALUES (?,?,?,?,?,?,?)`,
                [
                  guildId,
                  userId,
                  item.id,
                  item.name,
                  item.price,
                  userInput,
                  Date.now()
                ],
                (err) => {

                  if (err) {
                    console.error("❌ PURCHASE INSERT ERROR:", err);

                    // إذا فشل تسجيل الطلب، نرجع النقاط التي تم خصمها
                    db.run(
                      "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                      [item.price, guildId, userId]
                    );

                    if (item.stock > 0) {
                      db.run(
                        "UPDATE shop_items SET stock=stock+1 WHERE id=? AND guild_id=?",
                        [item.id, guildId]
                      );
                    }

                    return interaction.reply({
                      content: "❌ حدث خطأ أثناء تسجيل الطلب وتمت إعادة النقاط والكمية.",
                      ephemeral: true
                    });
                  }

                  db.get(
                    "SELECT purchase_channel FROM settings WHERE guild_id=?",
                    [guildId],
                    async (err, settings) => {

                      if (!settings?.purchase_channel) {
                        db.run(
                          "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                          [item.price, guildId, userId]
                        );

                        return interaction.reply({
                          content: "❌ لم يتم تحديد قناة الطلبات وتمت إعادة النقاط.",
                          ephemeral: true
                        });
                      }

                      const channel = interaction.guild.channels.cache.get(
                        settings.purchase_channel
                      );

                      if (!channel) {
                        db.run(
                          "UPDATE users SET total_points=total_points+? WHERE guild_id=? AND user_id=?",
                          [item.price, guildId, userId]
                        );

                        return interaction.reply({
                          content: "❌ قناة الطلبات غير موجودة وتمت إعادة النقاط.",
                          ephemeral: true
                        });
                      }

                      const row = new ActionRowBuilder().addComponents(

                        new ButtonBuilder()
                          .setCustomId(`deliver_${userId}_${item.id}_${item.price}`)
                          .setLabel("✅ تم التسليم")
                          .setStyle(ButtonStyle.Success),

                        new ButtonBuilder()
                          .setCustomId(`reject_${userId}_${item.id}_${item.price}`)
                          .setLabel("❌ رفض")
                          .setStyle(ButtonStyle.Danger)

                      );

                      await sendShopLog(interaction.guild, {
                        title: "🛒 طلب شراء جديد",
                        fields: [
                          { name: "👤 العضو", value: `<@${userId}> (${userId})` },
                          { name: "📦 المنتج", value: item.name, inline: true },
                          { name: "💰 السعر", value: `${item.price} 🪙`, inline: true },
                          { name: "📝 المعلومات", value: userInput || "لا توجد" }
                        ]
                      });

                      await channel.send({
                        content: `🛒 **طلب شراء جديد**

👤 العضو: <@${userId}>
🆔 ID: ${userId}

📦 المنتج: ${item.name}
💰 السعر: ${item.price}

📝 ${item.input_name || "المعلومات"}:
${userInput}

🟡 الحالة: قيد المراجعة`,
                        components: [row]
                      });

                      await sendShopLog(interaction.guild, {
                        title: "🛒 طلب شراء جديد",
                        description: "تم إنشاء طلب شراء جديد",
                        fields: [
                          {
                            name: "👤 العضو",
                            value: `<@${userId}>`,
                            inline: true
                          },
                          {
                            name: "📦 المنتج",
                            value: item.name,
                            inline: true
                          },
                          {
                            name: "💰 السعر",
                            value: `${item.price} نقطة`,
                            inline: true
                          },
                          {
                            name: "📝 المعلومات",
                            value: userInput || "لا توجد",
                            inline: false
                          }
                        ]
                      });

                      return interaction.reply({
                        content:
`✅ تم تسجيل طلبك

📦 المنتج: ${item.name}
💰 تم خصم: ${item.price} نقطة
📝 ${item.input_name || "المعلومات"}: ${userInput}

🟡 الطلب بانتظار مراجعة الإدارة.`,
                        ephemeral: true
                      });

                    }
                  );

                }
                  );
                }

              );

            }
          );

        }
      );

    }

    return;
  }

  console.log("SLASH:", interaction.commandName, interaction.user.id);
  if (!interaction.isChatInputCommand()) return;

  console.log("COMMAND:", interaction.commandName, interaction.user.tag);
  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {

    const permission = await checkCommandSettings({
      guildId: interaction.guild.id,
      commandName: interaction.commandName,
      channelId: interaction.channel.id,
      member: interaction.member
    });

    if (!permission.allowed) {
      return interaction.reply({
        content: `⛔ ${permission.reason}`,
        ephemeral: true
      });
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      console.log(
        "⚠️ INTERACTION SKIPPED:",
        interaction.customId || interaction.commandName || "NO_ID",
        "REPLIED:",
        interaction.replied,
        "DEFERRED:",
        interaction.deferred,
        "TYPE:",
        interaction.type
      );
      return;
    }

    try {
      await interaction.reply({
        content: "حدث خطأ أثناء تنفيذ الأمر",
        ephemeral: true
      });
    } catch (replyError) {
      console.error("❌ ERROR REPLYING TO INTERACTION:", replyError);
    }
  }
});

client.once("clientReady", async () => {
  console.log("🎙️ فحص حالات الصوت...");

  // ننتظر قليلًا حتى تكون حالات الصوت جاهزة في الكاش
  await new Promise(resolve => setTimeout(resolve, 2000));

  let found = 0;

  for (const guild of client.guilds.cache.values()) {
    try {
      for (const [userId, voiceState] of guild.voiceStates.cache) {

        if (!voiceState.channel) continue;

        const member = voiceState.member;

        if (!member || member.user.bot) continue;

        found++;

        console.log(
          "🎙️ VOICE MEMBER FOUND:",
          member.id,
          member.user.tag,
          "CHANNEL:",
          voiceState.channel.id
        );

        await voiceStateUpdate.startVoiceTimer(member);
      }

    } catch (err) {
      console.error("VOICE STARTUP ERROR:", guild.id, err);
    }
  }

  console.log(`🎙️ تم العثور على ${found} عضو داخل الرومات الصوتية`);
});


// 🎙️ VOICE TIMER AUTO RESYNC
// فحص الرومات من الكاش فقط، بدون Discord API fetch
setInterval(async () => {
  try {
    let found = 0;

    for (const guild of client.guilds.cache.values()) {
      for (const [, voiceState] of guild.voiceStates.cache) {
        if (!voiceState.channel) continue;

        const member = voiceState.member;

        if (!member || member.user.bot) continue;

        found++;

        await voiceStateUpdate.startVoiceTimer(member);
      }
    }

    if (found > 0) {
      console.log(`🔄 VOICE RESYNC: ${found} عضو بالصوت`);
    }

  } catch (err) {
    console.error("❌ VOICE RESYNC ERROR:", err);
  }
}, 60 * 1000);

client.login(process.env.TOKEN);

const dashboard = require("./dashboard/app");
dashboard.set("client", client);
dashboard.locals.client = client;

dashboard.listen(process.env.PORT || 15719, "0.0.0.0", () => {
  console.log("🌐 Dashboard running on port 3000");
});

require("./database/currencySetup");

const runGiveaways = require("./giveawayRunner");

setInterval(() => {
  runGiveaways(client);
}, 60000);

client.on("guildCreate", async (guild) => {
  console.log(`🆕 دخل سيرفر جديد: ${guild.name} (${guild.id})`);

  const db = require("./database/connect");

  try {
    await db.run(
      `INSERT INTO settings
       (guild_id, text_enabled, voice_enabled, text_points, voice_points,
        voice_interval, message_cooldown, min_message_length, messages_required)
       VALUES (?,1,1,1,1,30,60,3,30)
       ON CONFLICT (guild_id) DO UPDATE SET
         voice_enabled = COALESCE(settings.voice_enabled, 1),
         voice_points = COALESCE(settings.voice_points, 1),
         voice_interval = COALESCE(settings.voice_interval, 30)`,
      [guild.id]
    );

    console.log(`✅ تم تجهيز إعدادات السيرفر: ${guild.id}`);

    // فحص أعضاء الرومات الصوتية من الـ cache فقط
    // بدون guild.members.fetch() لتجنب Rate Limits
    let found = 0;

    for (const [userId, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channel) continue;

      const member = voiceState.member;

      if (!member || member.user.bot) continue;

      found++;

      console.log(
        "🎙️ NEW GUILD VOICE MEMBER:",
        member.id,
        member.user.tag,
        "CHANNEL:",
        voiceState.channel.id
      );

      voiceStateUpdate.startVoiceTimer(member);
    }

    console.log(
      `🎙️ تم فحص السيرفر الجديد: ${found} عضو داخل الرومات الصوتية`
    );

  } catch (err) {
    console.error("❌ GUILD INIT ERROR:", err);
  }
});
