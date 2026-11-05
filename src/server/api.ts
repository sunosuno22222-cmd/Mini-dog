import { Request, Response, Router } from "express";
import {
  dc,
  registerCommands,
  assignMemberRole,
  verifyDiscordSignature,
  checkTrisalRole,
  createTrisalRole,
  beijoTriploEmbed,
  selinhoEmbed,
  tapaNaBundaEmbed,
  alizarEmbed,
  sendTtsMessage,
  SLASH_COMMANDS,
  applyGuildTemplate,
  fetchIpData,
  olhoDoDiaboEmbed,
} from "../lib/discord.server";
import { isBotOnline, initDiscordGatewayBot, getBotClient } from "./bot";
import {
  joinVoiceCall,
  leaveVoiceCall,
  getVoiceSessionStatus,
  speakInVoiceCall,
  playCustomMediaInVoiceCall,
} from "./voice";
import { applyZigZagChannelStyle, ZigZagStyle } from "./template";
import { getAllTickets } from "./tickets";

export const apiRouter = Router();

// Password check helper
function checkPassword(req: Request): boolean {
  const password = req.body?.password ?? req.headers["x-panel-password"];
  const expected = process.env.PANEL_PASSWORD?.trim() || "admin";
  return typeof password === "string" && password === expected;
}

// 1. System & Bot Status
apiRouter.get("/status", (_req: Request, res: Response) => {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  const appId = process.env.DISCORD_APPLICATION_ID?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const hasCustomPassword = Boolean(process.env.PANEL_PASSWORD?.trim());

  res.json({
    botTokenConfigured: Boolean(token && token !== "MY_DISCORD_BOT_TOKEN"),
    clientSecretConfigured: Boolean(clientSecret),
    publicKeyConfigured: Boolean(publicKey),
    appIdConfigured: Boolean(appId),
    groqKeyConfigured: Boolean(groqKey),
    gatewayConnected: isBotOnline(),
    hasCustomPassword,
    defaultPasswordActive: !hasCustomPassword,
    appUrl: process.env.APP_URL || "",
    commandsCount: SLASH_COMMANDS.length,
    commands: SLASH_COMMANDS.map((c) => `/${c.name}`),
  });
});

// 2. Allow updating token and groq key dynamically in runtime
apiRouter.post("/discord/configure", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { botToken: newToken, clientSecret: newSecret, publicKey: newKey, appId: newAppId, groqApiKey: newGroqKey } = req.body || {};
  let tokenChanged = false;

  if (typeof newToken === "string" && newToken.trim()) {
    process.env.DISCORD_BOT_TOKEN = newToken.trim();
    tokenChanged = true;
  }
  if (typeof newSecret === "string" && newSecret.trim()) {
    process.env.DISCORD_CLIENT_SECRET = newSecret.trim();
  }
  if (typeof newKey === "string" && newKey.trim()) {
    process.env.DISCORD_PUBLIC_KEY = newKey.trim();
  }
  if (typeof newAppId === "string" && newAppId.trim()) {
    process.env.DISCORD_APPLICATION_ID = newAppId.trim();
  }
  if (typeof newGroqKey === "string" && newGroqKey.trim()) {
    process.env.GROQ_API_KEY = newGroqKey.trim();
  }

  if (tokenChanged) {
    initDiscordGatewayBot().catch((e) => console.error("Error reconnecting bot:", e));
  }

  res.json({ success: true, message: "Configurações atualizadas com sucesso." });
});

