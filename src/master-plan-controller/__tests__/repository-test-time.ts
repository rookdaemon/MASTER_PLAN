const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g;

export function nextRepositoryTimestamp(files: Readonly<Record<string, string>>): string {
  let latest = Number.NEGATIVE_INFINITY;
  for (const content of Object.values(files)) {
    for (const match of content.matchAll(ISO_TIMESTAMP)) {
      const epoch = Date.parse(match[0]);
      if (!Number.isNaN(epoch)) latest = Math.max(latest, epoch);
    }
  }
  if (!Number.isFinite(latest)) throw new Error('Repository fixture has no timestamp');
  return new Date(latest + 1).toISOString();
}

export function advanceTimestamp(timestamp: string, milliseconds = 1): string {
  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch) || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error('A valid timestamp and positive offset are required');
  }
  return new Date(epoch + milliseconds).toISOString();
}
