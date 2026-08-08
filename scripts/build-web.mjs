/**
 * Builds the playable web prototype into a single self-contained HTML file.
 *
 * The bundle is the real game core: `web/main.ts` imports `src/store` and
 * `src/utils` unchanged. Only the native storage package is swapped for a
 * localStorage shim, so what you play in the browser is the same logic the
 * React Native build runs.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'dist/merge-restore.html');

const result = await build({
  entryPoints: [resolve(root, 'web/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  write: false,
  legalComments: 'none',
  define: { __DEV__: 'false' },
  alias: {
    // Native persistence -> localStorage, the only platform swap in the build.
    '@react-native-async-storage/async-storage': resolve(root, 'web/asyncStorageShim.ts'),
  },
});

const [bundle] = result.outputFiles;
if (bundle === undefined) throw new Error('esbuild produced no output');

const template = await readFile(resolve(root, 'web/index.template.html'), 'utf8');
const html = `${template}\n<script>\n${bundle.text}\n</script>\n`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');

console.log(`built ${outFile} (${(html.length / 1024).toFixed(1)} kB)`);
