import {
  Guild,
  TextChannel,
  User,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  Message,
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";

export interface PollVote {
  userId: string;
  userTag: string;
  avatarUrl: string;
  optionIndex: number;
  votedAt: number;
}

export interface PollOption {
  text: string;
}

export interface PollData {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  creatorId: string;
  creatorTag: string;
  question: string;
  options: PollOption[];
  votes: Record<string, PollVote>; // userId -> PollVote (ensures strictly 1 vote per user)
  closed: boolean;
  createdAt: number;
  closedAt?: number;
}

const POLLS_FILE = path.join(process.cwd(), "polls_data.json");
const pollsMap = new Map<string, PollData>();

// Load polls from disk
async function loadPollsFromDisk() {
  try {
    const raw = await fs.readFile(POLLS_FILE, "utf8");
    const arr: PollData[] = JSON.parse(raw);
    for (const p of arr) {
      pollsMap.set(p.id, p);
    }
  } catch {}
}
loadPollsFromDisk().catch(() => {});

async function savePollsToDisk() {
  try {
    const arr = Array.from(pollsMap.values());
    await fs.writeFile(POLLS_FILE, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error("[Polls Save Error]:", err);
  }
}

export function getAllPolls(guildId?: string): PollData[] {
  const all = Array.from(pollsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  if (guildId) {
    return all.filter((p) => p.guildId === guildId);
  }
  return all;
}

export function getPoll(pollId: string): PollData | undefined {
  return pollsMap.get(pollId);
}

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

/**
 * Generates ASCII/Unicode progress bar matching:
 * 30% ███░░░░░░░
 * 50% █████░░░░░
 * 75% ███████▌░░
 * 100% ██████████
 */
export function renderProgressBar(percentage: number, totalBlocks = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  if (clamped === 0) return "░".repeat(totalBlocks);
  if (clamped >= 100) return "█".repeat(totalBlocks);

  const exactBlocks = (clamped / 100) * totalBlocks;
  const fullBlocks = Math.floor(exactBlocks);
  const remainder = exactBlocks - fullBlocks;

  let bar = "█".repeat(fullBlocks);
  if (remainder >= 0.35 && bar.length < totalBlocks) {
    bar += "▌";
  }
  const empty = totalBlocks - bar.length;
  if (empty > 0) {
    bar += "░".repeat(empty);
  }
  return bar;
}

/**
 * Builds the embed and button action rows for a poll
 */
export function buildPollEmbedAndComponents(poll: PollData): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalVotes = Object.keys(poll.votes).length;

  const embed = new EmbedBuilder()
    .setColor(poll.closed ? 0x64748b : 0xef4444) // Slate if closed, Red/Crimson if active
    .setTitle(`📊 ${poll.question}`)
    .setFooter({
      text: `Total de Votos: ${totalVotes} • ${poll.closed ? "🔒 VOTAÇÃO ENCERRADA" : "Clique nas opções para votar (1 voto por pessoa)"} • Criado por @${poll.creatorTag}`,
    })
    .setTimestamp(poll.createdAt);

  // Build the visual options display
  const lines: string[] = [];

  poll.options.forEach((opt, idx) => {
    const votesForOption = Object.values(poll.votes).filter((v) => v.optionIndex === idx);
    const count = votesForOption.length;
    const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const bar = renderProgressBar(percentage, 10);
    const emoji = NUMBER_EMOJIS[idx] || `${idx + 1}️⃣`;

    lines.push(
      `${emoji} **${opt.text}**\n` +
      `\`${percentage.toString().padStart(3, " ")}% \` \`${bar}\` — **${count}** ${count === 1 ? "voto" : "votos"}\n`
    );
  });

  if (poll.closed) {
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("🔒 *Esta enquete foi encerrada pela moderação e não aceita novos votos.*");
  }

  embed.setDescription(lines.join("\n"));

  // Row 1: Option Buttons
  const optionRow = new ActionRowBuilder<ButtonBuilder>();
  poll.options.forEach((opt, idx) => {
    const emoji = NUMBER_EMOJIS[idx] || `${idx + 1}️⃣`;
    const label = opt.text.length > 70 ? opt.text.substring(0, 67) + "..." : opt.text;

    optionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote_${poll.id}_${idx}`)
        .setLabel(label)
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(poll.closed)
    );
  });

  // Row 2: Controls (View votes, Remove vote, Close poll)
  const controlRow = new ActionRowBuilder<ButtonBuilder>();

  controlRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`poll_view_${poll.id}`)
      .setLabel("Ver Votos")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`poll_unvote_${poll.id}`)
      .setLabel("Retirar Voto")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(poll.closed),

    new ButtonBuilder()
      .setCustomId(`poll_close_${poll.id}`)
      .setLabel(poll.closed ? "Encerrada" : "Encerrar Enquete")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(poll.closed)
  );

  return {
    embed,
    components: [optionRow, controlRow],
  };
}

/**
 * Creates a new poll in a channel
 */
export async function createPollInChannel(
  channel: TextChannel,
  creator: User,
  question: string,
  options: string[]
): Promise<PollData> {
  const pollId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const validOptions = options.map((o) => ({ text: o.trim() })).filter((o) => o.text.length > 0);

  if (validOptions.length < 2) {
    throw new Error("A enquete precisa de no mínimo 2 opções válidas.");
  }

  const poll: PollData = {
    id: pollId,
    guildId: channel.guild.id,
    channelId: channel.id,
    messageId: "",
    creatorId: creator.id,
    creatorTag: creator.tag || creator.username,
    question: question.trim(),
    options: validOptions.slice(0, 5), // Max 5 options
    votes: {},
    closed: false,
    createdAt: Date.now(),
  };

  const { embed, components } = buildPollEmbedAndComponents(poll);
  const sentMessage = await channel.send({
    embeds: [embed],
    components,
  });

  poll.messageId = sentMessage.id;
  pollsMap.set(poll.id, poll);
  await savePollsToDisk();

  return poll;
}

/**
 * Handles a member voting on an option
 */
export async function handlePollVote(
  pollId: string,
  optionIndex: number,
  user: User,
  message: Message
): Promise<{ success: boolean; message: string; updatedPoll: PollData }> {
  const poll = pollsMap.get(pollId);
  if (!poll) {
    return { success: false, message: "⚠️ Enquete não encontrada no sistema.", updatedPoll: null as any };
  }

  if (poll.closed) {
    return { success: false, message: "🔒 Esta enquete já foi encerrada e não aceita novos votos.", updatedPoll: poll };
  }

  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return { success: false, message: "⚠️ Opção de voto inválida.", updatedPoll: poll };
  }

  const existingVote = poll.votes[user.id];
  const chosenOption = poll.options[optionIndex];
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });

  // If already voted for the exact same option
  if (existingVote && existingVote.optionIndex === optionIndex) {
    return {
      success: false,
      message: `⚠️ Você já votou na opção **"${chosenOption.text}"**! Seu voto já está contabilizado.`,
      updatedPoll: poll,
    };
  }

  const isChangingVote = Boolean(existingVote);
  const oldOptionText = existingVote ? poll.options[existingVote.optionIndex]?.text : null;

  // Record strictly 1 vote per user
  poll.votes[user.id] = {
    userId: user.id,
    userTag: user.tag || user.username,
    avatarUrl,
    optionIndex,
    votedAt: Date.now(),
  };

  await savePollsToDisk();

  // Edit original Discord message with updated percentages and progress bars
  try {
    const { embed, components } = buildPollEmbedAndComponents(poll);
    await message.edit({
      embeds: [embed],
      components,
    });
  } catch (err) {
    console.error("[Poll Message Edit Error]:", err);
  }

  const feedback = isChangingVote
    ? `🔄 **Voto alterado com sucesso!** Você trocou de *"${oldOptionText}"* para **"${chosenOption.text}"**.`
    : `✅ **Voto computado com sucesso!** Você votou em **"${chosenOption.text}"**.`;

  return {
    success: true,
    message: feedback,
    updatedPoll: poll,
  };
}

/**
 * Handles removing a user's vote
 */
export async function handlePollUnvote(
  pollId: string,
  user: User,
  message: Message
): Promise<{ success: boolean; message: string }> {
  const poll = pollsMap.get(pollId);
  if (!poll) {
    return { success: false, message: "⚠️ Enquete não encontrada." };
  }

  if (poll.closed) {
    return { success: false, message: "🔒 Esta enquete já foi encerrada." };
  }

  if (!poll.votes[user.id]) {
    return { success: false, message: "⚠️ Você ainda não registrou nenhum voto nesta enquete." };
  }

  delete poll.votes[user.id];
  await savePollsToDisk();

  try {
    const { embed, components } = buildPollEmbedAndComponents(poll);
    await message.edit({
      embeds: [embed],
      components,
    });
  } catch (err) {
    console.error("[Poll Unvote Message Edit Error]:", err);
  }

  return {
    success: true,
    message: "🗑️ **Seu voto foi removido da enquete com sucesso!**",
  };
}

/**
 * Builds ephemeral response with voters, photos/avatars, and chosen options
 */
export function buildVotersEphemeralEmbed(poll: PollData): EmbedBuilder {
  const totalVotes = Object.keys(poll.votes).length;

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`👥 Registro de Votos — ${poll.question}`)
    .setDescription(
      `Aqui está a lista detalhada de quem votou em cada opção.\n*(Mensagem visível apenas para você)*\n\n**Total de Participantes:** ${totalVotes}`
    );

  if (totalVotes === 0) {
    embed.addFields({
      name: "Nenhum voto registrado",
      value: "*Ainda ninguém votou nesta enquete. Seja o primeiro a votar!*",
      inline: false,
    });
    return embed;
  }

  // Group voters by option
  poll.options.forEach((opt, idx) => {
    const emoji = NUMBER_EMOJIS[idx] || `${idx + 1}️⃣`;
    const voters = Object.values(poll.votes).filter((v) => v.optionIndex === idx);

    if (voters.length === 0) {
      embed.addFields({
        name: `${emoji} ${opt.text} (0 votos)`,
        value: "*Nenhum voto nesta opção.*",
        inline: false,
      });
    } else {
      const voterLines = voters.map((v) => {
        return `• [📷 Foto](${v.avatarUrl}) <@${v.userId}> — **${v.userTag}**`;
      });

      embed.addFields({
        name: `${emoji} ${opt.text} (${voters.length} ${voters.length === 1 ? "voto" : "votos"})`,
        value: voterLines.slice(0, 25).join("\n") + (voters.length > 25 ? `\n*...e mais ${voters.length - 25} membros*` : ""),
        inline: false,
      });
    }
  });

  // Set thumbnail to the most recent voter's avatar photo if available
  const recentVoter = Object.values(poll.votes).sort((a, b) => b.votedAt - a.votedAt)[0];
  if (recentVoter?.avatarUrl) {
    embed.setThumbnail(recentVoter.avatarUrl);
  }

  return embed;
}

/**
 * Closes a poll (by moderator or creator)
 */
export async function closePoll(
  pollId: string,
  user: User,
  member: GuildMember | null,
  message?: Message
): Promise<{ success: boolean; message: string }> {
  const poll = pollsMap.get(pollId);
  if (!poll) {
    return { success: false, message: "⚠️ Enquete não encontrada." };
  }

  if (poll.closed) {
    return { success: false, message: "🔒 Esta enquete já está encerrada." };
  }

  // Permission check: only creator, guild owner, or admin/mod can close
  const isCreator = poll.creatorId === user.id;
  const isGuildOwner = member?.guild?.ownerId === user.id;
  const isAdminOrMod =
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild);

  if (!isCreator && !isGuildOwner && !isAdminOrMod) {
    return {
      success: false,
      message: "🚫 **ACESSO NEGADO!** Apenas quem criou a enquete ou moderadores com permissão podem encerrá-la.",
    };
  }

  poll.closed = true;
  poll.closedAt = Date.now();
  await savePollsToDisk();

  if (message) {
    try {
      const { embed, components } = buildPollEmbedAndComponents(poll);
      await message.edit({
        embeds: [embed],
        components,
      });
    } catch (err) {
      console.error("[Poll Close Edit Error]:", err);
    }
  }

  return {
    success: true,
    message: `🔒 **A enquete "${poll.question}" foi encerrada com sucesso!** Novos votos não serão mais aceitos.`,
  };
}
