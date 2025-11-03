# Use a lean Node.js image
FROM node:18-alpine

# Set working directory for the service
WORKDIR /app/api-service

# Copy package files and install dependencies
COPY api-service/package*.json ./
RUN npm install

# Copy the service code
COPY api-service/ ./

# Copy the shared folder and install its dependencies
COPY shared/ ../shared/
WORKDIR /app/shared
RUN npm install
WORKDIR /app/api-service

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application (from api-service directory)
WORKDIR /app/api-service
CMD ["node", "server.js"]
