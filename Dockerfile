FROM node:22-alpine

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy application source and compile Vite production bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["npm", "start"]
