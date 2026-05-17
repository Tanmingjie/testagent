import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Test cases table.
 * `steps_json` is a JSON array containing ALL step data (action, expected, translated, decomposed, IR).
 * JSON column design eliminates the need for a separate test_steps table (saves 1 table).
 */
export const testCases = sqliteTable('test_cases', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  name: text('name').notNull(),
  productLine: text('product_line').notNull(),
  stepsJson: text('steps_json').notNull(),
  source: text('source', { enum: ['excel', 'markdown'] }).notNull(),
  status: text('status', { enum: ['raw', 'translated', 'decomposed', 'executed'] })
    .notNull()
    .default('raw'),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$default(() => new Date().toISOString()),
});

/**
 * Test runs table.
 * `summary_json` is a JSON column containing { total, pass, fail, blocked, steps: [...] }.
 * JSON column eliminates the need for a separate step_results table (saves 1 table).
 */
export const testRuns = sqliteTable('test_runs', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  caseId: text('case_id')
    .notNull()
    .references(() => testCases.id),
  status: text('status', { enum: ['running', 'passed', 'failed', 'error'] })
    .notNull()
    .default('running'),
  summaryJson: text('summary_json').notNull(),
  generatedPythonCode: text('generated_python_code'),
  fixPrompt: text('fix_prompt'),
  createdAt: text('created_at').notNull().$default(() => new Date().toISOString()),
});

/**
 * Knowledge base cache table.
 * Single table for all knowledge types — config_yaml stores the cached YAML content.
 * Eliminates separate knowledge_vocab, knowledge_test_data, product_lines tables (saves 3+ tables).
 */
export const knowledge = sqliteTable('knowledge', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  productLine: text('product_line').notNull().unique(),
  configYaml: text('config_yaml'),
  updatedAt: text('updated_at').notNull().$default(() => new Date().toISOString()),
});
