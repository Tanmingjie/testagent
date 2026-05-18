// Knowledge API Contracts
// Endpoints: /api/product-lines, /api/knowledge/*

// GET /api/product-lines — List all
// POST /api/product-lines — Create
export interface ProductLineResponse {
  id: string;
  name: string;
  baseUrl?: string;
}

// GET /api/knowledge/:productLineId — Full KB
export interface KnowledgeVocabItem {
  term: string;
  locator?: string;
}

export interface KnowledgeTestDataItem {
  key: string;
  value: string;
}

export interface KnowledgeBehaviorItem {
  instruction: string;
  priority: string;
}

export interface KnowledgePreconditionItem {
  name: string;
  steps: string[];
}

export interface KnowledgeResponse {
  vocab: KnowledgeVocabItem[];
  testData: KnowledgeTestDataItem[];
  behaviors: KnowledgeBehaviorItem[];
  preconditions: KnowledgePreconditionItem[];
}

// PUT /api/knowledge/:productLineId — Update KB
// (Body: Partial<KnowledgeResponse>, Response: KnowledgeResponse)
