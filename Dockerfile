# Tokenopolis: no dependencies, no build step. Configuration comes from the environment (.env).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json ./
COPY server ./server
COPY public ./public
# Optional local data (belts.json, nicknames.json, team.json, data.json) is mounted at runtime,
# see docker-compose.yml.
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
