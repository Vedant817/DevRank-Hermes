const secretPatterns: Array<[RegExp, string]> = [
  // Longer provider prefixes first: sk-or-v1- would otherwise match generic sk-.
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_OPENROUTER_KEY]"],
  [/sk-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_OPENAI_KEY]"],
  [/gsk_[A-Za-z0-9_-]{16,}/gi, "[REDACTED_GROQ_KEY]"],
  [/xox[a-z]-[A-Za-z0-9-]{3,}/g, "[REDACTED_SLACK_TOKEN]"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/gi, "[REDACTED_GITHUB_TOKEN]"],
  [/github_pat_[A-Za-z0-9_]{20,}/gi, "[REDACTED_GITHUB_TOKEN]"],
  [/lin_api_[A-Za-z0-9_-]{16,}/gi, "[REDACTED_LINEAR_KEY]"],
  [/tvly-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_TAVILY_KEY]"],
  [/sb_[A-Za-z0-9_-]{20,}/gi, "[REDACTED_SUPABASE_KEY]"],
  [/(?:AKIA|ASIA)[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]"],
  // Full PEM block first so the base64 body never survives a header-only match.
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]{0,8000}?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  [/postgres(?:ql)?:\/\/[^\s"'`)]+/gi, "[REDACTED_DATABASE_URL]"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED_EMAIL]"],
  [/\b[A-Z][A-Z0-9]{1,9}-\d{1,8}\b/g, "[REDACTED_JIRA_REFERENCE]"],
  [/\b(customer|client|tenant|account)(?:[_-]?(id|name|email|slug))?\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED_CUSTOMER_REFERENCE]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s)]+/gi, "$1=[REDACTED_SECRET]"],
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
