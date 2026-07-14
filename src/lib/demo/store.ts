import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDemoState, currentLosAngelesDay } from "./fixtures";
import { reduceDemoState } from "./reducer";
import {
  DemoRevisionError,
  type DemoCommand,
  type DemoOwnerKind,
  type DemoSession,
  type DemoState,
} from "./types";

export type CreateDemoSession = {
  ownerKind: DemoOwnerKind;
  ownerId: string;
  seedDay?: string;
  ttlHours?: number;
};

export interface DemoSessionStore {
  create(input: CreateDemoSession): Promise<DemoSession>;
  read(id: string): Promise<DemoSession | null>;
  getRevision(id: string): Promise<number | null>;
  mutate(id: string, expectedRevision: number | undefined, command: DemoCommand): Promise<DemoSession>;
  reset(id: string, expectedRevision?: number): Promise<DemoSession>;
  delete(id: string): Promise<boolean>;
  prune(): Promise<number>;
}

type StoredRow = {
  id: string;
  owner_kind: DemoOwnerKind;
  owner_id: string;
  active_actor_id: string;
  seed_day: string;
  revision: number;
  snapshot: DemoState;
  expires_at: string;
};

function expiry(ttlHours = 24) {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
}

function session(row: StoredRow): DemoSession {
  return {
    id: row.id,
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    activeActorId: row.active_actor_id,
    seedDay: row.seed_day,
    revision: Number(row.revision),
    state: row.snapshot,
    expiresAt: row.expires_at,
  };
}

export class SqliteDemoSessionStore implements DemoSessionStore {
  private readonly database: DatabaseSync;

