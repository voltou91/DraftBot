const Op = require('sequelize/lib/operators');
const Maps = require('../../core/Maps')

/**
 * Allow the user to learn more about what is going on with his character
 * @param {("fr"|"en")} language - Language to use in the response
 * @param {module:"discord.js".Message} message - Message from the discord server
 * @param {String[]} args=[] - Additional arguments sent with the command
 * @param {Number} forceSpecificEvent - For testing purpose
 */
const ReportCommand = async function (language, message, args, forceSpecificEvent = -1, forceSmallEvent = null) {
	const [entity] = await Entities.getOrRegister(message.author.id);

	if ((await canPerformCommand(message, language, PERMISSION.ROLE.ALL, [EFFECT.DEAD], entity)) !== true) {
		return;
	}
	if (await sendBlockedError(message.author, message.channel, language)) {
		return;
	}
	await addBlockedPlayer(entity.discordUser_id, "cooldown");
	setTimeout(() => {
		if (hasBlockedPlayer(entity.discordUser_id)) {
			removeBlockedPlayer(entity.discordUser_id);
			if (getBlockedPlayer(entity.discordUser_id) && getBlockedPlayer(entity.discordUser_id).context === "cooldown") {
				removeBlockedPlayer(entity.discordUser_id);
			}
		}
	}, 500);

	if (entity.Player.score === 0 && entity.effect === EFFECT.BABY) {
		const event = await Events.findOne({where: {id: 0}});
		return await doEvent(message, language, event, entity, REPORT.TIME_BETWEEN_BIG_EVENTS / 1000 / 60, 100);
	}

	if (!Maps.isTravelling(entity.Player)) {
		return await chooseDestination(entity, message, language);
	}

	if (needBigEvent(entity)) {
		return await doRandomBigEvent(message, language, entity, forceSpecificEvent);
	}

	const smallEventNumber = triggersSmallEvent(entity);
	if (forceSmallEvent != null || smallEventNumber !== -1) {
		return await executeSmallEvent(message, language, entity, smallEventNumber, forceSmallEvent);
	}

	return await sendTravelPath(entity, message, language);
}

/**
 * Picks a random event (or the forced one) and executes it
 * @param {module:"discord.js".Message} message
 * @param {"fr"|"en"} language
 * @param {Entities} entity
 * @param {Number} forceSpecificEvent
 * @returns {Promise<void>}
 */
const doRandomBigEvent = async function(message, language, entity, forceSpecificEvent) {
	let time;
	if (forceSpecificEvent === -1) {
		time = millisecondsToMinutes(message.createdAt.getTime() - entity.Player.lastReportAt.valueOf());
	} else {
		time = JsonReader.commands.report.timeMaximal + 1;
	}
	if (time > JsonReader.commands.report.timeLimit) {
		time = JsonReader.commands.report.timeLimit;
	}

	const Sequelize = require('sequelize');
	let event;

	// nextEvent is defined ?
	if (entity.Player.nextEvent !== undefined && entity.Player.nextEvent !== null) {
		forceSpecificEvent = entity.Player.nextEvent;
	}

	if (forceSpecificEvent === -1) {
		event = await Events.findOne({
			where: {
				[Op.and]: [
					{id: {[Op.gt]: 0}},
					{id: {[Op.lt]: 9999}},
				]
			}, order: Sequelize.literal('RANDOM()')
		});
	} else {
		event = await Events.findOne({where: {id: forceSpecificEvent}});
	}
	await Maps.stopTravel(entity.Player);
	return await doEvent(message, language, event, entity, time);
}

/**
 * If the entity reached his destination (= big event)
 * @param {Entities} entity
 * @returns {boolean}
 */
const needBigEvent = function(entity) {
	return Maps.getTravellingTime(entity.Player) >= REPORT.TIME_BETWEEN_BIG_EVENTS;
}

