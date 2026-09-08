const db = require("../database/connect");
const isStaff = require("./checkStaff");

module.exports = async function checkStaffPermission(interaction) {
  const guild = interaction.guild;

  if (!guild) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ هذا الأمر لا يمكن استخدامه هنا.",
        ephemeral: true
      });
    }
    return false;
  }

  const userId = interaction.user.id;
  const guildId = guild.id;

  // Owner السيرفر لديه تحكم كامل دائماً
  if (guild.ownerId === userId) {
    return true;
  }

  // باقي المستخدمين يجب أن يكونوا Staff
  if (await isStaff(guildId, userId)) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: "❌ ليس لديك صلاحية. يجب أن تكون موظفاً في البوت.",
      ephemeral: true
    });
  }

  return false;
};
