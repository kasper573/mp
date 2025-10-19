# Migration Guide: Drizzle ORM to Gel (EdgeDB) Query Builder

## Overview

This migration replaces the PostgreSQL + Drizzle ORM stack with Gel Database (EdgeDB) and its TypeScript Query Builder. This is a **complete database system replacement**, not just an ORM change.

## What Changed

### Before (Drizzle ORM)
- Database: PostgreSQL
- ORM: Drizzle ORM
- Query Language: SQL
- Schema: TypeScript/Drizzle schema definitions
- Client: `drizzle-orm/node-postgres`

### After (Gel)
- Database: Gel (EdgeDB)
- Query Builder: Generated TypeScript Query Builder
- Query Language: EdgeQL
- Schema: EdgeQL schema definitions (`.esdl` files)
- Client: `gel` package

## Steps Completed

1. ✅ Replaced `drizzle-orm` and `drizzle-kit` with `gel` in package.json
2. ✅ Created EdgeQL schema at `dbschema/default.esdl`
3. ✅ Created Gel configuration file `gel.toml`
4. ✅ Updated database client to use Gel
5. ✅ Prepared schema.ts to export generated query builder

## Steps Remaining

### 1. Set Up Gel Database Infrastructure

Replace the PostgreSQL service in Docker Compose with Gel:

```yaml
# In docker-compose.dev.yaml, replace postgres service with:
gel:
  image: edgedb/edgedb:latest
  environment:
    EDGEDB_SERVER_SECURITY: insecure_dev_mode
  ports:
    - "5656:5656"
  volumes:
    - gel-data:/var/lib/edgedb/data
```

Add to volumes section:
```yaml
volumes:
  gel-data:
```

### 2. Initialize Gel Project

Once Gel database is running:

```bash
cd integrations/db
npx gel project init
```

### 3. Create Migration

```bash
cd integrations/db
npx gel migration create
npx gel migrate
```

### 4. Generate TypeScript Query Builder

```bash
cd integrations/db
pnpm generate  # This runs: npx @gel/generate edgeql-js
```

This will create the query builder in `dbschema/edgeql-js/`.

### 5. Update Connection Strings

Replace PostgreSQL connection strings with Gel DSN format:

**Old format:**
```
postgresql://user:password@host:5432/database
```

**New format:**
```
gel://username:password@localhost:5656/database
```

Update environment variables:
- `MP_API_DATABASE_CONNECTION_STRING`
- `MP_GAME_SERVICE_DATABASE_CONNECTION_STRING`

### 6. Migrate Database Queries

#### Import the Query Builder

```typescript
import e from "@mp/db/schema";
import { createDbClient } from "@mp/db";
```

#### Example Migrations

**Drizzle select:**
```typescript
await db.select().from(characterTable).where(eq(characterTable.id, characterId));
```

**Gel query builder:**
```typescript
await e.select(e.Character, (char) => ({
  id: true,
  name: true,
  coords: true,
  // ... other fields
  filter: e.op(char.id, '=', characterId)
})).run(client);
```

**Drizzle insert:**
```typescript
await db.insert(npcTable).values({
  id: npcId,
  name: "Soldier",
  // ... other fields
}).returning({ id: npcTable.id });
```

**Gel query builder:**
```typescript
await e.insert(e.Npc, {
  id: npcId,
  name: "Soldier",
  // ... other fields
}).run(client);
```

**Drizzle update:**
```typescript
await db.update(characterTable)
  .set({ online: true })
  .where(eq(characterTable.id, characterId));
```

**Gel query builder:**
```typescript
await e.update(e.Character, (char) => ({
  filter: e.op(char.id, '=', characterId),
  set: {
    online: true
  }
})).run(client);
```

**Drizzle delete:**
```typescript
await db.delete(table);
```

**Gel query builder:**
```typescript
await e.delete(e.TableName).run(client);
```

**Drizzle join:**
```typescript
await db.select()
  .from(npcSpawnTable)
  .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));
```

**Gel query builder:**
```typescript
await e.select(e.NpcSpawn, (spawn) => ({
  // Fields are automatically joined via links
  npcId: {
    id: true,
    name: true,
    // ... npc fields
  },
  // ... other fields
})).run(client);
```

### 7. Update Seed Script

The `seed.ts` file needs to be completely rewritten to use the Gel query builder. Key changes:

1. Replace `db.delete(table)` with `e.delete(e.TableName).run(client)`
2. Replace `db.insert(table).values(...)` with `e.insert(e.TableName, {...}).run(client)`
3. Replace `db.transaction()` with Gel's transaction API

### 8. Update Drop Script

Replace all Drizzle drop operations with Gel equivalents.

### 9. Files That Need Migration

**Core DB Files:**
- ✅ `integrations/db/src/client.ts` (DONE)
- ✅ `integrations/db/src/schema.ts` (DONE)
- ✅ `integrations/db/src/index.ts` (DONE)
- ❌ `integrations/db/seed.ts` (TODO)
- ❌ `integrations/db/drop.ts` (TODO)

**App Files Using Database:**
- ❌ `apps/gateway/src/db-operations.ts`
- ❌ `apps/game-service/src/etc/game-data-loader.ts`
- ❌ All other files importing from `@mp/db`

### 10. Testing

After migration:

```bash
pnpm lint
pnpm format
pnpm test
pnpm build
```

## Key Differences

### 1. Schema Definitions
- **Drizzle**: TypeScript functions defining tables
- **Gel**: EdgeQL schema files (declarative)

### 2. Relationships
- **Drizzle**: Foreign keys with `.references()`
- **Gel**: Links (first-class relationships)

### 3. Queries
- **Drizzle**: SQL-like TypeScript API
- **Gel**: Graph-like TypeScript API with automatic traversal

### 4. Types
- **Drizzle**: Inferred from schema
- **Gel**: Generated from schema

### 5. Transactions
- **Drizzle**: `db.transaction((tx) => ...)`
- **Gel**: `client.transaction((tx) => ...)`

## Benefits of Gel

1. **Type Safety**: Generated types from schema
2. **Graph Queries**: Natural relationship traversal
3. **Schema Migrations**: First-class migration support
4. **Better Performance**: Optimized query execution
5. **Modern API**: Clean, composable query builder

## Challenges

1. **Learning Curve**: EdgeQL is different from SQL
2. **Tooling**: Different ecosystem
3. **Migration Effort**: All queries must be rewritten
4. **Infrastructure**: New database system to deploy

## Resources

- [Gel Documentation](https://docs.geldata.com/)
- [Query Builder Reference](https://docs.geldata.com/reference/clients/js/querybuilder)
- [EdgeQL Tutorial](https://docs.geldata.com/learn/edgeql)
- [Migration Guide](https://docs.geldata.com/guides/migrations)

## Support

For issues during migration:
- Check [Gel Discord](https://discord.gg/umUueND6ag)
- Review [Gel GitHub](https://github.com/geldata/gel-js)
