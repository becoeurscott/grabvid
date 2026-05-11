FROM python:3.12-slim

# Install ffmpeg for media processing + cron for yt-dlp auto-updates + nodejs for yt-dlp JS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    cron \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Force-install the absolute latest yt-dlp (critical for platform compatibility)
RUN pip install --no-cache-dir --upgrade yt-dlp

# Copy application code
COPY . .

# Create temp directory for downloads
RUN mkdir -p /tmp/grabvid

# Set up cron job to auto-update yt-dlp every 6 hours
RUN echo "0 */6 * * * pip install --upgrade yt-dlp >> /var/log/ytdlp-update.log 2>&1" | crontab -

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Run startup script (upgrades yt-dlp, starts cron, then launches uvicorn)
CMD ["/app/start.sh"]
