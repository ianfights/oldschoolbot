import { MessageEmbed } from 'discord.js';
import { randArrItem, roll } from 'e';
import { CommandStore, KlasaMessage } from 'klasa';
import { Bank } from 'oldschooljs';
import LootTable from 'oldschooljs/dist/structures/LootTable';

import { itemContractResetTime } from '../../lib/constants';
import { allMbTables, MysteryBoxes, PMBTable } from '../../lib/data/openables';
import { kalphiteKingLootTable } from '../../lib/kalphiteking';
import { AbyssalDragonLootTable } from '../../lib/minions/data/killableMonsters/custom/AbyssalDragon';
import { Ignecarus } from '../../lib/minions/data/killableMonsters/custom/Ignecarus';
import { VasaMagus } from '../../lib/minions/data/killableMonsters/custom/VasaMagus';
import { nexLootTable } from '../../lib/nex';
import { ClientSettings } from '../../lib/settings/types/ClientSettings';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { DragonTable } from '../../lib/simulation/grandmasterClue';
import { allThirdAgeItems, runeAlchablesTable } from '../../lib/simulation/sharedTables';
import { BotCommand } from '../../lib/structures/BotCommand';
import { addBanks, formatDuration, itemID, updateBankSetting, updateGPTrackSetting } from '../../lib/util';
import { formatOrdinal } from '../../lib/util/formatOrdinal';
import getOSItem from '../../lib/util/getOSItem';
import resolveItems from '../../lib/util/resolveItems';
import { LampTable } from '../../lib/xpLamps';

const contractTable = new LootTable()
	.every('Coins', [1_000_000, 3_500_000])
	.tertiary(50, LampTable)
	.tertiary(50, MysteryBoxes)
	.add(DragonTable, [1, 2], 2)
	.add(runeAlchablesTable, [1, 3], 3)
	.every(runeAlchablesTable, [1, 3])
	.add(
		new LootTable()
			.add('Clue scroll (beginner)', 1, 50)
			.add('Clue scroll (easy)', 1, 40)
			.add('Clue scroll (medium)', 1, 30)
			.add('Clue scroll (hard)', 1, 20)
			.add('Clue scroll (elite)', 1, 10)
			.add('Clue scroll (master)', 1, 5)
			.add('Clue scroll (Grandmaster)', 1, 2)
	);

const itemContractItems = Array.from(
	new Set([
		...allMbTables,
		...kalphiteKingLootTable.allItems.filter(i => i !== itemID('Baby kalphite king')),
		...AbyssalDragonLootTable.allItems,
		...VasaMagus.allItems,
		...Ignecarus.allItems.filter(i => i !== itemID('Dragon egg')),
		...nexLootTable.allItems,
		...PMBTable.allItems,
		...resolveItems([
			'Untradeable mystery box',
			'Tradeable mystery box',
			'Pet mystery box',
			'Holiday mystery box',
			'Klik',
			'Scruffy',
			'Shelldon',
			'Remy',
			'Divine sigil',
			'Wintertoad',
			'Hammy',
			'Dwarven bar',
			'Dwarven ore',
			'Magic banana',
			'Scroll of the hunt',
			'Scroll of longevity',
			'Scroll of life',
			'Scroll of proficiency'
		])
	])
);

function pickItemContract(streak: number) {
	let item = randArrItem(allMbTables);
	if (streak > 50) {
		let fifties = Math.floor(streak / 50);
		for (let i = 0; i < fifties; i++) {
			if (roll(95 + i * 5)) {
				item = randArrItem(allThirdAgeItems);
			}
		}
	}

	return item;
}

