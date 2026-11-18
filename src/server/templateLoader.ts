import fs from 'node:fs';
import path from 'node:path';

export interface TemplateChannel {
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  readOnly?: boolean;
  adminOnly?: boolean;
  userLimit?: number;
}

export interface TemplateCategory {
  name: string;
  adminOnly?: boolean;
  channels: TemplateChannel[];
}

export interface ServerTemplate {
  id: string;
  categories: TemplateCategory[];
}

interface TemplateFileSchema {
  templates?: Record<string, Partial<ServerTemplate>>;
  id?: string;
  categories?: TemplateCategory[];
}

const TEMPLATE_PATH = path.resolve(process.cwd(), 'server', 'template.json');

function validateTemplate(parsed: Partial<ServerTemplate> | undefined): ServerTemplate {
  if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.categories)) {
    throw new Error('Estrutura do template inválida em server/template.json.');
  }

  for (const category of parsed.categories) {
    if (!category || typeof category.name !== 'string' || !category.name.trim()) {
      throw new Error('Categoria inválida encontrada no template.');
    }
    if (!Array.isArray(category.channels)) {
      throw new Error(`Lista de canais inválida na categoria "${category.name}".`);
    }
    for (const channel of category.channels) {
      if (
        !channel ||
        typeof channel.name !== 'string' ||
        !channel.name.trim() ||
        (channel.type !== 'text' && channel.type !== 'voice')
      ) {
        throw new Error(`Canal inválido encontrado na categoria "${category.name}".`);
      }
    }
  }

  return parsed as ServerTemplate;
}

/**
 * Loads the requested server structure template (e.g. "dog" or "dogs1") from disk
 * so any edits to server/template.json take effect immediately on the next /aph run.
 */
export function loadServerTemplate(templateId = 'dog'): ServerTemplate {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as TemplateFileSchema;

  if (parsed.templates && typeof parsed.templates === 'object') {
    const selected = parsed.templates[templateId];
    if (!selected) {
      throw new Error(`Template "${templateId}" não encontrado em server/template.json.`);
    }
    return validateTemplate(selected);
  }

  return validateTemplate(parsed);
}

export function getAvailableTemplateIds(): string[] {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as TemplateFileSchema;
  if (parsed.templates && typeof parsed.templates === 'object') {
    return Object.keys(parsed.templates);
  }
  return parsed.id ? [parsed.id] : [];
}
