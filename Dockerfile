# ---- deps: production node_modules (also used by the migrate/seed scripts)
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- build: Next.js standalone server
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- runtime
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY data ./data
COPY src/db/schema.ts ./src/db/schema.ts
COPY src/lib/normalize.ts ./src/lib/normalize.ts
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && chown -R node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
