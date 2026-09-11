# ==========================================
# Multi-Stage Dockerfile for SSRace All-in-One
# (Frontend Phaser 3 Web + Backend Colyseus)
# ==========================================

# Stage 1: Build Client (Vite + Phaser 3)
FROM node:20-alpine AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ------------------------------------------
# Stage 2: Build Server (TypeScript Colyseus)
# ------------------------------------------
FROM node:20-alpine AS server-builder
WORKDIR /server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# ------------------------------------------
# Stage 3: Production All-in-One Runner
# ------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567

# Salin dependencies server untuk mode produksi
COPY server/package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Salin hasil kompilasi server backend (dist/)
COPY --from=server-builder /server/dist ./dist

# Salin hasil kompilasi website frontend ke public/ (disajikan langsung oleh Express di port 2567)
COPY --from=client-builder /client/dist ./public

# Ekspos port permainan
EXPOSE 2567

# Jalankan server
CMD ["node", "dist/index.js"]
