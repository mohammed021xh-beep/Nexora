const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("تحويل")
    .setDescription("تحويل نقاط إلى عضو آخر")
    .addUserOption(option =>
      option
        .setName("العضو")
        .setDescription("العضو الذي سيستلم النقاط")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("المبلغ")
        .setDescription("عدد النقاط المراد تحويلها")
        .setMinValue(1)
        .setRequired(true)
    ),

  async execute(interaction) {
    const senderId = interaction.user.id;
    const receiver = interaction.options.getUser("العضو");
    const amount = interaction.options.getInteger("المبلغ");
    const guildId = interaction.guild.id;

    if (receiver.id === senderId) {
      return interaction.reply({
        content: "❌ لا يمكنك تحويل النقاط لنفسك.",
        ephemeral: true
      });
    }

    if (receiver.bot) {
      return interaction.reply({
        content: "❌ لا يمكنك تحويل النقاط إلى بوت.",
        ephemeral: true
      });
    }

    try {
      const sender = await db.get(
        `SELECT total_points
         FROM users
         WHERE guild_id=? AND user_id=?`,
        [guildId, senderId]
      );

      const senderPoints = Number(sender?.total_points || 0);

      if (senderPoints < amount) {
        return interaction.reply({
          content: `❌ رصيدك غير كافٍ. رصيدك الحالي: **${senderPoints}** نقطة.`,
          ephemeral: true
        });
      }

      await db.run(
        `INSERT INTO users
          (guild_id, user_id, total_points)
         VALUES (?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET
           total_points = users.total_points - EXCLUDED.total_points`,
        [guildId, senderId, amount]
      );

      await db.run(
        `INSERT INTO users
          (guild_id, user_id, total_points)
         VALUES (?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET
           total_points = users.total_points + EXCLUDED.total_points`,
        [guildId, receiver.id, amount]
      );

      const newBalance = senderPoints - amount;

      await interaction.reply({
        content:
          `✅ تم تحويل **${amount}** نقطة إلى ${receiver}.\n` +
          `💰 رصيدك الجديد: **${newBalance}** نقطة.`
      });

    } catch (err) {
      console.error("❌ TRANSFER ERROR:", err);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ حدث خطأ أثناء تحويل النقاط.",
          ephemeral: true
        });
      }
    }
  }
};
