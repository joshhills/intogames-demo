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

# Escape special characters in URLs for sed
API_URL_ESCAPED=$(echo "$API_URL" | sed 's/[[\.*^$()+?{|]/\\&/g' | sed "s/'/\\\'/g")
WS_URL_ESCAPED=$(echo "$WS_URL" | sed 's/[[\.*^$()+?{|]/\\&/g' | sed "s/'/\\\'/g")

# Replace the entire script block (from comment through closing script tag) with our config
# This ensures the JavaScript is properly inside script tags
sed -i "/<!-- API URLs injected by deployment script -->/,/<\/script>/c\\
<!-- API URLs injected by deployment script -->\\
<script>\\
window.API_URL = '${API_URL_ESCAPED}';\\
window.WS_URL = '${WS_URL_ESCAPED}';\\
</script>
" /usr/share/nginx/html/index.html

echo "Configuration injected successfully"

