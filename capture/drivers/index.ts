// capture/drivers/index.ts
//
// Registry of the 8 per-app drivers + the docker-compose + seed contract
// that scripts/capture_corpus.ts uses to bring each app up.

import type { PerAppDriver } from '../per_app.js';
import { conduitDriver } from './conduit.js';
import { mattermostDriver } from './mattermost.js';
import { excalidrawDriver } from './excalidraw.js';
import { gitlabCeDriver } from './gitlab-ce.js';
import { rocketChatDriver } from './rocket-chat.js';
import { penpotDriver } from './penpot.js';
import { calComDriver } from './cal-com.js';
import { nocodbDriver } from './nocodb.js';

export interface AppEntry {
  app: string;
  /** Path (relative to repo root) to the docker-compose.yml. */
  composeFile: string;
  /**
   * Seed command. Either a shell-runnable script path
   * (./apps/<app>/seed.sh) or a `tsx`-invokable typescript fixture builder
   * (npx tsx apps/<app>/seed.ts). The orchestrator will exec it from the
   * repo root.
   */
  seedCmd: string[];
  /** Approximate cold-build wall clock, for the planning log. */
  approxBuildMinutes: number;
  /** Factory that returns the driver (deferred so env vars are read late). */
  driver: () => PerAppDriver;
}

export const APPS: AppEntry[] = [
  {
    app: 'conduit',
    composeFile: 'apps/conduit/docker-compose.yml',
    seedCmd: ['./apps/conduit/seed.sh'],
    approxBuildMinutes: 8,
    driver: conduitDriver,
  },
  {
    app: 'mattermost',
    composeFile: 'apps/mattermost/docker-compose.yml',
    seedCmd: ['./apps/mattermost/seed.sh'],
    approxBuildMinutes: 3,
    driver: mattermostDriver,
  },
  {
    app: 'excalidraw',
    composeFile: 'apps/excalidraw/docker-compose.yml',
    seedCmd: ['npx', 'tsx', 'apps/excalidraw/seed.ts'],
    approxBuildMinutes: 4,
    driver: excalidrawDriver,
  },
  {
    app: 'gitlab-ce',
    composeFile: 'apps/gitlab-ce/docker-compose.yml',
    seedCmd: ['./apps/gitlab-ce/seed.sh'],
    approxBuildMinutes: 6,
    driver: gitlabCeDriver,
  },
  {
    app: 'rocket-chat',
    composeFile: 'apps/rocket-chat/docker-compose.yml',
    seedCmd: ['./apps/rocket-chat/seed.sh'],
    approxBuildMinutes: 3,
    driver: rocketChatDriver,
  },
  {
    app: 'penpot',
    composeFile: 'apps/penpot/docker-compose.yml',
    seedCmd: ['npx', 'tsx', 'apps/penpot/seed.ts'],
    approxBuildMinutes: 5,
    driver: penpotDriver,
  },
  {
    app: 'cal-com',
    composeFile: 'apps/cal-com/docker-compose.yml',
    seedCmd: ['./apps/cal-com/seed.sh'],
    approxBuildMinutes: 8,
    driver: calComDriver,
  },
  {
    app: 'nocodb',
    composeFile: 'apps/nocodb/docker-compose.yml',
    seedCmd: ['./apps/nocodb/seed.sh'],
    approxBuildMinutes: 2,
    driver: nocodbDriver,
  },
];

export function findApp(app: string): AppEntry {
  const entry = APPS.find((a) => a.app === app);
  if (!entry) throw new Error(`unknown app "${app}"; valid: ${APPS.map((a) => a.app).join(',')}`);
  return entry;
}
