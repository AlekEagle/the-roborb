import { ApplicationCommandTypes, Client } from 'oceanic.js';
import { config } from 'dotenv';
import { exec } from 'node:child_process';

config();

const client = new Client({
  auth: `Bot ${process.env.TOKEN}`,
  gateway: {
    intents: ['GUILD_MESSAGES', 'GUILDS'],
  },
});

client.on('ready', async () => {
  console.log('Client is ready!');
  await client.application.bulkEditGlobalCommands([
    {
      type: ApplicationCommandTypes.CHAT_INPUT,
      name: 'orbify',
      description: 'Turn your beloved image into an orb.',
      options: [
        {
          type: 3,
          name: 'image',
          description: 'The image to orbify.',
          required: true,
        },
      ],
    },
  ]);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommandInteraction()) return;
  if (!interaction.isChatInputCommand()) return;
  switch (interaction.data.name) {
    case 'orbify': {
      const interactionMessage = await interaction.reply({
        content: 'Cramming your image into an orb...',
      });

      break;
    }
  }
});
client.connect();
