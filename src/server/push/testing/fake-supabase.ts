/**
 * A tiny in-memory stand-in for the Supabase client, for unit tests of the push chain.
 * It understands only the query shapes this area uses: select / insert / upsert / update /
 * delete with eq, in and gte filters, single(), count with head, and rpc() handlers.
 * Not a database: no RLS, no types, no constraints beyond upsert's conflict column.
 */

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };
type Result = { data: unknown; error: DbError | null; count?: number | null };

type Operation = "select" | "insert" | "upsert" | "update" | "delete";

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: readonly unknown[] }
  | { kind: "gte"; column: string; value: string | number };

export type LoggedQuery = {
  table: string;
  operation: Operation;
  values?: Row | Row[];
  filters: Filter[];
};

type RpcHandler = (args: Record<string, unknown>) => unknown;

let nextId = 1;

export class FakeSupabase {
  readonly tables: Record<string, Row[]> = {};
  readonly log: LoggedQuery[] = [];
  readonly rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  private readonly rpcHandlers = new Map<string, RpcHandler>();
  private readonly failures: { table: string; operation: Operation }[] = [];

  constructor(private readonly defaults: Record<string, () => Row> = {}) {}

  seed(table: string, rows: Row[]): this {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows.map((row) => ({ ...row }))];
    return this;
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  onRpc(name: string, handler: RpcHandler): this {
    this.rpcHandlers.set(name, handler);
    return this;
  }

  /** The next matching query returns a database error instead of running. */
  failNext(table: string, operation: Operation): this {
    this.failures.push({ table, operation });
    return this;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(name: string, args: Record<string, unknown> = {}) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcHandlers.get(name);
    const result: Result = handler
      ? { data: handler(args), error: null }
      : { data: null, error: { code: "PGRST202", message: `No rpc ${name}` } };
    return Promise.resolve(result);
  }

  /** @internal */
  takeFailure(table: string, operation: Operation): boolean {
    const index = this.failures.findIndex((f) => f.table === table && f.operation === operation);
    if (index === -1) return false;
    this.failures.splice(index, 1);
    return true;
  }

  /** @internal */
  newRow(table: string, values: Row): Row {
    return { ...(this.defaults[table]?.() ?? {}), id: nextId++, ...values };
  }
}

class FakeQuery implements PromiseLike<Result> {
  private operation: Operation = "select";
  private values: Row | Row[] | undefined;
  private conflictColumn: string | undefined;
  private filters: Filter[] = [];
  private returning: string | null = null;
  private countOnly = false;
  private singleRow: "single" | "maybe" | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}) {
    if (this.operation === "select") {
      this.countOnly = options.head === true;
    }
    this.returning = columns;
    return this;
  }

  insert(values: Row | Row[]) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  upsert(values: Row | Row[], options: { onConflict?: string } = {}) {
    this.operation = "upsert";
    this.values = values;
    this.conflictColumn = options.onConflict ?? "id";
    return this;
  }

  update(values: Row) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  gte(column: string, value: string | number) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  single() {
    this.singleRow = "single";
    return this;
  }

  maybeSingle() {
    this.singleRow = "maybe";
    return this;
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onFulfilled, onRejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "in") return filter.values.includes(value);
      return typeof value === typeof filter.value && (value as string | number) >= filter.value;
    });
  }

  private run(): Result {
    this.db.log.push({
      table: this.table,
      operation: this.operation,
      values: this.values,
      filters: this.filters,
    });
    if (this.db.takeFailure(this.table, this.operation)) {
      return { data: null, error: { code: "XX000", message: "injected failure" } };
    }

    const table = (this.db.tables[this.table] ??= []);
    let affected: Row[];

    switch (this.operation) {
      case "select":
        affected = table.filter((row) => this.matches(row));
        if (this.countOnly) return { data: null, error: null, count: affected.length };
        break;
      case "insert":
        affected = toArray(this.values).map((values) => this.db.newRow(this.table, values));
        table.push(...affected);
        break;
      case "upsert": {
        const column = this.conflictColumn ?? "id";
        affected = toArray(this.values).map((values) => {
          const existing = table.find((row) => row[column] === values[column]);
          if (existing) return Object.assign(existing, values);
          const row = this.db.newRow(this.table, values);
          table.push(row);
          return row;
        });
        break;
      }
      case "update":
        affected = table.filter((row) => this.matches(row));
        for (const row of affected) Object.assign(row, this.values);
        break;
      case "delete":
        affected = table.filter((row) => this.matches(row));
        this.db.tables[this.table] = table.filter((row) => !affected.includes(row));
        break;
    }

    const isWrite = this.operation !== "select";
    if (isWrite && this.returning === null) return { data: null, error: null };

    const data = affected.map((row) => project(row, this.returning ?? "*"));
    if (this.singleRow) {
      if (data.length === 1) return { data: data[0], error: null };
      if (data.length === 0 && this.singleRow === "maybe") return { data: null, error: null };
      return { data: null, error: { code: "PGRST116", message: "Not exactly one row" } };
    }
    return { data, error: null };
  }
}

function toArray(values: Row | Row[] | undefined): Row[] {
  if (!values) return [];
  return Array.isArray(values) ? values : [values];
}

function project(row: Row, columns: string): Row {
  if (columns.trim() === "*") return { ...row };
  const out: Row = {};
  for (const column of columns.split(",").map((c) => c.trim())) out[column] = row[column];
  return out;
}
