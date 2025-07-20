# Use the official Node.js 18 LTS image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S meetapp -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web ./web

# Change ownership to non-root user
RUN chown -R meetapp:nodejs /app
USER meetapp

# Expose the port that Cloud Run expects
EXPOSE 8080

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=8080

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/server.js"] 