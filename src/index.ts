import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Client,
  CreateApplicationCommandOptions,
} from 'oceanic.js';
import { config } from 'dotenv';
import { exec } from 'node:child_process';
import { writeFile, readFile, mkdir } from 'node:fs/promises';

config();

const client = new Client({
  auth: `Bot ${process.env.TOKEN}`,
  gateway: {
    intents: ['GUILD_MESSAGES', 'GUILDS'],
  },
});

const TEST_SERVER = '456542159210807307';

const commands: any = [
  {
    type: ApplicationCommandTypes.CHAT_INPUT,
    name: 'orbify',
    description: 'Turn your beloved image into an orb.',
    options: [
      {
        type: ApplicationCommandOptionTypes.ATTACHMENT,
        name: 'image',
        description: 'The image to orbify.',
        required: true,
      },
    ],
  },
];

client.on('ready', async () => {
  console.log('Client is ready!');
  await client.application.bulkEditGlobalCommands(commands);
  await client.application.bulkEditGuildCommands(TEST_SERVER, commands);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommandInteraction()) return;
  if (!interaction.isChatInputCommand()) return;
  switch (interaction.data.name) {
    case 'orbify': {
      const interactionMessage = await interaction.reply({
        content: 'Downloading your image...',
      });

      const image = interaction.data.options.getAttachment('image')!;

      await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });

      // Download the image to the local filesystem
      const imageDownload = fetch(image.url);
      const imageBuffer = await imageDownload.then((res) => res.bytes());
      const filename = `/tmp/orbs/${interaction.id}/orb-input.${image.filename
        .split('.')
        .pop()}`;
      await writeFile(filename, imageBuffer);

      // Orbify the image
      interactionMessage.message?.edit({
        content: 'Orbifying your image with blender...',
      });
      const orbify = exec(
        `blender -y -b blender-orbifier/sphere.blend -- --texture "${filename}" --output /tmp/orbs/${interaction.id}/orb.mp4`,
      );

      orbify.stdout?.on('data', (data) => {
        console.log(data);
      });

      orbify.on('close', () => {
        interactionMessage.message?.edit({
          content: 'Converting your orb into a gif...',
        });
        const convert = exec(
          `./blender-orbifier/gif-script.sh /tmp/orbs/${interaction.id}/orb.mp4 /tmp/${interaction.id}/orb`,
        );

        convert.stdout?.on('data', (data) => {
          console.log(data);
        });

        convert.on('close', async () => {
          interactionMessage.message?.edit({
            content: 'Uploading your orb...',
          });
          const orb = await client.rest.channels.createMessage(
            interaction.channelID,
            {
              content: 'Here is your orb!',
              files: [
                {
                  name: 'orb.gif',
                  contents: await readFile(
                    `/tmp/orbs/${interaction.id}/orb-256x256.gif`,
                  ),
                },
              ],
            },
          );

          interactionMessage.message?.delete();
        });
      });

      break;
    }
  }
});
client.connect();
