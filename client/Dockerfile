FROM nginx:alpine

# Copy client files
COPY . /usr/share/nginx/html/

# Copy the config injection script
COPY inject-config.sh /inject-config.sh

# Make it executable
RUN chmod +x /inject-config.sh

# Create a custom entrypoint that runs the injection script then starts nginx
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo '/inject-config.sh' >> /entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

