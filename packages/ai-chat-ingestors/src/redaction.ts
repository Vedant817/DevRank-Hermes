const secretPatterns: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]"],
  [/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED_EMAIL]"],
  [/\b[A-Z][A-Z0-9]{1,9}-\d{1,8}\b/g, "[REDACTED_JIRA_REFERENCE]"],
  [/\b(customer|client|tenant|account)(?:[_-]?(id|name|email|slug))?\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED_CUSTOMER_REFERENCE]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s]+/gi, "$1=[REDACTED_SECRET]"],
];

export interface RedactionResult {
  text: string;
  redactions: string[];
}

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const redactions = new Set<string>();

  for (const [pattern, replacement] of secretPatterns) {
    text = text.replace(pattern, (match) => {
      redactions.add(replacement.match(/\[[^\]]+\]/)?.[0] ?? replacement);
      return match.replace(pattern, replacement);
    });
  }

  return {
    text,
    redactions: [...redactions],
  };
}
