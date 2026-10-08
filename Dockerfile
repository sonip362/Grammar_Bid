FROM node:18-alpine

# Set production environment
ENV NODE_ENV=production
ENV PORT=7860

WORKDIR /app

# Install curl for HEALTHCHECK
RUN apk add --no-cache curl

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies cleanly
RUN npm ci --omit=dev

# Copy application source code with correct ownership
COPY --chown=node:node . .

# Switch to non-root user
USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:7860/api/health || exit 1

EXPOSE 7860

CMD ["node", "server/index.js"]
