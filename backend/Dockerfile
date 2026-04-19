FROM node:20-alpine
ARG VERSION=dev
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
LABEL org.opencontainers.image.title="torro-backend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/optimumsage/torro"
EXPOSE 3000
CMD ["node", "src/index.js"]
