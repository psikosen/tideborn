import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maximumSubmissionZipBytes, submissionAssetEntries } from './submission-assets.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const submissionRoot = join(projectRoot, 'submission');
const zipPath = join(projectRoot, 'Tideborn-submission.zip');
const publicAssets = join(projectRoot, 'public', 'assets');
const reportRoot = join(projectRoot, 'output', 'submission-compliance');
const reportPath = join(reportRoot, 'COMPLIANCE-AUDIT.txt');
const runtimeAuditPath = join(projectRoot, 'output', 'submission-runtime', 'runtime-audit.json');
const failures = [];
const passes = [];
const warnings = [];
const pass = (message) => passes.push(message);
const fail = (message) => failures.push(message);

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else files.push(path);
  }
  return files;
};
const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const indexPath = join(submissionRoot, 'index.html');
let index = '';
try {
  index = await readFile(indexPath, 'utf8');
  pass('index.html exists at the package root.');
} catch {
  fail('index.html is missing from the package root.');
}

if (index) {
  const moduleMatch = index.match(/<script type="module">([\s\S]*?)<\/script>/);
  const code = moduleMatch?.[1] ?? '';
  if (code.length >= 250_000 && code.split('\n').length >= 5_000 && code.includes('class TidebornGame') && code.includes('class MatterWorld')) {
    pass(`Entrant game code is inline and readable (${code.length.toLocaleString()} bytes; ${code.split('\n').length.toLocaleString()} lines).`);
  } else {
    fail(`Inline game-code readability heuristic failed (${code.length} bytes; ${code.split('\n').length} lines).`);
  }
  if (!/<script\b[^>]*\bsrc=/.test(index) && !/<link\b[^>]*rel=["']stylesheet/.test(index)) {
    pass('Entrant JavaScript and CSS do not depend on external bundle files.');
  } else fail('index.html still references an external script or stylesheet bundle.');
  if (!/(?:src|href)=["']\/(?!\/)|url\(\s*["']?\/(?!\/)|["']\/assets\//.test(index)) {
    pass('No root-relative asset or document URLs remain in index.html.');
  } else fail('Root-relative URL found in index.html.');
  if (!/<(?:script|link|img|source)\b[^>]*(?:src|href)=["']https?:\/\//i.test(index)) {
    pass('No external-host script, stylesheet, image, or source URL exists in index.html.');
  } else fail('External-host resource URL found in index.html.');
  if (index.includes('"three": "./vendor/three.module.js"') && index.includes('"three/addons/": "./vendor/addons/"')) {
    pass('Import map resolves Three.js and add-ons to relative vendor paths.');
  } else fail('Local Three.js import-map entries are incomplete.');
}

for (const required of [
  'vendor/three.module.js',
  'vendor/three.core.js',
  'vendor/LICENSE.three.txt',
  'vendor/addons/loaders/GLTFLoader.js',
  'vendor/addons/utils/SkeletonUtils.js',
  'vendor/addons/postprocessing/EffectComposer.js',
  'assets/models',
  'assets/trees',
  'assets/minerals',
  'assets/tools',
  'ASSET-ATTRIBUTION.md',
]) {
  try { await stat(join(submissionRoot, required)); pass(`${required} is packaged.`); }
  catch { fail(`${required} is missing.`); }
}

try {
  const mismatches = [];
  for (const [sourceRelative, destinationRelative] of submissionAssetEntries) {
    const sourceFile = join(publicAssets, sourceRelative);
    const packagedFile = join(submissionRoot, 'assets', destinationRelative);
    try {
      if (await digest(sourceFile) !== await digest(packagedFile)) mismatches.push(`${destinationRelative} (content differs)`);
    } catch { mismatches.push(`${destinationRelative} (missing)`); }
  }
  if (!mismatches.length) pass(`All ${submissionAssetEntries.length} required runtime assets are present byte-for-byte.`);
  else fail(`Runtime asset mismatch: ${mismatches.join(', ')}`);
} catch (error) { fail(`Could not compare runtime assets: ${error}`); }

try {
  const zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
  if (zipEntries.includes('index.html') && !zipEntries.some((entry) => entry.startsWith('submission/'))) {
    pass('ZIP contains index.html at its top level (no enclosing submission directory).');
  } else fail('ZIP layout is invalid: index.html is not at the top level.');
  if (!zipEntries.some((entry) => entry.endsWith('.DS_Store'))) pass('ZIP contains no .DS_Store files.');
  else fail('ZIP contains .DS_Store metadata.');
} catch (error) { fail(`Could not inspect ZIP: ${error}`); }

const zipBytes = await stat(zipPath).then((entry) => entry.size).catch(() => 0);
if (zipBytes && zipBytes < maximumSubmissionZipBytes) pass(`Final ZIP size is below the enforced ${(maximumSubmissionZipBytes / 1_000_000).toFixed(0)} MB limit: ${(zipBytes / 1024 / 1024).toFixed(2)} MiB (${zipBytes.toLocaleString()} bytes).`);
else if (zipBytes) fail(`Final ZIP is ${zipBytes.toLocaleString()} bytes; limit is ${maximumSubmissionZipBytes.toLocaleString()} bytes.`);
else fail('Final ZIP is missing or empty.');

const attribution = await readFile(join(submissionRoot, 'ASSET-ATTRIBUTION.md'), 'utf8').catch(() => '');
if (attribution.includes('CC BY 4.0') && attribution.includes('Original code-built creature models') && !attribution.includes('Sketchfab Standard') && !attribution.includes('CC BY-NC-SA 4.0')) {
  pass('Attribution report covers the shipped CC BY models and original code-built replacements without unresolved license families.');
} else fail('Attribution report is stale or still contains an unresolved model-license family.');
try {
  const runtimeAudit = JSON.parse(await readFile(runtimeAuditPath, 'utf8'));
  const currentZipHash = await digest(zipPath);
  const targetPortraits = runtimeAudit.portraitResults ?? [];
  if (runtimeAudit.packageSha256 === currentZipHash
    && runtimeAudit.runtimeError === null
    && runtimeAudit.externalRequests?.length === 0
    && runtimeAudit.pageErrors?.length === 0
    && runtimeAudit.failedRequests?.length === 0
    && targetPortraits.length === 2
    && targetPortraits.every((entry) => entry.mode === 'playing' && entry.mobileCamera?.active)) {
    pass('Fresh ZIP runtime passed a clean static server with zero external/failed requests or browser errors, including 390x844 and 430x932 portrait play.');
  } else {
    warnings.push('Runtime audit is missing, stale, or incomplete; rerun npm run test:submission, then npm run audit:submission.');
  }
} catch {
  warnings.push('Runtime audit has not been recorded; run npm run test:submission, then npm run audit:submission.');
}
warnings.push('Manual gate: no physical phone is connected to this workspace; repeat the passing portrait touch checks on an actual device before uploading.');

const report = [
  'TIDEBORN SUBMISSION COMPLIANCE AUDIT',
  `Generated: ${new Date().toISOString()}`,
  '',
  `RESULT: ${failures.length ? 'FAIL' : 'PASS'}`,
  '',
  'PASS',
  ...passes.map((item) => `- ${item}`),
  '',
  'FAIL',
  ...(failures.length ? failures : ['None']).map((item) => `- ${item}`),
  '',
  'MANUAL REVIEW',
  ...warnings.map((item) => `- ${item}`),
  '',
].join('\n');
await mkdir(reportRoot, { recursive: true });
await writeFile(reportPath, report);
console.log(report);
if (failures.length) process.exitCode = 1;
