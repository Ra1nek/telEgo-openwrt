# telEgo REST API Documentation

Base URL: http://127.0.0.1:9091/api/v1/

All endpoints return JSON responses. Authentication is handled via IP whitelist configured in [server.api].whitelist.

## Status Endpoints

### GET /status
Returns overall service status and basic statistics.

Response:
{
  "status": "running",
  "uptime_seconds": 3600,
  "version": "3.5.5",
  "connections": {
    "active": 12,
    "total_today": 145
  },
  "traffic": {
    "bytes_in": 12345678,
    "bytes_out": 87654321
  }
}

### GET /healthz
Health check endpoint for monitoring systems. Returns 200 OK if service is running.

Response: 200 OK (empty body)

## Statistics Endpoints

### GET /stats
Returns detailed statistics about connections and traffic.

Response:
{
  "connections": {
    "active": 12,
    "total_today": 145,
    "total_all_time": 12345
  },
  "traffic": {
    "bytes_in_total": 1234567890,
    "bytes_out_total": 9876543210,
    "bytes_in_today": 12345678,
    "bytes_out_today": 87654321
  },
  "users_online": 5,
  "unique_ips": 8
}

### GET /stats/upstreams
Returns statistics for each upstream connection.

Response:
{
  "upstreams": [
    {
      "name": "ME",
      "status": "healthy",
      "latency_ms": 45,
      "connections": 8
    },
    {
      "name": "DC1",
      "status": "healthy", 
      "latency_ms": 120,
      "connections": 4
    }
  ]
}

## User Management Endpoints

### GET /users
Returns list of active users and their statistics.

Response:
{
  "users": [
    {
      "username": "alice",
      "secret_hash": "abc123...",
      "connections_active": 2,
      "bytes_in": 1000000,
      "bytes_out": 5000000,
      "last_seen": "2026-08-30T12:00:00Z"
    }
  ]
}

### POST /users
Creates a new user secret.

Request Body:
{
  "username": "newuser",
  "secret": "0123456789abcdef0123456789abcdef"
}

Response: 201 Created

### DELETE /users/{username}
Deletes a user secret.

Response: 204 No Content

## Configuration Endpoints

### GET /config
Returns current configuration (secrets masked).

Response:
{
  "general": {
    "use_middle_proxy": true,
    "tls_mode": true
  },
  "server": {
    "port": 443
  },
  "web_proxy": {
    "enabled": true,
    "carrier": "https-lanes"
  }
}

### POST /config/reload
Reloads configuration without restart.

Response: 200 OK {"message": "Configuration reloaded"}

## Prometheus Metrics

### GET /metrics
Returns metrics in Prometheus format for monitoring integration.

Example output:
# HELP telego_connections_active Active connections count
# TYPE telego_connections_active gauge
telego_connections_active 12
# HELP telego_traffic_bytes_in Total bytes received
# TYPE telego_traffic_bytes_in counter
telego_traffic_bytes_in 1234567890

## Error Responses

All endpoints return standard HTTP status codes:
- 200 OK - Success
- 201 Created - Resource created
- 204 No Content - Success, no content to return
- 400 Bad Request - Invalid request parameters
- 401 Unauthorized - IP not in whitelist
- 404 Not Found - Endpoint or resource not found
- 500 Internal Server Error - Server error

## Rate Limiting

API requests are rate-limited to 100 requests per minute per IP address.
Exceeding the limit returns HTTP 429 Too Many Requests.
