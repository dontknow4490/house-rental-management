# Step 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client & compile NestJS backend
RUN npx prisma generate
RUN npm run build

# Step 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application and dependencies
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Create directory structure for persistent uploads
RUN mkdir -p uploads/qr uploads/proofs uploads/maintenance uploads/private/citizenship

EXPOSE 4000

# Run migrations and start production server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
