const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");
const checkStaffPermission = require("../utils/checkStaffPermission");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removepoints")
    .setDescription("خصم نقاط من عضو")
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
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {

    if (!(await checkStaffPermission(interaction))) return;

    const member = interaction.options.getUser("member");
    const points = interaction.options.getInteger("points");

    db.get(
      "SELECT total_points FROM users WHERE guild_id=? AND user_id=?",
      [interaction.guild.id, member.id],
      (err, row) => {

        if (err) {
          return interaction.reply({
            content: "❌ حدث خطأ.",
            ephemeral: true
          });
        }

        if (!row) {
          return interaction.reply({
            content: "❌ هذا العضو لا يملك نقاطًا.",
            ephemeral: true
          });
        }

        const newPoints = Math.max(0, row.total_points - points);

        db.run(
          "UPDATE users SET total_points=? WHERE guild_id=? AND user_id=?",
          [newPoints, interaction.guild.id, member.id],
          (err) => {

            if (err) {
              return interaction.reply({
                content: "❌ حدث خطأ أثناء خصم النقاط.",
                ephemeral: true
              });
            }

            interaction.reply({
              content: `✅ تم خصم **${points}** نقطة من ${member}.\n📊 رصيده الحالي: **${newPoints}** نقطة.`
            });

          }
        );

      }
    );

  }
};
