const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const db = require("../database/connect");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("عرض رصيدك"),

  async execute(interaction) {
    console.log(
      "START balance",
      interaction.user.id,
      "AGE:",
      Date.now() - interaction.createdTimestamp,
      "ms"
    );

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const user = await db.get(
        "SELECT * FROM users WHERE guild_id=? AND user_id=?",
        [guildId, userId]
      );

      if (!user) {
        return interaction.editReply("ليس لديك رصيد بعد");
      }

      const currency = await db.get(
        "SELECT * FROM currencies WHERE guild_id=? AND enabled=1 LIMIT 1",
        [guildId]
      );

      const name = currency?.name || "Points";
      const symbol = currency?.symbol || "⭐";

      // عدد الأعضاء المسجلين في نظام النقاط
      const totalMembers = await db.get(
        "SELECT COUNT(*)::int AS count FROM users WHERE guild_id=?",
        [guildId]
      );

      // ترتيب العضو حسب النقاط
      const rank = await db.get(
        `SELECT COUNT(*)::int + 1 AS rank
         FROM users
         WHERE guild_id=?
         AND total_points > ?`,
        [guildId, user.total_points]
      );

      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);

      const displayName =
        member?.displayName ||
        interaction.member?.displayName ||
        interaction.user.username;

      const avatar = member?.displayAvatarURL({
        extension: "png",
        size: 256
      }) || interaction.user.displayAvatarURL({
        extension: "png",
        size: 256
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: "🏆 NEXORA • BALANCE"
        })
        .setThumbnail(avatar)
        .setDescription(
          `**${displayName}**\n\n` +
          `## ${symbol} ${Number(user.total_points).toLocaleString()} نقطة\n\n` +
          `🏅 **المركز #${rank.rank}**\n` +
          `من أصل **${totalMembers.count} عضو**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💬 **نقاط الرسائل**\n` +
          `\`${Number(user.text_points).toLocaleString()}\`\n\n` +
          `🎙️ **نقاط الصوت**\n` +
          `\`${Number(user.voice_points).toLocaleString()}\``
        )
        .setFooter({
          text: `NEXORA • ${interaction.guild.name}`
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("BALANCE ERROR:", error);

      if (interaction.deferred && !interaction.replied) {
        await interaction
          .editReply("حدث خطأ أثناء عرض الرصيد")
          .catch(() => {});
      }
    }
  }
};
