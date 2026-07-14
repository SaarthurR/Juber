declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...values: unknown[]): { changes: number | bigint };
      get(...values: unknown[]): Record<string, unknown> | undefined;
      all(...values: unknown[]): Record<string, unknown>[];
    };
    close(): void;
  }
}
