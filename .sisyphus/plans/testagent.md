# TestAgent — 端到端 AI 辅助测试平台

## TL;DR

> **Quick Summary**: 构建 TestAgent 平台，实现从 Excel/Markdown 文本用例 → LLM 翻译与步骤拆解 → AI 生成 Playwright Python 代码 → 执行验证 → 输出可复用 Python 代码资产。LLM 每次调用同时产生「CLI 执行命令 + Python 交付代码」，零额外 token。
> 
> **Deliverables**:
> - TypeScript 全栈应用（Hono API + React 前端 + Playwright CLI 代码生成执行引擎）
> - Excel (.xlsx) + Markdown 用例导入与解析
> - LLM 翻译与步骤拆解服务（OpenAI 兼容 API，私有部署）
> - 知识库管理（按产品线：术语、测试数据、行为指令）
> - AI 代码生成式执行引擎（AI 生成 Playwright Python 代码 → CLI 执行验证 → 输出 .py 文件）
> - Web UI（用例树、执行进度、截图报告 + Python 代码预览、知识库管理）
> 
> **Estimated Effort**: M (4 waves, 26 tasks + final verification)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → 5 → E2 → E3 → 23 → 25 → F1-F4

---

## Context

### Original Request
用户设计了一个 TestAgent 产品，从文本用例到测试执行到测试报告，实现端到端 AI 辅助测试。第一阶段核心能力：文本用例翻译、步骤拆解、AI 执行（含自愈）、报告。第二阶段工程化：Web UI、用例导入、树状显示、执行可视化。用户要求整合两个阶段一起交付。

### Interview Summary
**Key Discussions**:
- **执行模式**: AI 代码生成式执行 — AI 生成 Playwright Python 代码 → 验证执行 → 输出 .py 资产
- **技术栈**: TypeScript 全栈（与 Playwright CLI 生态一致）
- **被测系统**: 通用平台（可测任何 Web 应用）+ 产品线级别配置
- **LLM**: 私有化部署，OpenAI 兼容 API（vLLM/Ollama/LocalAI），数据不出内网
- **输入格式**: Excel (.xlsx) 优先，Markdown 其次
- **预置条件**: 知识库定义流程（如"登录"），Agent 自动执行
- **可视化**: 每步截图（无录屏），失败步骤额外 accessibility tree
- **报告**: Web UI 内嵌，无单独文件
- **用户规模**: 单用户/团队共用，无认证
- **测试策略**: Tests-after

**Research Findings**:
- Playwright CLI 使用 bash 命令操控浏览器（非 MCP），~27K tokens/任务，4x 更省
- `playwright-cli run-code` 可在浏览器会话中直接执行 Playwright 代码片段
- `playwright-cli snapshot` 返回 accessibility tree（和 MCP 一样的 ref=eN 机制）
  - 三层格式管线：Human input → JSON IR → Executable .py (Playwright Python)
  - 知识库三层：domain vocabulary, test data, behavioral instructions
  - 失败分类（FAIL / BLOCK）基于错误模式关键词启发式判断
  - Code-Gen 模式：AI 每步同时产出 CLI 命令（执行）+ Python 代码（交付），零额外 token。生成的 .py 可独立执行；UI 变更时一键重跑 TestAgent 重新生成。

### Metis Review
**Identified Gaps** (addressed):
- LLM 编排角色: 拆分为 Translator + Decomposer + Executor 三个独立 system prompt
  - 代码生成式执行: AI 每步同步产出 CLI 命令（执行）+ Python 代码（交付），零额外 token。生成的 .py 可独立执行；UI 变更时一键重跑重新生成。
- 数据持久化: SQLite（Drizzle ORM），起步足够
- 失败分类: FAIL（应用 Bug）/ BLOCK（环境阻隔），关键词启发式，无需 LLM
- 通信协议: 简单 API 轮询（非 WebSocket）
- 并发限制: 默认 1，最大 3 浏览器实例
- Token 预算: 每步骤 + 每用例硬性上限
- 延迟目标: 10 步用例 < 5 分钟

---

## Work Objectives

### Core Objective
构建 TestAgent 平台，实现 Excel/Markdown 文本用例 → LLM 翻译与步骤拆解 → 页面分析 + AI 驱动 CLI 执行 → 输出可复用 Python 代码资产 + 执行报告。**AI 每步同步产出命令和代码，零额外 token；UI 变更时一键重跑重新生成。**

### Concrete Deliverables
- 可运行的 TypeScript 全栈应用
- `src/` 目录：后端所有服务（parser, translator, knowledge, executor, api, db）
- `web/` 目录：React + Vite 前端
- `data/` 目录：SQLite 数据库 + 截图存储 + 生成的 .py 文件
- `knowledge/` 目录：示例知识库 YAML 文件
- 可通过 `npm run dev` 一键启动

### Definition of Done
- [ ] Excel 文件可导入，解析为结构化用例
- [ ] 用例经 LLM 翻译 + 拆解后可被 agent 读取执行
- [ ] 知识库术语可上下文化 LLM 提示词
- [ ] AI Agent 通过 Playwright CLI 执行测试步骤，输出 Playwright 代码
- [ ] 失败步骤自动分类（FAIL/BLOCK）并生成 Fix Prompt
- [ ] 每步截图，失败步骤含错误信息与分类
- [ ] Web UI 展示用例树、执行进度、截图报告

### Must Have
- Excel (.xlsx) 用例导入（含中文，合并单元格处理）
- Markdown 用例导入
- 文本用例翻译（专业化、可执行化）
- 步骤-预期结果 1:1 拆解
- 知识库按产品线配置（术语、测试数据、行为指令、前置流程）
- Playwright CLI runtime 执行（snapshot-first + 代码生成）
- 失败分类（FAIL / BLOCK，基于错误关键词启发式）
- Fix Prompt 报告生成（可将失败步骤转化为修复建议）
- Web UI：用例导入、树状显示、一键执行、执行进度、截图报告
- 每步截图 + 失败步骤错误信息
- OpenAI 兼容 API LLM 接入

### Must NOT Have (Guardrails)
- ❌ 不支持 API 测试 — 仅浏览器 UI 测试
- ❌ 不支持测试用例自动生成 — 只翻译，不生成
- ❌ 不支持移动端测试 — 仅桌面浏览器
- ❌ 不支持 CI 触发/调度/定时执行 — 导出代码但不集成 CI
- ❌ 不支持基线比较/回归趋势 — 仅单次执行报告
- ❌ 不支持多租户/用户认证 — 单团队共用
- ❌ 不引入 DI 框架（Inversify 等）— 直接构造
- ❌ 不引入插件架构 — 保持扁平
- ❌ 不过早抽象（AbstractBrowserExecutor 等）— 保持实现导向
- ❌ 不使用 Allure/JUnit 报告格式 — 仅 Web UI 内嵌
- ❌ 不支持 Gherkin 输入格式
- ❌ 不添加 Redis/Memcached 缓存 — SQLite 起步

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (greenfield)
- **Automated tests**: Tests-after (单元测试在实现后补充)
- **Framework**: bun test (TypeScript native, fast)
- **Integration tests**: Playwright 测试 Web UI
- **Coverage target**: Core services >60%

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend API**: Bash (curl) — Send requests, assert status + JSON fields
- **Web UI**: Playwright — Navigate, interact, assert DOM, screenshot
- **CLI/Scripts**: Bash — Run command, validate output, check exit code
- **LLM Services**: Bash (curl to API) — Verify prompt construction and response parsing

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 7 tasks, all parallel):
├── T1:  Project scaffolding + dev environment [quick]
├── T2:  Database schema + Drizzle + SQLite [quick]
├── T3:  Core type definitions + Zod schemas [quick]
├── T4:  LLM client library [quick]
├── T5:  Playwright CLI setup [unspecified-high]
├── T6:  Knowledge base YAML schema + sample [quick]
└── T7:  API contract definitions [quick]

Wave 2 (Input + Translation + Web Start - 7 tasks):
├── T8:  Excel + Markdown parsers [unspecified-high]
├── T9:  Translator LLM prompt + service [deep]
├── T10: Step decomposer LLM prompt + service [deep]
├── T11: Knowledge base service (CRUD + retrieval) [unspecified-high]
├── T12: REST API: test case endpoints [unspecified-high]
├── T13: REST API: knowledge base + execution endpoints [unspecified-high]
└── T14: Web UI: Vite + React setup + layout [visual-engineering]

Wave 3 (Execution Engine - 3 tasks):
├── E1: Playwright CLI Execution Utilities [quick]
├── E2: Step Executor Core [unspecified-high]
└── E3: Execution Runner + Report Builder [unspecified-high]

Wave 4 (Web UI Pages - 5 tasks):
├── T21: Test case import + tree view pages [visual-engineering]
├── T22: Knowledge base management page [visual-engineering]
├── T23: Execution page + progress polling [visual-engineering]
├── T24: Report page + Fix Prompt + Code Preview + Rerun [visual-engineering]
└── T25: End-to-end integration + polish [deep]

