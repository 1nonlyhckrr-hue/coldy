FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
FROM node:22-bookworm-slim
ENV NODE_ENV=production DATABASE_PATH=/app/var/luna.sqlite
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/var && chown node:node /app/var
USER node
CMD ["node", "src/index.js"]
