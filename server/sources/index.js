// Picks the data source from DATA_SOURCE (see docs/contract.md for the interface every source
// implements): datadog | mock | demo | file | a path to a module exporting createSource(config).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createDatadogSource } from './datadog.js';
import { createMockSource } from './mock.js';
import { createDemoSource } from './demo.js';
import { createFileSource } from './file.js';

const BUILT_IN = {
  datadog: createDatadogSource,
  mock: createMockSource,
  demo: createDemoSource,
  file: createFileSource,
};

export async function createSource(config) {
  const name = String(config.dataSource ?? 'mock');
  const builtIn = BUILT_IN[name];
  if (builtIn) return builtIn(config);
  const url = pathToFileURL(resolve(config.root, name)).href;
  let mod;
  try {
    mod = await import(url);
  } catch (err) {
    throw new Error(`DATA_SOURCE "${name}" is not datadog, mock, demo or file, and could not be loaded as a module: ${err.message}`);
  }
  if (typeof mod.createSource !== 'function') throw new Error(`DATA_SOURCE "${name}" must export createSource(config)`);
  const source = await mod.createSource(config);
  return { mode: 'custom', ...source };
}