  constructor(path = process.env.DEMO_SQLITE_PATH ?? ".juber/demo.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      create table if not exists demo_sessions (
        id text primary key,
        owner_kind text not null,
        owner_id text not null unique,
        active_actor_id text not null,
        seed_day text not null,
        revision integer not null,
        snapshot text not null,
        expires_at text not null
      )
    `);
  }

  async create(input: CreateDemoSession) {
    const seedDay = input.seedDay ?? currentLosAngelesDay();
    const state = createDemoState(seedDay);
    const row: StoredRow = { id: randomUUID(), owner_kind: input.ownerKind, owner_id: input.ownerId, active_actor_id: state.activeActorId, seed_day: seedDay, revision: 0, snapshot: state, expires_at: expiry(input.ttlHours) };
    this.database.exec("begin immediate");
    try {
      this.database.prepare("delete from demo_sessions where owner_id = ?").run(input.ownerId);
      this.database.prepare("insert into demo_sessions values (?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.owner_kind, row.owner_id, row.active_actor_id, row.seed_day, row.revision, JSON.stringify(row.snapshot), row.expires_at);
      this.database.exec("commit");
      return session(row);
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  async read(id: string) {
    const raw = this.database.prepare("select * from demo_sessions where id = ? and expires_at > ?").get(id, new Date().toISOString());
    return raw ? session(this.parse(raw)) : null;
  }

  async getRevision(id: string) {
    const raw = this.database.prepare("select revision from demo_sessions where id = ? and expires_at > ?").get(id, new Date().toISOString());
    return raw ? Number(raw.revision) : null;
  }

  async mutate(id: string, expectedRevision: number | undefined, command: DemoCommand) {
    return this.update(id, expectedRevision, (state) => reduceDemoState(state, command).state);
  }

  async reset(id: string, expectedRevision?: number) {
    return this.update(id, expectedRevision, (state) => createDemoState(state.seedDay));
  }

  async delete(id: string) {
    return Number(this.database.prepare("delete from demo_sessions where id = ?").run(id).changes) > 0;
  }

  async prune() {
    return Number(this.database.prepare("delete from demo_sessions where expires_at <= ?").run(new Date().toISOString()).changes);
  }

  close() {
    this.database.close();
  }

  private update(id: string, expectedRevision: number | undefined, change: (state: DemoState) => DemoState) {
    this.database.exec("begin immediate");
    try {
      const raw = this.database.prepare("select * from demo_sessions where id = ? and expires_at > ?").get(id, new Date().toISOString());
      if (!raw) throw new Error("Demo session not found");
      const row = this.parse(raw);
      if (expectedRevision !== undefined && expectedRevision !== row.revision) throw new DemoRevisionError(row.revision);
      const nextState = change(row.snapshot);
      const revision = row.revision + 1;
      const result = this.database.prepare("update demo_sessions set active_actor_id = ?, revision = ?, snapshot = ? where id = ? and revision = ?").run(nextState.activeActorId, revision, JSON.stringify(nextState), id, row.revision);
      if (Number(result.changes) !== 1) throw new DemoRevisionError(row.revision);
      this.database.exec("commit");
      return session({ ...row, active_actor_id: nextState.activeActorId, revision, snapshot: nextState });
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  private parse(raw: Record<string, unknown>): StoredRow {
    return { id: String(raw.id), owner_kind: raw.owner_kind as DemoOwnerKind, owner_id: String(raw.owner_id), active_actor_id: String(raw.active_actor_id), seed_day: String(raw.seed_day), revision: Number(raw.revision), snapshot: JSON.parse(String(raw.snapshot)) as DemoState, expires_at: String(raw.expires_at) };
  }
}

export class SupabaseDemoSessionStore implements DemoSessionStore {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateDemoSession) {
    if (input.ownerKind !== "admin") throw new Error("Hosted demo sessions require an authenticated administrator");
    const seedDay = input.seedDay ?? currentLosAngelesDay();
    const state = createDemoState(seedDay);
    const { data, error } = await this.client.rpc("demo_session_enable", { p_id: randomUUID(), p_active_actor_id: state.activeActorId, p_seed_day: seedDay, p_snapshot: state, p_expires_at: expiry(input.ttlHours) });
    if (error) throw error;
    const value = Array.isArray(data) ? data[0] : data;
    if (!value) throw new Error("Demo session could not be enabled");
    const result = session(value as StoredRow);
    if (result.ownerId !== input.ownerId) throw new Error("Demo session owner mismatch");
    return result;
  }

  async read(id: string) {
    const { data, error } = await this.client.from("demo_sessions").select("id, owner_kind, owner_id, active_actor_id, seed_day, revision, snapshot, expires_at").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    return data ? session(data as StoredRow) : null;
  }

  async getRevision(id: string) {
    const { data, error } = await this.client.from("demo_sessions").select("revision").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    return data ? Number(data.revision) : null;
  }

  async mutate(id: string, expectedRevision: number | undefined, command: DemoCommand) {
    const current = await this.required(id);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new DemoRevisionError(current.revision);
    const next = reduceDemoState(current.state, command).state;
    return this.compareAndSwap(current, next);
  }

  async reset(id: string, expectedRevision?: number) {
    const current = await this.required(id);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new DemoRevisionError(current.revision);
    return this.compareAndSwap(current, createDemoState(current.seedDay));
  }

  async delete(id: string) {
    const { data, error } = await this.client.rpc("demo_session_disable", { p_id: id });
    if (error) throw error;
    return Boolean(data);
  }

  async prune() {
    const { data, error } = await this.client.rpc("demo_session_prune");
    if (error) throw error;
    return Number(data ?? 0);
  }

  private async required(id: string) {
    return await this.read(id) ?? Promise.reject(new Error("Demo session not found"));
  }

  private async compareAndSwap(current: DemoSession, state: DemoState) {
    const { data, error } = await this.client.rpc("demo_session_compare_and_swap", { p_id: current.id, p_expected_revision: current.revision, p_active_actor_id: state.activeActorId, p_snapshot: state });
    if (error) {
      if (error.message.toLowerCase().includes("revision")) throw new DemoRevisionError(await this.getRevision(current.id) ?? current.revision);
      throw error;
    }
    const value = Array.isArray(data) ? data[0] : data;
    if (!value) throw new DemoRevisionError(await this.getRevision(current.id) ?? current.revision);
    return session(value as StoredRow);
  }
}
