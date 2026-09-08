const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");
const checkStaffPermission = require("../utils/checkStaffPermission");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("givepoints")
    .setDescription("إعطاء نقاط لعضو")
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("points")
        .setDescription("عدد النقاط")
        .setMinValue(1)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await checkStaffPermission(interaction))) return;

    const member = interaction.options.getUser("member");
    const points = interaction.options.getInteger("points");

    try {
      await db.run(
        `INSERT INTO users
          (guild_id, user_id, total_points)
         VALUES (?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET
           total_points = users.total_points + EXCLUDED.total_points`,
        [interaction.guild.id, member.id, points]
      );

      await interaction.reply({
        content: `✅ تم إضافة **${points}** نقطة إلى ${member}.`
      });

    } catch (err) {
      console.error("❌ GIVEPOINTS ERROR:", err);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ حدث خطأ أثناء إضافة النقاط.",
          ephemeral: true
        });
      }
    }
  }
};
