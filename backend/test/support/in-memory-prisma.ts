/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// Test-only fake: WHERE clauses are matched dynamically against plain rows.
import { randomUUID } from 'crypto';

/**
 * Minimal in-memory stand-in for the PrismaService surface used by the auth
 * and users modules. It is NOT a general Prisma emulator.
 *
 * Semantics relevant to the session-security tests:
 * - Every operation yields to the event loop first, so concurrent callers
 *   genuinely interleave.
 * - `updateMany` evaluates its WHERE clause and applies the write in one
 *   synchronous step, mirroring how a PostgreSQL UPDATE re-checks the
 *   predicate under the row lock (only one caller can match a given row).
 * - `$transaction` rolls back all writes made inside the callback on error.
 * - `$queryRaw ... FOR UPDATE` on "User" takes a FIFO per-user lock held
 *   until the transaction ends, so lock ordering can be tested
 *   deterministically (see `lockHook` and `waitersFor`).
 *
 * What it does NOT model: MVCC snapshots / READ COMMITTED visibility. Writes
 * are visible to everyone immediately, so the R-1 anomaly itself (a revoking
 * statement missing a concurrently inserted row) cannot occur here. These
 * tests verify lock discipline and decision logic; real database behaviour
 * is covered by test/auth-session.e2e-spec.ts.
 */

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  disabledAt: Date | null;
  passwordChangedAt: Date | null;
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string | null;
  replacedByTokenId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

type Where = Record<string, any>;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function matches(row: Record<string, any>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null;
    if (condition instanceof Date)
      return value?.getTime() === condition.getTime();
    if (typeof condition === 'object') {
      if ('gt' in condition)
        return value instanceof Date && value > condition.gt;
      if ('not' in condition) return value !== condition.not;
      throw new Error(`Unsupported condition on ${key}`);
    }
    return value === condition;
  });
}

function pick<T extends Record<string, any>>(
  row: T,
  select?: Record<string, boolean>,
) {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.keys(select)
      .filter((k) => select[k])
      .map((k) => [k, row[k]]),
  );
}

export class InMemoryPrisma {
  users: UserRow[] = [];
  refreshTokens: RefreshTokenRow[] = [];

  addUser(
    partial: Partial<UserRow> & Pick<UserRow, 'email' | 'passwordHash'>,
  ): UserRow {
    const now = new Date();
    const row: UserRow = {
      id: randomUUID(),
      fullName: 'Test User',
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      disabledAt: null,
      passwordChangedAt: null,
      ...partial,
    };
    this.users.push(row);
    return row;
  }

  user = {
    findUnique: async ({ where }: { where: Where }) => {
      await tick();
      const row = this.users.find((u) => matches(u, where));
      return row ? { ...row } : null;
    },
    update: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<UserRow>;
    }) => {
      await tick();
      const row = this.users.find((u) => matches(u, where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  };

  refreshToken = {
    findUnique: async ({
      where,
      include,
    }: {
      where: Where;
      include?: { user?: { select?: Record<string, boolean> } };
    }) => {
      await tick();
      const row = this.refreshTokens.find((t) => matches(t, where));
      if (!row) return null;
      const result: Record<string, any> = { ...row };
      if (include?.user) {
        const user = this.users.find((u) => u.id === row.userId)!;
        result.user = pick(user, include.user.select);
      }
      return result;
    },
    findMany: async ({ where }: { where: Where }) => {
      await tick();
      return this.refreshTokens
        .filter((t) => matches(t, where))
        .map((t) => ({ ...t }));
    },
    create: async ({ data }: { data: Partial<RefreshTokenRow> }) => {
      await tick();
      if (this.refreshTokens.some((t) => t.tokenHash === data.tokenHash)) {
        throw new Error('Unique constraint failed on tokenHash');
      }
      const row: RefreshTokenRow = {
        id: randomUUID(),
        familyId: null,
        replacedByTokenId: null,
        revokedAt: null,
        createdAt: new Date(),
        ...data,
      } as RefreshTokenRow;
      this.refreshTokens.push(row);
      return { ...row };
    },
    update: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<RefreshTokenRow>;
    }) => {
      await tick();
      const row = this.refreshTokens.find((t) => matches(t, where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<RefreshTokenRow>;
    }) => {
      await tick();
      // Predicate check and write happen atomically (no await in between).
      const rows = this.refreshTokens.filter((t) => matches(t, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  };

  notificationPreference = {
    findMany: async () => {
      await tick();
      return [];
    },
  };

  // ---------- row locks (SELECT ... FOR UPDATE on "User") ----------

  /** FIFO lock queue per user id, like PostgreSQL's row-lock wait queue. */
  private lockTails = new Map<string, Promise<void>>();
  /** Number of transactions currently blocked waiting for a user's lock. */
  private waiting = new Map<string, number>();
  /** Locks held by the transaction this client instance belongs to. */
  private heldLocks?: Map<string, () => void>;

  /**
   * Test hook invoked right after a transaction acquires a user lock. Tests
   * use it as a deterministic barrier to pause the lock holder.
   */
  lockHook?: (userId: string) => Promise<void>;

  waitersFor(userId: string): number {
    return this.waiting.get(userId) ?? 0;
  }

  private async acquireLock(userId: string): Promise<() => void> {
    const previous = this.lockTails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    this.lockTails.set(
      userId,
      previous.then(() => mine),
    );

    this.waiting.set(userId, this.waitersFor(userId) + 1);
    await previous;
    this.waiting.set(userId, this.waitersFor(userId) - 1);
    return release;
  }

  /** Supports only the session-lock query issued by AuthService.lockUser. */
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    if (!/FROM "User"/.test(sql) || !/FOR UPDATE/.test(sql)) {
      throw new Error(`InMemoryPrisma: unsupported raw query: ${sql}`);
    }
    if (!this.heldLocks) {
      throw new Error('InMemoryPrisma: FOR UPDATE used outside a transaction');
    }

    const userId = values[0] as string;
    if (!this.heldLocks.has(userId)) {
      this.heldLocks.set(userId, await this.acquireLock(userId));
      await this.lockHook?.(userId);
    }

    const user = this.users.find((u) => u.id === userId);
    if (!user) return [];
    return [
      {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        blocked: user.deletedAt !== null || user.disabledAt !== null,
      },
    ];
  }

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    // Per-transaction client sharing the same data, owning its own locks.
    const tx = Object.create(this) as this;
    tx.heldLocks = new Map();

    const snapshot = {
      users: this.users.map((u) => ({ ...u })),
      refreshTokens: this.refreshTokens.map((t) => ({ ...t })),
    };
    try {
      return await fn(tx);
    } catch (error) {
      this.users = snapshot.users;
      this.refreshTokens = snapshot.refreshTokens;
      throw error;
    } finally {
      // Locks are released when the transaction ends (commit or rollback).
      tx.heldLocks.forEach((release) => release());
    }
  }

  async $connect() {}
  async $disconnect() {}
}
