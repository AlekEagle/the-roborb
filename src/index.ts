import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Client,
  CommandInteraction,
  Message,
} from 'oceanic.js';
import { config } from 'dotenv';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import OrbQueue from './OrbQueue.js';

config();

const execPromise = promisify(exec);

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

const orbQueue = new OrbQueue();

client.on('ready', async () => {
  console.log('Client is ready!');
  await client.application.bulkEditGlobalCommands(commands);
  await client.application.bulkEditGuildCommands(TEST_SERVER, commands);
});

async function orbify(interactionID: string, filename: string) {
  const { interaction, interactionMessage } = orbQueue.orbs.find(
    (entry) => entry.interaction.id === interactionID,
  )!;
  try {
    // Orbify the image
    await interactionMessage.edit({
      content: 'Orbifying your image with blender...',
    });
    const orbify = await execPromise(
      `blender -y -b blender-orbifier/sphere.blend -- --texture "${filename}" --output /tmp/orbs/${interaction.id}/orb.mp4`,
    );

    console.log(orbify.stdout);

    await interactionMessage.edit({
      content: 'Converting your orb into a gif...',
    });
    const convert = await execPromise(
      `./blender-orbifier/gif-script.sh /tmp/orbs/${interaction.id}/orb.mp4 /tmp/orbs/${interaction.id}/orb`,
    );

    console.log(convert.stdout);

    interactionMessage.edit({
      content: 'Uploading your orb...',
    });
    const orb = await client.rest.channels.createMessage(
      interaction.channelID,
      {
        content: `Here is your orb, ${interaction.member?.mention}!`,
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

    orbQueue.completeOrb(interaction.id);

    interactionMessage.delete();
  } catch (e) {
    console.error(e);
    interaction.reply({
      content: 'An error occurred while processing your request.',
    });
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommandInteraction()) return;
  if (!interaction.isChatInputCommand()) return;
  switch (interaction.data.name) {
    case 'orbify': {
      const interactionMessage = await (
        await interaction.reply({
          content: 'Downloading your image...',
        })
      ).getMessage()!;

      const image = interaction.data.options.getAttachment('image')!;

      await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });

      // Download the image to the local filesystem
      const imageDownload = fetch(image.url);
      const imageBuffer = await imageDownload.then((res) => res.bytes());
      const filename = `/tmp/orbs/${interaction.id}/orb-input.${image.filename
        .split('.')
        .pop()}`;
      await writeFile(filename, imageBuffer);

      // Add the image to the orb queue

      if (orbQueue.addOrb(interaction, interactionMessage) !== 0) {
        interactionMessage.edit({
          content: `Your orb is currently in position ${orbQueue.getOrbPosition(
            interaction.id,
          )}. `,
        });
        orbQueue.on('orbComplete', async () => {
          if (orbQueue.getOrbPosition(interaction.id) === 0) {
            await orbify(interaction.id, filename);
          }
        });
      } else {
        await orbify(interaction.id, filename);
      }
      break;
    }
  }
});
client.connect();
