FROM node:20-alpine
WORKDIR /app

# Copy workspace manifests first (better caching)
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

# Install all deps with workspaces so @orbeats/shared is resolved locally
RUN npm ci

# Copy sources (tsconfig.base.json required by shared/tsconfig.json)
COPY tsconfig.base.json ./
COPY server server
COPY shared shared

# Build shared first (required), then server (required)
RUN npm run build -w @orbeats/shared
RUN npm run build -w @orbeats/server

WORKDIR /app/server
EXPOSE 3001
CMD ["npm","start"]