/**
 * Sends an embed with the travel path and an advice
 * @param {Entities} entity
 * @param {module:"discord.js".Message} message
 * @param {"fr"|"en"} language
 * @returns {Promise<Message>}
 */
const sendTravelPath = async function(entity, message, language) {
	let travelEmbed = new discord.MessageEmbed();
	const tr = JsonReader.commands.report.getTranslation(language);
	travelEmbed.setAuthor(tr.travelPathTitle, message.author.displayAvatarURL());
	travelEmbed.setDescription(await Maps.generateTravelPathString(entity.Player, language));
	travelEmbed.addField(tr.startPoint, (await MapLocations.getById(entity.Player.previous_map_id)).getDisplayName(language), true);
	travelEmbed.addField(tr.progression, (Math.floor(10000 * Maps.getTravellingTime(entity.Player) / REPORT.TIME_BETWEEN_BIG_EVENTS) / 100.0) + "%", true);
	travelEmbed.addField(tr.endPoint, (await MapLocations.getById(entity.Player.map_id)).getDisplayName(language), true);
	travelEmbed.addField(tr.adviceTitle, tr.advices[randInt(0, tr.advices.length - 1)], false);
	return await message.channel.send(travelEmbed);
}

const destinationChoiceEmotes = ["1⃣", "2⃣", "3⃣", "4⃣", "5⃣", "6⃣", "7⃣", "8⃣", "9⃣"];

/**
 * Executes the choice of the next destination
 * @param {Entities} entity
 * @param {module:"discord.js".Message} message
 * @param {"fr"|"en"} language
 * @returns {Promise<void>}
 */
const chooseDestination = async function(entity, message, language) {
	await PlayerSmallEvents.removeSmallEventsOfPlayer(entity.Player.id);
	const destinationMaps = await Maps.getNextPlayerAvailableMaps(entity.Player);
	// TODO mettre le temps ici comme ça ça bloque pas si le bot crash
	if (destinationMaps.length === 1) {
		await Maps.startTravel(entity.Player, destinationMaps[0]);
		return await destinationChoseMessage(entity, destinationMaps[0], message, language);
	}

	const tr = JsonReader.commands.report.getTranslation(language);
	let chooseDestinationEmbed = new discord.MessageEmbed();
	chooseDestinationEmbed.setAuthor(format(tr.destinationTitle, { pseudo: message.author.username }), message.author.displayAvatarURL());
	let desc = tr.chooseDestinationIndications + "\n";
	for (let i = 0; i < destinationMaps.length; ++i) {
		const map = await MapLocations.getById(destinationMaps[i]);
		desc += destinationChoiceEmotes[i] + " - " + map.getDisplayName(language) + "\n";
	}
	chooseDestinationEmbed.setDescription(desc);

	const sentMessage = await message.channel.send(chooseDestinationEmbed);

	const collector = sentMessage.createReactionCollector((reaction, user) => {
		return destinationChoiceEmotes.indexOf(reaction.emoji.name) !== -1 && user.id === message.author.id;
	}, { time: 120000 });

	collector.on('collect', async () => {
		collector.stop();
	});

	collector.on('end', async (collected) => {
		const mapId = collected.first() ? destinationMaps[destinationChoiceEmotes.indexOf(collected.first().emoji.name)] : destinationMaps[randInt(0, destinationMaps.length - 1)];
		await Maps.startTravel(entity.Player, mapId);
		await destinationChoseMessage(entity, mapId, message, language);
	});

	for (let i = 0; i < destinationMaps.length; ++i) {
		try {
			await sentMessage.react(destinationChoiceEmotes[i]);
		} catch (e) {
			console.error(e);
		}
	}
}

/**
 * Function called to display the direction chose by a player
 * @param entity
 * @param map
 * @param message
 * @param language
 * @returns {Promise<void>}
 */
