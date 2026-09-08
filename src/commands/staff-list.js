const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");
const checkStaffPermission = require("../utils/checkStaffPermission");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff-list")
    .setDescription("عرض موظفي المتجر"),

  async execute(interaction) {

    if (!(await checkStaffPermission(interaction))) return;

    db.all(
      "SELECT user_id FROM staff WHERE guild_id=?",
      [interaction.guild.id],
      (err, rows) => {

        if (err) {
          return interaction.reply({
            content: "❌ خطأ في قاعدة البيانات",
            ephemeral: true
          });
        }

        if (!rows.length) {
          return interaction.reply({
            content: "❌ لا يوجد موظفون",
            ephemeral: true
          });
        }

        const list = rows.map(r => `• <@${r.user_id}>`).join("\n");

        interaction.reply({
          content: `👥 **موظفو المتجر:**\n\n${list}`,
          ephemeral: true
        });
      }
    );
  }
};
