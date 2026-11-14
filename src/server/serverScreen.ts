import puppeteer, { Browser, Page } from "puppeteer-core";
import { broadcastFrameToCallChat, joinVoiceCall } from "./voice";

export interface ServerBroadcastSession {
  active: boolean;
  internalStage: boolean;
  region: string;
  guildId: string;
  voiceChannelId: string;
  fallbackTextChannelId?: string;
  url: string;
  title: string;
  intervalSeconds: number;
  startedAt: number;
  lastUpdatedAt: number | null;
  framesSent: number;
  messageId: string | null;
  discordChannelName: string | null;
  discordLink: string | null;
  lastError: string | null;
  lastFrameBase64: string | null;
}

const gScreen = globalThis as any;

let browserInstance: Browser | null = gScreen.__ssBrowser || null;
let activePage: Page | null = gScreen.__ssPage || null;
let syncTimer: ReturnType<typeof setInterval> | null = gScreen.__ssTimer || null;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let isCapturing = false;

let currentState: ServerBroadcastSession = gScreen.__ssState || {
  active: false,
  internalStage: false,
  region: "us-east5 (Estados Unidos)",
  guildId: "",
  voiceChannelId: "",
  fallbackTextChannelId: undefined,
  url: "",
  title: "",
  intervalSeconds: 4,
  startedAt: 0,
  lastUpdatedAt: null,
  framesSent: 0,
  messageId: null,
  discordChannelName: null,
  discordLink: null,
  lastError: null,
  lastFrameBase64: null,
};

function syncGlobalRefs() {
  gScreen.__ssBrowser = browserInstance;
  gScreen.__ssPage = activePage;
  gScreen.__ssTimer = syncTimer;
  gScreen.__ssState = currentState;
}

function validatePublicUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("Informe a URL do site para o bot compartilhar.");
  const withProto =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("URL inválida.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Apenas URLs http:// ou https:// são suportadas.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Endereços locais ou privados não são permitidos.");
  }

  return parsed.toString();
}

async function ensureBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
  browserInstance = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--lang=en-US",
      "--window-size=1280,720",
    ],
    env: {
      ...process.env,
      TZ: "America/New_York",
    },
  });
  browserInstance.on("disconnected", () => {
    browserInstance = null;
    activePage = null;
    syncGlobalRefs();
  });
  syncGlobalRefs();
  return browserInstance;
}

async function captureAndPushFrame(pushToDiscord: boolean): Promise<string | null> {
  if (!activePage || activePage.isClosed() || isCapturing) {
    return currentState.lastFrameBase64;
  }
  isCapturing = true;
  try {
    const base64 = (await activePage.screenshot({
      type: "jpeg",
      quality: 82,
      encoding: "base64",
    })) as string;
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    currentState.lastFrameBase64 = dataUrl;
    currentState.title = (await activePage.title().catch(() => "")) || currentState.url;
    currentState.url = activePage.url() || currentState.url;

    if (pushToDiscord && currentState.active && currentState.guildId && currentState.voiceChannelId) {
      try {
        const captionText = currentState.internalStage
          ? `📺 **Tela do Jogo ao Vivo (Servidor EUA · us-east5)**\n🖥️ Frame sincronizado automaticamente (independente do seu celular/PC)`
          : `🌐 **Tela do Bot (Servidor EUA 24h):** ${currentState.title}\n🔗 ${currentState.url}`;

        const res = await broadcastFrameToCallChat(
          currentState.guildId,
          currentState.voiceChannelId,
          dataUrl,
          captionText,
          currentState.messageId || undefined,
          currentState.fallbackTextChannelId
        );
        currentState.messageId = res.messageId;
        currentState.discordChannelName = res.channelName;
        currentState.discordLink = res.discordLink;
        currentState.framesSent += 1;
        currentState.lastUpdatedAt = Date.now();
        currentState.lastError = null;
      } catch (err) {
        currentState.lastError = (err as Error).message;
      }
    }
    syncGlobalRefs();
    return dataUrl;
  } catch (err) {
    currentState.lastError = (err as Error).message;
    return currentState.lastFrameBase64;
  } finally {
    isCapturing = false;
  }
}

export async function startServerScreenBroadcast(params: {
  guildId: string;
  voiceChannelId: string;
  url: string;
  fallbackTextChannelId?: string;
  intervalSeconds?: number;
}): Promise<ServerBroadcastSession> {
  const safeUrl = validatePublicUrl(params.url);
  const intervalSecs = Math.min(30, Math.max(3, Number(params.intervalSeconds) || 5));

  await joinVoiceCall(params.guildId, params.voiceChannelId);

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  const browser = await ensureBrowser();
  if (!activePage || activePage.isClosed()) {
    activePage = await browser.newPage();
    await activePage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await activePage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    );
  }

  await activePage.goto(safeUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch((err) => {
    console.warn("[ServerScreen] Aviso ao navegar:", (err as Error).message);
  });

  await new Promise((r) => setTimeout(r, 900));
  const title = (await activePage.title().catch(() => "")) || safeUrl;

  currentState = {
    active: true,
    internalStage: false,
    region: "us-east5 (Estados Unidos)",
    guildId: params.guildId,
    voiceChannelId: params.voiceChannelId,
    fallbackTextChannelId: params.fallbackTextChannelId,
    url: activePage.url() || safeUrl,
    title,
    intervalSeconds: intervalSecs,
    startedAt: Date.now(),
    lastUpdatedAt: null,
    framesSent: 0,
    messageId: null,
    discordChannelName: null,
    discordLink: null,
    lastError: null,
    lastFrameBase64: null,
  };
  syncGlobalRefs();

  await captureAndPushFrame(true);

  syncTimer = setInterval(() => {
    if (!currentState.active) return;
    captureAndPushFrame(true).catch(() => {});
  }, intervalSecs * 1000);
  syncGlobalRefs();

  return { ...currentState };
}

