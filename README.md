# TestAgent

AI 驱动的端到端测试平台。从 Excel 文本用例 → AI 翻译拆解 → 浏览器自动执行 → 输出 Python 代码 + 测试报告。

## 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 LLM API 地址和模型名

# 3. 安装浏览器 + 创建数据库
npx playwright-cli install-browser chromium
bun run db:migrate

# 4. （可选）配置产品知识库
#    参考 knowledge/template.md 创建 <产品名>.md

# 5. 启动
bun run dev
# 后端 http://localhost:3001  |  前端 http://localhost:5173
```

## 使用流程

```
1. 在知识库目录下创建产品 MD 文档（参考 knowledge/template.md）
2. 打开 http://localhost:5173 → 选择产品线 → 上传 Excel/Markdown 测试用例
3. 用例管理页 → 点击"执行" → 进入执行页
4. 执行页选择"一键执行"（翻译→拆解→执行自动串联）或"分步执行"
5. 查看执行历史 → 截图 + Python 代码 + 修复建议
```

## 页面导航

| 页签 | 功能 |
|------|------|
| 导入用例 | 选择产品线，上传 Excel/MD 文件 |
| 用例管理 | 树状查看用例，点击展开步骤，执行/删除用例 |
| 执行测试 | 3 阶段工作流（翻译→拆解→执行），一键/分步两种模式 |
| 执行历史 | 历史记录列表，点击查看详情（步骤截图+Python代码+修复建议） |

## 技术栈

| 层 | 技术 |
|:--|:--|
| 后端 | TypeScript + Bun + Hono |
| 数据库 | SQLite (Drizzle ORM, 3 张表) |
| 前端 | React + Vite + Tailwind CSS |
| 浏览器驱动 | Playwright CLI |
| AI | OpenAI 兼容 API（私有部署） |

## 项目结构

```
src/
├── shared/       类型定义、LLM 客户端、提示词
├── parser/       Excel (.xlsx) + Markdown (.md) 解析
├── translator/   LLM 翻译 + 步骤拆解服务
├── knowledge/    MD 知识库加载（frontmatter: name + baseUrl）
├── executor/     🔴 核心：页面快照分析 → CLI 执行 → Python 代码生成
├── api/          REST API (Hono) — 异步执行 + 轮询
└── db/           Drizzle schema + SQLite

web/              React 前端
├── pages/        Import | Cases | Execution | ExecutionHistory
├── components/   StatusBadge | FixPromptPanel | CodePreviewPanel
└── hooks/        useExecutionProgress (轮询)

data/             SQLite .db + 截图
knowledge/        产品知识库 MD 文件
```

## 核心架构

```
Excel/MD → parse → translate → decompose
                                    ↓
CLI open <baseUrl> → resize(全页) → scroll(懒加载) → snapshot(含boxes)
                                    ↓
                for each step:
                  LLM 阅读 快照元素 + 知识库MD → 输出 cliCommand + pythonCode
                  playwrigt-cli <cliCommand> → 截图 → 验证
                                    ↓
                pythonCode 聚合 → 完整 .py + FixPrompt
```

关键设计：
- **真实 Playwright ref**：直接使用快照中的 ref ID，确保 CLI 命令可执行
- **知识库 MD 注入**：产品知识全文注入 LLM 提示词，替代机械术语匹配
- **异步执行**：POST /run 立即返回 runId，后台执行 + 前端轮询
- **全页快照**：`snapshot --boxes` 获取元素坐标，`screenshot --full-page` 捕获完整页面
- **智能视口**：`eval` 获取内容尺寸 → 动态 `resize` 匹配，确保全景可见

## Scripts

| Command | Description |
|:--|:--|
| `bun run dev` | 启动后端 + 前端 |
| `bun run build` | 编译 TypeScript |
| `bun test` | 运行测试 |
| `bun run db:migrate` | 创建数据库表 |

## 环境变量

| 变量 | 说明 |
|:--|:--|
| `LLM_API_URL` | OpenAI 兼容 API 地址 (如 `https://api.deepseek.com/v1`) |
| `LLM_API_KEY` | API 密钥 |
| `LLM_MODEL_NAME` | 模型名称 (如 `deepseek-chat`) |
| `PORT` | 后端端口 (默认 3001) |
| `DB_PATH` | SQLite 数据库路径 (默认 `./data/testagent.db`) |
| `HEADED` | 设为 `true` 显示浏览器窗口，`false` 为无头模式 |
