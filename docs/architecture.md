# TestAgent 架构设计文档

> 版本: 1.1.0 | AI 驱动的端到端测试自动化平台
> 输入: 中文文本测试用例 → 输出: Playwright Python 代码 + 测试报告
> 最后更新: 2026-05-19 — 执行引擎重大优化 (详见 §5 和 §6)

---

## 1. 系统架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                      用户浏览器 (React/Vite)                      │
│  ImportPage │ CasesPage │ ExecutionPage │ ExecutionHistoryPage    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP (JSON)
                    ┌──────▼──────────────────────────────────┐
                    │         Hono API (Bun/TypeScript)        │
                    │  routes/test-cases.ts                    │
                    │  routes/execution.ts                     │
                    │  middleware/error-handler.ts              │
                    └──────┬──────────────┬────────────────────┘
                           │              │
              ┌────────────▼────┐  ┌──────▼──────────────────┐
              │   SQLite DB     │  │   Executor  (核心引擎)    │
              │   (Drizzle ORM) │  │                          │
              │   3 张表       │  │  page-analyzer.ts        │
              │   data/*.db    │  │  step-executor.ts         │
              └────────────────┘  │  cli-commands.ts          │
                                  │  cli-session.ts           │
                                  │  cli-runner.ts            │
                                  │  python-code-generator.ts │
                                  │  report-builder.ts        │
                                  └──────────┬───────────────┘
                                             │
                    ┌────────────────────────▼────────────────┐
                    │         npx playwright-cli (子进程)       │
                    │  spawnSync → 无 shell 注入风险           │
                    │  Chromium 浏览器 (headed/headless)       │
                    └─────────────────────────────────────────┘
                                             │
                    ┌────────────────────────▼────────────────┐
                    │         LLM (OpenAI 兼容 API)            │
                    │  翻译 → 拆解 → 代码生成                  │
                    │  知识库 MD 全文注入提示词                │
                    └─────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 | 关键文件 |
|:--|:-----|:---------|
| 后端运行时 | Bun + TypeScript | `src/index.ts` |
| Web 框架 | Hono | `src/api/app.ts` |
| 数据库 | SQLite + Drizzle ORM | `src/db/schema.ts` |
| 前端 | React + Vite + Tailwind | `web/src/` |
| 浏览器驱动 | Playwright CLI (子进程) | `src/executor/cli-runner.ts` |
| AI | OpenAI 兼容 API | `src/shared/llm-client.ts` |
| 知识库 | Markdown + YAML frontmatter | `src/knowledge/loader.ts` |

---

## 2. 数据流: 测试用例生命周期

```
用例导入                                        执行完成
    │                                              │
    ▼                                              ▼
┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐
│  raw   │──▶│translated│──▶│decomposed│──▶│   executed   │
└────────┘   └──────────┘   └──────────┘   └──────────────┘
    │              │              │               │
  parseFile    translate     decompose       runTestCase
  (parser/)    (LLM)         (LLM)           (executor/)
```

### 各阶段详情

| 阶段 | 数据库 status | 触发方式 | 涉及服务 | 说明 |
|:-----|:-------------|:---------|:---------|:-----|
| **raw** | `'raw'` | POST /import | parser/ (`excel-parser.ts`, `markdown-parser.ts`) | 从 Excel/MD 解析原始步骤 |
| **translated** | `'translated'` | POST /:id/translate | translator/ (`translate-service.ts`) | LLM 标准化术语、精确化描述 |
| **decomposed** | `'decomposed'` | POST /:id/decompose | translator/ (`decompose-service.ts`) | LLM 将复合步骤拆分为原子操作 |
| **executed** | `'executed'` | POST /execution/run/:id | executor/ (全部) | 浏览器执行 + 报告生成 |

---

## 3. 数据库设计

### schema: `src/db/schema.ts`

```typescript
// test_cases — 测试用例主表
test_cases {
  id:              text PK        // UUID v4
  name:            text NOT NULL   // 用例名称
  product_line:    text NOT NULL   // 产品线标识
  steps_json:      text NOT NULL   // JSON: { order, actionText, expectedText, actionIR, assertionIR }[]
  original_steps_json: text        // 导入时的原始步骤快照
  source:          'excel'|'markdown' NOT NULL
  status:          'raw'|'translated'|'decomposed'|'executed' NOT NULL  DEFAULT 'raw'
  created_at:      text NOT NULL
  updated_at:      text NOT NULL
}

// test_runs — 执行记录表
test_runs {
  id:                   text PK   // UUID v4
  case_id:              text FK → test_cases.id NOT NULL
  status:               'running'|'passed'|'failed'|'error' NOT NULL DEFAULT 'running'
  summary_json:         text NOT NULL  // JSON: { total, pass, fail, blocked, steps: [...] }
  generated_python_code: text          // 聚合后的完整 Playwright Python 代码
  fix_prompt:           text           // 失败步骤的修复建议（供用户提交给 LLM）
  created_at:           text NOT NULL
}

// knowledge — 知识库缓存表
knowledge {
  id:           text PK
  product_line: text UNIQUE NOT NULL  // 与 MD frontmatter 的 name 对应
  config_yaml:  text                  // 缓存（兼容旧版结构化知识库）
  updated_at:   text NOT NULL
}
```

### 设计要点

- **JSON 列代替关联表**: `steps_json` 替代 `test_steps` 表，`summary_json` 替代 `step_results` 表，共计节省 2 张表
- **original_steps_json**: 保留导入时的原始步骤，翻译/拆解后仍可对照
- **knowledge 表**: 主要为迁移兼容，实际运行时从 MD 文件加载

---

## 4. API 设计

### 所有端点

| 方法 | 路径 | 说明 | 请求/响应 |
|:-----|:-----|:-----|:----------|
| **测试用例** | | | |
| POST | `/api/test-cases/import` | 上传 Excel/MD 文件 | FormData: file + productLineId → `{ cases: [{id, name, status}] }` |
| GET | `/api/test-cases` | 列表查询 | Query: ?productLine=&status=&search= → `{ cases: [...] }` |
| GET | `/api/test-cases/tree` | 产品线按模块分组树 | `{ modules: [{ name, cases: [...] }] }` |
| GET | `/api/test-cases/:id` | 获取单个用例详情 | → `{ id, name, productLine, steps, status }` |
| DELETE | `/api/test-cases/:id` | 删除指定用例 | → `200 { deleted: true }` (删除成功时返回 JSON) |
| DELETE | `/api/test-cases/batch` | 批量删除 | Query: ?productLine= → `{ deleted: true }` |
| POST | `/api/test-cases/:id/translate` | LLM 翻译标准化 | → `202 { status, steps }` |
| POST | `/api/test-cases/:id/decompose` | LLM 步骤拆解 | → `202 { status, steps }` |
| GET | `/api/test-cases/product-lines` | 获取产品线列表 | → `{ productLines: [{ id, name, baseUrl }] }` |
| **执行** | | | |
| POST | `/api/execution/run/:testCaseId` | 启动异步执行 | → `201 { runId }` |
| GET | `/api/execution/runs/:runId` | 轮询执行状态 | → `{ runId, status, summary, steps, generatedPythonCode, fixPrompt }` |
| GET | `/api/execution/runs` | 历史记录列表 | → `{ runs: [{ runId, caseId, caseName, status, createdAt }] }` |
| DELETE | `/api/execution/runs` | 清空执行历史 | → `{ deleted: true }` |
| **截图** | | | |
| GET | `/api/screenshots/:filename` | 获取步骤截图 | → PNG 文件 |

### 异步执行协议

```
前端                          后端
  │                            │
  │  POST /execution/run/:id   │
  │───────────────────────────▶│  创建 test_runs (status=running)
  │◀───────────────────────────│  201 { runId }
  │                            │
  │  GET /execution/runs/:runId│  ← 后台运行: runTestCase()
  │───────────────────────────▶│      |
  │◀───────────────────────────│  ← 每 3s 轮询
  │  status === 'running'      │      |
  │    ...                     │      └→ 完成后更新 DB
  │  GET /execution/runs/:runId│
  │───────────────────────────▶│
  │◀───────────────────────────│  status in ['passed','failed','error']
  │  展示报告                   │
```

---

## 5. 执行管道详情

### 完整流程

```
用户点击"执行"
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Browser Session Open                                              │
│    CliSession.open(baseUrl)                                          │
│    src/executor/cli-session.ts                                       │
│    → npx playwright-cli open <baseUrl> [--headed]                    │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Smart Viewport                                                    │
│    resize(1920, 1080)  ← 标准初始视口                                │
│    evalPage('document.body.scrollWidth/Height') ← 获取内容实际尺寸    │
│    → 动态 resize(min(实际宽度, 2560), min(实际高度, 4096))          │
│    → 保证全页可见，后续截图不需要滚动拼接                             │
│    src/executor/cli-commands.ts (resize, evalPage)                   │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Page Analysis                                                     │
│    mousewheel(0, 10000) → 800ms → mousewheel(0, -10000)  ← 触发懒加载 │
│    snapshot --raw --boxes  ← 获取无障碍树 + 元素坐标框               │
│    │                                                                  │
│    ▼                                                                  │
│    analyzePage() → flattenTree() → PageElement[] ← 提取交互元素       │
│    src/executor/page-analyzer.ts                                     │
│    flattenTree() 递归遍历 JSON 树，保留真实 ref (e47, e89)           │
│    仅保留 INTERACTIVE_ROLES: button, link, textbox, combobox 等      │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. For Each Step (循环)                                              │
│    ┌──────────────────────────────────────────────────────────────┐  │
│    │ a. buildUserPrompt()                                         │  │
│    │    ← 知识库 MD (产品知识库)                                   │  │
│    │    ← 页面摘要 (URL/标题/元素，按优先级排序截断 Top 40)       │  │
│    │      优先级: button/textbox=5 > link/menuitem=4 > combobox=3 │  │
│    │      有名字元素 +3 分，确保交互目标不被容器元素挤出           │  │
│    │    ← 当前步骤 (actionText, expectedText)                      │  │
│    │    ← 之前的交互记录 (步骤序号 + CLI 命令 + 结果)              │  │
│    │    ← 重试错误信息 (第二次尝试时)                               │  │
│    │    src/executor/step-executor.ts                              │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ b. LLM Code Generation                                       │  │
│    │    system: codegen-prompt.md (src/executor/codegen-prompt.md) │  │
│    │    user: buildUserPrompt() 的输出                             │  │
│    │    → JSON { cliCommand, pythonCode, targetElement, reasoning }│  │
│    │    ★ 一次调用同时产出 CLI 命令 + Python 代码，零额外 token   │  │
│    │    ★ cliCommand 绝不空: ref 不可用时用 run-code + JS 定位器  │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ c. Command Validation                                        │  │
│    │    validateCommandMatchesAction(cmd, actionText)              │  │
│    │    → 等待/检查步骤放行所有命令 (含 assert)                    │  │
│    │    → run-code 直接放行 (动作类型在 JS 代码中)                 │  │
│    │    → fill/type 对应"输入"，click 对应"点击"                   │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ d. CLI Execution                                             │  │
│    │    parseCliCommand(cliCommand) → { action, args }            │  │
│    │    spawnSync('npx', ['playwright-cli', action, ...args])     │  │
│    │    assert: 三层回退 (snapshot → innerText → CJK 模糊匹配)    │  │
│    │    run-code: 在浏览器中执行任意 Playwright JS                │  │
│    │    src/executor/cli-runner.ts  (使用 spawnSync 防 shell 注入) │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ e. Post-Action Verification                                  │  │
│    │    snapshot → 检查错误模式 (验证码/安全验证/连接失败)        │  │
│    │    navigate: 额外验证页面内容非空                            │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ f. Screenshot                                                │  │
│    │    screenshot --full-page --filename data/screenshots/step-N  │  │
│    │    文件名格式: step-{order}-{timestamp}.png                   │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ g. Failure Classification                                    │  │
│    │    CLI exit code === 0 且 verifyAfterAction 通过 → PASS      │  │
│    │    匹配 BLOCK_PATTERNS (timeout/CAPTCHA/验证码) → BLOCK      │  │
│    │    其余 → FAIL → 触发自愈 (attemptSelfHeal)                   │  │
│    ├──────────────────────────────────────────────────────────────┤  │
│    │ h. Self-Heal (自愈) — 仅在 FAIL 时触发                       │  │
│    │    assert 失败: 等待 1.5s → 重试 innerText + 模糊匹配        │  │
│    │                (不调用自愈 LLM，不做 precondition)            │  │
│    │    空命令失败: 跳过 precondition → 直接当前页 regenerate     │  │
│    │    其他失败: LLM 生成 precondition → 执行 → retry origCmd    │  │
│    │              → 仍失败 → 刷新快照 → regenerate                │  │
│    │    最多执行: 1 precondition + 1 regenerate                   │  │
│    └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Generate Python Code                                             │
│    python-code-generator.ts                                         │
│    从 interactionLog 提取 passing 步骤的 pythonCode                  │
│    按 stepOrder 排序 → 拼接为完整 Playwright Python 函数             │
│    函数名: test_{用例名转 snake_case}                               │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Build Report                                                     │
│    report-builder.ts                                                │
│    { summary: { total, pass, fail, blocked, steps }                 │
│      generatedPythonCode, fixPrompt, recommendations }              │
│    fixPrompt: 失败步骤的修复建议 (供用户提交给 LLM 修正)            │
│    recommendations: 通用建议 (阻塞步骤处理/定位器检查/网络检查)     │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Cleanup                                                          │
│    CliSession.close()  →  npx playwright-cli close                  │
│    DB 更新: test_runs.status = passed|failed, summaryJson, ...      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 关键设计模式

### 6.1 spawnSync 替代 execSync

`src/executor/cli-runner.ts`:

```typescript
// ✅ 正确: spawnSync 避免 shell 注入
const result = spawnSync('npx', ['playwright-cli', ...args], {
  encoding: 'utf-8', timeout: 30000
});

// ❌ 错误: execSync 存在 shell 转义风险
// execSync(`npx playwright-cli ${args.join(' ')}`);
```

### 6.2 真实 Ref 保留

`src/executor/page-analyzer.ts` — `flattenTree()`:

```
snapshot --raw --boxes 产生的 JSON 包含 Playwright 真实 ref (e47, e89)
  ↓
flattenTree() 递归遍历 children，保留 ref/role/name
  ↓
LLM 使用这些 ref 生成 cliCommand: "click e47"
  ↓
playwright-cli click e47 → 可直接寻址到真实 DOM 元素
```

### 6.3 知识库注入

```
前端选择产品线 → POST /import
  ↓
KnowledgeService.buildContext(productLine)
  ↓
读取 knowledge/{productLine}.md → parseFrontmatter() → 提取 content
  ↓
content 全文注入 LLM 提示词的 "## 产品知识库" 章节
  ↓
LLM 在翻译/拆解/代码生成三个环节均参考知识库内容
```

### 6.4 异步执行 + DB 轮询

```
POST /execution/run/:testCaseId
  → 创建 test_runs (status=running)
  → 不等待执行完成，立即返回 { runId }
  → 后台 Promise: runTestCase() → 完成后更新 DB

前端 useExecutionProgress(runId) hook:
  → useEffect → setTimeout 每 3s 轮询 GET /execution/runs/:runId
  → status === 'passed'|'failed'|'error' 时停止轮询
```

### 6.5 204 改为 200 JSON

```
DELETE /api/test-cases/:id
  → 返回 200 { deleted: true }   (非 204 No Content)
  → 前端统一 JSON 响应处理，减少特判逻辑
```

### 6.6 元素截断: 优先级排序 (2026-05-19 新增)

```
parseAccessibilityTree() → 元素按 DOM 顺序输出 (顶层容器在前)
  ↓
buildUserPrompt() → sort by priority antes de slice(0, 40)
  ↓
优先级权重: button/textbox=5, link/menuitem=4, combobox/searchbox/checkbox=3
            有名字元素额外 +3 分
```

**为何重要**: DOM 顺序的前 40 个元素通常是 `generic/navigation/listitem` 容器。排序后 "登录" 按钮 (button=5, named=3 → 8 分) 排在 "百度首页" 链接 (link=4, named=3 → 7 分) 之前，确保 LLM 看到真正的交互目标。

### 6.7 assert 命令: 三层匹配 (2026-05-19 新增)

```
assert "用户名或密码错误"
  ↓
① snapshot 子串匹配 (accessibility tree JSON → .toLowerCase().includes())
  ↓ (未找到)
② eval('document.body.innerText') 子串匹配 (捕获 toast/动态文本)
  ↓ (仍未找到)
③ CJK 字符模糊匹配: 逐字拆分 → 命中率 ≥ 60% → PASS
   "用户名或密码错误" → [用,户,名,或,密,码,错,误]
   页面文本 "...用户名或密码有误..." → 7/8 = 88% → PASS
```

**为何需要**: 错误提示通常为 `alert/toast` 角色，可能不在无障碍树中; 且测试人员撰写的"预期结果"可能用词与界面不完全一致 (如"错误" vs "有误")。

### 6.8 run-code 命令: 兜底定位 (2026-05-19 新增)

```
元素 ref 不在页面摘要中
  ↓
LLM 生成 run-code 命令 (替代 ref 定位)
  run-code page.getByText('用户名登录').click()
  run-code page.getByPlaceholder('手机号/用户名/邮箱').fill('admin')
  run-code page.getByRole('button', { name: '登录' }).click()
  ↓
spawnSync('npx', ['playwright-cli', 'run-code', '<JS代码>'])
  → 在浏览器会话中直接执行 Playwright JS API
```

**为何需要**: 页面摘要只展示 Top 40 个元素，部分交互元素可能被截断。`run-code` 通过 Playwright 的文本/角色/占位符定位器绕过 ref 依赖，保证 LLM 总能产出可执行命令。

### 6.9 自愈流程: 按失败类型分流 (2026-05-19 重构)

```
step FAIL
  ↓
┌─ assert 失败 → 等待 1.5s → 重试 innerText + 模糊匹配 → PASS/FAIL
│   (不调用自愈 LLM，不做 precondition。assert 是只读操作，页面状态已正确)
│
├─ 空命令失败 → 刷新当前页快照 → 直接 regenerate
│   (跳过 precondition，避免导航/点击破坏页面状态)
│
└─ 其他失败 → LLM 生成 precondition → 执行 → retry origCmd
              → 仍失败 → 刷新快照 → regenerate
```

**关键改动**: 之前 assert 失败会触发 LLM 生成 precondition (如重复点击登录按钮)，浪费 20-30s 且可能破坏页面状态。现在按失败类型分流，assert 和空命令走轻量通道。

---

## 7. 前端组件树

```
App
├── Layout
│   ├── Sidebar                    # 导航菜单
│   │   ├── 导入用例    → /import
│   │   ├── 用例管理    → /cases
│   │   ├── 执行测试    → /execution
│   │   └── 执行历史    → /history
│   └── (Outlet — React Router)
│
├── ImportPage                     # 导入用例
│   ├── 产品线下拉选择器
│   ├── 文件上传 (Excel/MD)
│   └── 导入结果列表
│
├── CasesPage                      # 用例管理
│   ├── 树状视图 (按产品线分组)
│   │   ├── 模块名 (含批量删除)
│   │   └── 用例行
│   │       ├── 用例名
│   │       ├── StatusBadge (raw/translated/decomposed/executed)
│   │       ├── 展开步骤
│   │       └── 操作按钮: 翻译/拆解/执行/删除
│   └── 搜索/过滤
│
├── ExecutionPage                  # 执行测试 (3 阶段工作流)
│   ├── 三阶段指示器
│   │   └── 翻译 → 拆解 → 执行
│   ├── 模式切换
│   │   ├── 一键执行 (自动串联 3 阶段)
│   │   └── 分步执行 (手动逐阶段确认)
│   ├── 步骤列表
│   │   ├── 步骤序号 + 动作描述 + 预期结果
│   │   ├── 执行状态 (PASS/FAIL/BLOCK)
│   │   └── 步骤截图缩略图
│   └── 结果面板
│       ├── 汇总: 总数/通过/失败/阻塞
│       └── 操作按钮: 查看完整报告
│
├── ExecutionHistoryPage           # 执行历史
│   ├── 历史列表 (按时间倒序)
│   └── 点击 → 跳转详情
│
├── ReportPage                     # 执行报告详情
│   ├── 执行摘要卡片
│   ├── 步骤列表 (含截图 + 状态)
│   ├── CodePreviewPanel           # 生成的 Python 代码
│   └── FixPromptPanel             # 修复建议
```

### 前端 Hooks

| Hook | 文件 | 功能 |
|:-----|:-----|:-----|
| `useExecutionProgress(runId)` | `web/src/hooks/useExecutionProgress.ts` | 每 3s 轮询执行状态 |

---

## 8. 知识库系统

### 文件结构

```
knowledge/
├── template.md              # 模板（参考用，不会被加载）
├── baidu-demo.md            # 示例: 百度搜索产品线
└── ...                      # 用户创建的产品知识库 *.md
```

### 知识库格式 (YAML frontmatter + Markdown)

```markdown
---
name: baidu-demo             # → 产品线标识符 (productLine)
baseUrl: https://www.baidu.com  # → 测试入口 URL
---

# 百度搜索 - 知识库

## 术语词汇           # LLM 参考来源：术语标准化
| 术语 | 说明 |
|------|------|
| 搜索框 | 百度首页搜索输入框 |
| 百度一下 | 搜索提交按钮 |

## 业务背景           # LLM 参考来源：理解业务场景
百度是全球最大的中文搜索引擎...

## 操作规范           # LLM 参考来源：生成正确的操作序列
1. 搜索前等待首页完全加载
2. 遇到百度安全验证标记为阻塞（BLOCK）

## 测试示例           # LLM 参考来源：few-shot 示例
场景: 百度首页搜索
  当 打开百度首页
  且 在搜索框中输入"test"
```

### 核心加载逻辑

`src/knowledge/loader.ts` — `parseFrontmatter()`:

```
原始内容
  ↓
正则 /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  ↓
解析出 meta: { name, baseUrl }  +  content: 正文 Markdown
  ↓
ProductMeta { name, baseUrl, content, filePath }
```

### KnowledgeService API

| 方法 | 说明 |
|:-----|:-----|
| `getProductLines()` | 返回所有产品线 `[{name, baseUrl}]` |
| `getKnowledgeContent(productLine)` | 获取指定产品线正文内容 |
| `buildContext(productLine)` | 构建 LLM 提示词上下文 (含标题头) |
| `getBaseUrl(productLine)` | 获取指定产品线入口 URL |

### LLM 提示词注入

知识库内容在三个环节注入 LLM 提示词的 `## 产品知识库` 章节:

1. **翻译阶段** (translate-service.ts) — 标准化术语
2. **拆解阶段** (decompose-service.ts) — 规范操作序列
3. **代码生成阶段** (step-executor.ts → buildUserPrompt) — 元素定位

---

## 9. 环境配置

| 变量 | 说明 | 默认值 | 文件 |
|:-----|:-----|:-------|:-----|
| `LLM_API_URL` | OpenAI 兼容 API 地址 | `http://localhost:11434/v1` | `.env` |
| `LLM_API_KEY` | API 密钥 | `not-needed` | `.env` |
| `LLM_MODEL_NAME` | 模型名称 | `qwen2.5-72b` | `.env` |
| `PORT` | 后端端口 | `3001` | `.env` |
| `DB_PATH` | SQLite 数据库路径 | `./data/testagent.db` | `.env` |
| `HEADED` | 浏览器模式 (`true`=有头, `false`=无头) | `false` | `.env` |

### 目录结构

```
src/
├── shared/          # 类型定义、LLM 客户端、提示词
├── parser/          # Excel/Markdown 文件解析
├── translator/      # LLM 翻译 + 步骤拆解
├── knowledge/       # 知识库加载服务
├── executor/        # 核心执行引擎
├── api/             # Hono REST 路由
└── db/              # Drizzle schema + 迁移

web/src/
├── pages/           # ImportPage, CasesPage, ExecutionPage, ExecutionHistoryPage, ReportPage
├── components/      # Layout, Sidebar, StatusBadge, CodePreviewPanel, FixPromptPanel
└── hooks/           # useExecutionProgress

knowledge/           # 产品知识库 MD 文件
data/                # SQLite DB, 截图, 导入的 JSON 备份
```

---

## 附录: 关键文件索引

| 文件路径 | 核心职责 |
|:---------|:---------|
| `src/executor/step-executor.ts` | 执行管道编排，LLM 调用，CLI 解析 |
| `src/executor/page-analyzer.ts` | 页面分析，无障碍树解析，flattenTree |
| `src/executor/cli-commands.ts` | Playwright CLI 命令封装 |
| `src/executor/cli-runner.ts` | spawnSync 执行子进程 |
| `src/executor/codegen-prompt.md` | LLM 代码生成系统提示词 (含 run-code 兜底规则) |
| `src/executor/selfheal-prompt.md` | LLM 自愈系统提示词 |
| `src/executor/python-code-generator.ts` | Python 代码聚合生成 |
| `src/executor/report-builder.ts` | 报告 + fixPrompt + 建议 |
| `src/knowledge/loader.ts` | parseFrontmatter + MD 文件加载 |
| `src/knowledge/knowledge-service.ts` | 知识库查询服务 |
| `src/db/schema.ts` | Drizzle 3 表定义 |
| `src/api/routes/execution.ts` | 异步执行 API |
| `src/api/routes/test-cases.ts` | 测试用例 CRUD + 翻译/拆解 |
| `src/shared/llm-prompts.ts` | 翻译/拆解系统提示词 |
| `web/src/hooks/useExecutionProgress.ts` | 前端轮询 hook |
| `web/src/pages/ExecutionPage.tsx` | 3 阶段执行 UI |
