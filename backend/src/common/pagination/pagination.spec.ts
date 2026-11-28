import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor, toPage } from './pagination';

describe('pagination helpers', () => {
  it('round-trips a keyset cursor', () => {
    const key = [3, 'a1b2', '2026-11-28T08:00:00.000Z'];
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it.each([
    ['not base64 json', '%%%'],
    ['a JSON object', Buffer.from('{"a":1}').toString('base64url')],
    ['a JSON scalar', Buffer.from('42').toString('base64url')],
  ])('rejects %s with INVALID_CURSOR', (_label, cursor) => {
    let error: unknown;
    try {
      decodeCursor(cursor);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('returns the last page without a cursor', () => {
    expect(toPage([{ id: 'a' }, { id: 'b' }], 2, (r) => [r.id])).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: null,
    });
    expect(toPage([], 2, () => [])).toEqual({ items: [], nextCursor: null });
  });

  it('drops the look-ahead row and points the cursor at the last item', () => {
    const page = toPage([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2, (r) => [
      r.id,
    ]);
    expect(page.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(decodeCursor(page.nextCursor!)).toEqual(['b']);
  });
});
