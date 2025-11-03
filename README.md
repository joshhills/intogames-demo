# Into Games Masterclass: Connected Play Demo

This repository contains the complete "Firewall Defense" demo project for the "Building Systems for Connected Play" masterclass.

It's a "lean" project designed to demonstrate how multiple backend services work together to power a simple connected game.

## Architecture

This project runs 6 services simultaneously using Docker Compose:

1. Client (Nginx): A p5.js/p5.play frontend served as a static site on http://localhost:8080.
2. API Service (Node.js/Express): The main REST API on http://localhost:3000. It handles auth, player profiles, and submitting scores.
3. Push Service (Node.js/WebSocket): A lightweight WebSocket server on ws://localhost:3001 that pushes real-time updates (like global health) to all connected clients.
4. Redis: Used for storing player profiles, leaderboards, global health, MOTD, and Pub/Sub messaging between services.
5. Admin Service (Node.js/Fastify): Admin panel for live operations management at http://localhost:4000.
6. Swagger UI: API documentation interface at http://localhost:8081.

## How to Run

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

### Running the Demo

1. Clone this repository.
2. Open a terminal in the root directory.
3. Run the following command:
```
docker-compose up --build
```
4. Wait for all the services to build and start.

Open your browser and navigate to: http://localhost:8080

You can open multiple browser windows to simulate multiple players and see the real-time WebSocket updates (Global Health, Notifications) broadcast to all of them at once.

## Testing

The project includes comprehensive unit and integration tests for both the API service and admin service.

### Running Tests

**API Service:**
```bash
cd api-service
npm install
npm test
```

**Admin Service:**
```bash
cd admin-service
npm install
npm test
```

For detailed testing documentation, see [docs/TESTING.md](docs/TESTING.md).

Note: Integration tests require a Redis instance. Use the Redis service from `docker-compose.yml` or run a local Redis instance.