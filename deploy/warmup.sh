#!/bin/bash
# Algora Server Warm-up Script
# Run this after deployment or add to cron for periodic warm-up
#
# Usage:
#   ./warmup.sh                    # Warm up once
#   crontab: */5 * * * * /path/to/warmup.sh  # Every 5 minutes

BASE_URL="${1:-https://algora.moss.land}"

echo "Warming up Algora server at $BASE_URL..."

# Warm up main pages (triggers SSR caching)
curl -s -o /dev/null -w "GET /en: %{http_code} in %{time_total}s\n" "$BASE_URL/en"
curl -s -o /dev/null -w "GET /ko: %{http_code} in %{time_total}s\n" "$BASE_URL/ko"

# Warm up API endpoints (triggers data caching)
curl -s -o /dev/null -w "GET /api/stats: %{http_code} in %{time_total}s\n" "$BASE_URL/api/stats"
curl -s -o /dev/null -w "GET /api/agents: %{http_code} in %{time_total}s\n" "$BASE_URL/api/agents"
curl -s -o /dev/null -w "GET /api/activity: %{http_code} in %{time_total}s\n" "$BASE_URL/api/activity?limit=25"

# Health check
curl -s -o /dev/null -w "GET /health: %{http_code} in %{time_total}s\n" "$BASE_URL/health"

echo "Warm-up complete!"
