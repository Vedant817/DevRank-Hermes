import { readRuntimeEnv, type RuntimeEnv } from "@repo/shared";

export interface GuardrailResult {
  blocked: boolean;
  redacted: string;
  detections: Detection[];
}

export interface Detection {
  type: string;
  category: "pii" | "prompt_injection" | "toxicity" | "policy";
  start: number;
  end: number;
  severity: "low" | "medium" | "high" | "critical";
}

export interface GuardrailConfig {
  enabled: boolean;
  piiRedaction: boolean;
  promptInjection: boolean;
  enkryptAiApiKey?: string;
  enkryptAiEndpoint?: string;
}

const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: "[REDACTED_OPENAI_KEY]", pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED_OPENAI_KEY]" },
  { name: "[REDACTED_ORG_KEY]", pattern: /org-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED_ORG_KEY]" },
  { name: "[REDACTED_TOKEN]", pattern: /xox[baprs]-[A-Za-z0-9]{10,}/g, replacement: "[REDACTED_TOKEN]" },
  { name: "[REDACTED_TOKEN]", pattern: /gh[pousr]_[A-Za-z0-9_]{10,}/g, replacement: "[REDACTED_TOKEN]" },
  { name: "[REDACTED_JWT]", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: "[REDACTED_JWT]" },
  { name: "[REDACTED_DATABASE_URL]", pattern: /(postgres(?:ql)?|mysql|mongodb|redis|rediss):\/\/[^\s"']+/g, replacement: "[REDACTED_DATABASE_URL]" },
  { name: "[REDACTED_AWS_KEY]", pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_KEY]" },
  { name: "[REDACTED_EMAIL]", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  { name: "[REDACTED_SECRET]", pattern: /((?:secret|password|api[_-]?key|token|auth|credential)\s*[:=]\s*)['"]?(?!\[REDACTED_)[^\s"']{4,}/gi, replacement: "$1[REDACTED_SECRET]" },
];

const PROMPT_INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ignore_previous_instructions", pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|directions)/gi },
  { name: "role_escape", pattern: /you\s+are\s+(now\s+)?(a\s+)?(free|unrestricted|dan|jailbreak)/gi },
  { name: "system_prompt_disclosure", pattern: /output\s+(the\s+)?(system|initial)\s+(prompt|instructions|message)/gi },
];

export function resolveGuardrailConfig(env: RuntimeEnv = readRuntimeEnv()): GuardrailConfig {
  return {
    enabled: env.GUARDRAILS_ENABLED !== "false",
    piiRedaction: env.GUARDRAILS_PII_REDACTION !== "false",
    promptInjection: env.GUARDRAILS_PROMPT_INJECTION === "true",
    enkryptAiApiKey: env.ENKRYPTAI_API_KEY,
    enkryptAiEndpoint: env.ENKRYPTAI_ENDPOINT ?? "https://api.enkrypt.ai/v1",
  };
}

export function redactPII(text: string): GuardrailResult {
  const detections: Detection[] = [];

  for (const { name, pattern } of PII_PATTERNS) {
    const regex = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        type: name,
        category: "pii",
        start: match.index,
        end: match.index + match[0].length,
        severity: "high",
      });
    }
  }

  let redacted = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return {
    blocked: false,
    redacted,
    detections,
  };
}

export function detectPromptInjection(text: string): GuardrailResult {
  const detections: Detection[] = [];

  for (const { name, pattern } of PROMPT_INJECTION_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      detections.push({
        type: name,
        category: "prompt_injection",
        start: match.index,
        end: match.index + match[0].length,
        severity: "critical",
      });
    }
  }

  return {
    blocked: detections.length > 0,
    redacted: text,
    detections,
  };
}

export function sanitizeInput(
  text: string,
  config?: GuardrailConfig,
): GuardrailResult {
  const cfg = config ?? resolveGuardrailConfig();

  if (!cfg.enabled) {
    return { blocked: false, redacted: text, detections: [] };
  }

  let result = text;
  const allDetections: Detection[] = [];

  if (cfg.piiRedaction) {
    const piiResult = redactPII(result);
    result = piiResult.redacted;
    allDetections.push(...piiResult.detections);
  }

  if (cfg.promptInjection) {
    const piResult = detectPromptInjection(result);
    allDetections.push(...piResult.detections);
  }

  return {
    blocked: allDetections.some((d) => d.category === "prompt_injection"),
    redacted: result,
    detections: allDetections,
  };
}
