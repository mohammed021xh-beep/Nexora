const db = require("../database/connect");
const checkCommandSettings = require("../utils/checkCommandSettings");

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // ================================
    // 📝 تنفيذ اختصارات الأوامر الكتابية
    // ================================
    const content = message.content.trim();

    if (content) {
      try {
        // أول كلمة هي الاختصار، والباقي arguments للأمر
        const parts = content.split(/\s+/);
        const alias = parts[0].trim();

        const aliasRow = await db.get(
          "SELECT * FROM command_aliases WHERE guild_id = ? AND LOWER(alias) = LOWER(?)",
          [guildId, alias]
        );

        if (aliasRow) {
          const command = message.client.commands.get(aliasRow.command_name);

          if (command) {

            const permission = await checkCommandSettings({
              guildId,
              commandName: aliasRow.command_name,
              channelId: message.channel.id,
              member: message.member
            });

            if (!permission.allowed) {
              console.log(
                `⛔ TEXT COMMAND BLOCKED: ${message.author.tag} -> ${aliasRow.command_name} -> ${permission.reason}`
              );

              return message.reply({
                content: `⛔ ${permission.reason}`
              });
            }

            // العضو المذكور في المنشن
            const mentionedUser = message.mentions.users.first() || null;

            // نزيل المنشن من النص حتى لا يتم احتساب Discord ID كرقم نقاط
            const textWithoutMention = content
              .replace(/<@!?\d+>/g, "")
              .trim();

            // الأرقام الموجودة بعد إزالة المنشن
            const numberMatch = textWithoutMention.match(/(?:^|\s)(\d+)(?:\s|$)/);
            const amount = numberMatch ? Number(numberMatch[1]) : null;

            await command.execute({
              user: message.author,
              guild: message.guild,
              member: message.member,
              channel: message.channel,
              client: message.client,

              reply: async (data) => {
                if (typeof data === "string") {
                  return message.reply(data);
                }

                return message.reply(data);
              },

              editReply: async (data) => {
                return message.reply(data);
              },

              deferReply: async () => {},

              get deferred() {
                return false;
              },

              get replied() {
                return false;
              },

              createdTimestamp: message.createdTimestamp,

              options: {
                getUser: () => {
                  return mentionedUser;
                },

                getInteger: () => {
                  return amount;
                }
              }
            });

            console.log(
              `⌨️ TEXT COMMAND: ${message.author.tag} -> ${aliasRow.alias} -> ${aliasRow.command_name}`
            );
          }
        }
      } catch (error) {
        console.error("❌ TEXT COMMAND ERROR:", error);
      }
    }

    db.get(
      "SELECT * FROM settings WHERE guild_id = ?",
      [guildId],
      (err, settings) => {
        if (err) {
          console.error("❌ SETTINGS ERROR:", err);
          return;
        }

        console.log(
          "🧪 TEXT SETTINGS:",
          guildId,
          "text_enabled =", settings?.text_enabled,
          "type =", typeof settings?.text_enabled
        );

        // 📝 إيقاف نقاط الرسائل إذا كانت معطلة من الداشبورد
        if (Number(settings?.text_enabled ?? 1) !== 1) {
          console.log(
            "⛔ TEXT POINTS DISABLED:",
            guildId,
            userId
          );
          return;
        }

        const points = Number(settings?.text_points || 1);
        const minLength = Number(settings?.min_message_length || 10);
        const required = Number(settings?.messages_required || 1);

        if (message.content.length < minLength) return;

        db.get(
          "SELECT * FROM users WHERE guild_id = ? AND user_id = ?",
          [guildId, userId],
          (err, user) => {
            if (err) {
              console.error("❌ USER SELECT ERROR:", err);
              return;
            }

            if (!user) {
              return db.run(
                `INSERT INTO users
                 (guild_id, user_id, message_count)
                 VALUES (?, ?, 0)`,
                [guildId, userId]
              );
            }

            const count = Number(user.message_count || 0) + 1;

            console.log(
              `[POINTS] ${message.author.tag}: ${count}/${required}`
            );

            if (count >= required) {
              db.run(
                `UPDATE users
                 SET text_points = text_points + ?,
                     total_points = total_points + ?,
                     message_count = 0
                 WHERE guild_id = ? AND user_id = ?`,
                [points, points, guildId, userId],
                err => {
                  if (err) {
                    console.error("❌ POINT UPDATE ERROR:", err);
                    return;
                  }

                  console.log(
                    `[POINTS] ${message.author.tag}: +${points} نقطة`
                  );
                }
              );
            } else {
              db.run(
                `UPDATE users
                 SET message_count = ?
                 WHERE guild_id = ? AND user_id = ?`,
                [count, guildId, userId],
                err => {
                  if (err) {
                    console.error("❌ COUNT UPDATE ERROR:", err);
                  }
                }
              );
            }
          }
        );
      }
    );
  }
};