/**
 * Starts the server-side US (us-east5) Chromium frame on our own internal 16:9 Stage (/?stage=broadcast).
 * Starts on Scene 1 ("AGUARDANDO INÍCIO DA PARTIDA") and keeps streaming frames independently
 * even if the user leaves the app or switches apps on mobile/desktop.
 */
export async function startInternalStageBroadcast(params: {
  guildId: string;
  voiceChannelId: string;
  fallbackTextChannelId?: string;
  intervalSeconds?: number;
}): Promise<ServerBroadcastSession> {
  const port = Number(process.env.PORT) || 3000;
  const stageUrl = `http://127.0.0.1:${port}/?stage=broadcast`;
  const intervalSecs = Math.min(15, Math.max(3, Number(params.intervalSeconds) || 4));

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  const browser = await ensureBrowser();
  if (!activePage || activePage.isClosed()) {
    activePage = await browser.newPage();
    await activePage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await activePage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    );
  }

  await activePage.goto(stageUrl, { waitUntil: "networkidle2", timeout: 25_000 }).catch((err) => {
    console.warn("[InternalStage] Aviso ao carregar palco local:", (err as Error).message);
  });

  await new Promise((r) => setTimeout(r, 1000));

  currentState = {
    active: true,
    internalStage: true,
    region: "us-east5 (Estados Unidos)",
    guildId: params.guildId,
    voiceChannelId: params.voiceChannelId,
    fallbackTextChannelId: params.fallbackTextChannelId,
    url: stageUrl,
    title: "Palco Ao Vivo — Esperando o Jogo Começar",
    intervalSeconds: intervalSecs,
    startedAt: Date.now(),
    lastUpdatedAt: null,
    framesSent: 0,
    messageId: null,
    discordChannelName: null,
    discordLink: null,
    lastError: null,
    lastFrameBase64: null,
  };
  syncGlobalRefs();

  await captureAndPushFrame(true);

  syncTimer = setInterval(() => {
    if (!currentState.active) return;
    captureAndPushFrame(true).catch(() => {});
  }, intervalSecs * 1000);
  syncGlobalRefs();

  return { ...currentState };
}

/**
 * Seamlessly retargets an active US server-side stage stream when moving from the lobby voice call
 * to the temporary private match voice channel (🎙️・jogo-principal).
 */
export async function retargetServerScreenBroadcast(
  guildId: string,
  newVoiceChannelId: string,
  fallbackTextChannelId?: string
): Promise<void> {
  if (!currentState.active) return;
  currentState.guildId = guildId;
  currentState.voiceChannelId = newVoiceChannelId;
  if (fallbackTextChannelId !== undefined) {
    currentState.fallbackTextChannelId = fallbackTextChannelId;
  }
  currentState.messageId = null; // post fresh stage message inside the new match call chat
  syncGlobalRefs();
  await captureAndPushFrame(true);
}

/**
 * Triggers an immediate debounced frame capture whenever a WebSocket broadcast scene updates.
 */
export function triggerServerStageFrameRefresh(): void {
  if (!currentState.active || !currentState.internalStage) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    if (currentState.active && currentState.internalStage) {
      captureAndPushFrame(true).catch(() => {});
    }
  }, 550);
}

export function isServerStageBroadcastActive(): boolean {
  return Boolean(currentState.active);
}

export async function navigateServerScreen(url: string): Promise<ServerBroadcastSession> {
  if (!currentState.active || !activePage || activePage.isClosed()) {
    throw new Error("Nenhuma transmissão de servidor ativa no momento.");
  }
  const safeUrl = validatePublicUrl(url);
  currentState.internalStage = false;
  await activePage.goto(safeUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 700));
  await captureAndPushFrame(true);
  return { ...currentState };
}

export async function interactServerScreen(action: {
  type: "click" | "scroll" | "back" | "reload" | "type";
  x?: number;
  y?: number;
  deltaY?: number;
  text?: string;
}): Promise<ServerBroadcastSession> {
  if (!currentState.active || !activePage || activePage.isClosed()) {
    throw new Error("Nenhuma transmissão de servidor ativa no momento.");
  }

  if (action.type === "click" && typeof action.x === "number" && typeof action.y === "number") {
    const cx = Math.max(0, Math.min(1280, Math.round(action.x)));
    const cy = Math.max(0, Math.min(720, Math.round(action.y)));
    await activePage.mouse.click(cx, cy);
    await new Promise((r) => setTimeout(r, 500));
  } else if (action.type === "scroll") {
    const dy = Number(action.deltaY) || 400;
    await activePage.evaluate((amount) => window.scrollBy(0, amount), dy);
    await new Promise((r) => setTimeout(r, 250));
  } else if (action.type === "back") {
    await activePage.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  } else if (action.type === "reload") {
    await activePage.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
  } else if (action.type === "type" && action.text) {
    await activePage.keyboard.type(action.text, { delay: 20 });
    await activePage.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 600));
  }

  await captureAndPushFrame(true);
  return { ...currentState };
}

export async function getServerScreenStatus(refreshSnapshot = false): Promise<ServerBroadcastSession> {
  if (refreshSnapshot && currentState.active && activePage && !activePage.isClosed()) {
    await captureAndPushFrame(false);
  }
  return { ...currentState };
}

export async function stopServerScreenBroadcast(): Promise<ServerBroadcastSession> {
  currentState.active = false;
  currentState.internalStage = false;
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = null;
  }
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (activePage && !activePage.isClosed()) {
    await activePage.close().catch(() => {});
  }
  activePage = null;
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
  syncGlobalRefs();
  return { ...currentState };
}
