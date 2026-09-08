const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");
const checkStaffPermission = require("../utils/checkStaffPermission");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetpoints")
    .setDescription("تصفير نقاط جميع الأعضاء"),

  async execute(interaction) {

    if (!(await checkStaffPermission(interaction))) return;

    db.run(
      "UPDATE users SET text_points=0, voice_points=0, total_points=0 WHERE guild_id=?",
      [interaction.guild.id],
      function(err, result) {

        if (err) {
          console.error("❌ RESET POINTS ERROR:", err);

          return interaction.reply({
            content: "❌ خطأ أثناء التصفير",
            ephemeral: true
          });
        }

        const count = result?.rowCount ?? 0;

        interaction.reply({
          content: `✅ تم تصفير نقاط ${count} عضو`
        });

      }
    );
  }
};
