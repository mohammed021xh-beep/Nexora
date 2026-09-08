const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/connect");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff-add")
    .setDescription("إضافة موظف")
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("العضو")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // مالك السيرفر فقط يستطيع إدارة الموظفين
    if (interaction.guild.ownerId !== userId) {
      return interaction.reply({
        content: "❌ فقط مالك السيرفر يستطيع إضافة الموظفين.",
        ephemeral: true
      });
    }

    const member = interaction.options.getUser("member");

    try {
      await db.run(
        `INSERT INTO staff (guild_id, user_id)
         VALUES (?, ?)
         ON CONFLICT (guild_id, user_id) DO NOTHING`,
        [guildId, member.id]
      );

      await interaction.reply({
        content: `✅ تم إضافة ${member} إلى الموظفين.`,
        ephemeral: true
      });

    } catch (err) {
      console.error("STAFF ADD ERROR:", err);

      await interaction.reply({
        content: "❌ حدث خطأ أثناء إضافة الموظف.",
        ephemeral: true
      });
    }
  }
};