export default class DailyCommand extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			oneAtTime: true,
			cooldown: 5,
			categoryFlags: ['minion'],
			usage: '[str:...string]',
			aliases: ['ic']
		});
	}

	async run(msg: KlasaMessage, [str]: [string | undefined]) {
		await msg.author.settings.sync();
		const currentDate = new Date().getTime();
		const lastDate = msg.author.settings.get(UserSettings.LastItemContractDate);
		const difference = currentDate - lastDate;
		const totalContracts = msg.author.settings.get(UserSettings.TotalItemContracts);
		const streak = msg.author.settings.get(UserSettings.ItemContractStreak);
		const total = `\n\nYou've completed ${totalContracts} Item Contracts, you currently have a streak of ${streak}.`;

		if (msg.flagArgs.show && this.client.owners.has(msg.author)) {
			const t = new Bank();
			for (const i of itemContractItems) {
				t.add(i);
			}
			return msg.channel.sendBankImage({
				bank: t.bank,
				content: `There are ${
					itemContractItems.length
				} possible items to get. The average bot value of an itemcontract item is ${t.value() / t.length}`
			});
		}
		if (!msg.author.settings.get(UserSettings.CurrentItemContract)) {
			await msg.author.settings.update(UserSettings.CurrentItemContract, pickItemContract(streak));
		}
		const currentItem = getOSItem(msg.author.settings.get(UserSettings.CurrentItemContract)!);
		let durationRemaining = formatDuration(Date.now() - (lastDate + itemContractResetTime));

		const embed = new MessageEmbed().setThumbnail(
			`https://static.runelite.net/cache/item/icon/${currentItem.id}.png`
		);

		if (difference < itemContractResetTime) {
			return msg.channel.send(
				`You have no item contract available at the moment. Come back in ${durationRemaining}. ${total}`
			);
		}

		if (str === 'skip') {
			if (difference < itemContractResetTime) {
				return msg.channel.send({
					embeds: [
						embed.setDescription(
							`Your current contract is a ${currentItem.name} (Id: ${currentItem.id}), you can't skip it yet, you need to wait ${durationRemaining}. ${total}`
						)
					]
				});
			}

			if (!msg.flagArgs.confirm && !msg.flagArgs.cf && !msg.flagArgs.yes) {
				const sellMsg = await msg.channel.send({
					embeds: [
						embed.setDescription(
							`Are you sure you want to skip your item contract? You won't be able to get another contract for ${formatDuration(
								itemContractResetTime / 2
							)}. Say \`y\` to confirm.`
						)
					]
				});

				try {
					await msg.channel.awaitMessages({
						max: 1,
						time: 13_000,
						errors: ['time'],
						filter: _msg => _msg.author.id === msg.author.id && _msg.content.toLowerCase() === 'y'
					});
				} catch (err) {
					return sellMsg.edit('Cancelled.');
				}
			}
			const newItem = pickItemContract(streak);
			await msg.author.settings.update(
				UserSettings.LastItemContractDate,
				currentDate - itemContractResetTime / 2
			);
			await msg.author.settings.update(UserSettings.CurrentItemContract, newItem);
			await msg.author.settings.reset(UserSettings.ItemContractStreak);
			return msg.channel.send(
				`You skipped your item contract, your streak was reset, and your next contract will be available in ${formatDuration(
					itemContractResetTime / 2
				)}.`
			);
		}

		const userBank = msg.author.bank();
		const cost = new Bank().add(currentItem.id);
		if (!userBank.has(currentItem.id)) {
			embed.setDescription(
				`Your current contract is a ${currentItem.name} (Id: ${currentItem.id}), go get one!${total}`
			);
			return msg.channel.send({ embeds: [embed] });
		}

		if (!msg.flagArgs.confirm && !msg.flagArgs.cf) {
			const sellMsg = await msg.channel.send({
				embeds: [
					embed.setDescription(
						`Are you sure you want to hand over 1x ${currentItem.name} to complete your item contract? Say \`y\` to confirm.`
					)
				]
			});

			try {
				await msg.channel.awaitMessages({
					max: 1,
					time: 13_000,
					errors: ['time'],
					filter: _msg => _msg.author.id === msg.author.id && _msg.content.toLowerCase() === 'y'
				});
			} catch (err) {
				return sellMsg.edit('Cancelled.');
			}
		}

		const newStreak = streak + 1;

		const loot = new Bank().add(contractTable.roll());
		let gotBonus = '';
		for (const [kc, rolls] of [
			[100, 25],
			[50, 15],
			[25, 10],
			[10, 5]
		]) {
			if (newStreak % kc === 0) {
				gotBonus = `You got ${rolls} bonus rolls for your ${formatOrdinal(newStreak)} contract!`;
				for (let i = 0; i < rolls; i++) {
					loot.add(contractTable.roll());
					loot.add(runeAlchablesTable.roll());
					loot.add(runeAlchablesTable.roll());
					loot.add(runeAlchablesTable.roll());
					loot.add(runeAlchablesTable.roll());
					loot.add(runeAlchablesTable.roll());
				}
				break;
			}
		}

		await Promise.all([
			msg.author.settings.update(UserSettings.LastItemContractDate, currentDate),
			msg.author.settings.update(UserSettings.TotalItemContracts, totalContracts + 1),
			msg.author.settings.update(UserSettings.CurrentItemContract, pickItemContract(newStreak)),
			msg.author.settings.update(
				UserSettings.ItemContractBank,
				addBanks([msg.author.settings.get(UserSettings.ItemContractBank), cost.bank])
			),
			msg.author.removeItemsFromBank(cost),
			msg.author.addItemsToBank(loot),
			msg.author.settings.update(UserSettings.ItemContractStreak, newStreak)
		]);
		updateBankSetting(this.client, ClientSettings.EconomyStats.ItemContractCost, cost);
		updateBankSetting(this.client, ClientSettings.EconomyStats.ItemContractLoot, loot);
		updateGPTrackSetting(this.client, ClientSettings.EconomyStats.GPSourceItemContracts, loot.amount('Coins'));
		let res = `You handed in a ${currentItem.name} and received ${loot}. You've completed ${
			totalContracts + 1
		} Item Contracts, and your streak is now at ${newStreak}.`;
		if (gotBonus.length > 0) {
			res += `\n\n${gotBonus}`;
		}
		return msg.channel.send({ embeds: [embed.setDescription(res)] });
	}
}
