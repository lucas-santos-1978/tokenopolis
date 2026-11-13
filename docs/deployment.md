# Deployment

Tokenopolis is a single Node process serving static files and a JSON API. It needs Node 22.15 or
newer, a `.env`, and (for real data) outbound HTTPS to your data source. It keeps everything in
memory: no database, no writes to disk.

## Plain Node

```bash
cp .env.example .env     # fill in the data source and, for a shared panel, PANEL_PASSWORD
npm start                # http://localhost:3000
```

Put it behind any reverse proxy (nginx, Caddy, Traefik) for HTTPS. Basic auth (`PANEL_PASSWORD`)
protects every path, including the API; without HTTPS the password crosses the network in the
clear. Behind a corporate TLS proxy, `npm run start:proxy` runs Node with `--use-system-ca`.

## Docker

```bash
docker compose up -d     # builds the image from the Dockerfile, reads .env
```

`docker-compose.yml` has commented volume lines for the optional local files (`belts.json`,
`nicknames.json`, `team.json`, `data.json`, `avatars/`). The image runs as the unprivileged `node`
user and exposes port 3000.

Set `TIMEZONE` in `.env` when you run in a container: the default is the host's zone, and inside
most images that is UTC, which moves every day boundary (and the weekly season) by your offset.

## On a TV

Open `/?tour` (the city flying from the region to each city) or `/climb.html?tour` (cycling zoom
levels) in a kiosk-mode browser. The ❔ help of the city has a link builder with TV presets
(`?hour=` fixes the light, `?panels=0` hides the panels, `?quality=low` for weak machines,
`?lang=` for the language). The page refreshes its data by itself and never reloads.

## Updating

The server has no state worth keeping: stop it, replace the files, start it again. The browser
pages are served with `Cache-Control: no-store`, so visitors always get the new version.

## The author's VPS scripts

`deploy/hostinger/` holds the scripts the author uses to publish to a Hostinger VPS through its
Docker API: `compose.mjs` generates a compose file whose container boots `boot.cjs`, which waits for
an encrypted package that `publicar.mjs` builds from `public/`, `server/`, `package.json`, `.env`
and the optional root data files. They are specific to that setup and kept here as an example of
a push-based deploy without a registry; the generic path is the Dockerfile above. Behind a reverse
proxy on the same Docker network, `compose.mjs <version> <project> none` publishes no port on the
server, and `publicar.mjs` takes the proxy's https address instead of `http://<ip>:<port>`.
