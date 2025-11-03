# Firewall Defense API Documentation

This directory contains OpenAPI specifications and design documentation for the Firewall Defense game services.

## OpenAPI Specifications

Three OpenAPI 3.0 specifications are provided:

1. **`openapi-api-service.yaml`** - Main REST API service
   - Player authentication and profiles
   - Game configuration
   - Match completion and scoring
   - Leaderboard management
   - Global firewall health
   - Message of the Day (MOTD)

2. **`openapi-admin-service.yaml`** - Admin panel service
   - Proxies requests to API Service
   - Admin authentication
   - All admin panel endpoints

3. **`openapi-push-service.yaml`** - WebSocket push service
   - WebSocket connection protocol
   - Real-time message types and schemas

## Viewing API Documentation

### Using Swagger UI (Recommended)

The easiest way to view and interact with the API documentation is through Swagger UI, which is included in the Docker Compose setup:

1. Start all services: `docker-compose up`
2. Open Swagger UI: http://localhost:8081
3. Use the dropdown at the top to switch between API Service, Admin Service, and Push Service documentation

### Using External Tools

You can also view these OpenAPI specs using:

- **Swagger Editor**: https://editor.swagger.io (paste the YAML content)
- **Postman**: Import the YAML files to generate API collections
- **Redoc**: `npx @redocly/cli preview-docs openapi-api-service.yaml`

## Design Document

**`DESIGN_DOCUMENT.md`** - Comprehensive design document written from a designer/live operations perspective. This document describes:

- Functional requirements for each system (Player Profiles, Game Config, MOTD, Leaderboard, etc.)
- Business outcomes and success metrics
- Technical constraints and integration points
- Scalability considerations

This document serves as a reference for understanding how the implemented services align with game design and live operations requirements.

## Configuration

**`swagger-config.yaml`** - Configuration file for Swagger UI that defines which OpenAPI specs to load.

---

**Note:** When deploying to production, update the server URLs in the OpenAPI specs to match your deployment environment, or use environment variable substitution if your Swagger UI setup supports it.

