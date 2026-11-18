import fs from 'node:fs';
import path from 'node:path';
import { normalizeDiscordName } from './channelUtils.ts';

export type BannerEventType = 'welcome' | 'leave';

export interface BannerRuleConfig {
  enabled: boolean;
  channelId: string | null;
  title: string;
  message: string;
  imageFilename: string | null;
}

export interface GuildConfig {
  guildId: string;
  welcome: BannerRuleConfig;
  leave: BannerRuleConfig;
  updatedAt: string;
}

export interface AccountConfigRecord {
  userId: string;
  guilds: Record<string, GuildConfig>;
  lastPreset: {
    welcome: BannerRuleConfig;
    leave: BannerRuleConfig;
    updatedAt: string;
  } | null;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const CONFIG_FILE = path.resolve(DATA_DIR, 'guild-configs.json');
const ACCOUNT_CONFIG_FILE = path.resolve(DATA_DIR, 'account-configs.json');

function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function createDefaultRule(type: BannerEventType): BannerRuleConfig {
  if (type === 'welcome') {
    return {
      enabled: false,
      channelId: null,
      title: 'BEM-VINDO',
      message: 'Seja bem-vindo(a) ao servidor {server}!',
      imageFilename: null,
    };
  }
  return {
    enabled: false,
    channelId: null,
    title: 'ATÉ LOGO',
    message: '{user} saiu do servidor.',
    imageFilename: null,
  };
}

export function createDefaultGuildConfig(guildId: string): GuildConfig {
  return {
    guildId,
    welcome: createDefaultRule('welcome'),
    leave: createDefaultRule('leave'),
    updatedAt: new Date().toISOString(),
  };
}

function readAllConfigs(): Record<string, GuildConfig> {
  ensureDataDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, GuildConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllConfigs(configs: Record<string, GuildConfig>): void {
  ensureDataDirs();
  const tmpPath = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(configs, null, 2), 'utf-8');
  fs.renameSync(tmpPath, CONFIG_FILE);
}

function readAllAccountConfigs(): Record<string, AccountConfigRecord> {
  ensureDataDirs();
  if (!fs.existsSync(ACCOUNT_CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(ACCOUNT_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, AccountConfigRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllAccountConfigs(records: Record<string, AccountConfigRecord>): void {
  ensureDataDirs();
  const tmpPath = `${ACCOUNT_CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmpPath, ACCOUNT_CONFIG_FILE);
}

export function hasSavedGuildConfig(guildId: string): boolean {
  const all = readAllConfigs();
  return Boolean(all[guildId]);
}

export function getGuildConfig(guildId: string): GuildConfig {
  const all = readAllConfigs();
  const existing = all[guildId];
  if (!existing) {
    return createDefaultGuildConfig(guildId);
  }
  return {
    guildId,
    welcome: { ...createDefaultRule('welcome'), ...existing.welcome },
    leave: { ...createDefaultRule('leave'), ...existing.leave },
    updatedAt: existing.updatedAt || new Date().toISOString(),
  };
}

export function saveGuildConfig(config: GuildConfig): GuildConfig {
  const all = readAllConfigs();
  const updated: GuildConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  all[config.guildId] = updated;
  writeAllConfigs(all);
  return updated;
}

export function getUploadFilePath(filename: string): string {
  ensureDataDirs();
  const safeName = path.basename(filename);
  return path.resolve(UPLOADS_DIR, safeName);
}

export function saveUploadedImage(
  guildId: string,
  eventType: BannerEventType,
  buffer: Buffer,
  ext: 'png' | 'jpg' | 'webp',
  previousFilename: string | null,
): string {
  ensureDataDirs();

  if (previousFilename && !previousFilename.startsWith('account_')) {
    const prevPath = getUploadFilePath(previousFilename);
    if (fs.existsSync(prevPath)) {
      fs.unlinkSync(prevPath);
    }
  }

  const filename = `${guildId}_${eventType}_${Date.now()}.${ext}`;
  const targetPath = getUploadFilePath(filename);
  fs.writeFileSync(targetPath, buffer);
  return filename;
}

export function deleteUploadedImage(filename: string | null): void {
  if (!filename || filename.startsWith('account_')) return;
  const targetPath = getUploadFilePath(filename);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}

function copyUploadFile(sourceFilename: string | null, targetBasePrefix: string): string | null {
  if (!sourceFilename) return null;
  const sourcePath = getUploadFilePath(sourceFilename);
  if (!fs.existsSync(sourcePath)) return null;

  const ext = path.extname(sourceFilename).toLowerCase() || '.png';
  const targetFilename = `${targetBasePrefix}${ext}`;
  const targetPath = getUploadFilePath(targetFilename);

  if (sourcePath !== targetPath) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return targetFilename;
}

function normalizeChannelName(name: string): string {
  return normalizeDiscordName(name);
}

function backupRuleImageForAccount(
  userId: string,
  eventType: BannerEventType,
  rule: BannerRuleConfig,
  previousAccountFilename: string | null,
): BannerRuleConfig {
  if (!rule.imageFilename) {
    if (previousAccountFilename) {
      const oldPath = getUploadFilePath(previousAccountFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    return { ...rule, imageFilename: null };
  }

  const sourcePath = getUploadFilePath(rule.imageFilename);
  if (!fs.existsSync(sourcePath)) {
    // Keep previous account backup if the guild file is missing
    if (previousAccountFilename && fs.existsSync(getUploadFilePath(previousAccountFilename))) {
      return { ...rule, imageFilename: previousAccountFilename };
    }
    return { ...rule, imageFilename: null };
  }

  const ext = path.extname(rule.imageFilename).toLowerCase() || '.png';
  const backupFilename = `account_${userId}_${eventType}${ext}`;
  const backupPath = getUploadFilePath(backupFilename);

  if (previousAccountFilename && previousAccountFilename !== backupFilename) {
    const oldPath = getUploadFilePath(previousAccountFilename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  if (sourcePath !== backupPath) {
    fs.copyFileSync(sourcePath, backupPath);
  }

  return {
    ...rule,
    imageFilename: backupFilename,
  };
}

/**
 * Persists a guild's configuration inside the authenticated Discord user's account record
 * so that even if browser cache/cookies are cleared or the user reconnects on another device
 * or server, their saved setup and images remain bound to their Discord account.
 */
export function syncGuildConfigToAccount(userId: string, config: GuildConfig): AccountConfigRecord {
  const allAccounts = readAllAccountConfigs();
  const existingAccount: AccountConfigRecord = allAccounts[userId] ?? {
    userId,
    guilds: {},
    lastPreset: null,
    updatedAt: new Date().toISOString(),
  };

  const prevPresetWelcomeImg = existingAccount.lastPreset?.welcome.imageFilename ?? null;
  const prevPresetLeaveImg = existingAccount.lastPreset?.leave.imageFilename ?? null;

  const welcomeBackup = backupRuleImageForAccount(
    userId,
    'welcome',
    config.welcome,
    prevPresetWelcomeImg,
  );
  const leaveBackup = backupRuleImageForAccount(
    userId,
    'leave',
    config.leave,
    prevPresetLeaveImg,
  );

  const nowIso = new Date().toISOString();
  const updatedAccount: AccountConfigRecord = {
    userId,
    guilds: {
      ...existingAccount.guilds,
      [config.guildId]: {
        guildId: config.guildId,
        welcome: { ...config.welcome },
        leave: { ...config.leave },
        updatedAt: config.updatedAt || nowIso,
      },
    },
    lastPreset: {
      welcome: welcomeBackup,
      leave: leaveBackup,
      updatedAt: nowIso,
    },
    updatedAt: nowIso,
  };

  allAccounts[userId] = updatedAccount;
  writeAllAccountConfigs(allAccounts);
  return updatedAccount;
}

function ensureGuildImagesExistFromAccount(
  guildId: string,
  guildRule: BannerRuleConfig,
  accountFallbackRule: BannerRuleConfig | null | undefined,
  eventType: BannerEventType,
): BannerRuleConfig {
  if (guildRule.imageFilename && fs.existsSync(getUploadFilePath(guildRule.imageFilename))) {
    return guildRule;
  }

  const backupName = accountFallbackRule?.imageFilename ?? null;
  if (backupName && fs.existsSync(getUploadFilePath(backupName))) {
    const restoredName = copyUploadFile(backupName, `${guildId}_${eventType}_${Date.now()}`);
    return {
      ...guildRule,
      imageFilename: restoredName,
    };
  }

  return {
    ...guildRule,
    imageFilename: null,
  };
}

/**
 * Synchronizes existing guild configs to the user's account and restores any missing
 * guild configs from the user's Discord account record upon authentication.
 */
export function restoreAccountConfigsForUser(userId: string, adminGuildIds: string[]): void {
  const allGuildConfigs = readAllConfigs();
  const allAccounts = readAllAccountConfigs();
  const account = allAccounts[userId];

  let guildConfigsDirty = false;

  for (const guildId of adminGuildIds) {
    const diskConfig = allGuildConfigs[guildId];
    const accountGuildConfig = account?.guilds[guildId];

    if (diskConfig) {
      // Repair missing image files from account backup if needed, then keep account synced
      const repairedWelcome = ensureGuildImagesExistFromAccount(
        guildId,
        diskConfig.welcome,
        accountGuildConfig?.welcome ?? account?.lastPreset?.welcome,
        'welcome',
      );
      const repairedLeave = ensureGuildImagesExistFromAccount(
        guildId,
        diskConfig.leave,
        accountGuildConfig?.leave ?? account?.lastPreset?.leave,
        'leave',
      );

      if (
        repairedWelcome.imageFilename !== diskConfig.welcome.imageFilename ||
        repairedLeave.imageFilename !== diskConfig.leave.imageFilename
      ) {
        allGuildConfigs[guildId] = {
          ...diskConfig,
          welcome: repairedWelcome,
          leave: repairedLeave,
        };
        guildConfigsDirty = true;
      }

      if (!accountGuildConfig || diskConfig.updatedAt > (accountGuildConfig.updatedAt || '')) {
        syncGuildConfigToAccount(userId, allGuildConfigs[guildId]);
      }
    } else if (accountGuildConfig) {
      const restoredWelcome = ensureGuildImagesExistFromAccount(
        guildId,
        accountGuildConfig.welcome,
        account.lastPreset?.welcome,
        'welcome',
      );
      const restoredLeave = ensureGuildImagesExistFromAccount(
        guildId,
        accountGuildConfig.leave,
        account.lastPreset?.leave,
        'leave',
      );
      allGuildConfigs[guildId] = {
        guildId,
        welcome: restoredWelcome,
        leave: restoredLeave,
        updatedAt: accountGuildConfig.updatedAt || new Date().toISOString(),
      };
      guildConfigsDirty = true;
    }
  }

  if (guildConfigsDirty) {
    writeAllConfigs(allGuildConfigs);
  }
}

/**
 * When a user links/opens a guild that has no config saved yet, automatically restores
 * either that guild's account backup or the user's latest account preset (titles, messages,
 * enabled state, background images, and best-matching channels).
 */
export function restorePresetForUnconfiguredGuild(
  userId: string,
  guildId: string,
  channels: Array<{ id: string; name: string }> = [],
): GuildConfig | null {
  if (hasSavedGuildConfig(guildId)) {
    return getGuildConfig(guildId);
  }

  const allAccounts = readAllAccountConfigs();
  const account = allAccounts[userId];
  if (!account) return null;

  const exactBackup = account.guilds[guildId];
  const source = exactBackup ?? account.lastPreset;
  if (!source) return null;

  const resolveChannelId = (
    preferredId: string | null,
    eventType: BannerEventType,
  ): string | null => {
    if (preferredId && channels.some((ch) => ch.id === preferredId)) {
      return preferredId;
    }
    if (channels.length === 0) return exactBackup ? preferredId : null;

    if (eventType === 'welcome') {
      const match = channels.find((ch) => {
        const n = normalizeChannelName(ch.name);
        return (
          n.includes('entrada') ||
          n.includes('entrd') ||
          n.includes('boas-vindas') ||
          n.includes('welcome')
        );
      });
      return match?.id ?? null;
    }

    const match = channels.find((ch) => {
      const n = normalizeChannelName(ch.name);
      return n.includes('saida') || n.includes('despedida') || n.includes('leave');
    });
    return match?.id ?? null;
  };

  const restoredWelcome = ensureGuildImagesExistFromAccount(
    guildId,
    {
      ...source.welcome,
      channelId: resolveChannelId(source.welcome.channelId, 'welcome'),
    },
    account.lastPreset?.welcome,
    'welcome',
  );

  const restoredLeave = ensureGuildImagesExistFromAccount(
    guildId,
    {
      ...source.leave,
      channelId: resolveChannelId(source.leave.channelId, 'leave'),
    },
    account.lastPreset?.leave,
    'leave',
  );

  const saved = saveGuildConfig({
    guildId,
    welcome: restoredWelcome,
    leave: restoredLeave,
    updatedAt: new Date().toISOString(),
  });
  syncGuildConfigToAccount(userId, saved);
  return saved;
}
