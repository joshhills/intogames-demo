# Into Games Masterclass: Connected Play Demo

This repository contains the complete "Firewall Defense" demo project for the "Building Systems for Connected Play" masterclass.

It's a "lean" project designed to demonstrate how multiple backend services work together to power a simple connected game.

## Architecture

This project runs 5 services simultaneously using Docker Compose:

1. Client (Nginx): A p5.js/p5.play frontend served as a static site on http://localhost:8080.
2. API Service (Node.js/Fastify): The main REST API on http://localhost:3000. It handles auth, player profiles, and submitting scores.
3. Push Service (Node.js/WebSocket): A lightweight WebSocket server on ws://localhost:3001 that pushes real-time updates (like global health) to all connected clients.
4. MongoDB: A persistent database for storing player profiles and high scores.
5. Redis: An in-memory cache for storing the real-time GlobalFirewallIntegrity value.

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