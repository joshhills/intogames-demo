# Use a lean Node.js image
FROM node:18-alpine

# Set working directory for the service
WORKDIR /app/push-service

# Copy package files and install dependencies
COPY push-service/package*.json ./
RUN npm install

# Copy the service code
COPY push-service/ ./

# Copy the shared folder and install its dependencies
COPY shared/ ../shared/
WORKDIR /app/shared
RUN npm install
WORKDIR /app/push-service

# Expose the port the app runs on
EXPOSE 3001

# Command to run the application (from push-service directory)
WORKDIR /app/push-service
CMD ["node", "server.js"]
