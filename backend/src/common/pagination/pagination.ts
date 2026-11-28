import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
}

/** Keyset cursors are opaque base64url-encoded JSON tuples of the sort key. */
export function encodeCursor(key: unknown[]): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

export function invalidCursor(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_CURSOR',
    message: 'Invalid page cursor.',
  });
}

export function decodeCursor(cursor: string): unknown[] {
  try {
    const key: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (Array.isArray(key)) return key;
  } catch {
    // fall through
  }
  throw invalidCursor();
}

/**
 * Builds a page from rows fetched with `take: limit + 1`; the extra row only
 * signals that another page exists.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => unknown[],
): Page<T> {
  const items = rows.length > limit ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(keyOf(last)) : null,
  };
}
