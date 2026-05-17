// Execution API Contracts
// Endpoints: /api/execution/*

// POST /api/execution/run/:testCaseId — Start execution
export interface RunRequest {
  // Empty body for now
}

export interface RunResponse {
  runId: string;
}

// GET /api/execution/runs/:runId — Get run status
export interface RunStatusStep {
  stepOrder: number;
  status: string;
  screenshotUrl?: string;
  error?: string;
  pythonCode?: string;
}

export interface RunStatusSummary {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
}

export interface RunStatusResponse {
  runId: string;
  status: string;
  summary: RunStatusSummary;
  steps: RunStatusStep[];
  generatedPythonCode: string;
  fixPrompt: string;
}

// GET /api/execution/runs — List recent runs
export interface RunListItem {
  runId: string;
  caseId: string;
  status: string;
  createdAt: string;
}

export interface RunListResponse {
  runs: RunListItem[];
}