const destinationChoseMessage = async function(entity, map, message, language) {
	const tr = JsonReader.commands.report.getTranslation(language);
	const typeTr = JsonReader.models.maps.getTranslation(language);
	const mapInstance = await MapLocations.getById(map);
	let destinationEmbed = new discord.MessageEmbed();
	destinationEmbed.setAuthor(format(tr.destinationTitle, { pseudo: message.author.username }), message.author.displayAvatarURL());
	destinationEmbed.setDescription(format(tr.choseMap, {
		mapPrefix: typeTr.types[mapInstance.type].prefix,
		mapName: mapInstance.getDisplayName(language),
		mapType: typeTr.types[mapInstance.type].name.toLowerCase()
	}));
	await message.channel.send(destinationEmbed);
}

/*const ReportCommand = async function (language, message, args, forceSpecificEvent = -1) {
	const [entity] = await Entities.getOrRegister(message.author.id);

	if ((await canPerformCommand(message, language, PERMISSION.ROLE.ALL, [EFFECT.DEAD], entity)) !== true) {
		return;
	}
	if (await sendBlockedError(message.author, message.channel, language)) {
		return;
	}
	await addBlockedPlayer(entity.discordUser_id, "cooldown");
	setTimeout(() => {
		if (hasBlockedPlayer(entity.discordUser_id)) {
			removeBlockedPlayer(entity.discordUser_id);
			if (getBlockedPlayer(entity.discordUser_id).context === "cooldown") {
				removeBlockedPlayer(entity.discordUser_id);
			}
		}
	}, 500);

	let time;
	if (forceSpecificEvent === -1) {
		time = millisecondsToMinutes(message.createdAt.getTime() - entity.Player.lastReportAt.valueOf());
	} else {
		time = JsonReader.commands.report.timeMaximal + 1;
	}
	if (time > JsonReader.commands.report.timeLimit) {
		time = JsonReader.commands.report.timeLimit;
	}

	if (entity.Player.score === 0 && entity.effect === EFFECT.BABY) {
		const event = await Events.findOne({where: {id: 0}});
		return await doEvent(message, language, event, entity, time, 100);
	}

	if (time < JsonReader.commands.report.timeMinimal) {
		if (entity.currentEffectFinished()) {
			return await message.channel.send(format(JsonReader.commands.report.getTranslation(language).noReport, {pseudo: message.author }));
		} else {
			return await canPerformCommand(message, language, PERMISSION.ROLE.ALL, [entity.effect], entity);
		}
	}

	if (time <= JsonReader.commands.report.timeMaximal && draftbotRandom.integer(0, JsonReader.commands.report.timeMaximal - 1) > time) {
		return await doPossibility(message, language, await Possibilities.findAll({where: {event_id: 9999}}), entity, time);
	}

	const Sequelize = require('sequelize');
	let event;

	// nextEvent is defined ?
	if (entity.Player.nextEvent !== undefined && entity.Player.nextEvent !== null) {
		forceSpecificEvent = entity.Player.nextEvent;
	}

	if (forceSpecificEvent === -1) {
		event = await Events.findOne({
			where: {
				[Op.and]: [
					{id: {[Op.gt]: 0}},
					{id: {[Op.lt]: 9999}},
				]
			}, order: Sequelize.literal('RANDOM()')
		});
	} else {
		event = await Events.findOne({where: {id: forceSpecificEvent}});
	}
	return await doEvent(message, language, event, entity, time);
};*/

/**
 * @param {module:"discord.js".Message} message - Message from the discord server
 * @param {("fr"|"en")} language - Language to use in the response
 * @param {Event} event
 * @param {Entities} entity
 * @param {Number} time
 * @param {Number} forcePoints Force a certain number of points to be given instead of random
 * @return {Promise<void>}
 */