Wave FINAL (Verification - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T5 → E2 → E3 → T23 → T25 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T2-T7, T14 | 1 |
| T2 | T1 | T8, T11, T12 | 1 |
| T3 | T1 | T8-T13, E2 | 1 |
| T4 | T1 | T9, T10, E2 | 1 |
| T5 | T1 | E1 | 1 |
| T6 | T1 | T11 | 1 |
| T7 | T1, T3 | T12, T13 | 1 |
| T8 | T3, T2 | T12, T21 | 2 |
| T9 | T4, T3 | T10, T12 | 2 |
| T10 | T4, T3, T9 | E2 | 2 |
| T11 | T2, T3, T6 | T13, T22 | 2 |
| T12 | T7, T8, T9 | T21 | 2 |
| T13 | T7, T11 | T23, T24 | 2 |
| T14 | T1 | T21-T25 | 2 |
| E1 | T5 | E2 | 3 |
| E2 | T4, T3, T10, E1 | E3 | 3 |
| E3 | T2, E2 | T23, T24, T25 | 3 |
| T21 | T14, T12 | T25 | 4 |
| T22 | T14, T11 | T25 | 4 |
| T23 | T14, E3 | T25 | 4 |
| T24 | T14, E3 | T25 | 4 |
| T25 | T21-T24 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 7 tasks — T1-T3 → `quick`, T4 → `unspecified-high`, T5 → `unspecified-high`, T6-T7 → `quick`
- **Wave 2**: 7 tasks — T8 → `unspecified-high`, T9-T10 → `deep`, T11-T13 → `unspecified-high`, T14 → `visual-engineering`
- **Wave 3**: 3 tasks — E1 → `quick`, E2 → `unspecified-high`, E3 → `unspecified-high`
- **Wave 4**: 5 tasks — T21-T24 → `visual-engineering`, T25 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project Scaffolding + Dev Environment

  **What to do**:
  - Initialize git repo, create `.gitignore` (node_modules, data/*.db, screenshots, .env)
  - Create root `package.json` with workspaces (`src`, `web`), scripts: `dev`, `build`, `test`, `lint`
  - Set up `tsconfig.json` (strict mode, path aliases: `@shared/*`, `@core/*`)
  - Install core deps: `hono`, `drizzle-orm`, `better-sqlite3`, `zod`, `xlsx`, `dotenv`
  - Install dev deps: `typescript`, `bun-types`, `drizzle-kit`, `vitest` or `bun test`
  - Create directory structure: `src/{shared,parser,translator,knowledge,executor,api,db}/`, `web/`, `data/`, `knowledge/`
  - Create `.env.example` with: `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL_NAME`, `PORT`, `DB_PATH`
  - Create `README.md` with setup instructions

  **Must NOT do**:
  - No Turborepo/Nx monorepo tooling (over-engineering)
  - No pre-commit hooks yet (add later if needed)
  - No Docker setup yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard project initialization, well-understood patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2-T7)
  - **Blocks**: T2, T3, T4, T5, T6, T7, T14
  - **Blocked By**: None

  **References**:
  - `TestAgent-design.md` — Original design document describing the product scope
  - Context: Hono framework — lightweight TypeScript web framework, ideal for API server
  - Context: Drizzle ORM — TypeScript-native ORM for SQLite, minimal abstraction

  **Acceptance Criteria**:
  - [ ] `bun install` succeeds without errors
  - [ ] `bun run build` compiles TypeScript without errors
  - [ ] Directory structure matches: `src/{shared,parser,translator,knowledge,executor,api,db}/`, `web/`, `data/`, `knowledge/`
  - [ ] `.env.example` contains all required variables
  - [ ] `.gitignore` covers node_modules, data/*.db, screenshots

  **QA Scenarios**:
  ```
  Scenario: Project builds and runs
    Tool: Bash
    Preconditions: Fresh clone of the repo
    Steps:
      1. Run `bun install`
      2. Run `bun run build`
      3. Verify exit code is 0
    Expected Result: Both commands succeed with exit code 0
    Failure Indicators: `bun install` fails with missing deps; `bun run build` has TS errors
    Evidence: .sisyphus/evidence/task-1-build.log

  Scenario: Directory structure is correct
    Tool: Bash
    Preconditions: Project initialized
    Steps:
      1. Run `ls src/` and check for: shared, parser, translator, knowledge, executor, api, db
      2. Run `ls web/` and check it exists
      3. Run `ls data/` and check it exists
    Expected Result: All directories present
    Evidence: .sisyphus/evidence/task-1-dir-structure.log
  ```

  **Commit**: YES
  - Message: `feat(init): project scaffolding and dev environment`
  - Files: `package.json, tsconfig.json, .gitignore, .env.example, README.md`
  - Pre-commit: `bun run build`

- [x] 2. Database Schema + Drizzle + SQLite Setup

  **What to do**:
  - Define Drizzle schema in `src/db/schema.ts` with **3 tables**（非 10 张表，JSON 列替代规范化）：
    - `test_cases`: id, name, product_line, steps_json (JSON 列：含所有步骤的 action/expected/translated/decomposed/IR), source (excel|markdown), status (raw|translated|decomposed|executed), created_at, updated_at
    - `test_runs`: id, case_id, status (running|passed|failed|error), summary_json (JSON 列：含 pass/fail/block counts + 每步 screenshotPath/error/pythonCode), generated_python_code (text), fix_prompt (text), created_at
    - `knowledge`: id, product_line (string), config_yaml (text, 缓存 knowledge/ 目录的 YAML 原内容), updated_at
  - JSON 列替代规范化的理由：单用户 SQLite，用例数 < 万级，JSON 查询效率足够，且省掉 test_steps/step_results/knowledge_vocab 等 7 张表
  - Create `src/db/index.ts` — Drizzle client initialization with SQLite
  - Create `src/db/migrate.ts` — migration runner
  - Create `drizzle.config.ts` at project root

  **Must NOT do**:
  - No PostgreSQL（SQLite 足够）
  - No test_steps 独立表（用 JSON 列）
  - No 分表存储 knowledge（YAML 文件是 source of truth，DB 是本缓存）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition + ORM setup, well-established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3-T7)
  - **Blocks**: T8, T11, T12
  - **Blocked By**: T1 (project scaffolding)

  **References**:
  - Drizzle ORM docs: https://orm.drizzle.team/docs/overview — Schema definition patterns
  - Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite — Better-sqlite3 integration
  - `.sisyphus/drafts/testagent-design.md:93-97` — Knowledge base three-layer architecture informing schema design

  **Acceptance Criteria**:
  - [ ] `bun run src/db/migrate.ts` creates SQLite database
  - [ ] 3 tables exist: test_cases, test_runs, knowledge
  - [ ] Schema types exported correctly from `src/db/schema.ts`

  **QA Scenarios**:
  ```
  Scenario: Database migration succeeds
    Tool: Bash
    Preconditions: Project initialized, deps installed
    Steps:
      1. Run `bun run src/db/migrate.ts`
      2. Check that `data/testagent.db` file exists
      3. Run `sqlite3 data/testagent.db ".tables"` and verify 3 tables exist
     Expected Result: All tables created: test_cases, test_runs, knowledge
    Evidence: .sisyphus/evidence/task-2-migration.log

  Scenario: Schema types are importable
    Tool: Bash
    Preconditions: Migration done
    Steps:
      1. Run `bun -e "import { testCases } from './src/db/schema'; console.log(Object.keys(testCases))"`
    Expected Result: Prints column names without error
    Evidence: .sisyphus/evidence/task-2-schema-types.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/db/schema.ts, src/db/index.ts, src/db/migrate.ts, drizzle.config.ts`

- [x] 3. Core Type Definitions + Zod Schemas

  **What to do**:
  - Create `src/shared/types.ts` with TypeScript interfaces:
    - `TestCase`: { id, name, precondition, steps: TestStep[], source, productLineId, status }
    - `TestStep`: { order, actionText, expectedText, actionIR?: StepActionIR, assertionIR?: StepAssertionIR }
    - `StepActionIR`: { type: "navigate"|"click"|"type"|"fill"|"select"|"press"|"wait", target: string, value?: string }
    - `StepAssertionIR`: { type: "url"|"elementVisible"|"elementHidden"|"textContains"|"textEquals", locator?: string, value?: string }
    - `TestRun`: { id, testCaseId, status, steps: StepResult[], startedAt, finishedAt }
    - `StepResult`: { order, status, screenshotPath?, accessibilityTreePath?, errorMessage?, llmDecision?: string }
    - `KnowledgeBase`: { productLineId, vocab: VocabEntry[], testData: TestDataEntry[], behaviors: BehaviorEntry[], preconditions: PreconditionEntry[] }
    - `ExecutionProgress`: { runId, currentStep, totalSteps, stepStatuses, screenshotUrls }
    - `FailureClassification`: "PASS" | "FAIL" | "BLOCK"
    - `ExecutionReport`: { summary: {total, pass, fail, blocked}, steps: StepResult[], generatedPythonCode: string, fixPrompt: string }
  - Create `src/shared/schemas.ts` with Zod schemas for runtime validation of all above types
  - Create `src/shared/constants.ts` with enums and config defaults (MAX_RETRIES, TIMEOUTS, CONCURRENCY_LIMIT, TOKEN_BUDGETS)

  **Must NOT do**:
  - No generic `Record<string, any>` types
  - No premature union types for future extensibility
  - Keep types flat, not nested beyond 2 levels

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definition + Zod schema, mechanical but needs precision
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4-T7)
  - **Blocks**: T8, T9, T10, T11, T12, T13, E2
  - **Blocked By**: T1

  **References**:
  - Zod docs: https://zod.dev — Schema validation patterns
  - `.sisyphus/drafts/testagent-design.md:82-91` — Step decomposition IR format (step-assertion pairs with action type + assertion type)
  - Playwright CLI tools: snapshot returns accessibility tree with ref IDs; actions use run-code for Playwright code execution

  **Acceptance Criteria**:
  - [ ] `bun run build` compiles without type errors
  - [ ] Zod schemas parse valid example data successfully
  - [ ] Zod schemas reject invalid data (e.g., missing required field)

  **QA Scenarios**:
  ```
  Scenario: Types compile and Zod schemas validate
    Tool: Bash
    Preconditions: Project initialized
    Steps:
      1. Create a test file that imports all types and Zod schemas
      2. Validate a valid TestCase object against TestCaseSchema
      3. Validate an invalid TestCase (missing name) against TestCaseSchema
    Expected Result: Valid object parses; invalid object throws ZodError
    Evidence: .sisyphus/evidence/task-3-zod-validation.log

  Scenario: Constants are properly exported
    Tool: Bash
    Preconditions: Project initialized
    Steps:
      1. Run `bun -e "import { MAX_RETRIES, CONCURRENCY_LIMIT } from './src/shared/constants'; console.log(MAX_RETRIES, CONCURRENCY_LIMIT)"`
    Expected Result: Prints "1 3" (or configured defaults)
    Evidence: .sisyphus/evidence/task-3-constants.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/shared/types.ts, src/shared/schemas.ts, src/shared/constants.ts`

- [x] 4. LLM Client Library

  **What to do**:
  - Create `src/shared/llm-client.ts` — OpenAI-compatible API client wrapper:
    - Constructor takes: `apiUrl`, `apiKey`, `model`, `maxTokens`, `temperature`
    - `chatCompletion(messages, options?)` → structured response with token usage tracking
    - Support system/user/assistant message roles
    - Support `response_format: { type: "json_object" }` for structured output
    - Token budget tracking: `getTokensUsed()`, `isOverBudget(maxTokens)`
  - Create `src/shared/llm-prompts.ts` — Prompt templates for each agent role:
    - `TRANSLATOR_SYSTEM_PROMPT` — Translates raw text cases to structured IR
    - `DECOMPOSER_SYSTEM_PROMPT` — Decomposes translated cases into step-assertion pairs
    - `CODEGEN_SYSTEM_PROMPT` — Generates Playwright test code from step descriptions (code → CLI → execute)
    - Each prompt template accepts context variables (knowledge base terms, test data, etc.)
  - Implement timeout handling: per-request timeout (60s default), total budget timeout
  - Implement retry logic: exponential backoff on 5xx, no retry on 4xx
  - Create `src/shared/llm-client.test.ts` — unit tests with mocked fetch

  **Must NOT do**:
  - No LangChain/AutoGen dependency (overkill for our 3-role setup)
  - No streaming API support (we need complete JSON responses)
  - No function calling / tool_use (we generate Playwright code and run via CLI)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM integration needs careful error handling and prompt engineering, but not deep research
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T3, T5-T7)
  - **Blocks**: T9, T10, E2
  - **Blocked By**: T1

  **References**:
  - OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat — Standard `/v1/chat/completions` format
  - vLLM compatibility: vLLM implements the same API format, our client should work with both
  - `.sisyphus/drafts/testagent-design.md` — Metis review section: Token budget per step + per case, timeout 60s

  **Acceptance Criteria**:
  - [ ] `llm-client.ts` compiles and exports a functional class
  - [ ] Unit tests pass: mocked API returns valid response, token counting works
  - [ ] `chatCompletion` throws on timeout after configured duration
  - [ ] Prompt templates are exported and accept context variables

  **QA Scenarios**:
  ```
  Scenario: LLM client handles valid response
    Tool: Bash
    Preconditions: Project initialized, LLM client written
    Steps:
      1. Run unit test with mocked API that returns {"choices": [{"message": {"content": "{\"translated\": true}"}}]}
      2. Verify response is parsed correctly
      3. Verify token usage is tracked
    Expected Result: Test passes, content parsed as JSON, token counts non-zero
    Evidence: .sisyphus/evidence/task-4-llm-valid.log

  Scenario: LLM client handles timeout
    Tool: Bash
    Preconditions: LLM client written
    Steps:
      1. Run unit test with mocked API that never responds (hangs)
      2. Verify LLMTimeoutError is thrown after 60s (test with 1s timeout)
    Expected Result: LLMTimeoutError thrown, no infinite hang
    Evidence: .sisyphus/evidence/task-4-llm-timeout.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/shared/llm-client.ts, src/shared/llm-prompts.ts, src/shared/llm-client.test.ts`

- [x] 5. Playwright CLI Setup

  **What to do**:
  - Install `@playwright/cli` as project dependency (global: `npm install -g @playwright/cli@latest`, or local: `@playwright/cli` in package.json)
  - Install browsers: `playwright-cli install` (or use already installed `npx playwright install`)
  - Install CLI skills: `playwright-cli install --skills` (enables AI agent to use CLI commands)
  - Create `src/executor/cli-runner.ts` — CLI 命令执行封装：
    - `execCli(args: string[]): Promise<CliResult>` — 执行 `playwright-cli` 命令并解析输出
    - `CliResult`: { success, stdout, stderr, snapshot?, screenshotPath? }
    - 统一错误处理：命令失败时抛出 `CliError` 包含 stderr
    - 超时控制：每个命令 30s 超时
  - Create `src/executor/cli-runner.test.ts`
  - 验证 `playwright-cli --help` 可正常输出命令列表
  - 配置 `.playwright/cli.config.json` — 基本配置：
    ```json
    {
      "codegen": "typescript",
      "timeouts": { "action": 10000, "navigation": 30000 }
    }
    ```

  **Must NOT do**:
  - 不引入 `@playwright/mcp` 包（用 CLI 替代 MCP）
  - 不创建 MCP server 进程管理（CLI 是 bash 命令）
  - 不作为全局依赖（用 npx 或 package.json 管理）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI 安装和封装，模式明确
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T4, T6, T7)
  - **Blocks**: E1
  - **Blocked By**: T1

  **References**:
  - Playwright CLI GitHub: https://github.com/microsoft/playwright-cli — CLI 命令列表和用法
  - Playwright CLI Docs: https://playwright.dev/docs/next/getting-started-cli — SKILL 安装和配置
  - CLI 核心命令: `open`, `goto`, `click <ref>`, `type <text>`, `fill <ref> <text>`, `snapshot`, `screenshot`, `run-code`, `press`

  **Acceptance Criteria**:
  - [ ] `playwright-cli --help` 输出所有可用命令
  - [ ] `playwright-cli install` 安装浏览器成功
  - [ ] `playwright-cli open https://example.com` 后 `snapshot` 返回 accessibility tree
  - [ ] `playwright-cli screenshot` 生成截图文件
  - [ ] `cli-runner.ts` 封装可正常调用 CLI 并解析输出

  **QA Scenarios**:
  ```
  Scenario: Playwright CLI is installed and responsive
    Tool: Bash
    Preconditions: npm install -g @playwright/cli
    Steps:
      1. Run `playwright-cli --version`
      2. Verify version >= 0.1.13
      3. Run `playwright-cli --help`
      4. Verify output includes "open", "snapshot", "screenshot"
    Expected Result: CLI responds with version and command list
    Evidence: .sisyphus/evidence/task-5-cli-version.log

  Scenario: CLI opens browser and takes snapshot
    Tool: Bash
    Preconditions: Browsers installed
    Steps:
      1. Run `playwright-cli open https://example.com`
      2. Run `playwright-cli snapshot`
      3. Verify output contains accessibility tree with ref IDs
      4. Run `playwright-cli screenshot --filename=test.png`
      5. Verify test.png file exists
      6. Run `playwright-cli close`
    Expected Result: Snapshot shows page structure, screenshot file saved
    Evidence: .sisyphus/evidence/task-5-cli-snapshot.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/executor/cli-runner.ts, src/executor/cli-runner.test.ts, .playwright/cli.config.json`

- [x] 6. Knowledge Base YAML Schema + Sample Data

  **What to do**:
  - Create `src/knowledge/schema.ts` — Zod schemas for knowledge base YAML files:
    - `VocabEntry`: { term: string, locator?: string, description?: string, metadata?: Record<string, string> }
    - `TestDataEntry`: { key: string, value: string, environment?: string }
    - `BehaviorEntry`: { instruction: string, priority: "high"|"medium"|"low", appliesTo?: string[] }
    - `PreconditionEntry`: { name: string, description: string, steps: string[] }
    - `ProductLineConfig`: { name: string, baseUrl?: string, vocab: VocabEntry[], testData: TestDataEntry[], behaviors: BehaviorEntry[], preconditions: PreconditionEntry[] }
  - Create `src/knowledge/validator.ts` — YAML file validator using Zod schemas
  - Create sample knowledge base files in `knowledge/` directory:
    - `knowledge/demo-product.yaml` — Example product with Chinese terms (e.g., "购物车" → locator, "登录" → precondition steps)
    - Include: 5+ vocab entries, 3+ test data entries, 3+ behaviors, 2+ preconditions
  - Create `src/knowledge/loader.ts` — Load all YAML files from `knowledge/` directory

  **Must NOT do**:
  - No database storage yet (that's T11)
  - No term matching/ranking algorithm yet (that's T11)
  - No vector embeddings (over-engineering)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition + sample data creation, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T5, T7)
  - **Blocks**: T11
  - **Blocked By**: T1

  **References**:
  - `.sisyphus/drafts/testagent-design.md:93-97` — Knowledge base three-layer architecture (vocab, test data, behaviors)
  - YAML format is the human-editable layer; database is the machine-optimized layer
  - Chinese term examples: "购物车" (shopping cart), "登录" (login), "搜索" (search)

  **Acceptance Criteria**:
  - [ ] Zod schemas validate correct YAML without errors
  - [ ] Zod schemas reject malformed YAML (missing required fields)
  - [ ] `knowledge/demo-product.yaml` contains valid Chinese-language sample data
  - [ ] `loader.ts` can read and validate all YAML files in `knowledge/`

  **QA Scenarios**:
  ```
  Scenario: YAML schema validates sample data
    Tool: Bash
    Preconditions: YAML files and schemas created
    Steps:
      1. Run loader on knowledge/demo-product.yaml
      2. Verify it parses into ProductLineConfig with all fields
      3. Verify vocab entries include Chinese terms
    Expected Result: Parsed config has 5+ vocab, 3+ testData, 3+ behaviors, 2+ preconditions
    Evidence: .sisyphus/evidence/task-6-yaml-validation.log

  Scenario: Invalid YAML is rejected
    Tool: Bash
    Preconditions: Schemas created
    Steps:
      1. Create a YAML file with missing required fields (no "name")
      2. Run validator on it
      3. Verify ZodError is thrown with descriptive message
    Expected Result: Validation fails with "Required at path: name"
    Evidence: .sisyphus/evidence/task-6-yaml-invalid.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/knowledge/schema.ts, src/knowledge/validator.ts, src/knowledge/loader.ts, knowledge/demo-product.yaml`

- [x] 7. API Contract Definitions

  **What to do**:
  - Create `src/api/contracts/` directory with type definitions for all REST endpoints:
    - `test-cases.api.ts`:
      - `POST /api/test-cases/import` — Upload Excel/MD file → returns parsed test cases
      - `GET /api/test-cases` — List all test cases (with filtering by product line, status)
      - `GET /api/test-cases/:id` — Get single test case with steps
      - `DELETE /api/test-cases/:id` — Delete test case
      - `POST /api/test-cases/:id/translate` — Trigger LLM translation
      - `POST /api/test-cases/:id/decompose` — Trigger step decomposition
    - `knowledge.api.ts`:
      - `GET /api/knowledge/:productLineId` — Get knowledge base
      - `PUT /api/knowledge/:productLineId` — Update knowledge base
      - `GET /api/product-lines` — List all product lines
    - `execution.api.ts`:
      - `POST /api/execution/run/:testCaseId` — Start test execution (async, returns runId)
      - `GET /api/execution/runs/:runId` — Get run status with step results, screenshot URLs, generatedPythonCode, fixPrompt
      - `GET /api/execution/runs` — List recent runs
    - `health.api.ts`:
      - `GET /api/health` — Health check
  - All request/response types use Zod schemas from T3

  **Must NOT do**:
  - No API implementation (that's T12, T13)
  - No authentication middleware
  - No rate limiting

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definition for API contracts, mechanical
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T6)
  - **Blocks**: T12, T13
  - **Blocked By**: T1, T3

  **References**:
  - Hono routing: https://hono.dev/docs/api/routing — REST endpoint definition patterns
  - WebSocket in Hono: https://hono.dev/docs/helpers/ws — WebSocket upgrade patterns
  - `.sisyphus/drafts/testagent-design.md` — Scope: import, tree view, execution, knowledge management, reporting

  **Acceptance Criteria**:
  - [ ] All API endpoint types are defined with request/response shapes
  - [ ] WebSocket event types are defined
  - [ ] Types reference Zod schemas from T3
  - [ ] `bun run build` compiles without errors

  **QA Scenarios**:
  ```
  Scenario: API contracts compile and are type-safe
    Tool: Bash
    Preconditions: Types and schemas from T3 created
    Steps:
      1. Run `bun run build`
      2. Verify no type errors in src/api/contracts/
    Expected Result: Clean build, all endpoint types resolve correctly
    Evidence: .sisyphus/evidence/task-7-api-contracts.log
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(init): project scaffolding and foundation`
  - Files: `src/api/contracts/*.ts`

- [x] 8. Excel + Markdown Parser Services

  **What to do**:
  - Create `src/parser/excel-parser.ts`:
    - Parse .xlsx files using `xlsx` library
    - Expected column mapping (Chinese headers): "用例名称" → name, "预置条件" → precondition, "测试步骤" → actionText, "预期结果" → expectedText, "所属模块" → module (optional)
    - Handle merged cells (common in Chinese test case spreadsheets)
    - Handle multiple sheets (each sheet = a module/category)
    - Handle empty rows gracefully
    - Support flexible column headers (variations like "用例名"/"测试用例"/"case name")
    - Return `TestCase[]` with raw content preserved
  - Create `src/parser/markdown-parser.ts`:
    - Parse Markdown files with structured test case format:
      ```markdown
      ## 用例名称：Login with valid credentials
      **预置条件**：User account exists
      | # | 测试步骤 | 预期结果 |
      |---|---------|---------|
      | 1 | Navigate to login page | Login page displayed |
      | 2 | Enter username and password | Fields populated |
      | 3 | Click submit | Dashboard shown |
      ```
    - Support alternative formats (bullet lists, numbered lists without table)
    - Return `TestCase[]` with raw content preserved
  - Create `src/parser/index.ts` — Unified parser that detects file type and delegates
  - Create `src/parser/excel-parser.test.ts` and `src/parser/markdown-parser.test.ts`
  - Include test fixture files: `src/parser/fixtures/test-cases.xlsx`, `src/parser/fixtures/test-cases.md`

  **Must NOT do**:
  - No LLM translation here (just parsing raw content into structured types)
  - No .xls support (only .xlsx)
  - No CSV parsing (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Excel parsing with merged cells and Chinese headers requires attention to edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9-T14, but depends on T3, T2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T12, T21
  - **Blocked By**: T3 (type definitions), T2 (database for storage)

  **References**:
  - `xlsx` library: https://docs.sheetjs.com/docs/cell — Cell parsing, merged ranges, sheet access
  - `.sisyphus/drafts/testagent-design.md:8` — Input format: 用例名称、预置条件、测试步骤、预期结果
  - Chinese test case conventions: typically 4-5 columns, sometimes with merged cells for precondition grouping
  - `.sisyphus/drafts/testagent-design.md:Metis findings` — Excel parsing edge cases: merged cells, inconsistent columns, Chinese encoding

  **Acceptance Criteria**:
  - [ ] Excel parser handles Chinese headers and merged cells
  - [ ] Markdown parser handles table and list formats
  - [ ] Both parsers return `TestCase[]` matching Zod schema
  - [ ] Empty files return `[]` instead of error
  - [ ] Malformed files throw descriptive ParseError

  **QA Scenarios**:
  ```
  Scenario: Excel parser handles Chinese headers with merged cells
    Tool: Bash
    Preconditions: Test fixture xlsx file with merged cells created
    Steps:
      1. Run parser on fixture file with merged-cell preconditions
      2. Verify TestCase objects have correct precondition inheritance
      3. Verify step order is preserved
    Expected Result: 3+ test cases parsed with correct name, precondition, steps
    Evidence: .sisyphus/evidence/task-8-excel-merged.log

  Scenario: Markdown parser handles table format
    Tool: Bash
    Preconditions: Test fixture md file with table format
    Steps:
      1. Run parser on fixture file
      2. Verify step-assertion 1:1 mapping
    Expected Result: Each step has exactly one expectedText
    Evidence: .sisyphus/evidence/task-8-markdown-table.log

  Scenario: Empty Excel file returns empty array
    Tool: Bash
    Preconditions: Empty .xlsx file (no data rows)
    Steps:
      1. Run parser on empty file
    Expected Result: Returns [] with no error
    Failure Indicators: Throws error or returns null
    Evidence: .sisyphus/evidence/task-8-empty-file.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/parser/*.ts, src/parser/fixtures/*`

- [x] 9. Translator LLM Prompt + Service

  **What to do**:
  - Create `src/translator/translate-service.ts`:
    - `translateTestCase(rawCase: TestCase, knowledgeBase: KnowledgeBase): Promise<TestCase>` — Takes raw parsed case, returns translated case
    - Injects knowledge base context: domain vocabulary, test data, behavioral instructions
    - Uses `TRANSLATOR_SYSTEM_PROMPT` from T4
    - Constructs prompt with: raw test case text + matched vocabulary terms + relevant test data + behavioral rules
    - LLM returns structured JSON following `TestCase` schema
    - Validates LLM response against Zod schema (retry once if invalid JSON)
    - Tracks token usage and enforces budget
  - Create `src/translator/translator-prompt.md` — Detailed system prompt in Chinese that instructs the LLM to:
    - Standardize terminology using knowledge base vocab
    - Make steps more precise and actionable (e.g., "点击登录按钮" → "点击 [登录] 按钮")
    - Make expected results verifiable (e.g., "页面正常" → "登录成功页面显示，URL 包含 /dashboard")
    - Preserve original intent — do not add or remove test steps
    - Output as JSON matching the TestCase schema
  - Create `src/translator/translate-service.test.ts`

  **Must NOT do**:
  - No step decomposition here (that's T10)
  - No browser interaction (that's E2)
  - Do not let the LLM invent new test steps — only translate and refine existing ones

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering for translation quality is critical; needs careful design and testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T12
  - **Blocked By**: T4 (LLM client), T3 (type definitions)

  **References**:
  - `.sisyphus/drafts/testagent-design.md:8` — Translation: 专业化、可执行、agent可读
  - `.sisyphus/drafts/testagent-design.md:93-97` — Knowledge base context injection pattern
  - `.sisyphus/drafts/testagent-design.md:76-81` — Three-tier format: human input → ML IR → executable
  - Key insight: LLM prompt must include knowledge base terms so the translation uses correct, consistent terminology
  - From Metis: Private models may be less capable — system prompt must be very precise with instructions and examples

  **Acceptance Criteria**:
  - [ ] Translation service accepts raw TestCase + KnowledgeBase and returns translated TestCase
  - [ ] Translated steps use vocabulary from knowledge base
  - [ ] LLM response validated against Zod schema
  - [ ] Invalid LLM JSON response triggers one retry
  - [ ] Token usage is tracked per call

  **QA Scenarios**:
  ```
  Scenario: Translation produces structured output
    Tool: Bash (curl to test endpoint or run unit test with mocked LLM)
    Preconditions: LLM client configured, knowledge base loaded
    Steps:
      1. Provide raw TestCase: { name: "登录测试", steps: [{ actionText: "输入用户名密码点击登录", expectedText: "登录成功" }] }
      2. Provide KnowledgeBase with vocab: { "登录": { locator: "button[type=submit]" } }
      3. Run translation
      4. Verify output has standardized steps with vocabulary-matched terms
    Expected Result: Translated steps are more precise; each step has clear actionText and expectedText
    Evidence: .sisyphus/evidence/task-9-translation.log

  Scenario: Invalid LLM response triggers retry
    Tool: Bash
    Preconditions: Mock LLM returns invalid JSON on first call, valid on second
    Steps:
      1. Call translateTestCase with mock returning "not valid json" then valid JSON
      2. Verify retry happens and result is eventually valid
    Expected Result: One retry, final result is valid TestCase
    Evidence: .sisyphus/evidence/task-9-retry.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/translator/translate-service.ts, src/translator/translator-prompt.md, src/translator/translate-service.test.ts`

- [x] 10. Step Decomposer LLM Prompt + Service

  **What to do**:
  - Create `src/translator/decompose-service.ts`:
    - `decomposeTestCase(translatedCase: TestCase, knowledgeBase: KnowledgeBase): Promise<TestCase>` — Takes translated case, returns decomposed case with step-assertion 1:1 mapping
    - Uses `DECOMPOSER_SYSTEM_PROMPT` from T4
    - Input: a translated TestCase that may have complex steps (e.g., "输入用户名密码点击登录" = one step, should be decomposed into 3 steps: enter username, enter password, click login)
    - Output: each step has exactly one actionText and one expectedText
    - Inject knowledge base behavioral instructions (e.g., "wait for page load after navigation")
    - Validates output against Zod schema (retry once on invalid)
  - Create `src/translator/decomposer-prompt.md` — System prompt for decomposition:
    - Rule: Each step must be a single atomic action
    - Rule: Each step must have exactly one verifiable expected result
    - Rule: Compound steps (multiple actions) must be split
    - Rule: Navigational/setup steps still need expected results (e.g., "Navigate to /login" → "Login page is displayed")
    - Output as JSON matching TestCase schema
  - Create `src/translator/decompose-service.test.ts`
  - Create `src/translator/pipeline.ts` — Orchestrates translate → decompose sequentially:
    - `processTestCase(rawCase, knowledgeBase): Promise<TestCase>` — translate then decompose

  **Must NOT do**:
  - Do not add test steps that don't exist in the original case
  - Do not execute browser actions (that's E2)
  - Do not generate browser code (code export deferred to Phase 2)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Step decomposition logic is critical for execution reliability; prompt engineering requires care
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but logically after T9 in pipeline)
  - **Parallel Group**: Wave 2
  - **Blocks**: E2
  - **Blocked By**: T4, T3, T9 (for pipeline.ts)

  **References**:
  - `.sisyphus/drafts/testagent-design.md:10` — Step decomposition: step ↔ expectedResult 1:1 mapping
  - `.sisyphus/drafts/testagent-design.md:82-91` — Step-assertion interleaved pairs + test.step() grouping
  - Key: "输入用户名密码点击登录" is a compound step that MUST be decomposed into 3 atomic actions
  - From Metis: Setup steps (navigate) need expected results too; steps without assertions are ambiguous

  **Acceptance Criteria**:
  - [ ] Compound steps are correctly split into atomic actions
  - [ ] Each output step has exactly one actionText and one expectedText
  - [ ] Pipeline (translate + decompose) works end to end
  - [ ] Output validated against Zod schema

  **QA Scenarios**:
  ```
  Scenario: Compound step is decomposed into atomic steps
    Tool: Bash
    Preconditions: Translation service ready
    Steps:
      1. Provide translated TestCase with compound step: "输入用户名密码点击登录"
      2. Run decomposition
      3. Verify output has 3 steps: enter username, enter password, click login
      4. Each step has its own expectedText
    Expected Result: 3 atomic steps with 3 separate expected results
    Evidence: .sisyphus/evidence/task-10-decompose.log

  Scenario: Pipeline translate→decompose works end-to-end
    Tool: Bash
    Preconditions: Both services ready
    Steps:
      1. Provide raw TestCase + KnowledgeBase
      2. Run pipeline (translate then decompose)
      3. Verify final output is a fully decomposed TestCase
    Expected Result: Output has step-assertion 1:1 mapping, uses vocabulary, atomic steps
    Evidence: .sisyphus/evidence/task-10-pipeline.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/translator/decompose-service.ts, src/translator/decomposer-prompt.md, src/translator/decompose-service.test.ts, src/translator/pipeline.ts`

- [x] 11. Knowledge Base Service (CRUD + Retrieval)

  **What to do**:
  - Create `src/knowledge/knowledge-service.ts`:
    - `getProductLines(): Promise<ProductLineConfig[]>`
    - `getKnowledgeBase(productLineId: string): Promise<KnowledgeBase>`
    - `upsertKnowledgeBase(productLineId: string, config: ProductLineConfig): Promise<void>`
    - `matchTerms(text: string, productLineId: string): Promise<VocabEntry[]>` — Find vocabulary terms in text (simple string matching, not vector search)
    - `getTestData(productLineId: string, environment?: string): Promise<TestDataEntry[]>`
    - `getBehaviors(productLineId: string): Promise<BehaviorEntry[]>`
    - `getPrecondition(name: string, productLineId: string): Promise<PreconditionEntry | undefined>`
    - `buildContext(text: string, productLineId: string): Promise<string>` — Build LLM context string with matched terms, relevant test data, and applicable behaviors
  - Create `src/knowledge/knowledge-service.test.ts`
  - Implement term matching: exact match first, then substring match, case-insensitive for English terms
  - Synchronize YAML files ↔ database: load YAML on startup, save on update

  **Must NOT do**:
  - No vector embeddings / semantic search (over-engineering for MVP)
  - No knowledge base versioning (single current version per product line)
  - No knowledge base import/export (management via Web UI later)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Service layer with CRUD + retrieval logic; needs proper DB integration but not deep research
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T13, T22
  - **Blocked By**: T2 (database), T3 (types), T6 (YAML schema)

  **References**:
  - `.sisyphus/drafts/testagent-design.md:93-97` — Three-layer KB architecture
  - `.sisyphus/drafts/testagent-design.md:Metis section` — Knowledge base: per product-line, NOT per version; linear precondition flow
  - `src/db/schema.ts` (from T2) — Database tables for knowledge entries
  - `src/knowledge/schema.ts` (from T6) — YAML validation schemas

  **Acceptance Criteria**:
  - [ ] CRUD operations work against SQLite database
  - [ ] `matchTerms("点击登录按钮", "demo-product")` returns the "登录" vocab entry
  - [ ] `buildContext()` produces formatted string with matched terms + test data + behaviors
  - [ ] YAML ↔ DB synchronization works on startup
  - [ ] Unit tests pass

  **QA Scenarios**:
  ```
  Scenario: Term matching finds relevant vocabulary
    Tool: Bash
    Preconditions: Database seeded with demo-product knowledge base
    Steps:
      1. Call matchTerms("点击登录按钮输入密码", "demo-product")
      2. Verify returned entries include "登录" term
      3. Call buildContext with same text and product line
      4. Verify output string contains matched terms and their locators
    Expected Result: "登录" vocab entry found; context string includes locator info
    Evidence: .sisyphus/evidence/task-11-term-match.log

  Scenario: CRUD operations on knowledge base
    Tool: Bash
    Preconditions: Database initialized
    Steps:
      1. Upsert a new knowledge base entry
      2. Read it back via getKnowledgeBase
      3. Verify all fields match
    Expected Result: Round-trip CRUD works, data persists
    Evidence: .sisyphus/evidence/task-11-crud.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/knowledge/knowledge-service.ts, src/knowledge/knowledge-service.test.ts`

- [x] 12. REST API: Test Case Endpoints

  **What to do**:
  - Create `src/api/routes/test-cases.ts` — Hono routes implementing:
    - `POST /api/test-cases/import` — Accept multipart file upload (.xlsx/.md), parse via T8, store in DB
    - `GET /api/test-cases` — List with query params: productLineId, status, search
    - `GET /api/test-cases/:id` — Full test case with steps and translated/decomposed content
    - `GET /api/test-cases/tree` — Tree structure grouped by module/source file
    - `DELETE /api/test-cases/:id`
    - `POST /api/test-cases/:id/translate` — Trigger translation, update status
    - `POST /api/test-cases/:id/decompose` — Trigger decomposition, update status
    - `POST /api/test-cases/batch-translate` — Translate multiple cases at once
  - Create `src/api/middleware/error-handler.ts` — Global error handling middleware
  - Create `src/api/routes/test-cases.test.ts` — Integration tests using Hono test client

  **Must NOT do**:
  - No authentication middleware
  - No pagination yet (fetch all, team-scale is small)
  - No file size validation beyond basic check

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: REST API wiring; lots of endpoints but each is straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T21
  - **Blocked By**: T7 (API contracts), T8 (parsers), T9 (translator)

  **References**:
  - Hono routing: https://hono.dev/docs/api/routing — Route definitions and middleware
  - Hono testing: https://hono.dev/docs/guides/testing — TestClient for integration tests
  - `src/api/contracts/test-cases.api.ts` (from T7) — Request/response types

  **Acceptance Criteria**:
  - [ ] All CRUD endpoints return correct status codes (200, 201, 404, 500)
  - [ ] Import endpoint parses Excel and stores test cases in DB
  - [ ] Translate endpoint triggers LLM and updates case status
  - [ ] Tree endpoint returns nested structure by module
  - [ ] Integration tests pass

  **QA Scenarios**:
  ```
  Scenario: Import Excel file via API
    Tool: Bash (curl)
    Preconditions: API server running, demo Excel file available
    Steps:
      1. `curl -X POST -F "file=@test-cases.xlsx" -F "productLineId=demo-product" http://localhost:3001/api/test-cases/import`
      2. Verify 201 response with list of created test case IDs
      3. `curl http://localhost:3001/api/test-cases` and verify imported cases exist
    Expected Result: 201 with test case objects; list endpoint shows imported cases
    Evidence: .sisyphus/evidence/task-12-import-api.log

  Scenario: Translate test case via API
    Tool: Bash (curl)
    Preconditions: Test case exists in DB
    Steps:
      1. `curl -X POST http://localhost:3001/api/test-cases/{id}/translate`
      2. Verify 200 response with translated content
      3. `curl http://localhost:3001/api/test-cases/{id}` and verify status is "translated"
    Expected Result: Case status changes from "raw" to "translated"
    Evidence: .sisyphus/evidence/task-12-translate-api.log

  Scenario: 404 for non-existent test case
    Tool: Bash (curl)
    Steps:
      1. `curl http://localhost:3001/api/test-cases/nonexistent-id`
    Expected Result: 404 with error message
    Evidence: .sisyphus/evidence/task-12-404.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/api/routes/test-cases.ts, src/api/middleware/error-handler.ts`

- [x] 13. REST API: Knowledge Base + Execution Endpoints

  **What to do**:
  - Create `src/api/routes/knowledge.ts`:
    - `GET /api/product-lines` — List all product lines
    - `POST /api/product-lines` — Create product line
    - `GET /api/knowledge/:productLineId` — Get full knowledge base
    - `PUT /api/knowledge/:productLineId/vocab` — Update vocabulary entries
    - `PUT /api/knowledge/:productLineId/test-data` — Update test data
    - `PUT /api/knowledge/:productLineId/behaviors` — Update behaviors
    - `PUT /api/knowledge/:productLineId/preconditions` — Update preconditions
  - Create `src/api/routes/execution.ts`:
    - `POST /api/execution/run/:testCaseId` — Start execution (async, returns runId)
    - `GET /api/execution/runs/:runId` — Get run status with step results + screenshot URLs + Fix Prompt
    - `GET /api/execution/runs` — List all runs
  - Create `src/api/routes/health.ts` — `GET /api/health` health check
  - Create `src/api/app.ts` — Wire all routes together, mount on Hono app
  - Create `src/api/server.ts` — Start server with drizzle middleware

  **Must NOT do**:
  - No actual execution logic here (that's E3)
  - No code export logic here (deferred to Phase 2)
  - These routes are stubs that call the services from other tasks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: More API wiring; straightforward but numerous endpoints
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T23, T24
  - **Blocked By**: T7 (API contracts), T11 (knowledge service)

  **References**:
  - `src/api/contracts/` (from T7) — All request/response type definitions
  - Hono file upload: https://hono.dev/docs/api/request — Multipart handling
  - WebSocket upgrade: https://hono.dev/docs/helpers/ws — For real-time execution progress

  **Acceptance Criteria**:
  - [ ] Knowledge CRUD endpoints work against database
  - [ ] Execution stub endpoints return placeholder responses (not yet wired)
  - [ ] Health endpoint returns `{ status: "ok" }`
  - [ ] All routes compile and are mounted on the app

  **QA Scenarios**:
  ```
  Scenario: Knowledge base CRUD via API
    Tool: Bash (curl)
    Preconditions: API server running, database initialized
    Steps:
      1. `curl -X POST http://localhost:3001/api/product-lines -H "Content-Type: application/json" -d '{"name":"Test Product"}'`
      2. `curl http://localhost:3001/api/product-lines` — verify new product line listed
      3. `curl http://localhost:3001/api/knowledge/{id}` — verify knowledge base returned
    Expected Result: Product line created, knowledge base accessible
    Evidence: .sisyphus/evidence/task-13-kb-api.log

  Scenario: Execution returns run ID
    Tool: Bash (curl)
    Preconditions: Test case exists, execution route exists (stub)
    Steps:
      1. `curl -X POST http://localhost:3001/api/execution/run/{testCaseId}`
      2. Verify response contains `runId` field (may be placeholder initially)
    Expected Result: 200 with { runId: "..." }
    Evidence: .sisyphus/evidence/task-13-exec-api.log
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(core): parsers, translator, and knowledge base`
  - Files: `src/api/routes/knowledge.ts, src/api/routes/execution.ts, src/api/routes/health.ts, src/api/app.ts, src/api/server.ts`

- [x] 14. Web UI: Vite + React Setup + Layout

  **What to do**:
  - Initialize Vite + React + TypeScript project in `web/` directory:
    - `npm create vite@latest web -- --template react-ts`
    - Install: `tailwindcss`, `@tanstack/react-query`, `react-router-dom`, `lucide-react` (icons)
    - Install WebSocket library: native WebSocket API (no extra dep needed)
  - Configure Tailwind CSS with a minimal design system (colors, spacing)
  - Create layout components:
    - `web/src/App.tsx` — Root with router
    - `web/src/components/Layout.tsx` — Sidebar navigation + main content area
    - `web/src/components/Sidebar.tsx` — Navigation: 用例管理, 知识库, 执行, 报告
  - Create page stubs:
    - `web/src/pages/ImportPage.tsx` — Placeholder
    - `web/src/pages/CasesPage.tsx` — Placeholder
    - `web/src/pages/KnowledgePage.tsx` — Placeholder
    - `web/src/pages/ExecutionPage.tsx` — Placeholder
    - `web/src/pages/ReportPage.tsx` — Placeholder
  - Create API client: `web/src/lib/api.ts` — fetch wrapper with base URL and error handling
  - Create `web/vite.config.ts` with proxy to backend (`/api` → `localhost:3001`)
  - Verify `npm run dev` starts the frontend

  **Must NOT do**:
  - No Next.js (SSR not needed for this SPA)
  - No state management library (React Query + component state sufficient)
  - No Shadcn/Radix yet (add when needed in specific pages)
  - No dark mode (MVP doesn't need it)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend scaffolding with layout and design system
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T21, T22, T23, T24, T25
  - **Blocked By**: T1

  **References**:
  - Vite React: https://vite.dev/guide/#scaffolding-your-first-vite-project — Project setup
  - Tailwind CSS: https://tailwindcss.com/docs/installation — CSS framework
  - React Query: https://tanstack.com/query/latest — Data fetching and caching
  - Hono proxy: Vite's `server.proxy` config for development

  **Acceptance Criteria**:
  - [ ] `npm run dev` in `web/` starts without errors
  - [ ] Layout renders with sidebar and content area
  - [ ] Page stubs are accessible via sidebar navigation
  - [ ] API proxy works (curl `/api/health` returns ok)
  - [ ] Tailwind classes apply correctly

  **QA Scenarios**:
  ```
  Scenario: Web UI starts and navigates
    Tool: Playwright
    Preconditions: Web dev server running on :5173
    Steps:
      1. Navigate to http://localhost:5173
      2. Verify sidebar is visible with 4 navigation items (用例管理, 知识库, 执行, 报告)
      3. Click each nav item and verify page changes
    Expected Result: All pages render without errors; sidebar highlights active item
    Evidence: .sisyphus/evidence/task-14-ui-nav.png

  Scenario: API proxy works
    Tool: Bash
    Preconditions: Both frontend and backend running
    Steps:
      1. `curl http://localhost:5173/api/health`
    Expected Result: {"status":"ok"}
    Evidence: .sisyphus/evidence/task-14-api-proxy.log
  ```

  **Commit**: YES (separate commit for UI scaffolding)
  - Message: `feat(ui): web app setup and layout`
  - Files: `web/**`

- [x] E1. Playwright CLI Execution Utilities

  > **核心变化**: MCP → CLI。不再使用 MCP Server。改用 `playwright-cli` 操作浏览器，记录每一步的执行交互。执行完毕后将交互记录翻译为 Playwright Python 代码供用户查看/复制。

  **What to do**:
  - Create `src/executor/cli-session.ts` — CL I 浏览器会话管理（基于 T5 的 `cli-runner.ts`）：
    - `openSession(url?, opts?): Promise<string>` → `playwright-cli open <url>`，返回 session ID
    - `closeSession()` → `playwright-cli close`
    - `listSessions()` → `playwright-cli list`
    - 每个 test case 独立 session，执行完毕清理
  - Create `src/executor/cli-commands.ts` — 高层操作封装：
    - `navigate(url)` → `playwright-cli goto <url>` — 导航到 URL
    - `snapshot(depth?)` → `playwright-cli snapshot` — 返回 accessibility tree（含 ref=eN）
    - `screenshot(filename?)` → `playwright-cli screenshot` — 截图到文件
    - `click(ref)` → `playwright-cli click <ref>` — 点击元素
    - `fill(ref, text)` → `playwright-cli fill <ref> <text>` — 填充表单
    - `type(ref, text)` → `playwright-cli type <text>` — 输入文本
    - `press(key)` → `playwright-cli press <key>` — 键盘按键
    - `runCode(code)` → `playwright-cli run-code "<code>"` — 执行任意 Playwright JS 代码
    - `generateLocator(ref)` → `playwright-cli generate-locator <ref>` — 从 ref 生成 locator
  - 每个方法返回结构化结果: `{ success, stdout?, error? }`

  **执行流程**（AI Agent 视角）：
  ```
  1. playwright-cli open https://myapp.com/login
  2. playwright-cli snapshot                    ← 看页面结构
  3. AI 分析：找到用户名输入框 → 生成代码
  4. playwright-cli run-code "await page.getByPlaceholder('用户名').fill('admin')"
  5. playwright-cli screenshot                   ← 截图
  6. playwright-cli snapshot                     ← 验证
  7. AI 分析：密码框 → 生成代码
  8. playwright-cli run-code "await page.getByPlaceholder('密码').fill('pass123')"
  9. playwright-cli run-code "await page.getByRole('button', { name: '登录' }).click()"
  10. playwright-cli screenshot
  11. playwright-cli snapshot → URL含/dashboard → PASS ✅
  12. 所有代码片段 → compileTestCase() → 最终 .py 文件（可保存为项目资产，pytest 直接运行）
  ```

  **Must NOT do**:
  - 不创建任何 MCP 相关代码
  - 不使用 `@playwright/mcp` 包
  - 不直接调用 Playwright API（通过 CLI 间接调用）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI 命令封装 + 代码构建器，模式明确
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: E2
  - **Blocked By**: T5 (Playwright CLI Setup)

  **References**:
  - Playwright CLI: https://github.com/microsoft/playwright-cli — `run-code`, `snapshot`, `screenshot`, `generate-locator`
  - Playwright API: https://playwright.dev/docs/api/class-page — AI 生成 Playwright 代码时的 API 参考
  - `src/executor/cli-runner.ts` (from T5) — CLI 命令执行基础

  **Acceptance Criteria**:
  - [ ] `openSession(url)` 启动浏览器并导航到 URL
  - [ ] `snapshot()` 返回 accessibility tree（含 ref=eN）
  - [ ] `runCode("await page.goto('https://example.com')")` 在浏览器中执行成功
  - [ ] `screenshot()` 生成截图文件
  - [ ] `compileTestCase()` 输出合法的 Python 代码

  **QA Scenarios**:
  ```
  Scenario: CLI session opens, runs code, takes screenshot
    Tool: Bash
    Preconditions: Playwright CLI installed
    Steps:
      1. openSession("https://example.com")
      2. snapshot() → verify tree with ref IDs
      3. runCode("await page.getByRole('heading').textContent()") → verify output
      4. screenshot("test-e1.png") → verify file exists
      5. closeSession()
    Expected Result: All commands work, screenshot saved
    Evidence: .sisyphus/evidence/task-e1-cli-session.log

  Scenario: Code builder generates valid Python file
    Tool: Bash
    Preconditions: Snippets collected
    Steps:
      1. addSnippet("page.goto('https://example.com')")
      2. addSnippet("expect(page).to_have_title('Example Domain')")
      3. const code = compileTestCase(testCase, snippets)
      4. Save to temp_test.py
      5. Run pytest temp_test.py --dry-run
    Expected Result: Valid Python, no compilation errors
    Evidence: .sisyphus/evidence/task-e1-code-build.log
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(exec): AI execution engine`
  - Files: `src/executor/cli-session.ts, src/executor/cli-commands.ts`

- [x] E2. Step Executor — AI 代码生成执行循环 + Python 代码产出

  > **执行机制**: playwright-cli (JS) 驱动浏览器 → 记录交互 → 执行完毕 → 将记录翻译为 Python 代码展示
  > **Python 代码定位**: 展示/复制/保存的交付物，不是执行引擎本身。用户可选择性复制到项目中独立运行。

  **What to do**:
  - Create `src/executor/page-analyzer.ts` — **预执行页面分析**（关键优化点，减少 50-70% token 消耗）：
    - `analyzePage(cli, knowledgeBase): Promise<PageSummary>` — 在步骤执行前运行一次：
      1. `playwright-cli snapshot --depth=full` → 获取全量 accessibility tree
      2. 提取所有**可交互元素**（按钮、输入框、链接、下拉框、表单等）：
         ```typescript
         interface PageElement {
           ref: string;           // e5, e12 等快照引用 ID
           role: string;          // button, textbox, link, combobox...
           name: string;          // 元素的 accessible name
           type?: string;         // submit, text, search...
           matchedTerm?: string;  // 匹配到的业务术语（如"登录按钮"）
           pythonLocator?: string; // 生成的 Python Playwright locator（如 get_by_role("button", name="登录")）
           jsCommand?: string;    // 对应的 playwright-cli 命令（如 click e5）
         }
         ```
      3. **术语匹配**：将每个可交互元素的 name 与知识库 vocabulary 进行匹配：
      4. 输出 `PageSummary`（约 2-5KB，仅为全量 tree 的 10%）

  - Create `src/executor/step-executor.ts` — 执行循环（**核心：通过 playwright-cli JS 命令执行，同时记录交互用于后续生成 Python 代码**）：

    **执行流程**：
    ```
    // 第零步：预执行页面分析（一次）
    const pageSummary = await analyzePage(cli, knowledgeBase)

    // 每一步：LLM 决策 → CLI 执行 → 截图 → 验证 → 记录
    for (const step of testCase.steps) {
      // 1. LLM 阅读 PageSummary + 步骤描述
      //    输出 JSON 包含 cliCommand（用于立即执行）+ pythonCode（用于最终输出）
      //    "点击 [登录] 按钮" → 执行 playwright-cli click e5，同时记录 Python 代码
      const decision = await llm.chat([
        { role: "system", content: EXECUTOR_PROMPT },
        { role: "user", content: formatPrompt(step, pageSummary) }
      ])
      // decision = {
      //   cliCommand: "click e5",                                    // → 用于立即执行
      //   pythonCode: "page.get_by_role('button', name='登录').click()",  // → 用于最终输出
      //   targetElement: { ref: "e5", role: "button", name: "登录" },
      //   reasoning: "Found login button in page summary"
      // }

      // 2. 执行 playwright-cli 命令（JS/Node.js 执行，不需 Python）
      await cli.exec(decision.cliCommand)

      // 3. 截图
      const screenshot = await cli.screenshot(`step-${step.order}.png`)

      // 4. 快速 snapshot 验证结果
      const afterSnapshot = await cli.snapshot()
      const isPassed = await verifyResult(step, afterSnapshot)

      // 5. 记录交互（pythonCode 来自 LLM 决策，非模板生成）
      interactionLog.push({
        stepOrder: step.order,
        pythonCode: decision.pythonCode,    // ← LLM 产出的 Python 代码
        cliCommand: decision.cliCommand,
        targetElement: decision.targetElement,
        passed: isPassed,
        error: isPassed ? null : result.error
      })
    }

    // 全部执行完毕后：将所有 pythonCode 片段编译为完整 .py 文件
    const generatedPythonCode = interactionLog
      .filter(i => i.passed)               // 只包含通过步骤
      .map(i => i.pythonCode)              // 收集 LLM 产出的 Python 代码
      .join('\n    ')
    // 包装为完整的 Python 文件结构
    const fullPyCode = `
    from playwright.sync_api import Page, expect

    def test_${toSnakeCase(testCase.name)}(page: Page):
        ${generatedPythonCode}
    `
    // 保存到 DB，返回给 API

  - `classifyFailure(error: string): "FAIL" | "BLOCK"` — 关键词匹配（无需 LLM）：
    ```typescript
    const BLOCK_PATTERNS = [
      "timeout", "TimeoutError", "ERR_CONNECTION", "ERR_NAME_NOT_RESOLVED",
      "captcha", "CAPTCHA", "security verification",
      "网络不给力", "百度安全验证"
    ]
    return BLOCK_PATTERNS.some(p => error?.includes(p)) ? "BLOCK" : "FAIL"
    ```

  - Create `src/executor/types.ts` — 执行器类型：
    - `StepResult`: { stepOrder, status, screenshotPath, error?, generatedCode?, pythonCode? }
    - `Interaction`: { stepOrder, pythonCode, cliCommand, targetElement, passed, error? }
    - `PageElement`: { ref, role, name, matchedTerm?, pythonLocator? }
    - `PageSummary`: { url, title, elements: PageElement[], forms, matchedTerms }
    - `ExecutionContext`: { cli, llm, knowledgeBase, testCase, codeBuilder, pageSummary? }

  - Create `src/executor/codegen-prompt.md` — LLM 执行决策提示词（一次调用产出两种输出）：
    ```
    You are a browser test automation agent using Playwright CLI.
    
    Given:
    - STEP: what action to perform
    - EXPECTED: what should happen after the action
    - PAGE_SUMMARY: pre-analyzed page structure with interactive elements
    
    Your job: output JSON with TWO things:
    1. cliCommand: the playwright-cli command to execute NOW
    2. pythonCode: the equivalent Playwright Python code (for the final deliverable)
    
    Rules:
    1. Use PageSummary elements (ref=IDs) to target CLI commands
    2. Use Playwright Python sync API for pythonCode: get_by_role(), get_by_placeholder(), etc.
    3. NEVER use CSS selectors in pythonCode — use accessibility-first locators
    4. Include expect() assertions in pythonCode
    
    Output format:
    {
      "cliCommand": "click e5",
      "pythonCode": "page.get_by_role(\"button\", name=\"登录\").click()\nexpect(page).to_have_url(\"/dashboard\")",
      "targetElement": { "ref": "e5", "role": "button", "name": "登录", "matchedTerm": "登录按钮" },
      "reasoning": "Found login button in page summary"
    }
    ```

  - 重试逻辑：失败时 LLM 分析错误 → 选择不同元素/命令 → 重新执行（最多 1 次）
  - **无独立自愈模块**、**无独立分类器**、**无前置条件执行器**

  **Must NOT do**:
  - 不创建 MCP 工具调用（不用 `browser_click` 等方式）
  - 不创建独立 failure-classifier.ts
  - 不创建 precondition-runner.ts
  - 不进行 LLM 二次调用做分类（用关键词即可）
  - 页面分析成功后不重复全量 snapshot（复用 PageSummary 即可）

  **References**:
  - Playwright API: https://playwright.dev/docs/api/class-page — AI 生成代码时的 API 参考
  - Playwright Locators: https://playwright.dev/docs/locators — getByRole/getByPlaceholder/getByText
  - Playwright CLI `run-code` / `snapshot`: https://github.com/microsoft/playwright-cli
  - TestSprite Feature Exploration: 先探索站点结构再生成测试
  - `src/knowledge/knowledge-service.ts` — 知识库术语匹配（给 page-analyzer 用）

  **Acceptance Criteria**:
  - [ ] `pageAnalyze()` 提取所有可交互元素，PageSummary ≤ 全量 snapshot 的 20%
  - [ ] 术语匹配：知识库的"登录按钮"匹配到 `role=button, name="登录"` 的元素
  - [ ] 导航 step → LLM 输出 `{ cliCommand + pythonCode }` → CLI 执行 + Python 代码记录
  - [ ] 点击 step → LLM 从 PageSummary 找到元素 → pythonCode 为 `get_by_role().click()`
  - [ ] 输入 step → LLM 输出 pythonCode 为 `get_by_placeholder().fill("admin")`
  - [ ] 每个 step 的 pythonCode 来自 LLM 决策（非模板），质量由 LLM 保证
  - [ ] 全部执行完毕 → `generatePythonCode(interactionLog)` 输出完整 .py
  - [ ] 生成的 .py 使用正确的 `page.get_by_role()` / `page.get_by_placeholder()` 等 Python API
  - [ ] 失败时正确分类 FAIL/BLOCK（关键词匹配）
  - [ ] 重试：失败后 LLM 选择不同元素/命令（最多 1 次）

  **QA Scenarios**:
  ```
  Scenario: Page analysis extracts and matches terms
    Tool: Bash
    Preconditions: CLI session, knowledge base with Chinese terms
    Steps:
      1. Navigate to test page
      2. Run analyzePage()
      3. Verify pageSummary.elements contains interactive elements
      4. Verify matchedTerms includes KB vocab matches
      5. Verify pageSummary size < snapshot size * 0.2
    Expected Result: ~20% of full tree size, terms matched correctly
    Evidence: .sisyphus/evidence/task-e2-page-analysis.log

  Scenario: CLI executes step via playwright-cli command
    Tool: Bash
    Preconditions: CLI session open, LLM configured
    Steps:
      1. Execute step: "Navigate to https://example.com" / expected: "Page loads"
      2. LLM outputs: { cliCommand: "goto https://example.com" }
      3. CLI executes: playwright-cli goto https://example.com
      4. Verify status = "PASS"
      5. Verify interactionLog contains: { action: "navigate", url: "https://example.com" }
      6. Verify screenshot exists
    Expected Result: CLI executes, interaction recorded, screenshot saved
    Evidence: .sisyphus/evidence/task-e2-cli-exec.log

  Scenario: Python code generated from interaction log
    Tool: Bash
    Preconditions: 3 interactions recorded (navigate, click, fill)
    Steps:
      1. Call generatePythonCode(interactionLog, testCase)
      2. Verify output contains: page.goto(), .get_by_role().click(), .get_by_placeholder().fill()
      3. Verify output has `from playwright.sync_api import Page, expect`
      4. Verify output has `def test_xxx()`
    Expected Result: Valid Python file covering all 3 steps
    Evidence: .sisyphus/evidence/task-e2-python-gen.log

  Scenario: Timeout classified as BLOCK, excluded from Python output
    Tool: Bash
    Preconditions: Unreachable URL
    Steps:
      1. Execute step to unreachable URL
      2. Verify status = "BLOCK"
      3. Verify interactionLog has this step with passed=false
      4. Verify generated Python SKIPS this step
    Expected Result: Failed step in log but excluded from Python output
    Evidence: .sisyphus/evidence/task-e2-block.log
    Preconditions: Multiple steps executed successfully
    Steps:
      1. Execute 3 passing steps
      2. Call codeBuilder.compileTestCase()
      3. Verify output contains 3 step functions
      4. Run pytest output.py --dry-run
    Expected Result: Valid Python with pytest-playwright compatible code
    Evidence: .sisyphus/evidence/task-e2-py-output.log
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(exec): AI execution engine`
  - Files: `src/executor/step-executor.ts, src/executor/page-analyzer.ts, src/executor/python-code-generator.ts, src/executor/types.ts, src/executor/codegen-prompt.md`

- [x] E3. Execution Runner + Report Builder + Code Output

  > **关键输出**: 执行完成后，记录的所有交互被翻译为 Playwright Python 代码，展示在 Web UI 中供用户查看/复制/保存。生成的 .py 文件是交付物，不是执行引擎。

  **What to do**:
  - Create `src/executor/report-builder.ts`:
    - `buildReport(testCase, stepResults, interactionLog, generatedPythonCode): ExecutionReport` — 汇总执行结果：
      - summary: { total, pass, fail, blocked }
      - steps: [{ stepOrder, action, status, screenshotUrl, error, pythonCode? }]
      - `generatedPythonCode: string` — **完整的 Playwright Python .py 代码**（从 interactionLog 翻译得出）
      - `interactionLog: Interaction[]` — **原始执行记录**（用于 Python 代码生成和审计）
    - `generateFixPrompt(testCase, stepResults, generatedPythonCode): string` — 生成 Fix Prompt：
    - `generateRecommendations(stepResults): string[]`
  - 更新 `src/executor/index.ts` — 执行编排入口：
    ```typescript
    export async function runTestCase(testCaseId: string): Promise<RunResult> {
      const runId = crypto.randomUUID()
      const cli = createCliSession()
      const interactionLog: Interaction[] = []
      
      await cli.openSession(testCase.baseUrl || kb.baseUrl)
      try {
        const pageSummary = await analyzePage(cli, knowledgeBase)
        const results: StepResult[] = []
        for (const step of testCase.steps) {
          const result = await executeStep(step, { cli, llm, pageSummary, interactionLog })
          results.push(result)
        }
        // 从交互记录生成 Python 代码（离线步骤，不在执行关键路径上）
        const generatedPythonCode = generatePythonCode(interactionLog, testCase)
        const report = buildReport(testCase, results, interactionLog, generatedPythonCode)
        // 保存到 DB
        await db.saveRun(runId, testCaseId, { ...report, generatedPythonCode })
        return { runId, results, generatedPythonCode, report }
      } finally {
        await cli.closeSession()
      }
    }
    ```
  - 关键：`generatedPythonCode` 保存到 DB，通过 API 返回，**在 Web UI 中展示供用户复制保存**
  - 并发控制：`Semaphore`（最大 3），无需消息队列
  - API 集成：
    - `POST /api/execution/run/:testCaseId` → 返回 `{ runId }`
    - `GET /api/execution/runs/:runId` → 返回 `{ summary, steps, generatedCode, fixPrompt }`
    - 前端**简单轮询**（非 WebSocket）

  **Must NOT do**:
  - 不创建 WebSocket
  - 不创建 exporter 目录
  - 不使用消息队列

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 编排 + 报告 + 代码输出，逻辑清晰
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (last)
  - **Blocks**: T23, T24, T25
  - **Blocked By**: T2 (DB), E2 (step executor)

  **References**:
  - `.sisyphus/drafts/testSprite-research.md` — TestReport 结构
  - `src/executor/python-code-generator.ts` (from E2) — 从交互记录生成 Python 代码
  - `src/api/routes/execution.ts` (from T13) — API 端点

  **Acceptance Criteria**:
  - [ ] 3 步全部 PASS → report.summary = { pass: 3, fail: 0, blocked: 0 }
  - [ ] 有 FAIL/BLOCK 时 → Fix Prompt 包含修复建议 + Python 代码
  - [ ] `generatedCode` 包含完整可运行的 .py 文件
  - [ ] 生成的 .py 可通过 `pytest --dry-run` 验证
  - [ ] 生成的 .py 保存到 `data/generated/` 目录，可直接 `pytest` 运行
  - [ ] 并发：最多 3 个 CLI 浏览器并行

  **QA Scenarios**:
  ```
  Scenario: Full pipeline produces .py output asset
    Tool: Bash
    Preconditions: CLI, LLM, DB ready, test case exists
    Steps:
      1. `curl -X POST http://localhost:3001/api/execution/run/{testCaseId}`
      2. Poll `curl http://localhost:3001/api/execution/runs/{runId}`
      3. Verify report.generatedCode is non-empty Python string
      4. Save generatedCode to data/generated/test_xxx.py
      5. Run `pytest data/generated/test_xxx.py --dry-run`
      6. **Verify zero AI tokens needed for re-run**
    Expected Result: Generated Python passes validation, can be saved as permanent asset
    Evidence: .sisyphus/evidence/task-e3-full-run.log

  Scenario: Fix Prompt with Python code snippets
    Tool: Bash
    Preconditions: Mixed pass/fail/block results
    Steps:
      1. Get run result
      2. Verify report.fixPrompt contains generatedCode from failed steps
      3. Verify final .py file only includes passing steps
    Expected Result: FixPrompt references Python code, .py only has passing steps
    Evidence: .sisyphus/evidence/task-e3-fix-prompt.log

  Scenario: Re-run saved asset with zero AI cost
    Tool: Bash
    Preconditions: Generated .py file saved in data/generated/
    Steps:
      1. Run `pytest data/generated/test_xxx.py -q`
      2. Verify test passes
      3. Verify NO API calls to LLM (zero tokens consumed)
    Expected Result: Test runs independently, no AI dependency
    Evidence: .sisyphus/evidence/task-e3-rerun.log
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(exec): AI execution engine`
  - Files: `src/executor/report-builder.ts, src/executor/index.ts`

- [x] 21. Test Case Import + Tree View Pages

  **What to do**:
  - Create `web/src/pages/ImportPage.tsx`:
    - File upload area (drag-and-drop + click) accepting .xlsx and .md files
    - Product line selector dropdown
    - Upload progress indicator
    - Import result: number of cases parsed, list of case names with status
    - Error display for malformed files
  - Create `web/src/pages/CasesPage.tsx`:
    - Tree view component: group test cases by module/source file
    - Each tree node expands to show test steps
    - **双重状态徽章**：
      - 翻译状态: `raw → translated → decomposed`
      - **执行状态: `not_run → pass(绿色) / fail(红色) / block(橙色)`** — 显示最新一次执行结果
    - 执行状态徽章点击跳转到最新一次执行报告
    - Actions per case: translate, decompose, **execute（一键执行）**, delete
    - Bulk actions: batch translate all raw cases
    - Search/filter bar (by name, status)
  - Create `web/src/components/TestCaseTree.tsx` — Reusable tree component
  - Create `web/src/components/StepList.tsx` — Step list with action/expected pairs
  - Create `web/src/components/StatusBadge.tsx` — Color-coded status indicator
  - Connect to API endpoints: `POST /api/test-cases/import`, `GET /api/test-cases/tree`, `POST /api/test-cases/:id/translate`

  **Must NOT do**:
  - No drag-and-drop reordering of test cases
  - No inline editing of test steps (view-only for now)
  - No export button on this page (that's on report page)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI components with tree view, file upload, and status management
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T22-T24)
  - **Parallel Group**: Wave 4
  - **Blocks**: T25
  - **Blocked By**: T14 (web setup), T12 (test case API)

  **References**:
  - `web/src/lib/api.ts` (from T14) — API client
  - `src/api/routes/test-cases.ts` (from T12) — Backend endpoints
  - `.sisyphus/drafts/testagent-design.md:19-20` — 用例导入 + 树状结构显示

  **Acceptance Criteria**:
  - [ ] Excel file can be uploaded and parsed test cases appear in tree
  - [ ] Tree view groups cases by module
  - [ ] Status badges show raw/translated/decomposed correctly
  - [ ] **Execution status badge shows latest run: not_run / pass / fail / block**
  - [ ] Translate action triggers API and updates status
  - [ ] **Execute action directly from tree view → navigates to execution page with case pre-selected**
  - [ ] Malformed file shows error message

  **QA Scenarios**:
  ```
  Scenario: Upload Excel and view test case tree
    Tool: Playwright
    Preconditions: Web UI running, backend running, demo Excel file available
    Steps:
      1. Navigate to http://localhost:5173/import
      2. Select product line "demo-product" from dropdown
      3. Upload demo Excel file via file input
      4. Wait for import success message
      5. Navigate to cases page
      6. Verify tree view shows test cases grouped by module
      7. Expand a case and verify steps are listed
    Expected Result: Tree view shows cases with status "raw", steps visible on expand
    Evidence: .sisyphus/evidence/task-21-import-tree.png

  Scenario: Translate test case from UI
    Tool: Playwright
    Preconditions: Test case in "raw" status exists
    Steps:
      1. Navigate to cases page
      2. Click "Translate" action on a raw test case
      3. Wait for status to change from "raw" to "translated"
      4. Click "Decompose" action
      5. Verify status changes to "decomposed"
    Expected Result: Status badge transitions: raw → translated → decomposed
    Evidence: .sisyphus/evidence/task-21-translate.png

  Scenario: Upload malformed file
    Tool: Playwright
    Preconditions: Invalid file (non-xlsx, non-md)
    Steps:
      1. Navigate to import page
      2. Attempt to upload a .txt file
      3. Verify error message is displayed
    Expected Result: "Unsupported file type" error shown
    Evidence: .sisyphus/evidence/task-21-malformed.png
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ui): web UI pages for all workflows`
  - Files: `web/src/pages/ImportPage.tsx, web/src/pages/CasesPage.tsx, web/src/components/TestCaseTree.tsx, web/src/components/StepList.tsx, web/src/components/StatusBadge.tsx`

- [x] 22. Knowledge Base Management Page

  **What to do**:
  - Create `web/src/pages/KnowledgePage.tsx`:
    - Product line selector tabs
    - Four tabs within each product line:
      1. **术语词汇** (Vocabulary): Table with term, locator, description. Add/edit/delete rows.
      2. **测试数据** (Test Data): Table with key, value, environment. Add/edit/delete.
      3. **行为指令** (Behaviors): Table with instruction, priority. Add/edit/delete.
      4. **前置条件** (Preconditions): List of named preconditions with step sequences. Add/edit/delete.
    - Save button to persist changes via API
    - YAML preview (show what the YAML file would look like)
  - Create `web/src/components/EditableTable.tsx` — Reusable inline-editable table component
  - Create `web/src/components/PreconditionEditor.tsx` — Editor for precondition step sequences
  - Connect to API: `GET /api/knowledge/:productLineId`, `PUT /api/knowledge/:productLineId/*`

  **Must NOT do**:
  - No version history for knowledge base changes
  - No syntax highlighting for YAML preview
  - No import/export of knowledge base files (manage via UI only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CRUD UI with tables and editors
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21, T23, T24)
  - **Parallel Group**: Wave 4
  - **Blocks**: T25
  - **Blocked By**: T14 (web setup), T11 (knowledge base service + API from T13)

  **References**:
  - `web/src/lib/api.ts` (from T14) — API client
  - `src/api/routes/knowledge.ts` (from T13) — Backend endpoints
  - `.sisyphus/drafts/testagent-design.md:93-97` — Three-layer KB architecture informing UI tabs

  **Acceptance Criteria**:
  - [ ] Vocabulary table displays and allows add/edit/delete
  - [ ] Test data table displays and allows add/edit/delete
  - [ ] Behaviors table displays and allows add/edit/delete
  - [ ] Precondition editor allows creating step sequences
  - [ ] Save persists changes to backend
  - [ ] Data loads from backend on page mount

  **QA Scenarios**:
  ```
  Scenario: Add vocabulary term and save
    Tool: Playwright
    Preconditions: Web UI running, knowledge base exists
    Steps:
      1. Navigate to knowledge base page
      2. Select product line "demo-product"
      3. Click "Add Term" button in vocabulary tab
      4. Fill in: term="搜索框", locator="input[type='search']", description="搜索输入框"
      5. Click "Save"
      6. Verify success toast/notification
      7. Refresh page and verify term persists
    Expected Result: New term appears in table, persists after refresh
    Evidence: .sisyphus/evidence/task-22-kb-add.png

  Scenario: Edit precondition steps
    Tool: Playwright
    Preconditions: Precondition "logged_in" exists
    Steps:
      1. Navigate to preconditions tab
      2. Click edit on "logged_in" precondition
      3. Add a new step: "Wait for dashboard to load"
      4. Save
      5. Verify step is added
    Expected Result: Precondition has new step after save
    Evidence: .sisyphus/evidence/task-22-precond-edit.png
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ui): web UI pages for all workflows`
  - Files: `web/src/pages/KnowledgePage.tsx, web/src/components/EditableTable.tsx, web/src/components/PreconditionEditor.tsx`

- [x] 23. Execution Page + Progress Polling

  **What to do**:
  - Create `web/src/pages/ExecutionPage.tsx`:
    - Test case selector (from available decomposed cases)
    - "Execute" button to start execution
    - Progress display (simple polling, not WebSocket):
      - Step-by-step progress bar (step 2/10, step 3/10...)
      - Current step description (action + expected)
      - Step status indicators (pending → running → passed/failed/blocked)
      - Poll `GET /api/execution/runs/:runId` every 3s
      - Screenshot thumbnails appear as steps complete
  - Create `web/src/hooks/useExecutionProgress.ts` — Polling hook:
    - Calls `GET /api/execution/runs/:runId` every 3 seconds
    - Returns reactive state: current step, step statuses, screenshots
    - Stops polling when execution completes
  - Create `web/src/components/StepProgress.tsx` — Step-by-step progress component
  - Create `web/src/components/StepScreenshot.tsx` — Screenshot thumbnail viewer
  - Connect to API: `POST /api/execution/run/:testCaseId`, `GET /api/execution/runs/:runId`

  **Must NOT do**:
  - No WebSocket connection (simple polling is sufficient for MVP)
  - No video playback (screenshots only)
  - No execution scheduling

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Progress UI with polling, step visualization
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21, T22, T24)
  - **Parallel Group**: Wave 4
  - **Blocks**: T25
  - **Blocked By**: T14 (web setup), E3 (execution runner with API)

  **References**:
  - `src/api/routes/execution.ts` (from T13) — Polling API endpoints
  - `.sisyphus/drafts/testagent-design.md:23-24` — 一键执行 + 执行过程可视化

  **Acceptance Criteria**:
  - [ ] Execute button starts test and shows polling progress
  - [ ] Step progress updates every ~3s via polling
  - [ ] Screenshots appear for each completed step
  - [ ] PASS/FAIL/BLOCK status indicators are correct

  **QA Scenarios**:
  ```
  Scenario: Execute test and watch progress via polling
    Tool: Playwright
    Preconditions: Test case decomposed, backend running
    Steps:
      1. Navigate to execution page
      2. Select a test case, click "Execute"
      3. Observe progress bar updating every 3s
      4. Verify screenshots appear as steps complete
      5. Wait for completion notification
    Expected Result: Steps progress from "running" to "passed"/"failed"/"blocked"
    Evidence: .sisyphus/evidence/task-23-exec-progress.png
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ui): web UI pages for all workflows`
  - Files: `web/src/pages/ExecutionPage.tsx, web/src/hooks/useExecutionProgress.ts, web/src/components/StepProgress.tsx, web/src/components/StepScreenshot.tsx`

- [x] 24. Report Page with Screenshots + Fix Prompt + Code Preview + Rerun

  **What to do**:
  - Create `web/src/pages/ReportPage.tsx`:
    - **Rerun 按钮**（页面顶部，醒目位置）：
      - 调用 `POST /api/execution/run/:testCaseId` → 获得新 runId
      - 跳转到 T23 执行页面，自动展示新执行进度
      - 按钮在重新执行期间显示 loading 状态
    - Run summary: pass/fail/blocked counts, total steps
    - Step-by-step detail view:
      - Each step shows: action, expected, actual (pass/fail/blocked)
      - Screenshot thumbnail → click to expand full size
      - Failed steps: error message + FAIL/BLOCK badge
      - Blocked steps: error message + environment issue badge
      - Each step's generated Playwright code (collapsible)
    - Fix Prompt display panel:
      - Shows generated Fix Prompt text (read-only)
      - "Copy Prompt" button → copy to clipboard
      - Organized by: UI bugs (FAIL) and Environment issues (BLOCK)
    - **Generated Python Code Preview**:
      - Shows the complete .py output (syntax highlighted)
      - "Copy Code" button → copy to clipboard
      - "Download .py" button → save as Python file
      - Preview panel with line numbers
  - Create `web/src/components/ScreenshotGallery.tsx` — Screenshot grid with full-size viewer
  - Create `web/src/components/StatusBadge.tsx` — PASS/FAIL/BLOCK badge component
  - Create `web/src/components/FixPromptPanel.tsx` — Fix Prompt display + copy button
  - Create `web/src/components/CodePreviewPanel.tsx` — Syntax-highlighted code viewer + download
  - Connect to API: `GET /api/execution/runs/:runId` (返回包含 generatedPythonCode 字段)

  **Must NOT do**:
  - No Allure/JUnit report generation
  - No PDF export

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Report page with screenshot gallery, code preview, and status badges
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21, T22, T23)
  - **Parallel Group**: Wave 4
  - **Blocks**: T25
  - **Blocked By**: T14 (web setup), E3 (execution data)

  **References**:
  - `src/executor/report-builder.ts` (from E3) — Fix Prompt + generatedPythonCode
  - `.sisyphus/drafts/testSprite-research.md:Test Report` — TestSprite 报告结构参考
  - `src/executor/python-code-generator.ts` (from E2) — 从交互记录生成 Python .py 代码

  **Acceptance Criteria**:
  - [ ] **Rerun button starts new execution → navigates to execution page with new runId**
  - [ ] Report page shows pass/fail/blocked summary
  - [ ] Each step shows screenshot (clickable to expand)
  - [ ] Failed/Blocked steps show error message + status badge
  - [ ] Each step shows its generated Playwright code (collapsible)
  - [ ] Code Preview panel shows complete .py with syntax highlighting
  - [ ] "Copy Code" button copies to clipboard
  - [ ] "Download .py" button saves file
  - [ ] Fix Prompt panel displays and has copy button

  **QA Scenarios**:
  ```
  Scenario: Rerun from report page
    Tool: Playwright
    Preconditions: Completed execution report displayed
    Steps:
      1. Click "Rerun" button at top of report page
      2. Verify navigation to execution page
      3. Verify progress bar starts showing new execution
      4. Wait for completion, verify new report is generated
    Expected Result: New execution started, user sees live progress, new report appears
    Evidence: .sisyphus/evidence/task-24-rerun.png

  Scenario: View execution report with generated code
    Preconditions: Completed execution with mixed results
    Steps:
      1. Navigate to report page
      2. Verify summary shows pass/fail/blocked counts
      3. Verify each step's generated code snippet is shown
      4. Click screenshot thumbnail → verify full-size view
      5. Find FAILED step → verify error + FAIL badge + code
    Expected Result: Summary correct, screenshots, code, and badges visible
    Evidence: .sisyphus/evidence/task-24-report.png

  Scenario: Download generated .py file
    Tool: Playwright
    Preconditions: Successful execution
    Steps:
      1. Navigate to report page
      2. Scroll to Code Preview panel
      3. Verify .py content is displayed with syntax highlighting
      4. Click "Download .py" → verify file downloads
    Expected Result: Complete Playwright Python test file downloaded
    Evidence: .sisyphus/evidence/task-24-py-download.png

  Scenario: Copy Fix Prompt
    Tool: Playwright
    Preconditions: Execution with failures
    Steps:
      1. Navigate to report page
      2. Locate Fix Prompt panel
      3. Click "Copy" button
    Expected Result: Fix prompt copied to clipboard
    Evidence: .sisyphus/evidence/task-24-fix-prompt.png
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(ui): web UI pages for all workflows`
  - Files: `web/src/pages/ReportPage.tsx, web/src/components/ScreenshotGallery.tsx, web/src/components/StatusBadge.tsx, web/src/components/FixPromptPanel.tsx, web/src/components/CodePreviewPanel.tsx`

- [x] 25. End-to-End Integration + Polish

  **What to do**:
  - Create `src/api/index.ts` — Main server entry point:
    - Start Hono server with all routes mounted
    - Initialize database + run migrations
    - Load knowledge base YAML files
    - Configure CORS, error handler, request logging
  - Create `package.json` scripts:
    - `dev` — Start both backend + frontend in parallel (use `concurrently`)
    - `dev:api` — Start backend only
    - `dev:web` — Start frontend only
    - `build` — Build both projects
    - `test` — Run all tests
    - `db:migrate` — Run migrations
  - Write end-to-end integration test: `src/integration/e2e.test.ts`
    - Import an Excel file → Parse → Translate → Decompose → Execute (against example.com) → Report
    - Verify the full pipeline works
  - Add `src/shared/logger.ts` — Simple structured logging (no winston/pino, use console with levels)
  - Polish:
    - Add loading states to all pages
    - Add error states to all API calls
    - Add empty states (no test cases, no knowledge base)
    - Verify all navigation links work
  - Create sample test cases in `data/samples/` for demo purposes

  **Must NOT do**:
  - No Docker/containerization (not yet)
  - No production deployment config
  - No performance optimization
  - No APM/monitoring

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration testing across the full pipeline; requires understanding of all components
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 4 tasks)
  - **Parallel Group**: Wave 4 (last in wave)
  - **Blocks**: F1-F4
  - **Blocked By**: T21, T22, T23, T24

  **References**:
  - All previously created files in `src/` and `web/`
  - `.sisyphus/drafts/testagent-design.md:4` — 端到端 AI 辅助测试

  **Acceptance Criteria**:
  - [ ] `npm run dev` starts both backend and frontend
  - [ ] Full pipeline: import Excel → translate → decompose → execute → report works
  - [ ] All pages have loading, error, and empty states
  - [ ] Integration test passes
  - [ ] All API endpoints respond correctly

  **QA Scenarios**:
  ```
  Scenario: Full pipeline from Excel to report
    Tool: Bash + Playwright
    Preconditions: Clean database, backend + frontend running, sample Excel file
    Steps:
      1. Import sample Excel file via Web UI
      2. Verify test cases appear in tree view
      3. Click "Translate All" and wait for completion
      4. Click "Decompose All" and wait for completion
      5. Select a test case and click "Execute"
      6. Watch execution progress in real-time
      7. Navigate to report page
      8. Verify pass/fail summary and screenshots
      9. Click "Download .py" and verify Python file downloads
    Expected Result: Full pipeline completes without errors; report shows results; .py asset saved
    Evidence: .sisyphus/evidence/task-25-e2e-pipeline.png

  Scenario: Empty state displays correctly
    Tool: Playwright
    Preconditions: Fresh database with no data
    Steps:
      1. Navigate to cases page — verify empty state message
      2. Navigate to execution page — verify "no executions" message
      3. Navigate to report page — verify "no reports" message
    Expected Result: Each page shows helpful empty state, not blank screen
    Evidence: .sisyphus/evidence/task-25-empty-states.png

  Scenario: Error handling in UI
    Tool: Playwright
    Preconditions: Backend server stopped
    Steps:
      1. Navigate to import page
      2. Attempt to upload a file
      3. Verify error message is shown (not blank screen)
    Expected Result: "Unable to connect to server" error shown
    Evidence: .sisyphus/evidence/task-25-error-state.png
  ```

  **Commit**: YES (separate commit)
  - Message: `chore: final review and polish`
  - Files: `src/api/index.ts, package.json scripts, src/integration/e2e.test.ts, src/shared/logger.ts, data/samples/*`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(init): project scaffolding and foundation` - T1-T7 files, bun test
- **Wave 2**: `feat(core): parsers, translator, and knowledge base` - T8-T13 files, bun test
- **Wave 2b**: `feat(ui): web app setup and layout` - T14 files
- **Wave 3**: `feat(exec): AI execution engine` - E1-E3 files, bun test
- **Wave 4**: `feat(ui): web UI pages for all workflows` - T21-T25 files, bun test
- **Final**: `chore: final review and polish` - all verification evidence

---

## Success Criteria

### Verification Commands
```bash
bun run build        # Expected: successful TypeScript compilation
bun test             # Expected: all unit tests pass
bun run dev          # Expected: API server starts on :3001, Web UI on :5173
curl http://localhost:3001/api/health  # Expected: {"status":"ok"}
pytest data/generated/test_*.py -q     # Expected: generated Python tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Excel file can be imported and parsed
- [ ] Test case execution completes via Playwright CLI
- [ ] LLM 每步同时输出 cliCommand（执行）+ pythonCode（交付），无额外 token 成本
- [ ] Generated Python .py shown in Web UI for copy/save
- [ ] Web UI shows execution progress via polling
