// Writes the docker-compose for the "escalada" project on the VPS (Hostinger Docker Manager, "content" field).
// Usage: node deploy/hostinger/compose.mjs [version]. New version = the container goes back to waiting for a package (deploy/hostinger/publicar.mjs).
// Nothing secret here: the code and the .env only arrive encrypted, straight from this computer.
import { readFileSync } from 'node:fs';

const version = process.argv[2] ?? '1';
const boot = readFileSync(new URL('./boot.cjs', import.meta.url)).toString('base64');

process.stdout.write(`services:
  escalada:
    image: node:24-alpine
    restart: unless-stopped
    init: true
    working_dir: /app
    ports:
      - "38080:3000"
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
