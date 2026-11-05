// Writes the docker-compose for a project on the VPS (Hostinger Docker Manager, "content" field).
// Usage: node deploy/hostinger/compose.mjs [version] [project] [host port]
//   defaults: version 1, project "escalada", host port 38080. Another project name and port run a
//   second copy side by side (e.g. "tokenopolis" on 38081 to try a version without touching the live one).
// New version = the container goes back to waiting for a package (deploy/hostinger/publicar.mjs).
// Nothing secret here: the code and the .env only arrive encrypted, straight from this computer.
import { readFileSync } from 'node:fs';

const [version = '1', project = 'escalada', hostPort = '38080'] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]*$/.test(project)) throw new Error(`project name must be lowercase letters, digits and dashes: ${project}`);
if (!/^\d{2,5}$/.test(hostPort)) throw new Error(`host port must be a number: ${hostPort}`);
const boot = readFileSync(new URL('./boot.cjs', import.meta.url)).toString('base64');

process.stdout.write(`services:
  ${project}:
    image: node:24-alpine
    restart: unless-stopped
    init: true
    working_dir: /app
    ports:
      - "${hostPort}:3000"
    environment:
      PORT: "3000"
      DEPLOY_VERSION: "${version}"
      BOOT: "${boot}"
    command: ["node", "-e", "eval(Buffer.from(process.env.BOOT, 'base64').toString())"]
    volumes:
      - app:/app
    mem_limit: 512m
    cpus: 1
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
volumes:
  app:
`);
