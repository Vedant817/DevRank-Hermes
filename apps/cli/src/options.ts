import { CliError } from "./errors.js";

export type OptionValue = boolean | string | string[];

export type ParsedArgs = {
  commandName?: string;
  options: Record<string, OptionValue>;
  positionals: string[];
  raw: string[];
};

export function parseArgs(argv: string[]): ParsedArgs {
  const firstArg = argv[0];
  const commandName = firstArg && !firstArg.startsWith("-") ? firstArg : undefined;
  const rest = commandName ? argv.slice(1) : argv;
  const parsed: ParsedArgs = {
    commandName,
    options: {},
    positionals: [],
    raw: argv,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      parsed.positionals.push(...rest.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const optionToken = token.slice(2);
      const equalsIndex = optionToken.indexOf("=");

      if (equalsIndex >= 0) {
        addOption(parsed.options, optionToken.slice(0, equalsIndex), optionToken.slice(equalsIndex + 1));
        continue;
      }

      if (optionToken.startsWith("no-")) {
        addOption(parsed.options, optionToken, true);
        continue;
      }

      const next = rest[index + 1];

      if (next && !next.startsWith("--")) {
        addOption(parsed.options, optionToken, next);
        index += 1;
      } else {
        addOption(parsed.options, optionToken, true);
      }

      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      for (const shortName of token.slice(1)) {
        addOption(parsed.options, shortName, true);
      }
      continue;
    }

    parsed.positionals.push(token);
  }

  return parsed;
}

export function booleanOption(parsed: ParsedArgs, name: string) {
  const value = parsed.options[name];

  if (Array.isArray(value)) {
    return value.some((item) => item === "true" || item === "1");
  }

  if (typeof value === "string") {
    return value === "true" || value === "1";
  }

  return value === true;
}

export function stringOption(parsed: ParsedArgs, name: string) {
  const value = parsed.options[name];

  if (Array.isArray(value)) {
    return value.at(-1);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

export function stringListOption(parsed: ParsedArgs, name: string) {
  const value = parsed.options[name];

  if (Array.isArray(value)) {
    return value.filter((item) => item.trim().length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  return undefined;
}

export function numberOption(parsed: ParsedArgs, name: string, fallback: number) {
  const value = stringOption(parsed, name);

  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new CliError(`Option --${name} must be a positive number.`, 2);
  }

  return parsedValue;
}

function addOption(options: Record<string, OptionValue>, name: string, value: OptionValue) {
  const current = options[name];

  if (current === undefined) {
    options[name] = value;
    return;
  }

  if (Array.isArray(current)) {
    options[name] = [...current, String(value)];
    return;
  }

  options[name] = [String(current), String(value)];
}
