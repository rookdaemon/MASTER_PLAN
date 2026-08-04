export function formattedRepositoryJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sameRepositoryJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function appendRepositoryJsonArrayItems<T>(
  content: string,
  previous: readonly T[],
  next: readonly T[],
): string {
  if (sameRepositoryJson(previous, next)) return content;
  if (next.length < previous.length || !sameRepositoryJson(previous, next.slice(0, previous.length))) {
    return formattedRepositoryJson(next);
  }
  const additions = next.slice(previous.length);
  const trimmed = content.trimEnd();
  if (!trimmed.endsWith(']')) throw new Error('Expected a JSON array');
  const prefix = trimmed.slice(0, -1).trimEnd();
  const separator = previous.length === 0 ? '\n' : ',\n';
  const serialized = additions
    .map((item) => JSON.stringify(item, null, 2).split('\n').map((line) => `  ${line}`).join('\n'))
    .join(',\n');
  return `${prefix}${separator}${serialized}\n]\n`;
}
