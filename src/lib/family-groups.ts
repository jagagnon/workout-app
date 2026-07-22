export interface FamilyRow {
  canonical_name: string;
  family: string | null;
  is_key?: boolean;
}

export interface ClusteredRow<T> {
  item: T;
  familyHeader: string | null;
}

// Orders rows so exercises sharing a family (e.g. all row variations) sit next to
// each other, and marks the first row of each multi-member family for a sub-header.
// Ungrouped exercises (family: null) keep their own alphabetical slot, sorted by name.
// Within a family, the key lift (if any) leads the cluster.
export function clusterByFamily<T extends FamilyRow>(items: T[]): ClusteredRow<T>[] {
  const familyCounts = new Map<string, number>();
  for (const it of items) {
    if (it.family) familyCounts.set(it.family, (familyCounts.get(it.family) ?? 0) + 1);
  }

  const ordered = [...items].sort((a, b) => {
    const ka = a.family ?? a.canonical_name;
    const kb = b.family ?? b.canonical_name;
    if (ka !== kb) return ka.localeCompare(kb);
    if (!!a.is_key !== !!b.is_key) return a.is_key ? -1 : 1;
    return a.canonical_name.localeCompare(b.canonical_name);
  });

  let lastFamily: string | null = null;
  return ordered.map((item) => {
    const showHeader = !!item.family && (familyCounts.get(item.family) ?? 0) > 1 && item.family !== lastFamily;
    lastFamily = item.family;
    return { item, familyHeader: showHeader ? item.family : null };
  });
}
