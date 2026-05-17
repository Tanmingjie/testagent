# TestAgent 开发驾驶舱 — AI Agent 必读

> ⚠️ 每次开发会话开始时先读这个文件，再读 `plans/testagent.md` 的具体任务描述。
> 开发结束时更新底部的「进展记录」。

---

## 一、我们在做什么

从 Excel/Markdown 文本用例 → LLM 翻译拆解 → Playwright CLI 执行 → 输出 Python 代码 + Web UI 报告。

核心价值：**LLM 每次调用同步产出「CLI 命令（执行）+ Python 代码（交付）」，零额外 token。**

---

## 二、关键架构决策（不可偏离）

| 决策 | 内容 | 禁止 |
|:--|:--|:--|
| 执行引擎 | `playwright-cli`（bash 命令驱动浏览器） | 不用 `@playwright/mcp` |
| 代码输出 | **Playwright Python**（`from playwright.sync_api import Page, expect`） | 不输出 TypeScript/.spec.ts |
| LLM | OpenAI 兼容 API（私有部署，数据不出内网） | 不依赖云端模型 |
| 用例输入 | Excel (.xlsx) 优先，中文表头 | 不做 PRD→自动生成 |
| DB | SQLite **3 张表**，JSON 列替代规范化 | 不展开 10 张表 |
| 知识库 | YAML 文件（`knowledge/` 目录），DB 只缓存 | 不做 Web 管理页的实时同步复杂性 |
| 通信 | REST API + 轮询 | 不做 WebSocket |
| 失败分类 | 关键词匹配（FAIL / BLOCK） | 不做 LLM 分类 |
| 语言 | TypeScript 全栈 | 不混用 Python 做后端 |

---

## 三、执行流程速览

```
Excel/MD → parse(T8) → translate(T9) → decompose(T10) → pageAnalyze(E2)
                                                              ↓
                                          execute via playwright-cli (E2)
                                          LLM每步产出: cliCommand + pythonCode
                                                              ↓
                                          report + FixPrompt + .py (E3)
                                                              ↓
                                          Web UI 5 pages (T21-T25)
```

---

## 四、文件结构（建成后）

```
src/
├── shared/              types, llm-client, constants
├── parser/              excel-parser, markdown-parser
├── translator/          translate-service, decompose-service, pipeline
├── knowledge/           schema, loader, knowledge-service
├── executor/
│   ├── cli-runner.ts         T5: CLI 命令执行
│   ├── cli-session.ts        E1: 浏览器会话
│   ├── cli-commands.ts       E1: 高层操作
│   ├── page-analyzer.ts      E2: 页面分析+术语匹配
│   ├── step-executor.ts      E2: AI执行循环 ← 核心
│   ├── python-code-generator.ts  E2: 从interactionLog生成.py
│   ├── types.ts              E2: 类型
│   ├── codegen-prompt.md     E2: LLM prompt
│   ├── report-builder.ts     E3: 报告+fixPrompt
│   └── index.ts              E3: 编排入口
├── api/
│   ├── contracts/       API 类型定义
│   ├── routes/          test-cases, knowledge, execution, health
│   └── server.ts        Hono 启动
├── db/                  schema + migrate + drizzle
└── integration/         e2e test

web/
├── src/
│   ├── pages/           Import, Cases, Knowledge, Execution, Report
│   ├── components/      ScreenshotGallery, StatusBadge, FixPromptPanel, CodePreviewPanel...
│   ├── hooks/           useExecutionProgress (polling)
│   └── lib/             api client

data/                    SQLite .db + screenshots + generated .py
knowledge/               YAML 知识库文件
```

---

## 五、执行顺序

```
Wave 1（基础，7 tasks 并行）:
  T1 脚手架 → T2 DB schema → T3 类型 → T4 LLM客户端 → T5 CLI集成 → T6 KB schema → T7 API合约

Wave 2（输入+翻译+Web起步）:
  T8 解析器 → T9 翻译 → T10 拆解 → T11 KB服务 → T12 用例API → T13 KB+执行API → T14 Web脚手架

Wave 3（执行引擎，顺序依赖）:
  E1 CLI封装 → E2 🔴核心执行循环 → E3 编排+报告

Wave 4（Web页面，可并行）:
  T21 导入+树 → T22 KB管理 → T23 执行+轮询 → T24 报告+rerun → T25 E2E集成

Final（验证）:
  F1-F4 并行审查
```

**关键路径**: T1 → T5 → E2 → E3 → T23 → T25 → F1-F4

---

## 六、禁止清单

- ❌ 不引入 `@playwright/mcp`
- ❌ 不输出 TypeScript 代码
- ❌ 不用 CSS/XPath 选择器 → 只用 `get_by_role/get_by_placeholder/get_by_text`
- ❌ 不创建 WebSocket
- ❌ 不引入 DI 框架、插件架构、过早抽象
- ❌ 不创建独立 exporter 目录
- ❌ 不建立 10 张表的规范化 schema
- ❌ 不做 API 测试、移动端测试、用例自动生成

---

## 七、进展记录

> 每次开发会话结束时更新下面内容，记录：完成的任务、遇到的关键问题、下一步计划。

### Session 1 — 2026-05-17

| 项目 | 内容 |
|:--|:--|
| **日期** | 2026-05-17 |
| **完成任务** | 全部 22 个实现任务 (T1-T14, E1-E3, T21-T25)，4 个 Wave 全部完成 |
| **关键决策/变更** | (1) DB 10表→3表简化 (2) MCP→CLI 切换 (3) Python 代码由 LLM 同步产出 (4) 知识库 YAML→JSON (5) bun:sqlite 替代 better-sqlite3 |
| **遇到问题** | T4 首次派发中断需重试；T14 skill 名称问题需重试；better-sqlite3 与 bun 不兼容改 bun:sqlite |
| **下一步** | F1-F4 最终验证通过。发现并修复: app.ts 未挂载 test-cases 路由。全部完成。 |

---

### Session 2 — (待填写)

| 项目 | 内容 |
|:--|:--|
| **日期** | |
| **完成任务** | |
| **关键决策/变更** | |
| **遇到问题** | |
| **下一步** | |

---

### Session 3 — (待填写)

| 项目 | 内容 |
|:--|:--|
| **日期** | |
| **完成任务** | |
| **关键决策/变更** | |
| **遇到问题** | |
| **下一步** | |
