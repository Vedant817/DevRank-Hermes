export interface ContextItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ContextSearchInput {
  query: string;
  limit?: number;
  containerTags?: string[];
}

export interface ContextWriteInput {
  title: string;
  content: string;
  source: string;
  sourceId?: string;
  containerTags?: string[];
  metadata?: Record<string, unknown>;
}
