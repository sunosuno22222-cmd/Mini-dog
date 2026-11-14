import fs from "node:fs";
import path from "node:path";
import {
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

export type SecurityTestType = "spam" | "invite" | "massping" | "raid" | "all";

interface PersistedTestBotConfig {
  token?: string;
  applicationId?: string;
  botId?: string;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), ".test-bot-config.json");

let testBotClient: Client | null = null;
let isStartingTestBot = false;
let lastTestBotError: string | null = null;

function readPersistedTestBotConfig(): PersistedTestBotConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePersistedTestBotConfig(patch: Partial<PersistedTestBotConfig>): void {
  try {
    const current = readPersistedTestBotConfig();
    const next: PersistedTestBotConfig = { ...current };
    if (typeof patch.token === "string" && patch.token.trim()) {
      next.token = patch.token.trim();
      process.env.TEST_BOT_TOKEN = next.token;
    }
    if (typeof patch.applicationId === "string" && patch.applicationId.trim()) {
      next.applicationId = patch.applicationId.trim();
      process.env.TEST_BOT_APPLICATION_ID = next.applicationId;
    }
    if (typeof patch.botId === "string" && patch.botId.trim()) {
      next.botId = patch.botId.trim();
      process.env.TEST_BOT_ID = next.botId;
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.warn("[Test Bot Config Persist Warning]:", err);
  }
}

function hydrateTestBotEnvFromDisk(): void {
  const saved = readPersistedTestBotConfig();
  if (!process.env.TEST_BOT_TOKEN?.trim() && saved.token) {
    process.env.TEST_BOT_TOKEN = saved.token;
  }
  if (!process.env.TEST_BOT_APPLICATION_ID?.trim() && saved.applicationId) {
    process.env.TEST_BOT_APPLICATION_ID = saved.applicationId;
  }
  if (!process.env.TEST_BOT_ID?.trim() && saved.botId) {
    process.env.TEST_BOT_ID = saved.botId;
  }
}

export function getTestBotClient(): Client | null {
  return testBotClient;
}

export function isTestBotOnline(): boolean {
  return Boolean(testBotClient && testBotClient.isReady());
}

export function getLastTestBotError(): string | null {
  return lastTestBotError;
}

export function extractBotIdFromToken(token?: string | null): string | null {
  if (!token) return null;
  const firstSegment = token.trim().split(".")[0];
  if (!firstSegment) return null;
  try {
    const padded = firstSegment.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim();
    return /^\d{17,22}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function buildTestBotInviteUrl(appOrBotId?: string | null): string | null {
  const cleanId = appOrBotId?.trim();
  if (!cleanId || !/^\d{17,22}$/.test(cleanId)) return null;
  // Permissions: ViewChannel + SendMessages + ReadMessageHistory + EmbedLinks (NO Administrator so channel-hiding works!)
  const invitePermissions = "274877910016";
  return `https://discord.com/oauth2/authorize?client_id=${cleanId}&permissions=${invitePermissions}&scope=bot`;
}

export function getTestBotUserId(): string | null {
  hydrateTestBotEnvFromDisk();
  return (
    testBotClient?.user?.id ||
    process.env.TEST_BOT_ID?.trim() ||
    extractBotIdFromToken(process.env.TEST_BOT_TOKEN) ||
    null
  );
}

export function isTestBotUser(userId?: string | null): boolean {
  if (!userId) return false;
  hydrateTestBotEnvFromDisk();
  const activeId = testBotClient?.user?.id;
  const envId = process.env.TEST_BOT_ID?.trim();
  const tokenId = extractBotIdFromToken(process.env.TEST_BOT_TOKEN);
  return (
    (Boolean(activeId) && activeId === userId) ||
    (Boolean(envId) && envId === userId) ||
    (Boolean(tokenId) && tokenId === userId)
  );
}

export function getTestBotInfo() {
  hydrateTestBotEnvFromDisk();
  const user = testBotClient?.user;
  const extractedId = extractBotIdFromToken(process.env.TEST_BOT_TOKEN);
  const resolvedId = user?.id || process.env.TEST_BOT_ID?.trim() || extractedId || null;
  const appId =
    process.env.TEST_BOT_APPLICATION_ID?.trim() ||
    testBotClient?.application?.id ||
    resolvedId ||
    "";

  return {
    configured: Boolean(process.env.TEST_BOT_TOKEN?.trim()),
    online: isTestBotOnline(),
    id: resolvedId,
    applicationId: appId || null,
    username: user?.tag || user?.username || null,
    avatar: user?.displayAvatarURL() || null,
    inviteUrl: buildTestBotInviteUrl(appId),
    guildsCount: testBotClient?.guilds.cache.size || 0,
    guildIds: testBotClient ? Array.from(testBotClient.guilds.cache.keys()) : [],
    lastError: lastTestBotError,
  };
}

export async function inspectTestBotTokenOrId(tokenOrId: string): Promise<{
  id: string;
  username: string | null;
  avatar: string | null;
  inviteUrl: string;
}> {
  const clean = tokenOrId.trim();
  if (/^\d{17,22}$/.test(clean)) {
    savePersistedTestBotConfig({ applicationId: clean, botId: clean });
    return {
      id: clean,
      username: null,
      avatar: null,
      inviteUrl: buildTestBotInviteUrl(clean)!,
    };
  }

  const decodedId = extractBotIdFromToken(clean);
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${clean}` },
    });
    if (res.ok) {
      const me = (await res.json()) as { id: string; username: string; discriminator?: string; avatar?: string | null };
      const tag = me.discriminator && me.discriminator !== "0" ? `${me.username}#${me.discriminator}` : me.username;
      savePersistedTestBotConfig({ botId: me.id, applicationId: me.id });
      return {
        id: me.id,
        username: tag,
        avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null,
        inviteUrl: buildTestBotInviteUrl(me.id)!,
      };
    }
  } catch {
    // Fallback to token-decoded ID below
  }

  if (decodedId) {
    savePersistedTestBotConfig({ botId: decodedId, applicationId: decodedId });
    return {
      id: decodedId,
      username: null,
      avatar: null,
      inviteUrl: buildTestBotInviteUrl(decodedId)!,
    };
  }

  throw new Error("Não foi possível extrair o ID. Cole um Bot Token válido ou o Client/Application ID numérico.");
}

export async function initTestDiscordBot(forceReconnect = false): Promise<Client | null> {
  hydrateTestBotEnvFromDisk();
  const token = process.env.TEST_BOT_TOKEN?.trim();
  if (!token || token === "MY_SECOND_TEST_BOT_TOKEN") {
    lastTestBotError = "TEST_BOT_TOKEN não configurado.";
    console.log("[Test Bot Gateway] TEST_BOT_TOKEN não configurado. 2º Bot de Testes em espera.");
    return null;
  }

  if (!forceReconnect && testBotClient && testBotClient.isReady()) {
    lastTestBotError = null;
    return testBotClient;
  }

  if (isStartingTestBot) {
    // Wait up to 8s for an in-progress startup to finish
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      if (testBotClient && testBotClient.isReady()) return testBotClient;
      if (!isStartingTestBot) break;
    }
    return testBotClient;
  }

  isStartingTestBot = true;
  lastTestBotError = null;

  try {
    if (testBotClient) {
      try {
        await testBotClient.destroy();
      } catch {}
      testBotClient = null;
    }

    // Use ONLY non-privileged intents so the 2nd Test Bot NEVER fails with DisallowedIntents
    // even if Server Members / Message Content toggles are disabled in Discord Developer Portal!
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    const readyPromise = new Promise<Client>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Tempo limite aguardando conexão Gateway do 2º Bot (ClientReady)."));
      }, 15000);

      client.once(Events.ClientReady, (c) => {
        clearTimeout(timeout);
        console.log(`[Test Bot Gateway] 🧪 2º BOT DE TESTES CONECTADO: ${c.user.tag} (${c.user.id})`);
        savePersistedTestBotConfig({
          token,
          botId: c.user.id,
          applicationId: c.application?.id || c.user.id,
        });
        c.user.setActivity("🧪 Bot de Testes | /spam", { type: 0 });
        resolve(client);
      });

      client.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    client.on("error", (err) => {
      console.error("[Test Bot Gateway Error]:", err);
      lastTestBotError = err.message;
    });

    await client.login(token);
    await readyPromise;

    testBotClient = client;
    lastTestBotError = null;
    return client;
  } catch (err) {
    const rawMsg = (err as Error).message || String(err);
    lastTestBotError = rawMsg.includes("disallowed intents")
      ? "Intents privilegiadas bloqueadas no Discord Developer Portal."
      : rawMsg.includes("invalid token") || rawMsg.includes("An invalid token was provided")
      ? "Token do 2º Bot inválido! Copie um token novo em Discord Developer Portal -> Bot -> Reset Token."
      : rawMsg;
    console.error("[Test Bot Gateway] Falha ao iniciar 2º Bot de Testes:", lastTestBotError);
    testBotClient = null;
    return null;
  } finally {
    isStartingTestBot = false;
  }
}

