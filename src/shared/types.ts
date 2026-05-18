export interface StepActionIR {
  type: 'navigate' | 'click' | 'type' | 'fill' | 'select' | 'press' | 'wait';
  target: string;
  value?: string;
}

export interface StepAssertionIR {
  type: 'url' | 'elementVisible' | 'elementHidden' | 'textContains' | 'textEquals';
  locator?: string;
  value?: string;
}

export interface TestStep {
  order: number;
  actionText: string;
  expectedText: string;
  actionIR?: StepActionIR;
  assertionIR?: StepAssertionIR;
}

export interface TestCase {
  id: string;
  name: string;
  productLine: string;
  precondition?: string;
  source: 'excel' | 'markdown';
  steps: TestStep[];
  status: 'raw' | 'translated' | 'decomposed' | 'executed';
}

export type FailureClassification = 'PASS' | 'FAIL' | 'BLOCK';

export interface StepResult {
  stepOrder: number;
  status: FailureClassification;
  screenshotPath?: string;
  error?: string;
  pythonCode?: string;
}

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  steps: StepResult[];
}

export interface TestRun {
  id: string;
  caseId: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  summary: RunSummary;
  generatedPythonCode?: string;
  fixPrompt?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ExecutionReport {
  summary: RunSummary;
  steps: StepResult[];
  generatedPythonCode: string;
  fixPrompt: string;
  recommendations: string[];
}

export interface ExecutionProgress {
  runId: string;
  currentStep: number;
  totalSteps: number;
  status: string;
}

export interface PageElement {
  ref: string;
  role: string;
  name: string;
  matchedTerm?: string;
  pythonLocator?: string;
}

export interface FormGroup {
  name?: string;
  fields: PageElement[];
}

export interface MatchedTerm {
  term: string;
  locator: string;
  elementRef: string;
}

export interface PageSummary {
  url: string;
  title: string;
  elements: PageElement[];
  forms?: FormGroup[];
  matchedTerms: MatchedTerm[];
}

export interface Interaction {
  stepOrder: number;
  pythonCode: string;
  cliCommand: string;
  targetElement?: PageElement;
  passed: boolean;
  error?: string;
  screenshotPath?: string;
}

export interface VocabEntry {
  term: string;
  locator?: string;
  description?: string;
}

export interface TestDataEntry {
  key: string;
  value: string;
  environment?: string;
}

export interface BehaviorEntry {
  instruction: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PreconditionEntry {
  name: string;
  description: string;
  steps: string[];
}

export interface KnowledgeBase {
  productLine: string;
  baseUrl?: string;
  vocab: VocabEntry[];
  testData: TestDataEntry[];
  behaviors: BehaviorEntry[];
  preconditions: PreconditionEntry[];
}

export interface CodeGenResult {
  code: string;
  assertion?: string;
  reasoning: string;
}
