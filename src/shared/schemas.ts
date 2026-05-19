import { z } from 'zod';

export const StepActionIRSchema = z.object({
  type: z.enum(['navigate', 'click', 'type', 'fill', 'select', 'press', 'wait']),
  target: z.string().min(1),
  value: z.string().optional(),
});

export const StepAssertionIRSchema = z.object({
  type: z.enum(['url', 'elementVisible', 'elementHidden', 'textContains', 'textEquals']),
  locator: z.string().optional(),
  value: z.string().optional(),
});

export const TestStepSchema = z.object({
  order: z.number().int().min(0),
  actionText: z.string().min(1),
  expectedText: z.string().min(1),
  actionIR: StepActionIRSchema.optional(),
  assertionIR: StepAssertionIRSchema.optional(),
});

export const TestCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  productLine: z.string().min(1),
  precondition: z.string().nullish(),
  source: z.enum(['excel', 'markdown']),
  steps: z.array(TestStepSchema).min(1),
  status: z.enum(['raw', 'translated', 'decomposed', 'executed']),
});

export const FailureClassificationSchema = z.enum(['PASS', 'FAIL', 'BLOCK']);

export const StepResultSchema = z.object({
  stepOrder: z.number().int().min(0),
  status: FailureClassificationSchema,
  screenshotPath: z.string().optional(),
  error: z.string().optional(),
  pythonCode: z.string().optional(),
});

export const RunSummarySchema = z.object({
  total: z.number().int().min(0),
  pass: z.number().int().min(0),
  fail: z.number().int().min(0),
  blocked: z.number().int().min(0),
  steps: z.array(StepResultSchema),
});

export const TestRunSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  status: z.enum(['running', 'passed', 'failed', 'error']),
  summary: RunSummarySchema,
  generatedPythonCode: z.string().optional(),
  fixPrompt: z.string().optional(),
  startedAt: z.string().min(1),
  finishedAt: z.string().optional(),
});

export const PageElementSchema = z.object({
  ref: z.string().min(1),
  role: z.string().min(1),
  name: z.string().min(1),
  matchedTerm: z.string().optional(),
  pythonLocator: z.string().optional(),
});

export const FormGroupSchema = z.object({
  name: z.string().optional(),
  fields: z.array(PageElementSchema),
});

export const MatchedTermSchema = z.object({
  term: z.string().min(1),
  locator: z.string().min(1),
  elementRef: z.string().min(1),
});

export const PageSummarySchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  elements: z.array(PageElementSchema),
  forms: z.array(FormGroupSchema).optional(),
  matchedTerms: z.array(MatchedTermSchema),
});

export const InteractionSchema = z.object({
  stepOrder: z.number().int().min(0),
  pythonCode: z.string().min(1),
  cliCommand: z.string().min(1),
  targetElement: PageElementSchema.optional(),
  passed: z.boolean(),
  error: z.string().optional(),
});

export const VocabEntrySchema = z.object({
  term: z.string().min(1),
  locator: z.string().optional(),
  description: z.string().optional(),
});

export const TestDataEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  environment: z.string().optional(),
});

export const BehaviorEntrySchema = z.object({
  instruction: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
});

export const PreconditionEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(z.string().min(1)),
});

export const KnowledgeBaseSchema = z.object({
  productLine: z.string().min(1),
  baseUrl: z.string().optional(),
  vocab: z.array(VocabEntrySchema),
  testData: z.array(TestDataEntrySchema),
  behaviors: z.array(BehaviorEntrySchema),
  preconditions: z.array(PreconditionEntrySchema),
});

export const CodeGenResultSchema = z.object({
  code: z.string().min(1),
  assertion: z.string().optional(),
  reasoning: z.string().min(1),
});

export type TestCaseType = z.infer<typeof TestCaseSchema>;
export type TestStepType = z.infer<typeof TestStepSchema>;
export type KnowledgeBaseType = z.infer<typeof KnowledgeBaseSchema>;
export type PageSummaryType = z.infer<typeof PageSummarySchema>;
export type InteractionType = z.infer<typeof InteractionSchema>;
