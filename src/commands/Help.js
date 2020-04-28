/**
 * Displays commands of the bot for a player, if arg match one command explain that command
 * @param {("fr"|"en")} language - Language to use in the response
 * @param {module:"discord.js".Message} message - Message from the discord server
 * @param {String[]} args=[] - Additional arguments sent with the command
 */
const HelpCommand = async (language, message, args) => {
  let helpMessage = Config.text[language].commands.help.commands[args[0]];

  if (helpMessage === undefined) {
    helpMessage = Config.text[language].commands.help.intro + message.author.username +
      Config.text[language].commands.help.main;
  }

  if (draftbot.client.guilds.cache.get(Config.MAIN_SERVER_ID)
    .members
    .cache
    .find(val => val.id === message.author.id) === undefined) {
    await message.author.send(Config.text[language].commands.help.mp);
  }

  await message.channel.send(helpMessage);
};

module.exports.HelpCommand = HelpCommand;
