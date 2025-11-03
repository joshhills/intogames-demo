#!/bin/sh
# Don't exit on error - continue even if some steps fail

echo "Waiting for Grafana to be ready..."
for i in $(seq 1 60); do
  if curl -s -f http://grafana:3000/api/health > /dev/null 2>&1; then
    echo "Grafana is ready!"
    break
  fi
  echo "Waiting for Grafana... ($i/60)"
  sleep 2
done

echo "Waiting a bit more for full initialization..."
sleep 5

echo "Provisioning Prometheus datasource via API..."

# First, list all datasources to find if Prometheus exists
echo "Checking for existing Prometheus datasource..."
ALL_DS=$(curl -s -u admin:password123 http://grafana:3000/api/datasources 2>&1)
echo "All datasources: $ALL_DS"

# Try to find Prometheus by name
PROM_DS=$(echo "$ALL_DS" | grep -o '{"id":[0-9]*,"uid":"[^"]*","orgId":[0-9]*,"name":"Prometheus"[^}]*}' | head -1)

if [ ! -z "$PROM_DS" ]; then
  echo "Found existing Prometheus datasource, extracting ID..."
  DS_ID=$(echo "$PROM_DS" | grep -o '"id":[0-9]*' | cut -d: -f2 | head -1)
  EXISTING_UID=$(echo "$PROM_DS" | grep -o '"uid":"[^"]*"' | cut -d'"' -f4 | head -1)
  echo "Found datasource ID: $DS_ID, UID: $EXISTING_UID"
  
  if [ "$EXISTING_UID" != "prometheus" ]; then
    echo "Existing datasource has wrong UID ($EXISTING_UID), deleting and recreating..."
    DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
      -u admin:password123 \
      http://grafana:3000/api/datasources/$DS_ID 2>&1)
    DELETE_CODE=$(echo "$DELETE_RESPONSE" | tail -1)
    if [ "$DELETE_CODE" = "200" ]; then
      echo "Deleted old datasource, creating new one with correct UID..."
      sleep 2
      # Fall through to create new one
      PROM_DS=""
    else
      echo "⚠ Could not delete datasource (HTTP $DELETE_CODE), attempting update..."
      UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
        -H "Content-Type: application/json" \
        -u admin:password123 \
        -d '{"id":'$DS_ID',"name":"Prometheus","type":"prometheus","access":"proxy","url":"http://prometheus:9090","uid":"prometheus","isDefault":true,"jsonData":{}}' \
        http://grafana:3000/api/datasources/$DS_ID 2>&1)
      UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | tail -1)
      if [ "$UPDATE_CODE" = "200" ]; then
        echo "✓ Successfully updated Prometheus datasource with correct UID"
      else
        echo "⚠ Update also failed (HTTP $UPDATE_CODE)"
      fi
    fi
  else
    echo "✓ Prometheus datasource already has correct UID"
  fi
else
  # If we get here, we need to create a new Prometheus datasource
  echo "Creating new Prometheus datasource..."
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -u admin:password123 \
    -d '{"name":"Prometheus","type":"prometheus","access":"proxy","url":"http://prometheus:9090","uid":"prometheus","isDefault":true,"jsonData":{}}' \
    http://grafana:3000/api/datasources 2>&1)
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✓ Successfully created Prometheus datasource"
  else
    echo "⚠ Failed to create datasource (HTTP $HTTP_CODE): $BODY"
  fi
fi

echo ""
echo "Provisioning Loki datasource via API..."

# Refresh the datasource list after Prometheus provisioning
ALL_DS=$(curl -s -u admin:password123 http://grafana:3000/api/datasources 2>&1)

# Check for existing Loki datasource
echo "Checking for existing Loki datasource..."
ALL_DS=$(curl -s -u admin:password123 http://grafana:3000/api/datasources 2>&1)

# Try to find Loki by name
LOKI_DS=$(echo "$ALL_DS" | grep -o '{"id":[0-9]*,"uid":"[^"]*","orgId":[0-9]*,"name":"Loki"[^}]*}' | head -1)

if [ ! -z "$LOKI_DS" ]; then
  echo "Found existing Loki datasource, extracting ID..."
  LOKI_ID=$(echo "$LOKI_DS" | grep -o '"id":[0-9]*' | cut -d: -f2 | head -1)
  EXISTING_UID=$(echo "$LOKI_DS" | grep -o '"uid":"[^"]*"' | cut -d'"' -f4 | head -1)
  echo "Found datasource ID: $LOKI_ID, UID: $EXISTING_UID"
  
  if [ "$EXISTING_UID" != "loki" ]; then
    echo "Existing Loki datasource has wrong UID ($EXISTING_UID), deleting and recreating..."
    DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
      -u admin:password123 \
      http://grafana:3000/api/datasources/$LOKI_ID 2>&1)
    DELETE_CODE=$(echo "$DELETE_RESPONSE" | tail -1)
    if [ "$DELETE_CODE" = "200" ]; then
      echo "Deleted old Loki datasource, creating new one with correct UID..."
      sleep 2
      LOKI_DS=""
    else
      echo "⚠ Could not delete Loki datasource (HTTP $DELETE_CODE), attempting update..."
      UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
        -H "Content-Type: application/json" \
        -u admin:password123 \
        -d '{"id":'$LOKI_ID',"name":"Loki","type":"loki","access":"proxy","url":"http://loki:3100","uid":"loki","isDefault":false,"jsonData":{"maxLines":1000}}' \
        http://grafana:3000/api/datasources/$LOKI_ID 2>&1)
      UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | tail -1)
      if [ "$UPDATE_CODE" = "200" ]; then
        echo "✓ Successfully updated Loki datasource with correct UID"
      else
        echo "⚠ Update also failed (HTTP $UPDATE_CODE)"
      fi
    fi
  else
    echo "✓ Loki datasource already has correct UID"
  fi
fi

# If we get here, we need to create a new Loki datasource
if [ -z "$LOKI_DS" ]; then
  echo "Creating new Loki datasource..."
  LOKI_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -u admin:password123 \
    -d '{"name":"Loki","type":"loki","access":"proxy","url":"http://loki:3100","uid":"loki","isDefault":false,"jsonData":{"maxLines":1000}}' \
    http://grafana:3000/api/datasources 2>&1)
  
  LOKI_HTTP_CODE=$(echo "$LOKI_RESPONSE" | tail -1)
  LOKI_BODY=$(echo "$LOKI_RESPONSE" | head -n -1)
  
  if [ "$LOKI_HTTP_CODE" = "200" ] || [ "$LOKI_HTTP_CODE" = "201" ]; then
    echo "✓ Successfully created Loki datasource"
  else
    echo "⚠ Failed to create Loki datasource (HTTP $LOKI_HTTP_CODE): $LOKI_BODY"
  fi
fi

echo ""
echo "All datasource provisioning complete!"
