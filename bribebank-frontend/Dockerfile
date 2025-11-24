# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy Vite build output
COPY --from=builder /app/dist ./

# Simple default nginx config
# (NPM will sit in front, so we don't need anything fancy here)
