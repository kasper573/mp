# @mp/db - Gel (EdgeDB) Database Integration

## ⚠️ Migration Status: IN PROGRESS

This package is currently being migrated from **Drizzle ORM + PostgreSQL** to **Gel (EdgeDB) + Query Builder**.

### Current State

✅ **Completed:**
- Package dependencies updated (gel installed, drizzle removed)
- EdgeQL schema created (`dbschema/default.esdl`)
- Database client updated to use Gel
- Gel configuration file created (`gel.toml`)

❌ **Blocked - Requires Infrastructure:**
- Gel database server needs to be set up (replace PostgreSQL in Docker)
- Query builder generation requires running Gel database
- All database queries need to be migrated from SQL to EdgeQL

### Why This Migration is Complex

Gel (formerly EdgeDB) is **not just an ORM replacement**. It's a complete database system:

| Aspect | Before | After |
|--------|--------|-------|
| Database | PostgreSQL | Gel/EdgeDB |
| Query Language | SQL | EdgeQL |
| Schema Definition | TypeScript (Drizzle) | EdgeQL (.esdl files) |
| Client Library | drizzle-orm | gel |
| Docker Image | postgres:latest | edgedb/edgedb:latest |
| Port | 5432 | 5656 |
| Connection String | `postgresql://...` | `gel://...` |

## What You Need to Do

### 1. Set Up Gel Database

Update `docker-compose.dev.yaml` to replace PostgreSQL with Gel:

```yaml
gel:
  image: edgedb/edgedb:latest
  environment:
    EDGEDB_SERVER_SECURITY: insecure_dev_mode
  ports:
    - "5656:5656"
  volumes:
    - gel-data:/var/lib/edgedb/data
```

### 2. Initialize and Migrate

```bash
cd integrations/db

# Initialize Gel project
npx gel project init

# Create and apply migration
npx gel migration create
npx gel migrate

# Generate TypeScript query builder
pnpm generate
```

### 3. Update Connection Strings

All connection strings must use Gel DSN format:
```
gel://username:password@localhost:5656/database
```

### 4. Migrate All Queries

See `MIGRATION_GUIDE.md` for detailed query migration examples.

## Schema

The EdgeQL schema is defined in `dbschema/default.esdl` and includes:

- **ActorModel** - Character and NPC models
- **Area** - Game areas/maps
- **Inventory** - Player inventories
- **ConsumableDefinition** - Consumable item types
- **EquipmentDefinition** - Equipment item types
- **ConsumableInstance** - Consumable item instances
- **EquipmentInstance** - Equipment item instances
- **Character** - Player characters
- **Npc** - Non-player characters
- **NpcReward** - Rewards for killing NPCs
- **NpcSpawn** - NPC spawn configurations

## Usage (After Migration Complete)

```typescript
import { createDbClient, e } from "@mp/db";

const client = createDbClient("gel://...");

// Select query
const characters = await e.select(e.Character, (char) => ({
  id: true,
  name: true,
  health: true,
  filter: e.op(char.online, '=', true)
})).run(client);

// Insert query
await e.insert(e.Character, {
  id: characterId,
  name: "Hero",
  health: 100,
  // ... other fields
}).run(client);

// Update query
await e.update(e.Character, (char) => ({
  filter: e.op(char.id, '=', characterId),
  set: {
    health: 50
  }
})).run(client);

// Delete query
await e.delete(e.Character, (char) => ({
  filter: e.op(char.id, '=', characterId)
})).run(client);
```

## Why Gel/EdgeDB?

1. **Type Safety**: TypeScript types are generated from schema
2. **Graph Queries**: Natural traversal of relationships
3. **Modern API**: Clean, composable query builder
4. **Performance**: Optimized query execution
5. **Migrations**: First-class migration support

## Resources

- [Gel Documentation](https://docs.geldata.com/)
- [Query Builder Guide](https://docs.geldata.com/reference/clients/js/querybuilder)
- [EdgeQL Tutorial](https://docs.geldata.com/learn/edgeql)
- [Migration Guide](./MIGRATION_GUIDE.md)

## Development Scripts

```bash
# Generate TypeScript query builder from schema
pnpm generate

# Seed database with test data
pnpm seed

# Drop all data from database
pnpm drop

# Reset database (drop + seed)
pnpm reset
```

## Notes

- The seed and drop scripts are currently non-functional until query migration is complete
- All apps using `@mp/db` will need to be updated to use the new query builder
- The migration requires coordination with infrastructure changes (Docker, env vars)
