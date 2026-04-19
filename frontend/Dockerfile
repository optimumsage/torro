FROM node:20-alpine AS builder
ARG VERSION=dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

FROM node:20-alpine
ARG VERSION=dev
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
LABEL org.opencontainers.image.title="torro-frontend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/optimumsage/torro"
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
