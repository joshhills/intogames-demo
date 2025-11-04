#!/bin/sh
# This script injects environment variables into the client HTML for production deployment

# Default to localhost if not set (for local development)
API_URL="${CLIENT_API_URL:-http://localhost:3000/api}"
WS_URL="${CLIENT_WS_URL:-ws://localhost:3001/ws}"

# For Railway: if Railway-specific domains are provided, use them
# Railway provides RAILWAY_PUBLIC_DOMAIN for each service
# We need to construct URLs based on service domains
if [ -n "$RAILWAY_API_DOMAIN" ]; then
  # Use https for Railway (Railway uses HTTPS by default)
  API_URL="https://${RAILWAY_API_DOMAIN}/api"
fi
if [ -n "$RAILWAY_PUSH_DOMAIN" ]; then
  # Use wss for Railway WebSocket connections
  WS_URL="wss://${RAILWAY_PUSH_DOMAIN}/ws"
fi

# If explicit URLs are provided via env vars, use those (highest priority - already set above)
# This allows manual override for any deployment platform

echo "Configuring client with:"
echo "  API_URL: $API_URL"
echo "  WS_URL: $WS_URL"

# Replace the placeholder comment and script content with actual config
# Using a simpler approach: replace the lines between the comment and the closing script tag
sed -i "/<!-- API URLs injected by deployment script -->/,/\/\/ These will be injected/c\\
    <!-- API URLs injected by deployment script -->\\
    window.API_URL = '${API_URL}';\\
    window.WS_URL = '${WS_URL}';
" /usr/share/nginx/html/index.html

echo "Configuration injected successfully"

