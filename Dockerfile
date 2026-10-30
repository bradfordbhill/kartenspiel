# The game server in a container, for any host that runs Docker (Fly.io, Railway, a VPS, ...).
# Mount a volume at /data to keep accounts and stats across restarts.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN ./build.sh
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server/server.js"]