const doEvent = async (message, language, event, entity, time, forcePoints = 0) => {
	const eventDisplayed = await message.channel.send(format(JsonReader.commands.report.getTranslation(language).doEvent, {
		pseudo: message.author,
		event: event[language]
	}));
	const reactions = await event.getReactions();
	const collector = eventDisplayed.createReactionCollector((reaction, user) => {
		return (reactions.indexOf(reaction.emoji.name) !== -1 && user.id === message.author.id);
	}, {time: 120000});

	await addBlockedPlayer(entity.discordUser_id, "report", collector);

	collector.on('collect', async (reaction) => {
		collector.stop();
		const possibility = await Possibilities.findAll({
			where: {
				event_id: event.id,
				possibilityKey: reaction.emoji.name
			}
		});
		await doPossibility(message, language, possibility, entity, time, forcePoints);
	});

	collector.on('end', async (collected) => {
		if (!collected.first()) {
			const possibility = await Possibilities.findAll({where: {event_id: event.id, possibilityKey: 'end'}});
			await doPossibility(message, language, possibility, entity, time, forcePoints);
		}
	});
	for (const reaction of reactions) {
		if (reaction !== 'end') {
			await eventDisplayed.react(reaction).catch();
		}
	}
};

/**
 * @param {module:"discord.js".Message} message - Message from the discord server
 * @param {("fr"|"en")} language - Language to use in the response
 * @param {Possibility} possibility
 * @param {Entity} entity
 * @param {Number} time
 * @param {Number} forcePoints Force a certain number of points to be given instead of random
 * @return {Promise<Message>}
 */
const doPossibility = async (message, language, possibility, entity, time, forcePoints = 0) => {
	[entity] = await Entities.getOrRegister(entity.discordUser_id);
	const player = entity.Player;

	if (possibility.length === 1) { //Don't do anything if the player ends the first report
		if (possibility[0].dataValues.event_id === 0 && possibility[0].dataValues.possibilityKey === "end") {
			removeBlockedPlayer(entity.discordUser_id);
			return await message.channel.send(format(JsonReader.commands.report.getTranslation(language).doPossibility, {
				pseudo: message.author,
				result: "",
				event: possibility[0].dataValues[language]
			}));
		}
	}

	possibility = possibility[randInt(0, possibility.length)];
	const pDataValues = possibility.dataValues;
	let scoreChange;
	if (forcePoints !== 0) {
		scoreChange = forcePoints;
	} else {
		scoreChange = time + draftbotRandom.integer(0, time / 10 + player.level - 1);
	}
	let moneyChange = pDataValues.money + Math.round(time / 10 + draftbotRandom.integer(0, time / 10 + player.level / 5 - 1));
	if (pDataValues.money < 0 && moneyChange > 0) {
		moneyChange = Math.round(pDataValues.money / 2);
	}

	let result = '';
	result += format(JsonReader.commands.report.getTranslation(language).points, {score: scoreChange});
	if (moneyChange !== 0) {
		result += (moneyChange >= 0) ? format(JsonReader.commands.report.getTranslation(language).money, {money: moneyChange}) : format(JsonReader.commands.report.getTranslation(language).moneyLoose, {money: -moneyChange});
	}
	if (pDataValues.experience > 0) {
		result += format(JsonReader.commands.report.getTranslation(language).experience, {experience: pDataValues.experience});
	}
	if (pDataValues.health < 0) {
		result += format(JsonReader.commands.report.getTranslation(language).healthLoose, {health: -pDataValues.health});
	}
	if (pDataValues.health > 0) {
		result += format(JsonReader.commands.report.getTranslation(language).health, {health: pDataValues.health});
	}
	if (pDataValues.lostTime > 0 && pDataValues.effect === ":clock2:") {
		result += format(JsonReader.commands.report.getTranslation(language).timeLost, {timeLost: minutesToString(pDataValues.lostTime)});
	}
	result = format(JsonReader.commands.report.getTranslation(language).doPossibility, {
		pseudo: message.author,
		result: result,
		event: possibility[language]
	});

	entity.effect = pDataValues.effect;
	await entity.addHealth(pDataValues.health);

	player.addScore(scoreChange);
	player.addWeeklyScore(scoreChange);
	player.addMoney(moneyChange);
	player.experience += possibility.experience;

	if (pDataValues.nextEvent !== undefined) {
		player.nextEvent = pDataValues.nextEvent;
	}

	if (pDataValues.event_id !== 0) {
		player.setLastReportWithEffect(message.createdTimestamp, pDataValues.lostTime, pDataValues.effect);
	} else {
		player.setLastReportWithEffect(0, pDataValues.lostTime, pDataValues.effect);
	}

	if (pDataValues.item === true) {
		await giveRandomItem((await message.guild.members.fetch(entity.discordUser_id)).user, message.channel, language, entity);
	}

	if (pDataValues.eventId === 0) {
		player.money = 0;
		player.score = 0;
		if (pDataValues.emoji !== 'end') {
			player.money = 10;
			player.score = 100;
		}
	}

	let resultMsg = await message.channel.send(result);

	removeBlockedPlayer(entity.discordUser_id);

	while (player.needLevelUp()) {
		await player.levelUpIfNeeded(entity, message.channel, language);
	}

	if (!await player.killIfNeeded(entity, message.channel, language)) {
		await chooseDestination(entity, message, language);
	}

	entity.save();
	player.save();

	return resultMsg;
};

