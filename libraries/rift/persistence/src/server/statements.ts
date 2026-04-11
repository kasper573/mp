import type BetterSqlite3 from "better-sqlite3";

export interface CollectionRow {
  key: string;
  instance_id: string;
  _version: number;
  _deleted: number;
  [column: `comp_${number}`]: Uint8Array | Buffer | null;
}

interface UpsertRow {
  key: string;
  instance_id: string;
  blobs: ReadonlyArray<Uint8Array | undefined>;
}

export interface PreparedStatements {
  createTable(): void;
  loadOwned(instanceId: string): CollectionRow[];
  loadExternal(instanceId: string): CollectionRow[];
  loadByKey(key: string): CollectionRow | undefined;
  upsert(row: UpsertRow): void;
  softDelete(key: string, instanceId: string): void;
  createLeaseTable(): void;
  acquireLease(
    key: string,
    instanceId: string,
    expiresAt: number,
    now: number,
  ): boolean;
  renewLease(key: string, instanceId: string, expiresAt: number): void;
  releaseLease(key: string, instanceId: string): void;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll(`"`, `""`)}"`;
}

function blobColumn(index: number): string {
  return quoteIdentifier(`comp_${index}`);
}

function tableColumns(componentCount: number): string {
  return Array.from(
    { length: componentCount },
    (_, index) => `${blobColumn(index)} BLOB`,
  ).join(", ");
}

function nullAssignments(componentCount: number): string {
  return Array.from({ length: componentCount }, (_, index) => {
    const column = blobColumn(index);
    return `${column} = NULL`;
  }).join(", ");
}

export function createPreparedStatements(
  db: InstanceType<typeof BetterSqlite3>,
  collectionName: string,
  componentCount: number,
): PreparedStatements {
  const table = quoteIdentifier(collectionName);
  const componentColumns = tableColumns(componentCount);
  const componentNames = Array.from({ length: componentCount }, (_, index) =>
    blobColumn(index),
  ).join(", ");
  const upsertValues = Array.from({ length: componentCount }, () => "?").join(
    ", ",
  );
  const valuePlaceholders =
    componentCount === 0 ? "?, ?, 0" : `?, ?, 0, ${upsertValues}`;
  const upsertAssignments = Array.from(
    { length: componentCount },
    (_, index) => {
      const column = blobColumn(index);
      return `${column} = excluded.${column}`;
    },
  ).join(", ");

  const createTableSql = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `"key" TEXT PRIMARY KEY,`,
    `"instance_id" TEXT NOT NULL,`,
    `"_version" INTEGER NOT NULL DEFAULT 0,`,
    `"_deleted" INTEGER NOT NULL DEFAULT 0`,
    componentCount === 0 ? "" : `, ${componentColumns}`,
    `)`,
  ]
    .filter(Boolean)
    .join(" ");

  const createVersionIndexSql = `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(
    `${collectionName}_instance_id_idx`,
  )} ON ${table} ("instance_id")`;

  const loadOwnedSql = `SELECT * FROM ${table} WHERE "instance_id" = ?`;
  const loadExternalSql = `SELECT * FROM ${table} WHERE "instance_id" != ?`;
  const loadByKeySql = `SELECT * FROM ${table} WHERE "key" = ?`;
  const leaseTable = quoteIdentifier(`${collectionName}_leases`);
  const createLeaseTableSql = `CREATE TABLE IF NOT EXISTS ${leaseTable} ("key" TEXT PRIMARY KEY, "instance_id" TEXT NOT NULL, "expires_at" INTEGER NOT NULL)`;
  const acquireLeaseSql = `INSERT INTO ${leaseTable} ("key", "instance_id", "expires_at")
    VALUES (?, ?, ?)
    ON CONFLICT("key") DO UPDATE SET
      "instance_id" = excluded."instance_id",
      "expires_at" = excluded."expires_at"
    WHERE ${leaseTable}."expires_at" <= ? OR ${leaseTable}."instance_id" = excluded."instance_id"`;
  const renewLeaseSql = `UPDATE ${leaseTable}
    SET "expires_at" = ?
    WHERE "key" = ? AND "instance_id" = ?`;
  const releaseLeaseSql = `DELETE FROM ${leaseTable}
    WHERE "key" = ? AND "instance_id" = ?`;

  const upsertSql =
    componentCount === 0
      ? `INSERT INTO ${table} ("key", "instance_id", "_deleted")
         VALUES (?, ?, 0)
         ON CONFLICT("key") DO UPDATE SET
           "instance_id" = excluded."instance_id",
           "_version" = ${table}."_version" + 1,
           "_deleted" = 0`
      : `INSERT INTO ${table} ("key", "instance_id", "_deleted", ${componentNames})
         VALUES (${valuePlaceholders})
         ON CONFLICT("key") DO UPDATE SET
           "instance_id" = excluded."instance_id",
           "_version" = ${table}."_version" + 1,
           "_deleted" = 0,
           ${upsertAssignments}`;

  const updateDeleteSql =
    componentCount === 0
      ? `UPDATE ${table}
         SET "instance_id" = ?, "_version" = "_version" + 1, "_deleted" = 1
         WHERE "key" = ?`
      : `UPDATE ${table}
         SET "instance_id" = ?, "_version" = "_version" + 1, "_deleted" = 1, ${nullAssignments(componentCount)}
         WHERE "key" = ?`;

  const insertDeleteSql =
    componentCount === 0
      ? `INSERT INTO ${table} ("key", "instance_id", "_version", "_deleted")
         VALUES (?, ?, 1, 1)`
      : `INSERT INTO ${table} ("key", "instance_id", "_version", "_deleted", ${componentNames})
         VALUES (?, ?, 1, 1, ${Array.from({ length: componentCount }, () => "NULL").join(", ")})`;

  return {
    createTable() {
      db.exec(createTableSql);
      db.exec(createVersionIndexSql);
    },
    loadOwned(instanceId) {
      return db.prepare(loadOwnedSql).all(instanceId) as CollectionRow[];
    },
    loadExternal(instanceId) {
      return db.prepare(loadExternalSql).all(instanceId) as CollectionRow[];
    },
    loadByKey(key) {
      return db.prepare(loadByKeySql).get(key) as CollectionRow | undefined;
    },
    upsert(row) {
      const params =
        componentCount === 0
          ? [row.key, row.instance_id]
          : [
              row.key,
              row.instance_id,
              ...row.blobs.map((blob) => blob ?? null),
            ];
      db.prepare(upsertSql).run(...params);
    },
    softDelete(key, instanceId) {
      const updated = db.prepare(updateDeleteSql).run(instanceId, key);
      if (updated.changes > 0) {
        return;
      }
      db.prepare(insertDeleteSql).run(key, instanceId);
    },
    createLeaseTable() {
      db.exec(createLeaseTableSql);
    },
    acquireLease(key, instanceId, expiresAt, now) {
      const result = db
        .prepare(acquireLeaseSql)
        .run(key, instanceId, expiresAt, now);
      return result.changes > 0;
    },
    renewLease(key, instanceId, expiresAt) {
      db.prepare(renewLeaseSql).run(expiresAt, key, instanceId);
    },
    releaseLease(key, instanceId) {
      db.prepare(releaseLeaseSql).run(key, instanceId);
    },
  };
}