// 2.1 Reconnect Gateway Bot
apiRouter.post("/discord/reconnect-bot", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  try {
    const client = await initDiscordGatewayBot();
    res.json({
      success: true,
      online: Boolean(client && client.isReady()),
      user: client?.user?.tag ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3. Bot Overview
apiRouter.post("/discord/overview", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  try {
    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) {
      return res.status(400).json({
        error: "DISCORD_BOT_TOKEN não configurado no .env.",
        code: "TOKEN_MISSING",
      });
    }

    const bot = await dc<{ id: string; username: string; avatar: string | null }>("/users/@me");
    const guilds = await dc<{ id: string; name: string; icon: string | null }[]>("/users/@me/guilds");
    const appId = process.env.DISCORD_APPLICATION_ID?.trim() || bot.id;

    res.json({
      bot: {
        id: bot.id,
        username: bot.username,
        avatar: bot.avatar ? `https://cdn.discordapp.com/avatars/${bot.id}/${bot.avatar}.png` : null,
      },
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8&scope=bot%20applications.commands`,
      hasClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET?.trim()),
      hasPublicKey: Boolean(process.env.DISCORD_PUBLIC_KEY?.trim()),
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 4. Guild Details
apiRouter.post("/discord/guild", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  if (!guildId || typeof guildId !== "string") {
    return res.status(400).json({ error: "ID do servidor é obrigatório." });
  }

  try {
    const [guild, channels, roles] = await Promise.all([
      dc<any>(`/guilds/${guildId}?with_counts=true`),
      dc<any[]>(`/guilds/${guildId}/channels`),
      dc<any[]>(`/guilds/${guildId}/roles`),
    ]);

    const hasTrisalRole = roles.some((r) => {
      const n = r.name.toLowerCase().trim();
      return n === "trisal totoso" || n === "trisal" || n.includes("trisal");
    });

    res.json({
      id: guild.id as string,
      name: guild.name as string,
      members: (guild.approximate_member_count ?? 0) as number,
      online: (guild.approximate_presence_count ?? 0) as number,
      hasTrisalRole,
      channels: channels
        .map((c) => ({
          id: c.id as string,
          name: c.name as string,
          type: c.type as number,
          parentId: (c.parent_id ?? null) as string | null,
          position: c.position as number,
        }))
        .sort((a, b) => a.position - b.position),
      roles: roles
        .map((r) => ({
          id: r.id as string,
          name: r.name as string,
          color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : null,
          position: r.position as number,
          managed: Boolean(r.managed),
        }))
        .sort((a, b) => b.position - a.position),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 5. Register Slash Commands (Wipes global duplicates & applies to guild)
apiRouter.post("/discord/slash-commands", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  try {
    const result = await registerCommands(guildId);
    res.json({
      success: true,
      message: "Comandos sincronizados com sucesso e duplicatas eliminadas!",
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 6. Create TRISAL TOTOSO Role
// 6. Create TRISAL TOTOSO Role
apiRouter.post("/discord/create-trisal-role", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  if (!guildId) return res.status(400).json({ error: "guildId é obrigatório." });

  try {
    const role = await createTrisalRole(guildId);
    res.json({ success: true, role });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 6.1 Apply Aesthetic Paneleiro Template
apiRouter.post("/discord/apply-template", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  if (!guildId) return res.status(400).json({ error: "guildId é obrigatório." });

  try {
    const result = await applyGuildTemplate(guildId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Moderation Status & Live Logs Endpoint
apiRouter.post("/discord/moderation/status", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  try {
    const { getModerationConfig, getSecurityLogs } = await import("./moderation");
    res.json({
      success: true,
      config: getModerationConfig(),
      logs: getSecurityLogs(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update Moderation Config Endpoint
apiRouter.post("/discord/moderation/config", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  try {
    const { updateModerationConfig, getModerationConfig } = await import("./moderation");
    updateModerationConfig(req.body?.config || {});
    res.json({
      success: true,
      config: getModerationConfig(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Emergency Lockdown Trigger Endpoint
apiRouter.post("/discord/moderation/lockdown", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, lock } = req.body || {};
  if (!guildId) return res.status(400).json({ error: "guildId é obrigatório." });

  try {
    const { getBotClient } = await import("./bot");
    const { toggleServerLockdown } = await import("./moderation");
    const client = getBotClient();
    const guild = client?.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: "Servidor não encontrado no bot ativo." });
    }

    const result = await toggleServerLockdown(guild, Boolean(lock));
    res.json({
      success: true,
      lock: Boolean(lock),
      message: lock
        ? `🚨 Lockdown de Emergência Ativado em ${result.channelsAffected} canais de texto!`
        : `✅ Lockdown Desativado em ${result.channelsAffected} canais de texto!`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7. Send Message or TTS in Channel/Call
apiRouter.post("/discord/send-message", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { channelId, content, tts } = req.body || {};
  if (!channelId || !content) {
    return res.status(400).json({ error: "channelId e content são obrigatórios." });
  }

  try {
    await sendTtsMessage(channelId, content, Boolean(tts));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.1 Join Voice Call with Deafened Mode (Escuta Desligada)
apiRouter.post("/discord/voice/join", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, channelId } = req.body || {};
  if (!guildId || !channelId) {
    return res.status(400).json({ error: "guildId e channelId são obrigatórios." });
  }

  try {
    const result = await joinVoiceCall(guildId, channelId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.2 Leave Voice Call
apiRouter.post("/discord/voice/leave", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  if (!guildId) {
    return res.status(400).json({ error: "guildId é obrigatório." });
  }

  try {
    leaveVoiceCall(guildId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.3 Get Voice Call Status
apiRouter.post("/discord/voice/status", (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  if (!guildId) {
    return res.status(400).json({ error: "guildId é obrigatório." });
  }

  const status = getVoiceSessionStatus(guildId);
  res.json(status);
});

// 7.4 Speak in Voice Call (TTS Voice Audio Playback)
apiRouter.post("/discord/voice/speak", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, text, channelId, voice } = req.body || {};
  if (!guildId || !text) {
    return res.status(400).json({ error: "guildId e text são obrigatórios." });
  }

  try {
    const result = await speakInVoiceCall(guildId, text, channelId, voice);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.5 Upload and Play Custom Audio/Media File (OGG, MP3, MP4, WAV, etc.)
apiRouter.post("/discord/voice/upload-play", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, fileData, filename, channelId } = req.body || {};
  if (!guildId || !fileData) {
    return res.status(400).json({ error: "guildId e fileData são obrigatórios." });
  }

  try {
    const result = await playCustomMediaInVoiceCall(
      guildId,
      fileData,
      filename || "audio.mp3",
      channelId
    );
    res.json(result);
  } catch (error) {
    console.error("[Upload Play Error]:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.6 Apply Non-Destructive ID-Based Zig-Zag Channel Styler Template
apiRouter.post("/discord/template/zigzag", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, style } = req.body || {};
  if (!guildId) {
    return res.status(400).json({ error: "guildId é obrigatório." });
  }

  try {
    const result = await applyZigZagChannelStyle(guildId, (style as ZigZagStyle) || "curved");
    res.json(result);
  } catch (error) {
    console.error("[ZigZag Template Error]:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 7.7 Get Active Support Tickets
apiRouter.post("/discord/tickets", (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId } = req.body || {};
  const tickets = getAllTickets();
  const filtered = guildId ? tickets.filter((t) => t.guildId === guildId) : tickets;
  res.json({ success: true, tickets: filtered });
});

// 7.8 Send Support Panel to Channel
apiRouter.post("/discord/send-support-panel", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório." });

  try {
    const client = getBotClient();
    if (!client || !client.isReady()) {
      throw new Error("Bot Discord não está conectado no Gateway.");
    }
    const channel = (await client.channels.fetch(channelId).catch(() => null)) as any;
    if (!channel || !channel.isTextBased()) {
      throw new Error("Canal não encontrado ou não aceita mensagens de texto.");
    }
    const { buildSupportPanelMessage } = await import("./tickets");
    const panel = buildSupportPanelMessage();
    const sent = await channel.send(panel);
    res.json({ success: true, messageId: sent.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 7.8.1 Send IP Lookup Panel (Olho do Diabo) to Channel
apiRouter.post("/discord/send-ip-panel", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório." });

  try {
    const client = getBotClient();
    if (!client || !client.isReady()) {
      throw new Error("Bot Discord não está conectado no Gateway.");
    }
    const channel = (await client.channels.fetch(channelId).catch(() => null)) as any;
    if (!channel || !channel.isTextBased()) {
      throw new Error("Canal não encontrado ou não aceita mensagens de texto.");
    }
    const { buildIpPanelMessage } = await import("./tickets");
    const panel = buildIpPanelMessage();
    const sent = await channel.send(panel);
    res.json({ success: true, messageId: sent.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 7.9 Clean Ticket Messages & Bot Messages
apiRouter.post("/discord/clean-tickets-messages", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, channelId, mode } = req.body || {};
  if (!guildId) return res.status(400).json({ error: "guildId é obrigatório." });

  try {
    const client = getBotClient();
    if (!client || !client.isReady()) {
      throw new Error("Bot Discord não está conectado no Gateway.");
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error("Servidor não encontrado.");

    const { deleteAllBotMessagesInGuild } = await import("./tickets");
    const targetChannel = mode === "all" ? undefined : (channelId || undefined);

    const result = await deleteAllBotMessagesInGuild(
      guild,
      client.user.id,
      targetChannel,
      false
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 8. Assign Role to User
apiRouter.post("/discord/assign-role", async (req: Request, res: Response) => {
  if (!checkPassword(req)) {
    return res.status(401).json({ error: "Senha do painel incorreta." });
  }

  const { guildId, userId, roleId } = req.body || {};
  if (!guildId || !userId || !roleId) {
    return res.status(400).json({ error: "guildId, userId e roleId são obrigatórios." });
  }

  try {
    const result = await assignMemberRole(guildId, userId, roleId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Safe response helpers for Express and Connect
function respondJson(res: any, status: number, data: any) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(data));
}

function respondText(res: any, status: number, text: string) {
  if (typeof res.status === "function" && typeof res.send === "function") {
    return res.status(status).send(text);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain");
  return res.end(text);
}

function findOptionValue(options: any[], optName: string): any {
  if (!options || !Array.isArray(options)) return undefined;
  for (const opt of options) {
    const n = opt.name?.toLowerCase() || "";
    const target = optName.toLowerCase();
    if (n === target || n === target.replace(/-/g, "_") || n === target.replace(/_/g, "-")) {
      return opt.value;
    }
    if (opt.options) {
      const nested = findOptionValue(opt.options, optName);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

// 9. Public Discord Interactions Webhook Endpoint (Ed25519 signature validated)
export async function handleDiscordInteractions(req: Request, res: Response) {
  const signature = (req.headers["x-signature-ed25519"] as string) ?? "";
  const timestamp = (req.headers["x-signature-timestamp"] as string) ?? "";

  let rawBody: string = (req as any).rawBody ?? "";
  if (!rawBody) {
    if (typeof req.body === "string") rawBody = req.body;
    else if (req.body && typeof req.body === "object" && !(req.body instanceof Buffer)) {
      rawBody = JSON.stringify(req.body);
    }
  }

  const valid = await verifyDiscordSignature(rawBody, signature, timestamp);
  if (!valid) {
    console.warn("[Discord Webhook] Invalid signature from:", req.ip);
    return respondText(res, 401, "invalid request signature");
  }

  let interaction: any;
  try {
    interaction = typeof req.body === "object" && !(req.body instanceof Buffer) ? req.body : JSON.parse(rawBody);
  } catch {
    return respondText(res, 400, "invalid JSON");
  }

  console.log(`[Discord Interaction] Type: ${interaction.type}, Command: ${interaction.data?.name}`);

  // Type 1: PING (Discord tests this when saving the interaction endpoint)
  if (interaction.type === 1) {
    return respondJson(res, 200, { type: 1 });
  }

  const user = interaction.member?.user ?? interaction.user;
  if (!user?.id || !interaction.application_id || !interaction.token) {
    return respondJson(res, 200, { type: 4, data: { content: "Interação inválida.", flags: 64 } });
  }

  // Slash commands (type === 2)
  if (interaction.type === 2) {
    const rawName = interaction.data?.name || "";
    const name = rawName.toLowerCase().replace(/_/g, "-").trim();
    const authorId = user.id;
    const guildId = interaction.guild_id;
    const options = interaction.data?.options || [];

    // Helper to extract option value with multiple fallbacks
    const getOption = (optName: string, fallbackIndex = 0) => {
      const val = findOptionValue(options, optName);
      if (val !== undefined) return val;
      if (options[fallbackIndex]?.value !== undefined) {
        return options[fallbackIndex].value;
      }
      return undefined;
    };

    // If an old legacy command is triggered from cache
    if (["load", "regras", "ip-embed", "ip_embed"].includes(name)) {
      return respondJson(res, 200, {
        type: 4,
        data: {
          content: "⚠️ **Comando antigo desativado!**\nUse os novos comandos do Trisal: `/beijo-triplo`, `/selinho`, `/tapa-na-bunda`, `/alizar` ou `/falar`.",
          flags: 64,
        },
      });
    }

    // Match command names
    const isBeijo = name === "beijo-triplo" || name === "beijotriplo" || name.includes("beijo");
    const isSelinho = name === "selinho";
    const isTapa = name === "tapa-na-bunda" || name === "tapanabunda" || name.includes("tapa");
    const isAlizar = name === "alizar" || name === "alisar";

    if (isBeijo || isSelinho || isTapa || isAlizar) {
      if (!guildId || !interaction.member) {
        return respondJson(res, 200, {
          type: 4,
          data: { content: "Este comando só pode ser utilizado dentro de um servidor!", flags: 64 },
        });
      }

      // Check member roles for TRISAL TOTOSO
      const memberRoles: string[] = interaction.member.roles || [];
      const hasRole = await checkTrisalRole(guildId, memberRoles);

      if (!hasRole) {
        return respondJson(res, 200, {
          type: 4,
          data: {
            content: "🚫 **ACESSO NEGADO!**\n\nEste comando é **exclusivo** para membros que possuem o cargo oficial **TRISAL TOTOSO**! 💅💋\n\nPeça para a administração conceder o cargo no painel web.",
            flags: 64, // Ephemeral: only caller sees
          },
        });
      }

      if (isBeijo) {
        const u1 = getOption("user1", 0) || authorId;
        const u2 = getOption("user2", 1) || authorId;
        const embed = beijoTriploEmbed(authorId, u1, u2);
        return respondJson(res, 200, {
          type: 4,
          data: { embeds: [embed] },
        });
      }

      if (isSelinho) {
        const target = getOption("user", 0) || authorId;
        const embed = selinhoEmbed(authorId, target);
        return respondJson(res, 200, {
          type: 4,
          data: { embeds: [embed] },
        });
      }

      if (isTapa) {
        const target = getOption("user", 0) || authorId;
        const embed = tapaNaBundaEmbed(authorId, target);
        return respondJson(res, 200, {
          type: 4,
          data: { embeds: [embed] },
        });
      }

      if (isAlizar) {
        const target = getOption("user", 0) || authorId;
        const embed = alizarEmbed(authorId, target);
        return respondJson(res, 200, {
          type: 4,
          data: { embeds: [embed] },
        });
      }
    }

    // Olho do Diabo / IP Check Command
    if (name === "olho-do-diabo" || name === "buscar-ip" || name === "ip-embed") {
      const target = String(getOption("alvo", 0) || getOption("ip", 0) || getOption("ip_ou_dominio", 0) || "8.8.8.8");
      try {
        const ipData = await fetchIpData(target);
        const embed = olhoDoDiaboEmbed(ipData, user.username || "Moderador");
        return respondJson(res, 200, {
          type: 4,
          data: { embeds: [embed] },
        });
      } catch (err) {
        return respondJson(res, 200, {
          type: 4,
          data: { content: `⚠️ Erro no rastreamento: ${(err as Error).message}`, flags: 64 },
        });
      }
    }

    // TTS Voice Command
    if (name === "falar") {
      const texto = String(getOption("texto", 0) || "Mensagem de voz na call!");
      const tts = getOption("tts", 1) !== false;
      return respondJson(res, 200, {
        type: 4,
        data: { content: texto, tts },
      });
    }

    return respondJson(res, 200, {
      type: 4,
      data: {
        content: `Comando recebido: /${rawName}. Comandos disponíveis: /beijo-triplo, /selinho, /tapa-na-bunda, /alizar, /falar`,
        flags: 64,
      },
    });
  }

  return respondJson(res, 200, { type: 4, data: { content: "Interação não suportada.", flags: 64 } });
}
