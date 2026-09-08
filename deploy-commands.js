require("dotenv").config();

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];

const commandsPath = path.join(__dirname, "src/commands");
const files = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js") && !file.includes(".backup") && !file.endsWith(".bak.js"));

for (const file of files) {
  const command = require(`./src/commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⏳ تسجيل الأوامر...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ تم تسجيل الأوامر");
  } catch (error) {
    console.error(error);
  }
})();
