const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const db = require("../database/connect");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("عرض متجر السيرفر"),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      console.log("🛒 SHOP START:", guildId);

      console.log("🛒 SHOP DB QUERY...");
      const items = await db.all(
        "SELECT * FROM shop_items WHERE guild_id=? AND enabled=1",
        [guildId]
      );

      console.log("🛒 SHOP DB RESULT:", items?.length);

      if (!items || items.length === 0) {
        return interaction.reply({
          content: "🛒 المتجر فارغ حالياً.",
          ephemeral: true
        });
      }

      const options = items.slice(0, 25).map((item) => ({
        label: String(item.name).slice(0, 100),
        value: String(item.id),
        description: `السعر: ${item.price} 🪙`.slice(0, 100)
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId("shop_select")
        .setPlaceholder("🛒 اختر منتجاً من المتجر")
        .addOptions(options);

      const row = new ActionRowBuilder()
        .addComponents(menu);

      const embed = new EmbedBuilder()
        .setTitle("🛒 متجر السيرفر")
        .setDescription(
          "اختر المنتج الذي تريد شراءه من القائمة أدناه.\n\n" +
          "📦 اختر منتجاً لعرض تفاصيله وسعره."
        );

      return interaction.reply({
        embeds: [embed],
        components: [row]
      });

    } catch (err) {
      console.error("❌ SHOP COMMAND ERROR:", err);

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ حدث خطأ أثناء تحميل المتجر.",
          ephemeral: true
        });
      }
    }
  }
};
