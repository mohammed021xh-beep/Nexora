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
  EmbedBuilder,
  WebhookClient
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
      .setTimestamp();

    if (data.description) {
      embed.setDescription(data.description);
    }

    if (data.fields?.length) {
      embed.addFields(data.fields);
    }

    await channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("❌ SHOP LOG ERROR:", err);
  }
}


async function sendPurchaseWebhook(channel, embed, components = []) {
  try {
    const webhook = await channel.createWebhook({
      name: "Nexora • Purchases",
      avatar: client.user?.displayAvatarURL({ extension: "png", size: 256 }),
      reason: "Nexora shop purchase requests"
    });

    try {
      return await webhook.send({
        embeds: [embed],
        components,
        username: "Nexora • Purchases",
        avatarURL: client.user?.displayAvatarURL({ extension: "png", size: 256 })
      });
    } catch (sendErr) {
      console.error("❌ PURCHASE WEBHOOK SEND ERROR:", sendErr);
      throw sendErr;
    }
  } catch (err) {
    console.error("❌ PURCHASE WEBHOOK ERROR:", err);
    throw err;
  }
}

async function safeShopEmbedReply(interaction, embed) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        content: "",
        embeds: [embed]
      });
    }

    return await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();

    if (
      msg.includes("unknown message") ||
      msg.includes("10008") ||
      msg.includes("interaction has already been acknowledged")
    ) {
      try {
        const channel =
          interaction.channel ||
          await interaction.guild?.channels
            .fetch(interaction.channelId)
            .catch(() => null);

        if (channel?.isTextBased()) {
          return await channel.send({
            embeds: [embed],
            allowedMentions: { repliedUser: false }
          });
        }
      } catch (fallbackErr) {
        console.error("❌ SHOP EMBED FALLBACK ERROR:", fallbackErr);
      }
    }

    throw err;
  }
}

async function safeShopReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ content });
    }

    return await interaction.reply({
      content,
      ephemeral: true
    });
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();

    if (
      msg.includes("unknown message") ||
      msg.includes("10008") ||
      msg.includes("interaction has already been acknowledged")
    ) {
      try {
        const channel =
          interaction.channel ||
          await interaction.guild?.channels.fetch(interaction.channelId).catch(() => null);

        if (channel?.isTextBased()) {
          return await channel.send({
            content,
            allowedMentions: { repliedUser: false }
          });
        }
      } catch (fallbackErr) {
        console.error("❌ SHOP FALLBACK SEND ERROR:", fallbackErr);
      }
    }

    throw err;
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


