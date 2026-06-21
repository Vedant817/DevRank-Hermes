export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly causeCode?: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
