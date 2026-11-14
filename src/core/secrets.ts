const PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+\S{10,}/,
];

export function looksSecret(value: string): boolean {
  if (value.includes("{env:")) return false;
  return PATTERNS.some((pattern) => pattern.test(value));
}

export function envReference(name: string): string {
  return `{env:${name}}`;
}
