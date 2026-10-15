import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep the worker beside index.html, including in a GitHub Pages repository
// subdirectory. This build-time module adds no browser/runtime dependency.
export default function offlineGame() {
  let publicDirectory = '';
  return {
    name: 'souiu-imi-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { publicDirectory = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = new Map();
      for (const [name, output] of Object.entries(bundle)) {
        files.set(name, output.type === 'chunk' ? output.code : output.source);
      }
      const readPublic = (directory, prefix = '') => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const name = `${prefix}${entry.name}`;
          if (entry.isDirectory()) readPublic(resolve(directory, entry.name), `${name}/`);
          else if (entry.isFile() && !name.endsWith('-original.png')) files.set(name, readFileSync(resolve(directory, entry.name)));
        }
      };
      readPublic(publicDirectory);
      const template = readFileSync(new URL('../src/serviceWorker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(content);
      const version = hash.digest('hex').slice(0, 16);
      this.emitFile({
        type: 'asset', fileName: 'sw.js',
        source: template.replace('__BUILD_VERSION__', version).replace('__PRECACHE_FILES__', JSON.stringify([...files.keys()].sort())),
      });
    },
  };
}