async function processNormalShopPurchase({ db, interaction, item, guildId, userId }) {
  const settings = await db.get(
    "SELECT purchase_channel FROM settings WHERE guild_id=?",
    [guildId]
  );

  if (!settings || !settings.purchase_channel) {
    return interaction.editReply({
      content: "❌ لم يتم تحديد قناة الطلبات."
    });
  }

  let channel =
    interaction.guild.channels.cache.get(settings.purchase_channel);

  if (!channel) {
    channel = await interaction.guild.channels
      .fetch(settings.purchase_channel)
      .catch(() => null);
  }

  if (!channel || !channel.isTextBased()) {
    return interaction.editReply({
      content: "❌ قناة الطلبات غير موجودة، ولم يتم خصم أي نقاط."
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

  const createdAt = Date.now();
  const limitedStock = item.stock !== -1 && item.stock !== null;
  let purchaseId = null;

  try {
    purchaseId = await db.transaction(async (tx) => {
      const pointResult = await tx.run(
        `UPDATE users
         SET total_points = total_points - ?
         WHERE guild_id=? AND user_id=? AND total_points >= ?`,
        [item.price, guildId, userId, item.price]
      );

      if (!pointResult || Number(pointResult.rowCount || 0) < 1) {
        throw new Error("INSUFFICIENT_POINTS");
      }

      if (limitedStock) {
        const stockResult = await tx.run(
          `UPDATE shop_items
           SET stock=stock-1
           WHERE id=? AND guild_id=? AND enabled=1 AND stock>0`,
          [item.id, guildId]
        );

        if (!stockResult || Number(stockResult.rowCount || 0) < 1) {
          throw new Error("OUT_OF_STOCK");
        }
      }

      const purchaseResult = await tx.run(
        `INSERT INTO purchases
         (guild_id,user_id,item_id,item_name,price,user_input,created_at)
         VALUES (?,?,?,?,?,?,?)
         RETURNING id`,
        [
          guildId,
          userId,
          item.id,
          item.name,
          item.price,
          null,
          createdAt
        ]
      );

      if (!purchaseResult || Number(purchaseResult.rowCount || 0) < 1) {
        throw new Error("PURCHASE_INSERT_FAILED");
      }

      return purchaseResult.rows?.[0]?.id ?? null;
    });
  } catch (err) {
    console.error("❌ NORMAL SHOP TRANSACTION ERROR:", err);

    if (err?.message === "INSUFFICIENT_POINTS") {
      return interaction.editReply({
        content:
          `❌ رصيدك غير كافٍ.\n` +
          `💰 السعر: ${item.price} 🪙`
      });
    }

    if (err?.message === "OUT_OF_STOCK") {
      return interaction.editReply({
        content: "❌ نفذت الكمية ولم يتم خصم أي نقاط."
      });
    }

    return interaction.editReply({
      content: "❌ تعذر تسجيل طلب الشراء، ولم يتم خصم أي نقاط."
    });
  }

  let purchaseSent = false;

  try {
    try {
      const purchaseEmbed = new EmbedBuilder()
        .setTitle("🛒 طلب شراء جديد")
        .setDescription("تم استلام طلب شراء جديد ويحتاج إلى مراجعة الإدارة.")
        .addFields(
          {
            name: "👤 العضو",
            value: `<@${userId}>`,
            inline: true
          },
          {
            name: "🆔 معرف العضو",
            value: userId,
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
          },
          {
            name: "🟡 الحالة",
            value: "قيد المراجعة",
            inline: true
          }
        )
        .setThumbnail(
          interaction.user.displayAvatarURL({
            extension: "png",
            size: 256
          })
        )
        .setFooter({
          text: "Nexora • Purchases"
        })
        .setTimestamp();

      await sendPurchaseWebhook(channel, purchaseEmbed, [row]);

      purchaseSent = true;
    } catch (sendErr) {
      console.error(
        "⚠️ BUY CHANNEL SEND FAILED, RETRYING:",
        sendErr
      );

      const freshChannel =
        await interaction.guild.channels
          .fetch(settings.purchase_channel)
          .catch(() => null);

      if (!freshChannel || !freshChannel.isTextBased()) {
        throw sendErr;
      }

      await sendPurchaseWebhook(
        freshChannel,
        purchaseEmbed,
        [row]
      );

      purchaseSent = true;
    }
  } catch (sendErr) {
    console.error("❌ BUY CHANNEL SEND ERROR:", sendErr);

    try {
      await db.transaction(async (tx) => {
        if (purchaseId !== null) {
          await tx.run(
            "DELETE FROM purchases WHERE id=?",
            [purchaseId]
          );
        }

        await tx.run(
          `UPDATE users
           SET total_points=total_points+?
           WHERE guild_id=? AND user_id=?`,
          [item.price, guildId, userId]
        );

        if (limitedStock) {
          await tx.run(
            `UPDATE shop_items
             SET stock=stock+1
             WHERE id=? AND guild_id=?`,
            [item.id, guildId]
          );
        }
      });
    } catch (rollbackErr) {
      console.error(
        "❌ NORMAL SHOP COMPENSATION ERROR:",
        rollbackErr
      );
    }

    return interaction.editReply({
      content:
        "❌ تعذر إرسال طلب الشراء، وتمت إعادة نقاطك."
    });
  }

  if (!purchaseSent) {
    return;
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
  }).catch(err => {
    console.error("❌ SHOP LOG ERROR:", err);
  });

  const buyerEmbed = new EmbedBuilder()
    .setTitle("✅ تم تسجيل طلبك")
    .setDescription("تم إنشاء طلب الشراء بنجاح، وهو الآن بانتظار مراجعة الإدارة.")
    .addFields(
      {
        name: "📦 المنتج",
        value: item.name,
        inline: true
      },
      {
        name: "💰 المبلغ المدفوع",
        value: `${item.price} 🪙`,
        inline: true
      },
      {
        name: "🟡 الحالة",
        value: "قيد المراجعة",
        inline: true
      }
    )
    .setFooter({
      text: "Nexora • Shop"
    })
    .setTimestamp();

  return safeShopEmbedReply(interaction, buyerEmbed);
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

            await interaction.deferReply({ ephemeral: true });
            console.log("✅ BUY DEFERRED");

            db.get(
              "SELECT * FROM users WHERE guild_id=? AND user_id=?",
              [guildId, userId],
              async (userErr, user) => {

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

                return processNormalShopPurchase({
              db,
              interaction,
              item,
              guildId,
              userId
            });

            // الكود القديم محفوظ هنا كمرجع ولن يتم تنفيذه
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

                            let purchaseMessage;

                            try {
                              purchaseMessage = await channel.send({
                                content:
`🛒 **طلب شراء جديد**

👤 العضو: <@${userId}>
🆔 ID: ${userId}

📦 المنتج: ${item.name}
💰 السعر: ${item.price}

🟡 الحالة: قيد المراجعة`,
                                components: [row]
                              });
                            } catch (sendErr) {
                              console.error(
                                "⚠️ BUY CHANNEL SEND FAILED, RETRYING:",
                                sendErr
                              );

                              // محاولة الحصول على القناة من Discord مباشرة ثم إعادة الإرسال
                              const freshChannel =
                                await interaction.guild.channels
                                  .fetch(settings.purchase_channel)
                                  .catch(() => null);

                              if (!freshChannel || !freshChannel.isTextBased()) {
                                throw sendErr;
                              }

                              purchaseMessage = await freshChannel.send({
                                content:
`🛒 **طلب شراء جديد**

👤 العضو: <@${userId}>
🆔 ID: ${userId}

📦 المنتج: ${item.name}
💰 السعر: ${item.price}

🟡 الحالة: قيد المراجعة`,
                                components: [row]
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

                                return safeShopReply(
                                  interaction,
`✅ تم تسجيل طلبك بنجاح.

📦 المنتج: ${item.name}
💰 تم خصم: ${item.price} 🪙

🟡 الطلب بانتظار مراجعة الإدارة.`
                                );

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

    
// 🎁 GIVEAWAY JOIN HANDLER
if (
  interaction.isButton() &&
  interaction.customId?.startsWith("join_giveaway_")
) {
  const db = require("./database/connect");

  try {
    // تأكيد زر السحب فوراً قبل أي عمليات DB أو Discord API
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.customId.slice("join_giveaway_".length);
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;

    if (!giveawayId || !guildId) {
      return interaction.editReply({
        content: "❌ تعذر معالجة المشاركة.",
        ephemeral: true
      });
    }

    console.log(
      "🎁 GIVEAWAY JOIN:",
      giveawayId,
      "| USER:",
      userId
    );

    const giveaway = await db.get(
      `SELECT *
       FROM giveaways
       WHERE id=? AND guild_id=?`,
      [giveawayId, guildId]
    );

    if (!giveaway) {
      return interaction.editReply({
        content: "❌ هذا السحب غير موجود.",
        ephemeral: true
      });
    }

    if (giveaway.status !== "active") {
      return interaction.editReply({
        content: "❌ هذا السحب انتهى أو غير متاح حالياً.",
        ephemeral: true
      });
    }

    if (
      Number.isFinite(Number(giveaway.run_at)) &&
      Date.now() >= Number(giveaway.run_at)
    ) {
      return interaction.editReply({
        content: "⏰ انتهى وقت المشاركة في هذا السحب.",
        ephemeral: true
      });
    }

    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

    if (!member) {
      return interaction.editReply({
        content: "❌ تعذر التحقق من عضويتك في السيرفر.",
        ephemeral: true
      });
    }

    if (member.user.bot) {
      return interaction.editReply({
        content: "❌ البوتات لا يمكنها المشاركة.",
        ephemeral: true
      });
    }

    // 🔐 التحقق من الرتبة المطلوبة
    if (giveaway.role_id) {
      if (!member.roles.cache.has(giveaway.role_id)) {
        return interaction.editReply({
          content: "❌ لا تملك الرتبة المطلوبة للمشاركة في هذا السحب.",
          ephemeral: true
        });
      }
    }

    // 🚫 منع المشاركة أكثر من مرة
    const existing = await db.get(
      `SELECT id
       FROM giveaway_entries
       WHERE giveaway_id=? AND user_id=?`,
      [giveawayId, userId]
    );

    if (existing) {
      return interaction.editReply({
        content: "⚠️ أنت مشارك بالفعل في هذا السحب.",
        ephemeral: true
      });
    }

    const fee = Math.max(
      0,
      Number(giveaway.entry_fee || 0)
    );

    // 💰 السحب المدفوع
    if (fee > 0) {
      const user = await db.get(
        `SELECT total_points
         FROM users
         WHERE guild_id=? AND user_id=?`,
        [guildId, userId]
      );

      const balance = Number(user?.total_points || 0);

      if (balance < fee) {
        return interaction.editReply({
          content:
            `❌ نقاطك غير كافية.\n\n💰 رسوم المشاركة: **${fee} نقطة**\n💳 رصيدك الحالي: **${balance} نقطة**`,
          ephemeral: true
        });
      }

      const updated = await db.run(
        `UPDATE users
         SET total_points=total_points-?
         WHERE guild_id=? AND user_id=? AND total_points>=?`,
        [fee, guildId, userId, fee]
      );

      if (!updated?.rowCount) {
        return interaction.editReply({
          content: "❌ تعذر خصم رسوم المشاركة، حاول مرة أخرى.",
          ephemeral: true
        });
      }

      try {
        await db.run(
          `INSERT INTO giveaway_entries
           (giveaway_id,user_id,joined_at,paid)
           VALUES (?,?,?,1)`,
          [giveawayId, userId, Date.now()]
        );
      } catch (entryErr) {
        // 🔄 إذا فشل تسجيل المشاركة، نرجع النقاط
        await db.run(
          `UPDATE users
           SET total_points=total_points+?
           WHERE guild_id=? AND user_id=?`,
          [fee, guildId, userId]
        );

        if (
          String(entryErr?.message || "").toLowerCase().includes("unique")
        ) {
          return interaction.editReply({
            content: "⚠️ أنت مشارك بالفعل في هذا السحب.",
            ephemeral: true
          });
        }

        throw entryErr;
      }

      console.log(
        "✅ GIVEAWAY PAID JOIN:",
        giveawayId,
        "| USER:",
        userId,
        "| FEE:",
        fee
      );

      return interaction.editReply({
        content:
          `🎉 تمت مشاركتك بنجاح!\n\n🎁 **${giveaway.prize}**\n💰 تم خصم **${fee} نقطة** من رصيدك.`,
        ephemeral: true
      });
    }

    // 🆓 السحب المجاني
    try {
      await db.run(
        `INSERT INTO giveaway_entries
         (giveaway_id,user_id,joined_at,paid)
         VALUES (?,?,?,0)`,
        [giveawayId, userId, Date.now()]
      );
    } catch (entryErr) {
      if (
        String(entryErr?.message || "").toLowerCase().includes("unique")
      ) {
        return interaction.editReply({
          content: "⚠️ أنت مشارك بالفعل في هذا السحب.",
          ephemeral: true
        });
      }

      throw entryErr;
    }

    console.log(
      "✅ GIVEAWAY FREE JOIN:",
      giveawayId,
      "| USER:",
      userId
    );

    return interaction.editReply({
      content:
        `🎉 تمت مشاركتك بنجاح!\n\n🎁 الجائزة: **${giveaway.prize}**`,
      ephemeral: true
    });

  } catch (err) {
    console.error("❌ GIVEAWAY JOIN ERROR:", err);

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({
        content: "❌ حدث خطأ أثناء تسجيل مشاركتك."
      }).catch(() => {});
    }

    return interaction.reply({
      content: "❌ حدث خطأ أثناء تسجيل مشاركتك.",
      ephemeral: true
    }).catch(() => {});
  }
}

if (interaction.isButton() && interaction.customId?.startsWith("deliver_")) {

      const db = require("./database/connect");

      if (!(await checkStaffPermission(interaction)))
        return;

      const data = interaction.customId.split("_");
      const userId = data[1];
      const itemId = data[2];
      const price = parseInt(data[3]);

      const item = await db.get(
        "SELECT name FROM shop_items WHERE id=? AND guild_id=?",
        [itemId, interaction.guild.id]
      );

      const guildName = interaction.guild.name;
      const itemName = item?.name || "غير معروف";

      await interaction.update({
        content:
          interaction.message.content +
          "\n\n✅ **تم التسليم**\n👮 تم بواسطة: <@" +
          interaction.user.id +
          ">",
        components: []
      });

      await sendShopLog(interaction.guild, {
        title: "✅ تم تسليم طلب",
        description: "تم تسليم طلب شراء بنجاح",
        fields: [
          {
            name: "👤 العضو",
            value: `<@${userId}>`,
            inline: true
          },
          {
            name: "📦 المنتج",
            value: itemName,
            inline: true
          },
          {
            name: "💰 السعر",
            value: `${price} 🪙`,
            inline: true
          },
          {
            name: "🏠 السيرفر",
            value: guildName,
            inline: false
          },
          {
            name: "👮 الموظف",
            value: `<@${interaction.user.id}>`,
            inline: false
          }
        ]
      });

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);

      if (member) {
        const deliveryEmbed = new EmbedBuilder()
          .setTitle("🎉 تم تسليم طلبك بنجاح")
          .setDescription(
            "تمت معالجة طلب الشراء الخاص بك وتسليم المنتج بنجاح. ❤️"
          )
          .addFields(
            {
              name: "📦 المنتج",
              value: itemName,
              inline: true
            },
            {
              name: "💰 السعر",
              value: `${price} 🪙`,
              inline: true
            },
            {
              name: "🏠 السيرفر",
              value: guildName,
              inline: false
            },
            {
              name: "🟢 الحالة",
              value: "تم التسليم",
              inline: true
            },
            {
              name: "👮 تمت المعالجة بواسطة",
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          )
          .setFooter({
            text: "Nexora • Shop"
          })
          .setTimestamp();

        await member.send({
          embeds: [deliveryEmbed]
        }).catch(err => {
          console.log("⚠️ تعذر إرسال DM للمشتري:", err.message);
        });
      }

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

      const guildName = interaction.guild.name;
      const itemName = rejectItem?.name || "غير معروف";

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);

      if (member) {
        const rejectEmbed = new EmbedBuilder()
          .setTitle("❌ تم رفض طلب الشراء")
          .setDescription(
            "تم رفض طلب الشراء الخاص بك، وتمت إعادة النقاط إلى رصيدك بالكامل."
          )
          .addFields(
            {
              name: "📦 المنتج",
              value: itemName,
              inline: true
            },
            {
              name: "💰 النقاط المُعادة",
              value: `${price} 🪙`,
              inline: true
            },
            {
              name: "🏠 السيرفر",
              value: guildName,
              inline: false
            },
            {
              name: "🔴 الحالة",
              value: "تم الرفض",
              inline: true
            },
            {
              name: "👮 تمت المعالجة بواسطة",
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          )
          .setFooter({
            text: "Nexora • Shop"
          })
          .setTimestamp();

        await member.send({
          embeds: [rejectEmbed]
        }).catch(err => {
          console.log("⚠️ تعذر إرسال DM للمشتري:", err.message);
        });
      }

      return;
    }



  if (interaction.isModalSubmit()) {

    if (interaction.customId.startsWith("buy_input_")) {

      await interaction.deferReply({ ephemeral: true });

      const db = require("./database/connect");

      const itemId = interaction.customId.split("_")[2];
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const userInput = interaction.fields.getTextInputValue("user_input");

      db.get(
        "SELECT * FROM shop_items WHERE id=? AND guild_id=? AND enabled=1",
        [itemId, guildId],
        async (err, item) => {

          if (err || !item) {
            return interaction.editReply({
              content: "❌ المنتج غير موجود",
              ephemeral: true
            });
          }

          if (item.stock === 0) {
            return interaction.editReply({
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
              return interaction.editReply({
                content: "❌ لا يمكنك شراء هذا المنتج، يجب أن تمتلك الرتبة المطلوبة.",
                ephemeral: true
              });
            }
          }

          const settings = await db.get(
            "SELECT purchase_channel FROM settings WHERE guild_id=?",
            [guildId]
          );

          if (!settings?.purchase_channel) {
            return interaction.editReply({
              content: "❌ لم يتم تحديد قناة الطلبات.",
              ephemeral: true
            });
          }

          const channel = interaction.guild.channels.cache.get(
            settings.purchase_channel
          ) || await interaction.guild.channels
            .fetch(settings.purchase_channel)
            .catch(() => null);

          if (!channel || !channel.isTextBased()) {
            return interaction.editReply({
              content: "❌ قناة الطلبات غير موجودة أو غير صالحة.",
              ephemeral: true
            });
          }

          try {
            await db.transaction(async (tx) => {

              const balanceResult = await tx.run(
                `UPDATE users
                 SET total_points = total_points - ?
                 WHERE guild_id=? AND user_id=? AND total_points >= ?`,
                [item.price, guildId, userId, item.price]
              );

              if (!balanceResult || Number(balanceResult.rowCount || 0) === 0) {
                throw new Error("INSUFFICIENT_POINTS");
              }

              const stockResult = await tx.run(
                `UPDATE shop_items
                 SET stock = stock - 1
                 WHERE id=? AND guild_id=? AND enabled=1 AND stock > 0`,
                [item.id, guildId]
              );

              if (!stockResult || Number(stockResult.rowCount || 0) === 0) {
                throw new Error("OUT_OF_STOCK");
              }

              const purchaseResult = await tx.run(
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
                ]
              );

              if (!purchaseResult || Number(purchaseResult.rowCount || 0) === 0) {
                throw new Error("PURCHASE_INSERT_FAILED");
              }
            });

          } catch (err) {

            console.error(
              "❌ MODAL PURCHASE TRANSACTION ERROR:",
              err?.message || err
            );

            if (err?.message === "INSUFFICIENT_POINTS") {
              return interaction.editReply({
                content: "❌ رصيدك لا يكفي أو تعذر خصم النقاط.",
                ephemeral: true
              });
            }

            if (err?.message === "OUT_OF_STOCK") {
              return interaction.editReply({
                content: "❌ نفذت الكمية.",
                ephemeral: true
              });
            }

            return interaction.editReply({
              content: "❌ حدث خطأ أثناء تسجيل الطلب ولم يتم خصم النقاط.",
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

          try {
            const purchaseEmbed = new EmbedBuilder()
              .setTitle("🛒 طلب شراء جديد")
              .setDescription("تم استلام طلب شراء جديد ويحتاج إلى مراجعة الإدارة.")
              .addFields(
                {
                  name: "👤 العضو",
                  value: `<@${userId}>`,
                  inline: true
                },
                {
                  name: "🆔 معرف العضو",
                  value: userId,
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
                },
                {
                  name: `📝 ${item.input_name || "المعلومات"}`,
                  value: userInput || "لا توجد",
                  inline: false
                },
                {
                  name: "🟡 الحالة",
                  value: "قيد المراجعة",
                  inline: true
                }
              )
              .setThumbnail(
                interaction.user.displayAvatarURL({
                  extension: "png",
                  size: 256
                })
              )
              .setFooter({
                text: "Nexora • Purchases"
              })
              .setTimestamp();

            await sendPurchaseWebhook(
              channel,
              purchaseEmbed,
              [row]
            );
          } catch (sendErr) {
            console.error(
              "⚠️ MODAL BUY CHANNEL SEND FAILED, RETRYING:",
              sendErr
            );

            const freshChannel =
              await interaction.guild.channels
                .fetch(settings.purchase_channel)
                .catch(() => null);

            if (
              !freshChannel ||
              !freshChannel.isTextBased()
            ) {
              throw sendErr;
            }

            await sendPurchaseWebhook(
              freshChannel,
              purchaseEmbed,
              [row]
            );
          }

          await sendShopLog(interaction.guild, {
            title: "🛒 طلب شراء جديد",
            fields: [
              { name: "👤 العضو", value: `<@${userId}> (${userId})` },
              { name: "📦 المنتج", value: item.name, inline: true },
              { name: "💰 السعر", value: `${item.price} 🪙`, inline: true },
              { name: "📝 المعلومات", value: userInput || "لا توجد" }
            ]
          }).catch((logErr) => {
            console.error("⚠️ SHOP LOG ERROR:", logErr?.message || logErr);
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

          const buyerEmbed = new EmbedBuilder()
            .setTitle("✅ تم تسجيل طلبك")
            .setDescription("تم إنشاء طلب الشراء بنجاح، وهو الآن بانتظار مراجعة الإدارة.")
            .addFields(
              {
                name: "📦 المنتج",
                value: item.name,
                inline: true
              },
              {
                name: "💰 المبلغ المدفوع",
                value: `${item.price} 🪙`,
                inline: true
              },
              {
                name: `📝 ${item.input_name || "المعلومات"}`,
                value: userInput || "لا توجد",
                inline: false
              },
              {
                name: "🟡 الحالة",
                value: "قيد المراجعة",
                inline: true
              }
            )
            .setFooter({
              text: "Nexora • Shop"
            })
            .setTimestamp();

          return safeShopEmbedReply(interaction, buyerEmbed);


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
  console.log(`🌐 Dashboard running on port ${process.env.PORT || 15719}`);
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
