const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");
const checkStaffPermission = require("../utils/checkStaffPermission");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff-remove")
    .setDescription("إزالة موظف")
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("الموظف")
        .setRequired(true)
    ),

  async execute(interaction) {

    if (!(await checkStaffPermission(interaction))) return;

    const member = interaction.options.getUser("member");

    db.run(
      "DELETE FROM staff WHERE guild_id=? AND user_id=?",
      [interaction.guild.id, member.id],
      function(err) {

        if (err) {
          return interaction.reply({
            content: "❌ حدث خطأ",
            ephemeral: true
          });
        }

        if (this.changes === 0) {
          return interaction.reply({
            content: "❌ هذا العضو ليس موظفًا",
            ephemeral: true
          });
        }

        interaction.reply({
          content: `✅ تم حذف ${member} من الموظفين`,
          ephemeral: true
        });

      }
    );
  }
};
