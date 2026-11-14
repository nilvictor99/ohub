export const EXIT = {
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  CONFIG: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  NETWORK: 6,
  PERMISSION: 7,
  INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class OhubError extends Error {
  readonly code: ExitCode;
  readonly hint?: string;

  constructor(code: ExitCode, message: string, hint?: string) {
    super(message);
    this.name = "OhubError";
    this.code = code;
    this.hint = hint;
  }
}

export function usage(message: string, hint?: string): OhubError {
  return new OhubError(EXIT.USAGE, message, hint);
}

export function configError(message: string, hint?: string): OhubError {
  return new OhubError(EXIT.CONFIG, message, hint);
}

export function notFound(message: string, hint?: string): OhubError {
  return new OhubError(EXIT.NOT_FOUND, message, hint);
}

export function conflict(message: string, hint?: string): OhubError {
  return new OhubError(EXIT.CONFLICT, message, hint);
}
