/**
 * Main function of small event
 * @param {module:"discord.js".Message} message
 * @param {"fr"|"en"} language
 * @param {Entities} entity
 * @returns {Promise<>}
 */
const executeSmallEvent = async function (message, language, entity) {
	let randomPlayerOnMap = await MapLocations.getRandomPlayerOnMap(entity.Player.map_id, entity.Player.previous_map_id, entity.Player.id);
	let [otherEntity] = randomPlayerOnMap.length > 0 ? await Entities.getOrRegister(randomPlayerOnMap[0].discordUser_id) : [null];
	const tr = JsonReader.small_events.InteractOtherPlayers.getTranslation(language);
	if (!otherEntity) {
		return await message.channel.send(tr.no_one[randInt(0, tr.no_one.length)]);
	} else {
		const cList = [];

		const player = (await Players.getById(entity.Player.id))[0];
		const otherPlayer = (await Players.getById(otherEntity.Player.id))[0];
		let item = null;
		let guild = null;
		console.log(otherPlayer.rank);
		if (otherPlayer.rank === 1) {
			cList.push("top1");
		} else if (otherPlayer.rank <= 10) {
			cList.push("top10");
		} else if (otherPlayer.rank <= 50) {
			cList.push("top50");
		} else if (otherPlayer.rank <= 100) {
			cList.push("top100");
		}
		if (otherEntity.Player.badges) {
			if (otherEntity.Player.badges.includes("💎")) {
				cList.push("powerfulGuild");
			}
			if (otherEntity.Player.badges.includes("⚙️")) {
				cList.push("staffMember");
			}
		}
		if (otherEntity.Player.level < 10) {
			cList.push("beginner");
		} else if (otherEntity.Player.level >= 50) {
			cList.push("advanced");
		}
		if (otherEntity.Player.isInactive()) {
			cList.push("inactive");
		}
		if (otherEntity.Player.class && otherEntity.Player.class === entity.Player.class) {
			cList.push("sameClass");
		}
		if (otherEntity.Player.guild_id && otherEntity.Player.guild_id === entity.Player.guild_id) {
			cList.push("sameGuild");
		}
		if (otherPlayer.weeklyRank <= 5) {
			cList.push("topWeek");
		}
		const healthPercentage = otherEntity.health / await otherEntity.getMaxHealth();
		if (healthPercentage < 0.2) {
			cList.push("lowHP");
		} else if (healthPercentage === 1.0) {
			cList.push("fullHP");
		}
		if (otherPlayer.rank < player.rank) {
			cList.push("lowerRankThanHim");
		} else if (otherPlayer.rank > player.rank) {
			cList.push("betterRankThanHim");
		}
		if (otherEntity.Player.money > 20000) {
			cList.push("rich");
		} else if (otherEntity.Player.money < 200) {
			cList.push("poor");
		}
		if (otherEntity.Player.Inventory.potion_id !== JsonReader.models.inventories.potion_id && entity.Player.Inventory.potion_id === JsonReader.models.inventories.potion_id) {
			cList.push("duplicatePotion");
		}
		if (otherEntity.Player.pet_id) {
			cList.push("pet");
		}
		if (otherEntity.Player.guild_id) {
			guild = await Guilds.getById(otherEntity.Player.guild_id);
			if (guild.chief_id === otherEntity.Player.id) {
				cList.push("guildChief");
			} else if (guild.elder_id === otherEntity.Player.id) {
				cList.push("guildElder");
			}
		}
		cList.push("class");
		if (!otherEntity.checkEffect() && tr[otherEntity.effect]) {
			cList.push(otherEntity.effect);
		}
		if (otherEntity.Player.Inventory.weapon_id !== JsonReader.models.inventories.weapon_id) {
			cList.push("weapon");
		}
		if (otherEntity.Player.Inventory.armor_id !== JsonReader.models.inventories.armor_id) {
			cList.push("armor");
		}
		if (otherEntity.Player.Inventory.potion_id !== JsonReader.models.inventories.potion_id) {
			cList.push("potion");
		}
		if (otherEntity.Player.Inventory.object_id !== JsonReader.models.inventories.object_id) {
			cList.push("object");
		}

		const characteristic = cList[randInt(0, cList.length)];
		console.log(cList);
		console.log(characteristic);
		switch (characteristic) {
			case "weapon":
				item = await otherEntity.Player.Inventory.getWeapon();
				break;
			case "armor":
				item = await otherEntity.Player.Inventory.getArmor();
				break;
			case "duplicatePotion":
			case "potion":
				item = await otherEntity.Player.Inventory.getPotion();
				break;
			case "object":
				item = await otherEntity.Player.Inventory.getActiveObject();
				break;
		}
		let prefix_item = "";
		if (item) {
			if (item.french_plural === 1) {
				prefix_item = "ses";
			} else {
				if (item.french_masculine === 1) {
					prefix_item = "son";
				} else {
					prefix_item = "sa";
				}
			}
		}
		const msg = await message.channel.send(format(tr[characteristic][randInt(0, tr[characteristic].length)], {
			pseudo: await otherEntity.Player.getPseudo(language),
			level: otherEntity.Player.level,
			class: (await Classes.getById(otherEntity.Player.class))[language],
			advice: JsonReader.commands.report.getTranslation(language).advices[randInt(0, JsonReader.commands.report.getTranslation(language).advices.length)],
			pet_name: otherEntity.Player.Pet ? (PetEntities.getPetEmote(otherEntity.Player.Pet) + " " + (otherEntity.Player.Pet.nickname ? otherEntity.Player.Pet.nickname : PetEntities.getPetTypeName(otherEntity.Player.Pet, language))) : "",
			guild_name: guild ? guild.name : "",
			item: item ? item[language] : "",
			plural_item: item ? (item.french_plural === 1 ? "s" : "") : "",
			prefix_item: prefix_item,
		}));
		// TODO add reaction poor
		// TODO duplicate potion
		// TODO virer pseudos 404
	}
};

module.exports = {
	executeSmallEvent: executeSmallEvent
};