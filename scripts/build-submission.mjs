import { execFileSync } from 'node:child_process';
import { cp, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { maximumSubmissionZipBytes, submissionAssetEntries } from './submission-assets.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const submissionRoot = join(projectRoot, 'submission');
const zipPath = join(projectRoot, 'Tideborn-submission.zip');
const publicRoot = join(projectRoot, 'public');
const threeRoot = join(projectRoot, 'node_modules', 'three');
const addonRoot = join(threeRoot, 'examples', 'jsm');
const vendorRoot = join(submissionRoot, 'vendor');

const cleanCopy = async (source, destination) => {
  await cp(source, destination, {
    recursive: true,
    filter: (path) => !path.endsWith(`${sep}.DS_Store`) && !path.endsWith('.map'),
  });
};

const parseModuleSpecifiers = (source) => {
  const specifiers = new Set();
  const staticPattern = /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(source))) specifiers.add(match[1]);
  }
  return [...specifiers];
};

const addonDestination = (sourcePath) => {
  const rel = relative(addonRoot, sourcePath);
  if (rel.startsWith('..') || resolve(addonRoot, rel) !== resolve(sourcePath)) {
    throw new Error(`Refusing to copy add-on outside Three.js examples/jsm: ${sourcePath}`);
  }
  return join(vendorRoot, 'addons', rel);
};

const copyAddonClosure = async (entrySpecifiers) => {
  const queue = [];
  const visited = new Set();
  for (const specifier of entrySpecifiers) {
    const addonPrefix = specifier.startsWith('three/addons/')
      ? 'three/addons/'
      : specifier.startsWith('three/examples/jsm/')
        ? 'three/examples/jsm/'
        : null;
    if (addonPrefix) queue.push(join(addonRoot, specifier.slice(addonPrefix.length)));
  }

  while (queue.length) {
    const sourcePath = resolve(queue.shift());
    if (visited.has(sourcePath)) continue;
    visited.add(sourcePath);
    const source = await readFile(sourcePath, 'utf8');
    const destination = addonDestination(sourcePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source);
    for (const specifier of parseModuleSpecifiers(source)) {
      if (specifier.startsWith('.')) queue.push(resolve(dirname(sourcePath), specifier));
    }
  }
  return [...visited].map((path) => relative(addonRoot, path)).sort();
};

await rm(submissionRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(submissionRoot, { recursive: true });

const viteResult = await build({
  configFile: false,
  root: projectRoot,
  base: './',
  define: {
    // Keep the local/full game on the supplied high-detail GLBs while the
    // redistributable contest ZIP uses only cleared/original creature art.
    'import.meta.env.VITE_CONTEST_SAFE_CREATURES': JSON.stringify('1'),
  },
  logLevel: 'warn',
  build: {
    write: false,
    minify: false,
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
    rollupOptions: {
      external: (id) => id === 'three' || id.startsWith('three/'),
      output: { inlineDynamicImports: true },
    },
  },
});
const rollupOutput = Array.isArray(viteResult) ? viteResult[0].output : viteResult.output;
const gameChunk = rollupOutput.find((entry) => entry.type === 'chunk' && entry.isEntry);
const stylesheet = rollupOutput.find((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'));
if (!gameChunk || !stylesheet) throw new Error('Vite did not return the expected game chunk and stylesheet.');

for (const [sourceRelative, destinationRelative] of submissionAssetEntries) {
  const destination = join(submissionRoot, 'assets', destinationRelative);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(publicRoot, 'assets', sourceRelative), destination);
}

await mkdir(vendorRoot, { recursive: true });
await cleanCopy(join(threeRoot, 'build', 'three.module.js'), join(vendorRoot, 'three.module.js'));
await cleanCopy(join(threeRoot, 'build', 'three.core.js'), join(vendorRoot, 'three.core.js'));
await cleanCopy(join(threeRoot, 'LICENSE'), join(vendorRoot, 'LICENSE.three.txt'));
const copiedAddons = await copyAddonClosure(gameChunk.imports);

const importMap = {
  imports: {
    three: './vendor/three.module.js',
    'three/addons/': './vendor/addons/',
    'three/examples/jsm/': './vendor/addons/',
  },
};
const css = String(stylesheet.source).replaceAll('</style', '<\\/style');
const code = gameChunk.code
  .replaceAll('./assets/tool-icons/', './assets/tools/')
  .replaceAll('</script', '<\\/script');
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#06191e" />
    <title>Tideborn — The Living Planet</title>
    <style>
${css}
    </style>
    <script type="importmap">${JSON.stringify(importMap, null, 2)}</script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
// Tideborn entrant-authored game code — readable, unminified, and bundled inline.
// Third-party Three.js modules remain external under ./vendor/.
${code}
    </script>
  </body>
</html>
`;
await writeFile(join(submissionRoot, 'index.html'), html);
await cleanCopy(join(projectRoot, 'submission-docs', 'asset-attribution.md'), join(submissionRoot, 'ASSET-ATTRIBUTION.md'));
await writeFile(join(submissionRoot, 'PACKAGE-README.txt'), [
  'TIDEBORN CONTEST PACKAGE',
  '',
  'Serve this directory with any static HTTP server and open index.html.',
  'The game makes no external network requests. Three.js is under vendor/.',
  'Entrant-authored game JavaScript and CSS are readable and inline in index.html.',
  'Review ASSET-ATTRIBUTION.md before public submission.',
  '',
].join('\n'));

execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', '*.DS_Store'], { cwd: submissionRoot });
const zipBytes = (await stat(zipPath)).size;
if (zipBytes >= maximumSubmissionZipBytes) {
  throw new Error(`Submission ZIP is ${zipBytes.toLocaleString()} bytes; limit is ${maximumSubmissionZipBytes.toLocaleString()} bytes.`);
}
const indexBytes = (await stat(join(submissionRoot, 'index.html'))).size;
console.log(JSON.stringify({
  submissionRoot,
  zipPath,
  indexBytes,
  zipBytes,
  zipMiB: Number((zipBytes / 1024 / 1024).toFixed(2)),
  inlineGameBytes: code.length,
  inlineCssBytes: css.length,
  vendorAddons: copiedAddons,
}, null, 2));
