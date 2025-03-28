import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Client,
  Member,
} from 'oceanic.js';
import { config } from 'dotenv';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import OrbQueue from './OrbQueue.js';
import { URL } from 'node:url';

config();

const execPromise = promisify(exec);

const client = new Client({
  auth: `Bot ${process.env.TOKEN}`,
  gateway: {
    intents: ['GUILD_MESSAGES', 'GUILDS'],
  },
});

const commands: any = [
  {
    type: ApplicationCommandTypes.CHAT_INPUT,
    name: 'orbify',
    description: 'Turn your beloved image into an equally beloved orb.',
    options: [
      {
        type: ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'image',
        description: 'The image to orbify.',
        options: [
          {
            type: ApplicationCommandOptionTypes.ATTACHMENT,
            name: 'image',
            description: 'The image to orbify.',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'url',
        description: 'A URL to an image to orbify.',
        options: [
          {
            type: ApplicationCommandOptionTypes.STRING,
            name: 'url',
            description: 'The URL to an image to orbify.',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'user',
        description: "Orbify a user's avatar.",
        options: [
          {
            type: ApplicationCommandOptionTypes.USER,
            name: 'user',
            description: 'The user to orbify.',
            required: false,
          },
          {
            type: ApplicationCommandOptionTypes.BOOLEAN,
            name: 'prefer-server-avatar',
            description: 'Prefer the server avatar over the user avatar.',
            required: false,
          },
        ],
      },
    ],
  },
];

const orbQueue = new OrbQueue();

client.on('ready', async () => {
  console.log('Client is ready!');
  await client.application.bulkEditGlobalCommands(commands);
});

async function orbify(interactionID: string, filename: string) {
  const { interaction, interactionMessage } = orbQueue.orbs.find(
    (entry) => entry.interaction.id === interactionID,
  )!;
  try {
    // check if the image is a gif
    const isGif = filename.endsWith('.gif');
    // if it is a gif, convert it to a mp4
    if (isGif) {
      await interactionMessage.edit({
        content: 'Converting your gif to a format that blender can use...',
      });
      const convert = await execPromise(
        `ffmpeg -i "${filename}" /tmp/orbs/${interaction.id}/orb-input.mp4`,
      );

      // console.log(convert.stdout);

      filename = `/tmp/orbs/${interaction.id}/orb-input.mp4`;
    }

    // Orbify the image
    await interactionMessage.edit({
      content: 'Orbifying your image with blender...',
    });
    const orbify = await execPromise(
      `blender -y -b blender-orbifier/sphere.blend -- --texture "${filename}" --output /tmp/orbs/${interaction.id}/orb.mp4`,
    );

    // console.log(orbify.stdout);

    await interactionMessage.edit({
      content: 'Converting your orb into a gif...',
    });
    const convert = await execPromise(
      `./blender-orbifier/gif-script.sh /tmp/orbs/${interaction.id}/orb.mp4 /tmp/orbs/${interaction.id}/orb`,
    );

    // console.log(convert.stdout);

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
    case 'orbify':
      const interactionMessage = await (
        await interaction.reply({
          content: 'Downloading your image...',
        })
      ).getMessage()!;

      let imageBuffer: Uint8Array;
      let filename: string;

      switch (interaction.data.options.getSubCommand(true)[0]) {
        case 'image':
          const image = interaction.data.options.getAttachment('image')!;
          imageBuffer = await fetch(image.url).then((res) => res.bytes());
          filename = `/tmp/orbs/${interaction.id}/orb-input.${image.filename
            .split('.')
            .pop()}`;
          break;
        case 'url':
          const url = interaction.data.options.getString('url')!;
          imageBuffer = await fetch(url).then((res) => res.bytes());

          const parsedUrl = new URL(url);

          filename = `/tmp/orbs/${interaction.id}/orb-input.${parsedUrl.pathname
            .split('/')
            .pop()!
            .split('.')
            .pop()}`;
          break;
        case 'user':
          const user =
            interaction.data.options.getMember('user') ??
            interaction.member ??
            interaction.user;
          const preferServerAvatar =
            interaction.data.options.getBoolean('prefer-server-avatar') ??
            false;
          let avatarURL: string, isAnimated: boolean;
          if (user instanceof Member) {
            if (preferServerAvatar) {
              isAnimated =
                user.avatar && user.avatar.startsWith('a_') ? true : false;
              avatarURL = user.avatarURL(isAnimated ? 'gif' : 'png', 2048);
            } else {
              isAnimated = user.user.avatar!.startsWith('a_') ? true : false;
              avatarURL = user.user.avatarURL(isAnimated ? 'gif' : 'png', 2048);
            }
          } else {
            isAnimated =
              user.avatar && user.avatar.startsWith('a_') ? true : false;
            avatarURL = user.avatarURL(isAnimated ? 'gif' : 'png', 2048);
          }
          filename = `/tmp/orbs/${interaction.id}/orb-input.${
            isAnimated ? 'gif' : 'png'
          }`;
          imageBuffer = await fetch(avatarURL).then((res) => res.bytes());
          break;
        default:
          interactionMessage.edit({
            content: 'An error occurred while processing your orb.',
          });
          return;
      }

      await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });

      await writeFile(filename, imageBuffer);

      // Check if the downloaded file contains graphical data (is an image or image sequence/video)
      const check = await execPromise(
        `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filename}"`,
      );
      if (check.stdout.trim() !== 'video') {
        interactionMessage.edit({
          content: 'The file you provided is not an image, gif, or video.',
        });
        return;
      }

      // Add the image to the orb queue

      if (orbQueue.addOrb(interaction, interactionMessage) !== 0) {
        interactionMessage.edit({
          content: `Hang on, I'm already working on an orb, you'll have to wait. Your place in queue is: \`${orbQueue.getOrbPosition(
            interaction.id,
          )}\`.`,
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
});

client.on('error', console.error);
client.connect();
