FROM swaggerapi/swagger-ui:latest

# Set environment variables for Swagger UI
# The config file will be mounted as a volume
ENV SWAGGER_JSON=/docs/openapi-api-service.yaml
ENV CONFIG_URL=/docs/swagger-config.yaml

# Expose port
EXPOSE 8080
