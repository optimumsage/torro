# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
ARG VERSION=dev
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

# Stage 2: Backend serving both the API and the built frontend
FROM node:20-alpine
ARG VERSION=dev
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/src ./src
COPY --from=frontend-builder /frontend/dist ./public
LABEL org.opencontainers.image.title="torro" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/optimumsage/torro"
EXPOSE 3000
CMD ["node", "src/index.js"]
