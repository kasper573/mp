# Electric SQL Investigation for Game State Sync

## Executive Summary

Electric SQL **does support bidirectional sync** through the "through-the-database" pattern. However, using it for the game service's database synchronization requires architectural changes that may not provide significant benefits over the current polling approach.

## Current Implementation Analysis

### File: `integrations/db/src/utils/sync-game-state.ts`

The current implementation:

1. **Function Signature**: Single-shot sync function called periodically (every 5 seconds)
2. **Bidirectional Sync**:
   - **Save**: Writes current game state to database (character positions, inventory items)
   - **Load**: Reads character additions/removals from database
3. **Architecture**: Polling-based, designed to be called repeatedly via `startAsyncInterval`
4. **Consistency**: Uses database transactions for atomic updates

## What is Electric SQL?

Electric SQL is a **Postgres sync engine** with these characteristics:

### Architecture

- Sits between Postgres and clients
- Streams data changes in real-time via HTTP/SSE
- Uses "Shapes" (declarative queries) for partial replication
- Requires Electric sync service to be running

### Bidirectional Sync Support

Electric **does support writes** through multiple patterns documented in [their writes guide](https://electric-sql.com/docs/guides/writes):

1. **Online writes**: API calls for writes, Electric for reads
2. **Optimistic state**: Local state + API writes
3. **Shared persistent optimistic state**: Client-side DB + sync
4. **Through-the-database sync**: Local DB writes → API → Postgres → Electric → all clients

The game service scenario is closest to pattern #4, where:
- Game service writes to Postgres via Drizzle
- Electric syncs changes FROM Postgres TO game service instances
- Each instance sees changes from other instances in real-time

## Technical Feasibility

### Architecture Mismatch

**Current approach**:

```typescript
// Called every 5 seconds in a polling loop
const session = startAsyncInterval(async () => {
  const result = await opt.db.syncGameState({...});
  // Does one sync operation and returns
}, syncInterval);
```

**Electric approach**:

```typescript
// Requires persistent subscription lifecycle
const characterShape = new Shape<CharacterRow>({
  url: `${electricUrl}/v1/shape`,
  params: {
    table: 'character',
    where: `area_id = '${area.id}' AND online = true`
  }
});

// Subscribe to continuous updates
characterShape.subscribe(({ value }) => {
  // Handle changes as they arrive
  updateGameState(value);
});

// Shape must remain alive for continuous sync
```

### Key Differences

| Aspect                 | Current (Polling)                        | Electric (Real-time)                                |
| ---------------------- | ---------------------------------------- | --------------------------------------------------- |
| **Connection Model**   | Periodic DB queries                      | Persistent HTTP/SSE connection                      |
| **Function Interface** | One-shot operation (called repeatedly)   | Subscription lifecycle (start/stop)                 |
| **Latency**            | 5 second polling interval                | Real-time (< 1 second)                              |
| **Complexity**         | Simple (just SQL queries)                | Complex (manage Shape subscriptions + write syncing)|
| **Infrastructure**     | Just Postgres                            | Postgres + Electric sync service                    |
| **Resource Usage**     | DB query every 5 sec per game service    | Persistent connection per game service              |

## Implementation Options

### Option 1: Electric with polling wrapper (not recommended)

Keep the current polling interface but use Electric for reads:

**Pros**:
- Maintains public API compatibility
- Could get faster updates

**Cons**:
- Creates/destroys Shape subscriptions every 5 seconds (inefficient)
- Defeats the purpose of Electric's push model
- Adds infrastructure complexity for no real benefit
- More resource intensive than simple queries

### Option 2: Refactor to use Electric's continuous sync model

Change architecture to use persistent subscriptions:

**Changes required**:
- Modify `startDbSyncSession` to manage Shape lifecycle
- Remove polling interval
- Add Electric URL configuration
- Deploy Electric sync service

**Pros**:
- Lower latency (< 1 second vs 5 seconds)
- Real-time updates enable responsive gameplay
- Reduced DB query load
- Proper use of Electric's capabilities

**Cons**:
- Requires architectural changes
- Additional infrastructure (Electric service)
- More complex error handling and reconnection logic
- Changes public interface

**Code sketch**:

```typescript
export function startDbSyncSession(opt) {
  const shapes = [];
  
  // Create persistent character shape
  const characterShape = new Shape({
    url: `${opt.electricUrl}/v1/shape`,
    params: {
      table: 'character',
      where: `area_id = '${opt.area.id}' AND online = true`
    }
  });
  
  characterShape.subscribe(({ value }) => {
    syncCharacters(value, opt.state);
    opt.logger.info('Characters synced via Electric');
  });
  
  shapes.push(characterShape);
  
  // Similarly for items...
  
  return {
    stop() {
      // Clean up all shapes
      shapes.forEach(shape => shape.unsubscribe());
    },
    async flush() {
      // Save current state to DB
      await saveGameState(opt.db, opt.state);
    }
  };
}
```

### Option 3: Keep current implementation (recommended for now)

**Rationale**:
- Current polling works reliably
- 5-second latency is acceptable for area transitions
- Simple architecture is easier to maintain
- No additional infrastructure needed
- Team is familiar with current approach

**When to reconsider**:
- Real-time collaboration features needed (< 1 sec latency)
- Number of game services scales significantly (>20 instances)
- Database load from polling becomes problematic

## Recommendation

**For current requirements**: Keep the polling implementation (Option 3).

**If lower latency is needed**: Implement Option 2 with proper architectural refactoring.

**Never do**: Option 1 (polling + Electric) - it combines the worst of both approaches.

## Implementation Path (if choosing Option 2)

1. **Infrastructure**: Deploy Electric sync service
2. **Configuration**: Add Electric URL to environment variables
3. **Refactor**: Change `startDbSyncSession` to manage subscriptions
4. **Testing**: Verify cross-instance sync works correctly
5. **Migration**: Deploy with feature flag for gradual rollout

Estimated effort: 2-3 days for implementation + testing + deployment.

---

_Investigation Date: 2025-11-08_
_Electric SQL Version Reviewed: 1.1.3_
_MP Repository: kasper573/mp_
