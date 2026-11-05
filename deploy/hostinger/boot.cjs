// Runs inside the container (node:24-alpine); the docker-compose (deploy/hostinger/compose.mjs) passes this file in base64.
// With the DEPLOY_VERSION code in /app, it starts the panel. Otherwise it waits for the package: generates a key pair,
// writes the public one to the log (only whoever reads the log through the Hostinger API can encrypt for it), receives the package
// via POST /upload (deploy/hostinger/publicar.mjs), writes it to /app and starts the panel.
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');

const APP = process.env.APP_DIR || '/app'; // APP_DIR only for testing outside the container
const VERSION = process.env.DEPLOY_VERSION || '1';
const versionFile = `${APP}/.versao`;
const SAFE_PATH = /^(\.env|package\.json|belts\.json|nicknames\.json|team\.json|data\.json|(public|server)\/[\w\-./ ]+)$/;

function startApp() {
  const child = spawn(process.execPath, ['server/index.js'], { cwd: APP, stdio: 'inherit' });
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
}

// Writes everything to /app/.novo and only then swaps the top-level entries (server, public...), without mixing versions.
function install(files) {
  const staging = `${APP}/.novo`;
  fs.rmSync(staging, { recursive: true, force: true });
  const tops = new Set();
  for (const [rel, data] of files) {
    if (!SAFE_PATH.test(rel) || rel.split('/').includes('..')) throw new Error(`invalid path: ${rel}`);
    const dest = `${staging}/${rel}`;
    fs.mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    tops.add(rel.split('/')[0]);
  }
  for (const top of tops) {
    fs.rmSync(`${APP}/${top}`, { recursive: true, force: true });
    fs.renameSync(`${staging}/${top}`, `${APP}/${top}`);
  }
  fs.rmSync(staging, { recursive: true, force: true });
  fs.writeFileSync(versionFile, VERSION);
}

// Package: AES key wrapped in RSA-OAEP (384 bytes) + IV (12) + GCM tag (16) + encrypted gzipped JSON.
function receive() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  console.log(`[deploy] version ${VERSION} waiting for the package. KEY ${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`);
  let done = false;
  const server = http.createServer((req, res) => {
    const reply = (status, msg) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
      res.end(msg);
    };
    if (done || req.method !== 'POST' || req.url !== '/upload') return reply(404, 'nothing here');
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64e6) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const key = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, body.subarray(0, 384));
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, body.subarray(384, 396));
        decipher.setAuthTag(body.subarray(396, 412));
        const pkg = JSON.parse(zlib.gunzipSync(Buffer.concat([decipher.update(body.subarray(412)), decipher.final()])));
        if (pkg.version !== VERSION) return reply(409, `package for version ${pkg.version}; the container expects ${VERSION}`);
        install(pkg.files);
        done = true;
        console.log(`[deploy] version ${VERSION} installed (${pkg.files.length} files)`);
        reply(200, `installed: ${pkg.files.length} files`);
        server.close(startApp);
      } catch (err) {
        console.log(`[deploy] package refused: ${err.message}`);
        reply(400, 'package refused');
      }
    });
  });
  server.listen(Number(process.env.PORT || 3000));
}

const current = fs.existsSync(versionFile) && fs.readFileSync(versionFile, 'utf8').trim();
if (current === VERSION && fs.existsSync(`${APP}/server/index.js`)) startApp();
else receive();