/* ---------------------------------------------------------------
											SMALL EVENTS FUNCTIONS
--------------------------------------------------------------- */

/**
 * Returns the number of the small event to trigger or -1 if none has to be executed
 * @param {Entities} entity
 * @returns {number}
 */
const triggersSmallEvent = (entity) => {
	const now = new Date();
	const timeBetweenSmallEvents = REPORT.TIME_BETWEEN_BIG_EVENTS / (REPORT.SMALL_EVENTS_COUNT + 1);
	for (let i = 1; i <= REPORT.SMALL_EVENTS_COUNT; ++i) {
		const seBefore = entity.Player.start_travel_date.getTime() + (i * timeBetweenSmallEvents);
		const seAfter = entity.Player.start_travel_date.getTime() + ((i + 1) * timeBetweenSmallEvents);
		if (seBefore < now.getTime() && seAfter > now.getTime()) {
			for (let se of entity.Player.PlayerSmallEvents) {
				if (se.number === i) {
					return -1;
				}
			}
			return i;
		}
	}
	return -1;
}

let totalSmallEventsRarity = null;

const executeSmallEvent = async (message, language, entity, number, forced) => {

	// Pick random event
	let event;
	if (forced === null) {
		const small_events = JsonReader.small_events.small_events;
		const keys = Object.keys(small_events);
		if (totalSmallEventsRarity === null) {
			totalSmallEventsRarity = 0;
			for (let i = 0; i < keys.length; ++i) {
				totalSmallEventsRarity += small_events[keys[i]].rarity;
			}
		}
		let random_nb = randInt(1, totalSmallEventsRarity);
		let cumul = 0;
		for (let i = 0; i < keys.length; ++i) {
			cumul += small_events[keys[i]].rarity;
			if (cumul >= random_nb) {
				event = keys[i];
				break;
			}
		}
	}
	else {
		event = forced;
	}

	// Execute the event
	switch (event) {
		case "shop":
		case "pet_interaction":
		case "find_pet":
		case "find_item":
		case "nothing":
		case "small_bad_event":
		case "big_bad_event":
		case "interact_other_players": // Ce serait cool avec un petit message en fonction du niveau, du classement etc...
		case "win_health":
		case "bot_vote":
		case "staff_member_meet":
		case "personal_xp":
		case "guild_xp":
		case "class_event":
			await message.channel.send("TODO: " + event);
			break;
	}

	// Save
	PlayerSmallEvents.createPlayerSmallEvent(entity.Player.id, event, number).save();
}

/* ------------------------------------------------------------ */

module.exports = {
	commands: [
		{
			name: 'report',
			func: ReportCommand,
			aliases: ['r']
		}
	]
};