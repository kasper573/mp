# db

Database client and schema. Always use this library to interact with the database.

## Error Handling Convention

All database operations should use the **safe wrapper pattern** to ensure explicit error handling:

### Using Safe Database Operations

Database procedures should return `Result` or `ResultAsync` types from the `neverthrow` library (re-exported via `@mp/std`). This makes error handling explicit and type-safe:

```typescript
import { safeDbOperation } from "@mp/db";
import type { ResultAsync } from "@mp/std";

export function selectUserSafe(
  db: DbClient,
  userId: string,
): ResultAsync<User, Error> {
  return safeDbOperation(db, async (drizzle) => {
    const [user] = await drizzle
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return user;
  });
}
```

### Consuming Safe Database Operations

When calling database procedures, handle both success and error cases:

```typescript
const result = await selectUserSafe(db, userId);

if (result.isOk()) {
  console.log("User found:", result.value);
} else {
  console.error("Database error:", result.error);
}
```

### Benefits

1. **Type-safe error handling**: The compiler enforces that you handle errors
2. **No unhandled promise rejections**: All database errors are explicitly captured
3. **Composable**: Results can be chained with `.map()`, `.andThen()`, etc.
4. **Testable**: Easy to mock and test error scenarios

### ESLint Rule

The codebase includes a custom ESLint rule (`mp-db/require-db-result-return`) that warns when:

- Exported functions in `db/src/procedures/` accept a `DbClient` parameter but don't return a `Result` type
- Direct `DbClient.unwrap()` usage is detected (should use `safeDbOperation` instead)

Functions ending with `Safe` are exempt from the rule (e.g., `selectUserSafe` vs `selectUser` legacy version).

### Migration Strategy

When migrating existing code:

1. Create a new `*Safe` version of the function that returns `Result`
2. Keep the old throwing version for backward compatibility if needed
3. Gradually migrate call sites to use the safe version
4. Eventually deprecate and remove the throwing version

### Utilities

- `safeDbOperation(db, operation)` - Wraps async database operations
- `safeDbOperationSync(db, operation)` - Wraps synchronous operations
- `toSafeDbOperation(operation)` - Converts throwing operations to safe ones
