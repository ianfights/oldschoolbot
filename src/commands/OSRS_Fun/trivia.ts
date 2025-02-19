import fs from 'fs';
import { CommandStore, KlasaMessage, KlasaUser } from 'klasa';

import { BotCommand } from '../../lib/structures/BotCommand';

let triviaQuestions: any = null;
try {
	// eslint-disable-next-line prefer-destructuring
	triviaQuestions = JSON.parse(
		fs.readFileSync('./src/lib/resources/trivia-questions.json').toString()
	).triviaQuestions;
} catch (err) {
	console.log('No trivia questions file found. Disabling trivia command.');
}

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			aliases: ['t'],
			description: 'Sends a OSRS related trivia question.',
			examples: ['+t'],
			categoryFlags: ['fun'],
			usage: '[user:user]'
		});
	}

	async init() {
		if (!triviaQuestions) this.disable();
	}

	async run(msg: KlasaMessage, [user]: [KlasaUser | undefined]) {
		if (!msg.channel.__triviaQuestionsDone || msg.channel.__triviaQuestionsDone.length === triviaQuestions.length) {
			msg.channel.__triviaQuestionsDone = [];
		}

		const triviaDuelUsers: [KlasaUser, KlasaUser] | null = user === undefined ? null : [msg.author, user];

		const [item, index] = this.findNewTrivia(msg.channel.__triviaQuestionsDone);
		msg.channel.__triviaQuestionsDone.push(index);
		await msg.channel.send(
			triviaDuelUsers === null
				? item.q
				: `**Trivia Duel between ${msg.author.username} and ${user!.username}:** ${item.q}`
		);
		try {
			const collected = await msg.channel.awaitMessages({
				max: 1,
				time: 30_000,
				errors: ['time'],
				filter: answer => {
					if (!item.a.includes(answer.content.toLowerCase())) return false;
					if (triviaDuelUsers) {
						return triviaDuelUsers.includes(answer.author);
					}
					return true;
				}
			});
			const winner = collected.first()!;
			if (triviaDuelUsers) {
				return msg.channel.send(`${winner.author} won the trivia duel with \`${winner.content}\`!`);
			}
			return msg.channel.send(`${winner.author} had the right answer with \`${winner.content}\`!`);
		} catch (err) {
			return msg.channel.send('Nobody answered correctly.');
		}
	}

	findNewTrivia(_triviaQuestionsDone: any[]): any {
		const index = Math.floor(Math.random() * triviaQuestions.length);
		if (!_triviaQuestionsDone.includes(index)) {
			return [triviaQuestions[index], index];
		}
		return this.findNewTrivia(_triviaQuestionsDone);
	}
}
