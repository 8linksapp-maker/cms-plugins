import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

export interface PluginMeta {
  name: string;
  version: string;
  description: string;
  files: string[];
  adminPages: string[];
  configDefaults: Record<string, any>;
  hub: {
    label: string;
    description: string;
    icon: string;
    color: string;
    bg: string;
    href: string;
  };
  changelog: string;
}

export interface RegistryEntry {
  version: string;
  description: string;
}

export interface WalkerPaths {
  files: { src: string; dest: string }[];
  adminPages: { src: string; dest: string }[];
  slots: { slot: string; import: string; component: string }[];
}

export function getRegistry(): Record<string, RegistryEntry> {
  return JSON.parse(readFileSync(resolve(ROOT, 'registry.json'), 'utf-8'));
}

export function getPluginNames(): string[] {
  return readdirSync(resolve(ROOT, 'plugins'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

export function getPlugin(name: string): PluginMeta {
  return JSON.parse(
    readFileSync(resolve(ROOT, `plugins/${name}/plugin.json`), 'utf-8')
  );
}

export function getAllPlugins(): PluginMeta[] {
  return getPluginNames().map(getPlugin);
}

export function getTemplatePaths(name: string): Record<string, WalkerPaths> {
  return JSON.parse(
    readFileSync(resolve(ROOT, `templates/${name}/paths.json`), 'utf-8')
  );
}

/** @deprecated use getTemplatePaths('walker') */
export function getWalkerPaths(): Record<string, WalkerPaths> {
  return getTemplatePaths('walker');
}

export interface ThemeMeta {
  name: string;
  label: string;
  description: string;
  version: string;
  status: string;
  screenshot: string;
}

export function getThemeNames(): string[] {
  try {
    return readdirSync(resolve(ROOT, 'templates'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

export function getTheme(name: string): ThemeMeta {
  return JSON.parse(
    readFileSync(resolve(ROOT, `templates/${name}/theme.json`), 'utf-8')
  );
}

export function getAllThemes(): ThemeMeta[] {
  return getThemeNames().map(getTheme);
}

/** @deprecated use getAllThemes() */
export function getThemes(): string[] {
  return getThemeNames();
}
