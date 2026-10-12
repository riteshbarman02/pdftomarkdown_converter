# Self-hosted image. Conversion runs in-process, so run a single replica (or use sticky
# sessions) — the in-memory job store is not shared between replicas.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall copies the PDF.js worker into public/
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
