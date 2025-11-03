# Dockerfile for the Admin Service
# This service is an internal tool to set game configuration and broadcast messages.

# Use a specific Node.js base image
FROM node:18-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
# This copies server.js and the 'public' folder into the /app directory
COPY . .

# Expose the port the application runs on
EXPOSE 4000

# Command to run the application
# This runs the server.js file from the current working directory (/app)
CMD [ "node", "server.js" ]
