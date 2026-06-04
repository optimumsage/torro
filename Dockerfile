# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
ARG VERSION=dev
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

# Stage 2: Build backend (TypeScript -> dist) with native build deps for better-sqlite3
FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

# Stage 3: Runtime — backend serving both the API and the built frontend
FROM node:20-alpine
ARG VERSION=dev
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /frontend/dist ./public
LABEL org.opencontainers.image.title="torro" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/optimumsage/torro"
EXPOSE 3000
CMD ["node", "dist/index.js"]