export async function destroyTestDiscordBot(): Promise<void> {
  if (testBotClient) {
    try {
      await testBotClient.destroy();
    } catch {}
    testBotClient = null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageViaTestBotRest(
  channelId: string,
  payload: string | { content: string; allowed_mentions?: { parse: string[] } }
): Promise<void> {
  hydrateTestBotEnvFromDisk();
  const token = process.env.TEST_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TEST_BOT_TOKEN não configurado.");
  }

  const body = typeof payload === "string" ? { content: payload } : payload;
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("Token do 2º Bot inválido ou expirado (401). Gere um novo token no Discord Developer Portal.");
    }
    if (res.status === 403) {
      throw new Error("O 2º Bot não tem permissão para enviar mensagens neste canal (verifique se ele entrou no servidor e tem permissão de Enviar Mensagens).");
    }
    if (res.status === 404) {
      throw new Error("Canal não encontrado pelo 2º Bot (404). Verifique se o 2º Bot já foi convidado para este servidor.");
    }
    throw new Error(`Erro Discord API (${res.status}) ao enviar mensagem pelo 2º Bot: ${errText.slice(0, 200)}`);
  }
}

/**
 * Executes a real security test using the 2nd Discord Bot against the Main Bot's moderation engine.
 */
export async function runSecurityTest(
  guildId: string,
  channelId: string,
  testType: SecurityTestType = "spam",
  customText?: string
): Promise<{
  success: boolean;
  testType: SecurityTestType;
  message: string;
  hasAdminWarning: boolean;
}> {
  hydrateTestBotEnvFromDisk();

  // Auto-connect if token exists but Gateway wasn't ready yet
  if (!testBotClient || !testBotClient.isReady()) {
    await initTestDiscordBot();
  }

  const token = process.env.TEST_BOT_TOKEN?.trim();
  if (!token || token === "MY_SECOND_TEST_BOT_TOKEN") {
    throw new Error(
      "O 2º Bot de Testes não está configurado! Cole o TEST_BOT_TOKEN na aba Moderação Avançada (ou no .env) e clique em ⚡ Ligar 2º Bot."
    );
  }

  // Resolve Test Bot user ID via Gateway or REST /users/@me fallback
  let testBotId = testBotClient?.user?.id || getTestBotUserId();
  let testBotTag = testBotClient?.user?.tag || "Bot de Testes";

  if (!testBotId) {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    }).catch(() => null);
    if (meRes && meRes.ok) {
      const me = (await meRes.json()) as { id: string; username: string };
      testBotId = me.id;
      testBotTag = me.username;
      savePersistedTestBotConfig({ botId: me.id });
    }
  }

  if (!testBotId) {
    throw new Error(
      `O 2º Bot de Testes não conseguiu conectar${
        lastTestBotError ? ` (${lastTestBotError})` : ""
      }. Verifique o TEST_BOT_TOKEN na aba Moderação Avançada.`
    );
  }

  const {
    isMemberInQuarantine,
    triggerTestRaidQuarantine,
    waitForQuarantineRelease,
    whitelistBotId,
  } = await import("./moderation");
  const { getBotClient } = await import("./bot");

  whitelistBotId(testBotId);

  if (isMemberInQuarantine(guildId, testBotId)) {
    throw new Error(
      "⏳ O Bot de Testes ainda está cumprindo os 10 segundos de castigo no canal #spam-não! Aguarde a liberação automática para rodar outro teste."
    );
  }

  const mainClient = getBotClient();
  const mainGuild = mainClient?.guilds.cache.get(guildId);
  const mainChannel = mainGuild?.channels.cache.get(channelId) as TextChannel | undefined;

  // Check via Main Bot or Test Bot whether Test Bot is actually inside this guild
  const testMemberInGuild = mainGuild
    ? await mainGuild.members.fetch(testBotId).catch(() => null)
    : null;
  const testGuild = testBotClient?.guilds.cache.get(guildId);

  if (!testMemberInGuild && !testGuild) {
    const info = getTestBotInfo();
    throw new Error(
      `O 2º Bot de Testes (${testBotTag}) ainda não está neste servidor! Convide-o primeiro${
        info.inviteUrl ? `: ${info.inviteUrl}` : "."
      }`
    );
  }

  const hasAdminWarning = Boolean(
    testMemberInGuild?.permissions.has(PermissionFlagsBits.Administrator)
  );

  const testChannel = testGuild
    ? ((await testGuild.channels.fetch(channelId).catch(() => null)) as TextChannel | null)
    : null;

  const sendAsTestBot = async (
    payload: string | { content: string; allowedMentions?: { parse: string[] } }
  ) => {
    if (testChannel && testChannel.isTextBased() && "send" in testChannel) {
      try {
        await testChannel.send(payload as any);
        return;
      } catch {
        // Fallback to direct REST below
      }
    }
    const restPayload =
      typeof payload === "string"
        ? payload
        : { content: payload.content, allowed_mentions: { parse: [] } };
    await sendMessageViaTestBotRest(channelId, restPayload);
  };

  const executeSingleTest = async (mode: Exclude<SecurityTestType, "all">) => {
    if (mode === "spam") {
      const spamPhrase = customText?.trim() || "🚨 Teste Anti-Spam do Sistema #Phoenix";
      for (let i = 1; i <= 10; i++) {
        await sendAsTestBot(spamPhrase);
        if (i < 10) await sleep(300);
      }
      return "Teste de Anti-Spam (10 mensagens repetidas reais no chat) disparado! O Bot de Testes tomou castigo por 10s, as mensagens são apagadas após o castigo e ele será liberado automaticamente.";
    }

    if (mode === "invite") {
      await sendAsTestBot("🔗 Teste de bloqueio Anti-Convite: https://discord.gg/teste-bloqueio-sistema");
      return "Teste de Filtro Anti-Links de Convite disparado! Castigo de 10s aplicado e será liberado automaticamente.";
    }

    if (mode === "massping") {
      await sendAsTestBot({
        content: "📢 Teste de bloqueio Anti-MassPing @everyone (simulação segura do sistema)",
        allowedMentions: { parse: [] },
      });
      return "Teste de Escudo Anti-MassPing (@everyone) disparado! Castigo de 10s aplicado e será liberado automaticamente.";
    }

    // mode === "raid"
    if (!mainGuild) {
      throw new Error("Bot principal não conectado ao servidor para simular quarentena Anti-Raid.");
    }
    await triggerTestRaidQuarantine(mainGuild, testBotId!, channelId);
    return "Teste do Escudo Anti-Raid / Quarentena (#spam-não) disparado! O Bot de Testes ficará em castigo por 10s e será liberado automaticamente.";
  };

  if (testType === "all") {
    (async () => {
      const steps: Array<{ mode: Exclude<SecurityTestType, "all">; label: string }> = [
        { mode: "invite", label: "1/4 • Filtro Anti-Links de Convite" },
        { mode: "massping", label: "2/4 • Escudo Anti-MassPing (@everyone)" },
        { mode: "spam", label: "3/4 • Motor Anti-Spam (10x repetição)" },
        { mode: "raid", label: "4/4 • Escudo Anti-Raid & Quarentena (#spam-não)" },
      ];

      const results: string[] = [];

      for (const step of steps) {
        try {
          if (mainChannel) {
            await mainChannel
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x3b82f6)
                    .setTitle(`🧪 INICIANDO TESTE: ${step.label}`)
                    .setDescription(
                      `O 2º Bot de Testes (<@${testBotId}>) vai disparar a infração agora.\n` +
                      `⏱️ Após o bloqueio, ele cumprirá **10 segundos** de castigo em **#spam-não** antes da liberação automática.`
                    )
                    .setTimestamp(),
                ],
              })
              .catch(() => {});
          }

          await sleep(800);
          await executeSingleTest(step.mode);
          const released = await waitForQuarantineRelease(guildId, testBotId!, 25000);
          results.push(`${released ? "✅" : "⚠️"} **${step.label}** — ${released ? "Bloqueado, castigo 10s e liberado!" : "Tempo limite excedido"}`);
          await sleep(1200);
        } catch (err) {
          results.push(`❌ **${step.label}** — Falha: ${(err as Error).message}`);
        }
      }

      if (mainChannel) {
        await mainChannel
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x10b981)
                .setTitle("🏆 BATERIA DE TESTES DE SEGURANÇA CONCLUÍDA!")
                .setDescription(
                  `Todos os sistemas de bloqueio foram testados ao vivo com o 2º Bot (<@${testBotId}>):\n\n` +
                  results.join("\n") +
                  `\n\n🛡️ **Conclusão:** O sistema está funcionando 100% e nenhum banimento foi aplicado ao Bot de Testes!`
                )
                .setFooter({ text: "Protocolo de Auto-Teste • Sistema Phoenix" })
                .setTimestamp(),
            ],
          })
          .catch(() => {});
      }
    })().catch((e) => console.error("[All Security Tests Error]:", e));

    return {
      success: true,
      testType: "all",
      message:
        "🧪 Bateria completa iniciada (4 sistemas de bloqueio: Anti-Convite, Anti-MassPing, Anti-Spam 10x e Anti-Raid)! Cada etapa dura ~10 segundos e gera relatório automático no canal.",
      hasAdminWarning,
    };
  }

  const msg = await executeSingleTest(testType);
  return {
    success: true,
    testType,
    message: msg,
    hasAdminWarning,
  };
}
