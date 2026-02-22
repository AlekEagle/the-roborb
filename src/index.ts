import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  ApplicationIntegrationTypes,
  Client,
  CommandInteraction,
  InteractionContextTypes,
  Member,
} from 'oceanic.js';
import type { CreateApplicationCommandOptions } from 'oceanic.js';
import { config } from 'dotenv';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir, rmdir, rename } from 'node:fs/promises';
import OrbQueue from './OrbQueue.ts';
import { URL } from 'node:url';

config();

const execPromise = promisify(exec);

const client = new Client({
  auth: `Bot ${process.env.TOKEN}`,
  gateway: {
    intents: ['GUILD_MESSAGES', 'GUILDS'],
  },
});

const commands: CreateApplicationCommandOptions[] = [
  {
    type: ApplicationCommandTypes.CHAT_INPUT,
    name: 'orbify',
    description: 'Turn your beloved image into an equally beloved orb.',
    integrationTypes: [
      ApplicationIntegrationTypes.GUILD_INSTALL,
      ApplicationIntegrationTypes.USER_INSTALL,
    ],
    contexts: [
      InteractionContextTypes.GUILD,
      InteractionContextTypes.BOT_DM,
      InteractionContextTypes.PRIVATE_CHANNEL,
    ],
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
            description:
              'Prefer the server avatar over the user avatar. (Has no effect if used in a DM)',
            required: false,
          },
        ],
      },
    ],
  },
  {
    type: ApplicationCommandTypes.MESSAGE,
    name: 'Orbify this thingy',
    integrationTypes: [
      ApplicationIntegrationTypes.GUILD_INSTALL,
      ApplicationIntegrationTypes.USER_INSTALL,
    ],
    contexts: [
      InteractionContextTypes.GUILD,
      InteractionContextTypes.BOT_DM,
      InteractionContextTypes.PRIVATE_CHANNEL,
    ],
  },
  {
    type: ApplicationCommandTypes.USER,
    name: 'Orbify this user',
    integrationTypes: [
      ApplicationIntegrationTypes.GUILD_INSTALL,
      ApplicationIntegrationTypes.USER_INSTALL,
    ],
    contexts: [
      InteractionContextTypes.GUILD,
      InteractionContextTypes.BOT_DM,
      InteractionContextTypes.PRIVATE_CHANNEL,
    ],
  },
];

const orbQueue = new OrbQueue();

client.on('ready', async () => {
  console.log('Client is ready!');
  await client.application.bulkEditGlobalCommands(commands);
});

