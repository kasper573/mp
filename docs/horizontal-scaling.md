# Horizontal Scaling Architecture

This document describes the new horizontally scalable architecture for the MP game server.

## Overview

The monolithic server has been split into multiple services to support horizontal scaling:

- **API Server (`mp-api-server`)**: Handles system-wide operations
- **Area Servers (`mp-area-server-*`)**: Handle specific game areas
- **Area Server Registry**: Database-backed service discovery

## Architecture

### API Server

- Serves static assets (areas, tilesets, images)
- Provides system information (version, health)
- Handles area server discovery
- **Does not** handle game state or player connections

### Area Servers

- Handle game state for specific areas
- Manage player connections and movement
- Run game logic (NPCs, combat, etc.)
- Register themselves with the registry on startup
- Configurable via environment variables

### Area Server Registry

- Database table storing active area servers
- Maps areas to server endpoints
- Automatic cleanup on server shutdown
- Used by API server for discovery

## Configuration

### Environment Variables

**API Server:**

```bash
MP_SERVER_PORT=9999
MP_SERVER_PUBLIC_DIR=/path/to/public
MP_SERVER_DATABASE_URL=postgres://...
# ... other standard server vars
```

**Area Server:**

```bash
MP_AREA_SERVER_SERVER_ID=island-server
MP_AREA_SERVER_AREAS=island
MP_AREA_SERVER_PORT=3001
MP_AREA_SERVER_HTTP_BASE_URL=http://localhost:3001
MP_AREA_SERVER_DATABASE_URL=postgres://...
# ... other standard server vars
```

### Docker Compose

The new `docker-compose.yaml` includes:

- `mp-api-server`: API server service
- `mp-area-server-island`: Area server for island area
- `mp-area-server-forest`: Area server for forest area
- `mp-server`: Legacy monolithic server (profile: "legacy")

## Deployment

### Production (New Architecture)

```bash
docker-compose --profile prod up
```

### Legacy (Monolithic Server)

```bash
docker-compose --profile legacy up
```

### Development

```bash
# Start all services
docker-compose --profile prod up

# Or start individual services
docker-compose up mp-api-server mp-area-server-island
```

## Service Discovery

1. Area servers register themselves on startup
2. API server provides discovery endpoint: `/rpc/areaServerDiscovery/getServerForArea`
3. Clients can query which server handles a specific area
4. Future: Client-side area switching when moving between areas

## Database Schema

```sql
CREATE TABLE area_server_registry (
    server_id TEXT PRIMARY KEY,
    info JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_area_server_registry_areas
ON area_server_registry USING GIN ((info->'areas'));
```

## Migration Path

1. **Phase 1 (Current)**: Basic area server architecture

   - Multiple area servers running
   - Service discovery working
   - Portal transitions blocked between different servers

2. **Phase 2 (Future)**: Client-side area switching

   - Client detects area transitions
   - Automatic reconnection to new area server
   - Seamless player experience

3. **Phase 3 (Future)**: Advanced features
   - Load balancing within areas
   - Dynamic server scaling
   - Cross-server communication

## Benefits

- **Scalability**: Each area can run on separate hardware
- **Reliability**: Area failures don't affect other areas
- **Performance**: Game logic distributed across servers
- **Flexibility**: Easy to add new areas or scale existing ones
- **Backward Compatibility**: Legacy server still works

## Monitoring

Each service exposes:

- Health endpoint: `/health`
- Metrics endpoint: Available via existing metrics system
- Logs: Structured logging with service identification

## Testing

```bash
# Build all services
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm format

# Test area server registry
node test-area-server-registry.js
```
