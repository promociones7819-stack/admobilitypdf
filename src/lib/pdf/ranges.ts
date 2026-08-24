/** Converts a human page range such as "1-3, 6, 9-7" to zero-based indexes. */
export function parsePageRange(value: string, total: number): number[] {
  if (!value.trim()) throw new Error("empty-range");
  const result: number[] = [];
  for (const rawPart of value.split(",")) {
    const part = rawPart.trim();
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("invalid-range");
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < 1 || start > total || end > total) throw new Error("range-outside");
    const direction = start <= end ? 1 : -1;
    for (let page = start; page !== end + direction; page += direction) {
      const index = page - 1;
      if (!result.includes(index)) result.push(index);
    }
  }
  return result;
}

/** Semicolon-separated ranges become separate PDF documents. */
export function parsePageGroups(value: string, total: number): number[][] {
  const groups = value
    .split(";")
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => parsePageRange(group, total));
  if (groups.length === 0) throw new Error("empty-range");
  return groups;
}

export function pageChunks(total: number, size: number): number[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("invalid-chunk");
  const groups: number[][] = [];
  for (let start = 0; start < total; start += size) {
    groups.push(
      Array.from({ length: Math.min(size, total - start) }, (_, offset) => start + offset),
    );
  }
  return groups;
}