async function checkForGraphicalData(filename: string): Promise<boolean> {
  try {
    const check = await execPromise(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filename}"`,
    );
    return check.stdout.trim() === 'video';
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function addToQueueAndWork(
  interaction: CommandInteraction,
  filename: string,
) {
  if (orbQueue.addOrb(interaction) !== 0) {
    await interaction.editOriginal({
      content: `Hang on, I'm already working on an orb, you'll have to wait. Your place in queue is: \`${orbQueue.getOrbPosition(
        interaction.id,
      )}\`.`,
    });
    async function onOrbComplete() {
      if (orbQueue.getOrbPosition(interaction.id) === 0) {
        orbQueue.off('orbComplete', onOrbComplete);
        await orbify(interaction.id, filename);
      } else {
        (interaction as CommandInteraction).editOriginal({
          content: `An orb ahead of you in the queue is complete! Your new place in the queue is: \`${orbQueue.getOrbPosition(
            interaction.id,
          )}\`.`,
        });
      }
    }
    orbQueue.on('orbComplete', onOrbComplete);
  } else {
    await orbify(interaction.id, filename);
  }
}

async function resolveFileTypeAndFinalizePath(
  buf: Uint8Array<ArrayBufferLike>,
  interaction: CommandInteraction,
): Promise<string | null> {
  try {
    await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
    await writeFile(`/tmp/orbs/${interaction.id}/tempfile`, buf);
    const fileType = (
      await execPromise(
        `file --extension -b /tmp/orbs/${interaction.id}/tempfile`,
      )
    ).stdout
      .trim()
      .split('/')[0];
    if (fileType !== '') {
      await rename(
        `/tmp/orbs/${interaction.id}/tempfile`,
        `/tmp/orbs/${interaction.id}/orb-input.${fileType}`,
      );
      return `/tmp/orbs/${interaction.id}/orb-input.${fileType}`;
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function orbify(interactionID: string, filename: string) {
  const { interaction } = orbQueue.orbs.find(
    (entry) => entry.interaction.id === interactionID,
  )!;
  try {
    // check if the image is a gif
    const isGif = filename.endsWith('.gif');
    // if it is a gif, convert it to a mp4
    if (isGif) {
      await interaction.editOriginal({
        content: 'Converting your gif to a format that blender can use...',
      });
      const convert = await execPromise(
        `ffmpeg -i "${filename}" /tmp/orbs/${interaction.id}/orb-input.mp4`,
      );

      // console.log(convert.stdout);

      filename = `/tmp/orbs/${interaction.id}/orb-input.mp4`;
    }

    // Orbify the image
    await interaction.editOriginal({
      content: 'Orbifying your image with blender...',
    });
    const orbify = await execPromise(
      `blender -y -b blender-orbifier/sphere.blend -- --texture "${filename}" --output /tmp/orbs/${interaction.id}/orb.mp4`,
    );

    // console.log(orbify.stdout);

    await interaction.editOriginal({
      content: 'Converting your orb into a gif...',
    });
    const convert = await execPromise(
      `./blender-orbifier/gif-script.sh /tmp/orbs/${interaction.id}/orb.mp4 /tmp/orbs/${interaction.id}/orb`,
    );

    // console.log(convert.stdout);

    await interaction.editOriginal({
      content: 'Uploading your orb...',
    });
    const orb = await interaction.createFollowup({
      content: `Here is your orb, ${interaction.user.mention}!`,
      files: [
        {
          name: 'orb.gif',
          contents: await readFile(
            `/tmp/orbs/${interaction.id}/orb-256x256.gif`,
          ),
        },
      ],
    });

    orbQueue.completeOrb(interaction.id);

    await interaction.deleteOriginal();
  } catch (e) {
    console.error(e);
    interaction.reply({
      content: 'An error occurred while processing your request.',
    });
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommandInteraction()) return;

  // ==== USER COMMANDS ====
  if (interaction.isUserCommand()) {
    switch (interaction.data.name) {
      case 'Orbify this user':
        const targetUser =
          interaction.data.resolved.members?.first()! ??
          interaction.data.resolved.users?.first()!;
        const isAnimated =
          targetUser.avatar && targetUser.avatar.startsWith('a_')
            ? true
            : false;
        const avatarURL = targetUser.avatarURL(
          isAnimated ? 'gif' : 'png',
          2048,
        );
        const filename = `/tmp/orbs/${interaction.id}/orb-input.${isAnimated ? 'gif' : 'png'}`;

        await interaction.reply({
          content: 'Downloading your image...',
        });

        const imageBuffer = await fetch(avatarURL).then((res) => res.bytes());

        await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
        await writeFile(filename, imageBuffer);

        // Check if the downloaded file contains graphical data (is an image or image sequence/video)
        const isGraphical = await checkForGraphicalData(filename);
        if (!isGraphical) {
          await interaction.editOriginal({
            content: 'The file you provided is not an image, gif, or video.',
          });
          return;
        }

        // Add the image to the orb queue
        addToQueueAndWork(interaction, filename);
        break;
      default:
        interaction.editOriginal({
          content: 'how',
        });
        return;
    }
  }

  // ==== MESSAGE COMMANDS ====
  if (interaction.isMessageCommand()) {
    switch (interaction.data.name) {
      case 'Orbify this thingy':
        const message = interaction.data.resolved.messages.first()!;
        const attachment =
          message.attachments.first() ?? // Get the first attachment if it exists
          message.embeds[0].thumbnail ?? // If no attachment, get the thumbnail of the first embed if it exists
          message.embeds[0].image; // If no thumbnail, get the image of the first embed if it exists

        if (!attachment) {
          await interaction.reply({
            content:
              'The message you used this command on does not contain any attachments, embeds, or other media.',
            flags: 64, // Ephemeral
          });
          await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
          return;
        }

        // Check if the attachment is an image or a video (to allow for video or image sequence inputs)

        await interaction.reply({
          content: 'Downloading your image...',
        });

        const imageBuffer = await fetch(attachment.url).then((res) =>
          res.bytes(),
        );

        const filename = await resolveFileTypeAndFinalizePath(
          imageBuffer,
          interaction,
        );

        if (!filename) {
          await interaction.editOriginal({
            content:
              "I can't figure out what type of file this is, so I can't orbify it.",
          });
          await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
          return;
        }

        // Check if the downloaded file contains graphical data (is an image or image sequence/video)
        const isGraphical = await checkForGraphicalData(filename);
        if (!isGraphical) {
          await interaction.editOriginal({
            content: 'The file you provided is not an image, gif, or video.',
          });
          await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
          return;
        }

        // Add the image to the orb queue
        addToQueueAndWork(interaction, filename);
        break;
      default:
        interaction.editOriginal({
          content: 'how',
        });
        return;
    }
  }

  // ==== SLASH COMMANDS ====
  if (interaction.isChatInputCommand()) {
    switch (interaction.data.name) {
      case 'orbify':
        await interaction.reply({
          content: 'Downloading your image...',
        });

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
            let url = interaction.data.options.getString('url')!;

            // Check if the URL is a Tenor URL and if so, scrape the actual media URL from the page (because Tenor doesn't want people to use their API anymore)
            if (url.includes('tenor.com')) {
              try {
                const page = await fetch(url).then((res) => res.text());
                const urlMatch = page.match(
                  /<link rel="image_src" href="(.*?)">/,
                );
                if (urlMatch && urlMatch[1]) {
                  url = urlMatch[1];
                } else {
                  throw new Error('Could not find media URL on Tenor page');
                }
              } catch (e) {
                console.error(e);
                await interaction.editOriginal({
                  content:
                    "I couldn't retrieve the media from that Tenor URL. Please make sure it's a valid Tenor URL and try again.",
                });
                await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
                return;
              }
            }

            imageBuffer = await fetch(url).then((res) => res.bytes());

            const potentialFilename = await resolveFileTypeAndFinalizePath(
              imageBuffer,
              interaction,
            );

            if (!potentialFilename) {
              await interaction.editOriginal({
                content:
                  "I can't figure out what type of file this is, so I can't orbify it.",
              });
              await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
              return;
            }

            filename = potentialFilename;
            break;
          case 'user':
            const user =
              interaction.data.options.getMember('user') ?? // Get the member if possible (will be null if the command is used in a DM or if the user is not in the server)
              interaction.data.options.getUser('user') ?? // Get the user (will always be present, even in a DM, only returns null if the user cannot be found or if the option is not provided)
              interaction.member ?? // Get the member from the interaction (will be present if the command is used in a guild, but not in a DM)
              interaction.user; // Fallback to the user from the interaction (will always be present)
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
                avatarURL = user.user.avatarURL(
                  isAnimated ? 'gif' : 'png',
                  2048,
                );
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
            interaction.editOriginal({
              content: 'An error occurred while processing your orb.',
            });
            return;
        }

        await mkdir(`/tmp/orbs/${interaction.id}`, { recursive: true });

        await writeFile(filename, imageBuffer);

        // Check if the downloaded file contains graphical data (is an image or image sequence/video)
        const isGraphical = await checkForGraphicalData(filename);
        if (!isGraphical) {
          await interaction.editOriginal({
            content: 'The file you provided is not an image, gif, or video.',
          });
          await rmdir(`/tmp/orbs/${interaction.id}`, { recursive: true });
          return;
        }

        // Add the image to the orb queue
        addToQueueAndWork(interaction, filename);
        break;
      default:
        interaction.editOriginal({
          content: 'how',
        });
        return;
    }
  }
});

client.on('error', console.error);
client.connect();
