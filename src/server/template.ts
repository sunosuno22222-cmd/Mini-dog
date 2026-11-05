import { ChannelType, NonThreadGuildBasedChannel } from "discord.js";
import { getBotClient } from "./bot";

export type ZigZagStyle = "curved" | "arrows" | "brackets" | "corners";

/**
 * Strips existing decorative unicodes, dashes, bullets, and emojis to extract clean base channel name
 */
export function cleanChannelBaseName(name: string): string {
  let clean = name;
  clean = clean.replace(/^[╭╰┌└⟿⟣⟾◖◗‹›⟡⸸𐅙⌑⌬▤🔊💬#・\s\-_]+/gu, "");
  clean = clean.replace(/[╭╰┌└⟿⟣⟾◖◗‹›⟡⸸𐅙⌑⌬▤🔊💬#・\s\-_]+$/gu, "");
  clean = clean.trim();
  if (!clean) clean = "canal";
  return clean.toLowerCase();
}

/**
 * Formats a channel name into the specified Zig-Zag alternating style
 */
export function formatZigZagName(
  baseName: string,
  index: number,
  isVoice: boolean,
  style: ZigZagStyle = "curved"
): string {
  const isEven = index % 2 === 0;

  switch (style) {
    case "arrows":
      if (isVoice) {
        return isEven ? `‹・🔊・${baseName}・›` : `›・🔊・${baseName}・‹`;
      }
      return isEven ? `‹・${baseName}・›` : `›・${baseName}・‹`;

    case "brackets":
      if (isVoice) {
        return isEven ? `◖・🔊・${baseName}・◗` : `◗・🔊・${baseName}・◖`;
      }
      return isEven ? `◖・${baseName}・◗` : `◗・${baseName}・◖`;

    case "corners":
      if (isVoice) {
        return isEven ? `┌・🔊・${baseName}・┐` : `└・🔊・${baseName}・┘`;
      }
      return isEven ? `┌・${baseName}・┐` : `└・${baseName}・┘`;

    case "curved":
    default:
      if (isVoice) {
        return isEven ? `╭・🔊・${baseName}・⟡` : `╰・🔊・${baseName}・⟣`;
      }
      return isEven ? `╭・${baseName}・⟡` : `╰・${baseName}・⟣`;
  }
}

/**
 * Non-destructive Zig-Zag Channel Styler:
 * Finds each existing channel by its ID and edits its name to alternate in a clean Zig-Zag pattern.
 */
export async function applyZigZagChannelStyle(
  guildId: string,
  style: ZigZagStyle = "curved"
): Promise<{
  success: boolean;
  editedCount: number;
  channels: { id: string; oldName: string; newName: string }[];
}> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error("Bot Discord Gateway não está conectado.");
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Servidor Discord não encontrado pelo Bot.");
  }

  await guild.channels.fetch();
  const allChannels = Array.from(guild.channels.cache.values());

  const categories = allChannels.filter((c: any) => c && c.type === ChannelType.GuildCategory);
  const nonCategories = allChannels.filter(
    (c): c is NonThreadGuildBasedChannel =>
      Boolean(c) && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
  );

  const editedList: { id: string; oldName: string; newName: string }[] = [];

  const processGroup = async (channelsInGroup: NonThreadGuildBasedChannel[]) => {
    channelsInGroup.sort((a, b) => a.position - b.position);

    for (let i = 0; i < channelsInGroup.length; i++) {
      const ch = channelsInGroup[i];
      const isVoice = ch.type === ChannelType.GuildVoice;
      const clean = cleanChannelBaseName(ch.name);
      const newName = formatZigZagName(clean, i, isVoice, style);

      if (ch.name !== newName) {
        try {
          await ch.edit({ name: newName });
          editedList.push({ id: ch.id, oldName: ch.name, newName });
          await new Promise((r) => setTimeout(r, 450));
        } catch (err) {
          console.warn(`[ZigZag] Erro ao editar canal ${ch.id} (${ch.name}):`, (err as Error).message);
        }
      }
    }
  };

  for (const cat of categories) {
    if (!cat) continue;
    const inCat = nonCategories.filter((c) => c.parentId === (cat as any).id);
    if (inCat.length > 0) {
      await processGroup(inCat);
    }
  }

  const orphanChannels = nonCategories.filter((c) => !c.parentId);
  if (orphanChannels.length > 0) {
    await processGroup(orphanChannels);
  }

  return {
    success: true,
    editedCount: editedList.length,
    channels: editedList,
  };
}
