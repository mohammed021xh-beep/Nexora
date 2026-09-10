const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../database/connect");

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("عرض قائمة المتصدرين بالنقاط"),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;

    db.all(
      `SELECT user_id, total_points
       FROM users
       WHERE guild_id = ?
         AND total_points > 0
       ORDER BY total_points DESC`,
      [guildId],
      async (err, rows) => {
        if (err) {
          console.error("❌ Leaderboard DB Error:", err);

          return interaction.editReply({
            content: "❌ حدث خطأ أثناء جلب قائمة المتصدرين."
          });
        }

        if (!rows || rows.length === 0) {
          return interaction.editReply({
            content: "📭 لا يوجد أعضاء لديهم نقاط بعد."
          });
        }

        const members = [];

        for (const row of rows) {
          const member = await interaction.guild.members
            .fetch(row.user_id)
            .catch(() => null);

          members.push({
            userId: row.user_id,
            name: member ? member.displayName : "عضو غير موجود",
            points: Number(row.total_points || 0),
            member
          });
        }

        let page = 0;
        const totalPages = Math.ceil(members.length / PER_PAGE);

        const medals = ["🥇", "🥈", "🥉"];

        function createEmbed() {
          const start = page * PER_PAGE;
          const current = members.slice(start, start + PER_PAGE);

          let description =
            `**${interaction.guild.name}**\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n`;

          current.forEach((player, index) => {
            const position = start + index + 1;
            const rank = medals[position - 1] || `**#${position}**`;

            description +=
              `${rank} **${player.name}**\n` +
              `> ⭐ **${player.points.toLocaleString()} نقطة**\n\n`;
          });

          return new EmbedBuilder()
            .setTitle("🏆 قائمة المتصدرين")
            .setDescription(description)
            .setThumbnail(
              interaction.guild.iconURL({ dynamic: true })
            )
            .setFooter({
              text: `Nexora • الصفحة ${page + 1}/${totalPages} • ${members.length} عضو`
            })
            .setTimestamp();
        }

        function createButtons() {
          return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("leaderboard_previous")
              .setLabel("السابق")
              .setEmoji("◀️")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 0),

            new ButtonBuilder()
              .setCustomId("leaderboard_next")
              .setLabel("التالي")
              .setEmoji("▶️")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= totalPages - 1)
          );
        }

        const message = await interaction.editReply({
          embeds: [createEmbed()],
          components: totalPages > 1 ? [createButtons()] : []
        });

        if (totalPages <= 1) return;

        const collector = message.createMessageComponentCollector({
          time: 5 * 60 * 1000
        });

        collector.on("collect", async (buttonInteraction) => {
          if (
            buttonInteraction.user.id !== interaction.user.id
          ) {
            return buttonInteraction.reply({
              content: "❌ هذه القائمة ليست لك.",
              ephemeral: true
            });
          }

          if (buttonInteraction.customId === "leaderboard_previous") {
            if (page > 0) page--;
          }

          if (buttonInteraction.customId === "leaderboard_next") {
            if (page < totalPages - 1) page++;
          }

          await buttonInteraction.update({
            embeds: [createEmbed()],
            components: [createButtons()]
          });
        });

        collector.on("end", async () => {
          await interaction.editReply({
            components: []
          }).catch(() => {});
        });
      }
    );
  }
};
