import { z } from 'zod';

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

export const ProductLineConfigSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().optional(),
  vocab: z.array(VocabEntrySchema),
  testData: z.array(TestDataEntrySchema),
  behaviors: z.array(BehaviorEntrySchema),
  preconditions: z.array(PreconditionEntrySchema),
});

export type ProductLineConfig = z.infer<typeof ProductLineConfigSchema>;
export type VocabEntry = z.infer<typeof VocabEntrySchema>;
export type TestDataEntry = z.infer<typeof TestDataEntrySchema>;
export type BehaviorEntry = z.infer<typeof BehaviorEntrySchema>;
export type PreconditionEntry = z.infer<typeof PreconditionEntrySchema>;
