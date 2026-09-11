# ==========================================
# Multi-Stage Dockerfile for SSRace Colyseus Server
# ==========================================

# Stage 1: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

# Salin dependencies definition
COPY package*.json ./
RUN npm install

# Salin source code & config
COPY tsconfig.json ./
COPY src/ ./src/

# Kompilasi TypeScript ke JavaScript (dist/)
RUN npm run build

# ------------------------------------------
# Stage 2: Production Runner
# ------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567

# Salin package json untuk install production dependencies saja
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Ambil hasil kompilasi dari stage builder
COPY --from=builder /app/dist ./dist

# Ekspos port default Colyseus
EXPOSE 2567

# Jalankan server
CMD ["node", "dist/index.js"]
