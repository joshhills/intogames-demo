# API Documentation & Design

This directory contains OpenAPI specifications and the design document for the Firewall Defense game services.

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

1. Start all services: `docker-compose up`
2. Open Swagger UI: http://localhost:8081
3. Use the dropdown at the top to switch between API Service, Admin Service, and Push Service documentation

### Using External Tools

- **Swagger Editor**: https://editor.swagger.io (paste the YAML content)
- **Postman**: Import the YAML files to generate API collections
- **Redoc**: `npx @redocly/cli preview-docs openapi-api-service.yaml`

## Design Document

**`DESIGN_DOCUMENT.md`** - Comprehensive design document written from a designer/live operations perspective. This document describes:

- Functional requirements for each system (Player Profiles, Game Config, MOTD, Leaderboard, etc.)
- Business outcomes and success metrics
- Technical constraints and integration points
- Scalability considerations

## Configuration

**`swagger-config.yaml`** - Configuration file for Swagger UI that defines which OpenAPI specs to load.

---

**Note:** For complete project documentation, see the main [README.md](../README.md) in the root directory.

