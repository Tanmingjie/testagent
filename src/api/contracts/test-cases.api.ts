// Test Cases API Contracts
// Endpoints: /api/test-cases/*

// POST /api/test-cases/import — Upload Excel/MD file
export interface ImportRequest {
  /** Multipart file upload */
  file: File;
  /** Product line identifier */
  productLineId: string;
}

export interface ImportedCase {
  id: string;
  name: string;
  status: string;
}

export interface ImportResponse {
  cases: ImportedCase[];
}

// GET /api/test-cases — List all test cases
export interface ListRequest {
  productLine?: string;
  status?: string;
  search?: string;
}

export interface ListCaseItem {
  id: string;
  name: string;
  productLine: string;
  status: string;
  lastRunStatus?: string;
}

export interface ListResponse {
  cases: ListCaseItem[];
}

// GET /api/test-cases/tree — Tree structure grouped by module
export interface TreeModule {
  name: string;
  cases: Array<{
    id: string;
    name: string;
    status: string;
    lastRunStatus?: string;
  }>;
}

export interface TreeResponse {
  modules: TreeModule[];
}

// GET /api/test-cases/:id — Full test case with steps
export interface GetResponseStep {
  order: number;
  actionText: string;
  expectedText: string;
}

export interface GetResponse {
  id: string;
  name: string;
  productLine: string;
  steps: GetResponseStep[];
  status: string;
}

// DELETE /api/test-cases/:id
// (No request/response body — 204 No Content)

// POST /api/test-cases/:id/translate — Trigger LLM translation
// (No request/response body — 202 Accepted)

// POST /api/test-cases/:id/decompose — Trigger step decomposition
// (No request/response body — 202 Accepted)
