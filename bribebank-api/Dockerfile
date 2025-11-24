FROM node:20-alpine AS builder

# Prisma requires openssl even to generate the client
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# COPY prisma schema BEFORE generating the client
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy source code AFTER prisma generate
COPY . .

# Build TS
RUN npm run build

##############################
# Runtime Image
##############################

FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

