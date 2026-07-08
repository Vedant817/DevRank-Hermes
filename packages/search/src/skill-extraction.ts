import type { SearchResult } from "./index.js";

export interface SkillTaxonomyEntry {
  category: string;
  name: string;
  slug: string;
  keywords: string[];
}

export const skillTaxonomy: SkillTaxonomyEntry[] = [
  { category: "language", name: "TypeScript", slug: "typescript", keywords: ["typescript", "ts", "type safety", "typed javascript"] },
  { category: "language", name: "JavaScript", slug: "javascript", keywords: ["javascript", "js", "node", "ecmascript"] },
  { category: "language", name: "Python", slug: "python", keywords: ["python", "py", "django", "fastapi", "flask"] },
  { category: "language", name: "Go", slug: "go", keywords: ["golang", "go", "go module"] },
  { category: "language", name: "Rust", slug: "rust", keywords: ["rust", "cargo", "tokio"] },
  { category: "language", name: "Java", slug: "java", keywords: ["java", "spring", "spring boot", "jvm"] },
  { category: "language", name: "C++", slug: "cpp", keywords: ["c++", "cpp", "stl"] },
  { category: "language", name: "SQL", slug: "sql", keywords: ["sql", "postgres", "postgresql", "mysql", "relational database"] },
  { category: "language", name: "Shell", slug: "shell", keywords: ["bash", "shell", "zsh", "scripting"] },

  { category: "backend", name: "Node.js", slug: "nodejs", keywords: ["node.js", "nodejs", "express", "nestjs"] },
  { category: "backend", name: "API Design", slug: "api-design", keywords: ["rest api", "restful", "graphql", "api design", "openapi", "grpc"] },
  { category: "backend", name: "Microservices", slug: "microservices", keywords: ["microservice", "microservices", "service mesh", "rpc"] },
  { category: "backend", name: "Event-Driven", slug: "event-driven", keywords: ["event driven", "kafka", "rabbitmq", "message queue", "pub/sub", "streaming"] },
  { category: "backend", name: "Caching", slug: "caching", keywords: ["cache", "caching", "redis", "memcached", "cdn"] },
  { category: "backend", name: "Databases", slug: "databases", keywords: ["database", "databases", "postgres", "mongodb", "schema design", "indexing"] },

  { category: "frontend", name: "React", slug: "react", keywords: ["react", "react.js", "jsx", "hooks"] },
  { category: "frontend", name: "Next.js", slug: "nextjs", keywords: ["next.js", "nextjs", "ssr", "app router"] },
  { category: "frontend", name: "CSS", slug: "css", keywords: ["css", "tailwind", "styled components", "flexbox", "accessibility"] },
  { category: "frontend", name: "UI Engineering", slug: "ui-engineering", keywords: ["frontend", "ui", "ux", "component library", "design system"] },

  { category: "data", name: "Data Engineering", slug: "data-engineering", keywords: ["data pipeline", "etl", "spark", "warehouse", "dbt", "airflow"] },
  { category: "data", name: "Machine Learning", slug: "machine-learning", keywords: ["machine learning", "ml", "model training", "inference", "pytorch", "tensorflow"] },
  { category: "data", name: "LLM Engineering", slug: "llm-engineering", keywords: ["llm", "llms", "prompt engineering", "rag", "vector database", "fine tuning", "agent"] },

  { category: "infra", name: "System Design", slug: "system-design", keywords: ["system design", "scalability", "distributed systems", "consistency", "throughput", "capacity"] },
  { category: "infra", name: "AWS", slug: "aws", keywords: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  { category: "infra", name: "Kubernetes", slug: "kubernetes", keywords: ["kubernetes", "k8s", "helm", "container orchestration"] },
  { category: "infra", name: "Docker", slug: "docker", keywords: ["docker", "container", "containers", "oci"] },
  { category: "infra", name: "Terraform", slug: "terraform", keywords: ["terraform", "iac", "infrastructure as code"] },
  { category: "infra", name: "CI/CD", slug: "cicd", keywords: ["ci/cd", "cicd", "continuous integration", "continuous deployment", "github actions", "gitlab ci"] },
  { category: "infra", name: "Observability", slug: "observability", keywords: ["observability", "monitoring", "prometheus", "grafana", "opentelemetry", "logging"] },
  { category: "infra", name: "Postgres at scale", slug: "postgres-scale", keywords: ["postgres", "replication", "partitioning", "read replica"] },

  { category: "practice", name: "Testing", slug: "testing", keywords: ["unit testing", "integration testing", "e2e", "vitest", "jest", "pytest", "test automation"] },
  { category: "practice", name: "Code Review", slug: "code-review", keywords: ["code review", "pull request", "peer review"] },
  { category: "practice", name: "Agile", slug: "agile", keywords: ["agile", "scrum", "sprint", "kanban"] },
  { category: "practice", name: "Security", slug: "security", keywords: ["security", "auth", "authentication", "authorization", "owasp", "secrets management"] },
];

export const MISSING_SKILL_FREQUENCY_THRESHOLD = 2;

export const MAX_WEEKLY_LEARNING_PRIORITIES = 5;

export interface SkillGapResult {
  missingSkills: string[];
  resumeKeywordGaps: string[];
  weeklyLearningPriorities: string[];
}

export function scoreSkillFrequency(results: SearchResult[]): Record<string, number> {
  const frequency: Record<string, number> = {};

  for (const result of results) {
    const text = `${result.title}\n${result.content}`.toLowerCase();

    for (const entry of skillTaxonomy) {
      let hits = 0;

      for (const keyword of entry.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          hits += 1;
        }
      }

      if (hits > 0) {
        frequency[entry.slug] = (frequency[entry.slug] ?? 0) + hits;
      }
    }
  }

  return frequency;
}

export function computeSkillGap(
  skillFrequency: Record<string, number>,
  ownedSkillSlugs: string[] = [],
  options: {
    maxPriorities?: number;
    threshold?: number;
  } = {},
): SkillGapResult {
  const threshold = options.threshold ?? MISSING_SKILL_FREQUENCY_THRESHOLD;
  const maxPriorities = options.maxPriorities ?? MAX_WEEKLY_LEARNING_PRIORITIES;
  const owned = new Set(ownedSkillSlugs.map((slug) => slug.toLowerCase()));
  const bySlug = new Map(skillTaxonomy.map((entry) => [entry.slug, entry]));

  const candidates = Object.entries(skillFrequency)
    .filter(([slug, count]) => count >= threshold && !owned.has(slug.toLowerCase()))
    .map(([slug, count]) => ({ slug, count, entry: bySlug.get(slug) }))
    .filter((candidate): candidate is { slug: string; count: number; entry: SkillTaxonomyEntry } => candidate.entry !== undefined)
    .sort((first, second) => second.count - first.count);

  const missingSkills = candidates.map((candidate) => candidate.slug);
  const resumeKeywordGaps = candidates.map((candidate) =>
    `Add ${candidate.entry.name} experience — cited in ${candidate.count} target posting(s).`,
  );
  const weeklyLearningPriorities = candidates.slice(0, maxPriorities).map((candidate) => candidate.slug);

  return { missingSkills, resumeKeywordGaps, weeklyLearningPriorities };
}
