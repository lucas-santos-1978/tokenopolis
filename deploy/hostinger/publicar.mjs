// Sends the panel to the VPS container (README, "Publicar num servidor").
// Usage: node deploy/hostinger/publicar.mjs <container url> <container public key from its log> [version]
// Packs public/, server/, package.json, the optional root data files and .env (without showing any of it), appends PANEL_PASSWORD and encrypts:
// AES-256-GCM on the package, with the AES key wrapped with the container's public key (RSA-OAEP).
// The panel password is generated the first time and lives only in deploy/hostinger/vps.local.json.
import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..', '..');
const [url, publicKeyB64, version = '1'] = process.argv.slice(2);
if (!url || !publicKeyB64) {
  console.error('usage: node deploy/hostinger/publicar.mjs <container url> <public key> [version]');
  process.exit(1);
}

const secretsFile = join(import.meta.dirname, 'vps.local.json');
const secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, 'utf8')) : { panelPassword: randomBytes(12).toString('base64url') };
secrets.url = url;
writeFileSync(secretsFile, `${JSON.stringify(secrets, null, 2)}\n`);

const SAFE_PATH = /^(\.env|package\.json|belts\.json|nicknames\.json|team\.json|data\.json|(public|server)\/[\w\-./ ]+)$/;
const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
// optional data files at the project root: only packed when they exist
const dataFiles = ['belts.json', 'nicknames.json', 'team.json', 'data.json'].filter((f) => existsSync(join(root, f)));
const rels = ['package.json', ...dataFiles, ...walk(join(root, 'server')), ...walk(join(root, 'public'))]
  .map((f) => relative(root, resolve(root, f)).split(sep).join('/'));

const files = rels.map((rel) => {
  if (!SAFE_PATH.test(rel)) throw new Error(`name the container would refuse: ${rel}`);
  return [rel, readFileSync(join(root, rel)).toString('base64')];
});
// .env goes as is, plus the password at the end (the last definition wins)
const envFile = join(root, '.env');
const env = Buffer.concat([existsSync(envFile) ? readFileSync(envFile) : Buffer.alloc(0), Buffer.from(`\nPANEL_PASSWORD=${secrets.panelPassword}\n`)]);
files.push(['.env', env.toString('base64')]);

const plain = gzipSync(JSON.stringify({ version, files }));
const aesKey = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
const publicKey = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
const wrapped = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey);
if (wrapped.length !== 384) throw new Error('the container key is not RSA-3072');
const body = Buffer.concat([wrapped, iv, cipher.getAuthTag(), sealed]);

console.log(`package: ${files.length} files, ${(body.length / 1e6).toFixed(1)} MB encrypted, version ${version}`);
const res = await fetch(new URL('/upload', url), { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });
console.log(`response: ${res.status} ${await res.text()}`);
process.exitCode = res.ok ? 0 : 1;
