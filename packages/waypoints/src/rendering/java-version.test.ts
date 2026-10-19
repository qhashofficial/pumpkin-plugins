import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { ensurePumpkinWit } from '@pumpkin-plugins/pumpkin-api/wit';
import { expect, it } from 'vitest';
import { JAVA_DISPLAY_VERSION } from './java-version.ts';

it('targets the newest Java version in the pinned Pumpkin WIT', () => {
    const apiRoot = path.dirname(createRequire(import.meta.url).resolve('@pumpkin-plugins/pumpkin-api/package.json'));
    const witDir = ensurePumpkinWit({
        lockFile: path.join(apiRoot, 'wit.lock.json'),
        cacheRoot: process.env.PUMPKIN_PLUGINS_CACHE_DIR || path.join(apiRoot, '../../.cache'),
    });
    const playerWit = fs.readFileSync(path.join(witDir, 'player.wit'), 'utf8');
    const body = /enum java-minecraft-version \{([^}]*)\}/.exec(playerWit)?.[1];
    if (body === undefined) throw new Error('player.wit has no java-minecraft-version enum');
    const versions = body
        .split(',')
        .map((variant) => variant.replace(/\/\/.*$/gm, '').trim())
        .filter((variant) => variant !== '' && variant !== 'unknown');

    expect(versions.at(-1)).toBe(JAVA_DISPLAY_VERSION);
});
