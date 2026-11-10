# ChordMiniApp Frontend Dockerfile
# Multi-stage build for optimized Next.js production deployment

# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies needed for building
RUN apk add --no-cache libc6-compat python3 make g++
ENV npm_config_disturl="https://nodejs.org/dist"

# Copy package files and npm configuration, install all dependencies (including devDependencies)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Copy source code
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Increase Node.js heap size for build (4GB)
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Public origin baked into prerendered metadata (og:image, canonical). Runtime env cannot change it.
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
# Inlined into client components at build time.
ARG NEXT_PUBLIC_SEGMENTATION_ACCESS_REQUEST_EMAIL
ENV NEXT_PUBLIC_SEGMENTATION_ACCESS_REQUEST_EMAIL=${NEXT_PUBLIC_SEGMENTATION_ACCESS_REQUEST_EMAIL}
# Model selection, inlined at build time. BTC/Beat-Transformer are hidden on non-localhost
# origins unless experimental models are enabled.
ARG NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODELS
ENV NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODELS=${NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODELS}
ARG NEXT_PUBLIC_DEFAULT_CHORD_MODEL
ENV NEXT_PUBLIC_DEFAULT_CHORD_MODEL=${NEXT_PUBLIC_DEFAULT_CHORD_MODEL}
ARG NEXT_PUBLIC_DEFAULT_BEAT_MODEL
ENV NEXT_PUBLIC_DEFAULT_BEAT_MODEL=${NEXT_PUBLIC_DEFAULT_BEAT_MODEL}
# Comma-separated chord models listed in the UI but disabled as "Not deployed".
ARG NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS
ENV NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS=${NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS}

# Build the application
RUN npm run build

# Stage 2: Runner
FROM node:22-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install runtime dependencies including yt-dlp and ffmpeg for audio extraction
RUN apk add --no-cache \
    curl \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/cache/apk/*

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle

# Copy essential runtime files
COPY --from=builder /app/package.json ./package.json

# Prepare the persistent local audio mountpoint and set correct permissions.
RUN mkdir -p /app/storage/audio /app/storage/db
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV SQLITE_DATABASE_PATH="/app/storage/db/chordmini.sqlite"
ENV LOCAL_AUDIO_STORAGE_DIR="/app/storage/audio"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/persistence/health || exit 1

# Start the application
CMD ["node", "server.js"]
