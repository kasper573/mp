# Files Requiring Migration to Gel Query Builder

This document lists all files that need to be migrated from Drizzle ORM to Gel Query Builder.

## Status

🔴 **BLOCKED**: All files below require:
1. Gel database running in Docker
2. Query builder generated (`pnpm generate`)
3. Migration of query syntax from Drizzle to Gel

## Core Database Package (`integrations/db/`)

### ✅ Completed
- [x] `package.json` - Dependencies updated
- [x] `gel.toml` - Configuration created
- [x] `dbschema/default.esdl` - EdgeQL schema created
- [x] `src/client.ts` - Client updated
- [x] `src/schema.ts` - Exports placeholder
- [x] `src/index.ts` - Removed Drizzle operators
- [x] `src/types/vector.ts` - Converted to serialize/deserialize functions
- [x] `src/types/path.ts` - Converted to serialize/deserialize functions
- [x] `src/types/short-id.ts` - Simplified (no special handling needed)

### 🔴 To Do
- [ ] `seed.ts` - Needs complete rewrite with Gel query builder
- [ ] `drop.ts` - Needs complete rewrite or use Gel CLI commands

## Gateway App (`apps/gateway/`)

### 🔴 To Do
- [ ] `src/db-operations.ts` - 2 functions to migrate:
  - `saveOnlineCharacters()` - Uses update + inArray
  - `hasAccessToCharacter()` - Uses select + where + and + eq + $count
- [ ] `src/main.ts` - Line 84: Uses `db.$client.on('error', ...)` 
  - Gel client doesn't expose underlying connection events the same way
  - May need different error handling approach

## Game Service App (`apps/game-service/`)

### 🔴 To Do
- [ ] `src/etc/db-transform.ts` - Type conversions from/to DB format:
  - Imports: `characterTable`, `consumableDefinitionTable`, `equipmentDefinitionTable`, `npcRewardTable`
  - Functions that transform between DB rows and domain objects
  - Will need to update to work with Gel query result types
  
- [ ] `src/etc/game-data-loader.ts` - Large file with many queries:
  - `saveCharacterToDb()` - update query
  - `assignAreaIdToCharacterInDb()` - transaction with update + select
  - `getAllSpawnsAndTheirNpcs()` - select with leftJoin
  - `getAllNpcRewards()` - select with exists subquery
  - `getAllItemDefinitions()` - parallel selects from multiple tables
  - Uses: `and`, `eq`, `exists` operators
  - Uses: `characterTable`, `consumableDefinitionTable`, `equipmentDefinitionTable`, `npcRewardTable`, `npcSpawnTable`, `npcTable`

## Migration Examples for Each Pattern

### Pattern: Update Query
**Drizzle:**
```typescript
await db.update(characterTable)
  .set({ online: true })
  .where(eq(characterTable.id, characterId));
```

**Gel:**
```typescript
await e.update(e.Character, (char) => ({
  filter: e.op(char.id, '=', characterId),
  set: { online: true }
})).run(client);
```

### Pattern: Select with Filter
**Drizzle:**
```typescript
await db.select()
  .from(characterTable)
  .where(and(
    eq(characterTable.userId, userId),
    eq(characterTable.id, characterId)
  ));
```

**Gel:**
```typescript
await e.select(e.Character, (char) => ({
  id: true,
  userId: true,
  // ... other fields
  filter: e.op(
    e.op(char.userId, '=', userId),
    'and',
    e.op(char.id, '=', characterId)
  )
})).run(client);
```

### Pattern: Select with Join
**Drizzle:**
```typescript
await db.select()
  .from(npcSpawnTable)
  .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));
```

**Gel:**
```typescript
await e.select(e.NpcSpawn, (spawn) => ({
  id: true,
  count: true,
  // Links are automatically traversable - no join needed!
  npcId: {
    id: true,
    name: true,
    maxHealth: true,
    // ... other npc fields
  }
})).run(client);
```

### Pattern: Transaction
**Drizzle:**
```typescript
await db.transaction(async (tx) => {
  await tx.update(table).set(values).where(condition);
  return tx.select().from(table).where(condition);
});
```

**Gel:**
```typescript
await client.transaction(async (tx) => {
  await e.update(e.Table, (t) => ({
    filter: condition,
    set: values
  })).run(tx);
  return e.select(e.Table, (t) => ({
    // ... fields
    filter: condition
  })).run(tx);
});
```

### Pattern: Count
**Drizzle:**
```typescript
const count = await db.$count(query);
```

**Gel:**
```typescript
const count = await e.count(query).run(client);
```

### Pattern: Exists Subquery
**Drizzle:**
```typescript
await db.select()
  .from(table)
  .where(exists(subquery));
```

**Gel:**
```typescript
await e.select(e.Table, (t) => ({
  // ... fields
  filter: e.exists(subquery)
})).run(client);
```

## Error Handling

**Drizzle:**
```typescript
db.$client.on('error', (err) => {
  logger.error(err);
});
```

**Gel:**
```typescript
// Gel clients don't expose connection events directly
// Error handling is done via try/catch on queries
try {
  await query.run(client);
} catch (error) {
  logger.error(error);
}
```

## Testing After Migration

For each migrated file:
1. Ensure TypeScript compiles without errors
2. Run the application and test the feature
3. Verify database operations work correctly
4. Check logs for any errors

## Complete Migration Checklist

- [ ] Set up Gel database in Docker
- [ ] Initialize Gel project
- [ ] Generate query builder
- [ ] Migrate `integrations/db/seed.ts`
- [ ] Migrate `integrations/db/drop.ts`
- [ ] Migrate `apps/gateway/src/db-operations.ts`
- [ ] Migrate `apps/gateway/src/main.ts` error handling
- [ ] Migrate `apps/game-service/src/etc/db-transform.ts`
- [ ] Migrate `apps/game-service/src/etc/game-data-loader.ts`
- [ ] Update all other files that import from `@mp/db`
- [ ] Run full test suite
- [ ] Update documentation

## Estimated Effort

- **Infrastructure Setup**: 2-4 hours
- **Query Builder Generation**: 1 hour (including troubleshooting)
- **Seed/Drop Scripts**: 2-3 hours
- **Gateway App Migration**: 2-3 hours
- **Game Service Migration**: 4-6 hours
- **Testing and Fixes**: 4-6 hours

**Total**: ~15-23 hours of development time
