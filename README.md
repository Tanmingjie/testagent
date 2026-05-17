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

# 4. （可选）编辑知识库，填入被测产品的术语
#    编辑 knowledge/demo-product.json

# 5. 启动
bun run dev
# 后端 http://localhost:3001  |  前端 http://localhost:5173
```

## 使用流程

```
1. 打开 http://localhost:5173 → 上传 Excel/Markdown 测试用例
2. 点击"翻译"→ AI 标准化用例术语
3. 点击"拆解"→ AI 将复合步骤分解为原子操作
4. 点击"执行"→ AI 驱动 Playwright 浏览器自动测试
5. 查看报告 → 截图 + 失败分析(Fix Prompt) + Python 代码
6. 复制/下载 Python 代码，可直接在项目中复用
```

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
├── shared/       类型定义、LLM 客户端、常量
├── parser/       Excel (.xlsx) + Markdown (.md) 解析
├── translator/   LLM 翻译 + 步骤拆解服务
├── knowledge/    知识库加载 + 术语匹配
├── executor/     🔴 核心：页面分析 → CLI执行 → Python代码生成
├── api/          REST API (Hono) + 路由 + 中间件
└── db/           Drizzle schema + SQLite

web/              React 前端 (5 个页面)
├── pages/        Import | Cases | Knowledge | Execution | Report
├── components/   StatusBadge | FixPromptPanel | CodePreviewPanel
└── hooks/        useExecutionProgress (轮询)

data/             SQLite .db + 截图 + 生成的 .py 文件
knowledge/        知识库 JSON 文件
```

## 核心架构

```
Excel/MD → parse → translate → decompose → pageAnalyze
                                                ↓
                              execute via playwright-cli
                              LLM每步产出: cliCommand + pythonCode
                                                ↓
                              report + FixPrompt + .py
```

关键设计：
- **LLM 一次调用同步产出两个输出**：`cliCommand`（立即执行）+ `pythonCode`（最终交付），零额外 token
- **页面分析预匹配**：执行前分析页面结构 + 知识库术语匹配，每步省 50-70% token
- **生成代码即交付物**：用户获得可独立运行的 Playwright Python 脚本

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
| `LLM_API_URL` | OpenAI 兼容 API 地址 (如 `http://localhost:11434/v1`) |
| `LLM_API_KEY` | API 密钥 |
| `LLM_MODEL_NAME` | 模型名称 (如 `deepseek-chat` 或 `qwen2.5-72b`) |
| `PORT` | 后端端口 (默认 3001) |
| `DB_PATH` | SQLite 数据库路径 (默认 `./data/testagent.db`) |
