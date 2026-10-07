# Planet Hop — one image for Coolify / any Docker host.
# Serves the game + multiplayer relay on a SINGLE port (server/web.ts),
# so one public URL does everything (page + wss, same origin).
FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json ./
COPY public ./public
COPY server ./server
COPY scripts ./scripts
COPY tests ./tests

# Coolify: expose this port as the service port.
# Overridable at runtime with -e PORT=... (Coolify can inject PORT).
ENV PORT=8901
EXPOSE 8901

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://localhost:'+(process.env.PORT||8901)+'/health');if(!r.ok)process.exit(1)"]

CMD ["bun", "server/web.ts"]
