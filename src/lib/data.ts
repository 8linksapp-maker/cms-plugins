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

export function getWalkerPaths(): Record<string, WalkerPaths> {
  return JSON.parse(
    readFileSync(resolve(ROOT, 'templates/walker/paths.json'), 'utf-8')
  );
}

export function getThemes(): string[] {
  try {
    return readdirSync(resolve(ROOT, 'templates'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}
