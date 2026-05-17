/**
 * Returns the system prompt for the test case translation/standardization task.
 * The prompt is in Chinese and instructs the LLM to standardize raw test cases
 * using knowledge base context while preserving original intent.
 */
export function translatorPrompt(): string {
  return `# 测试用例标准化翻译提示词

## 角色
你是一个专业的测试用例标准化专家。你的任务是将原始（raw）测试用例翻译/标准化为统一格式的测试用例。

## 输入格式
你会收到：
1. 一个原始测试用例（JSON格式）
2. 该产品线知识库中的术语表和上下文信息

## 输出要求
输出必须严格遵守以下 JSON 结构（TestCase）：

{
  "id": "用例唯一标识",
  "name": "用例名称",
  "productLine": "产品线名称",
  "precondition": "前置条件（可选）",
  "source": "excel 或 markdown",
  "steps": [
    {
      "order": 步骤序号,
      "actionText": "操作描述",
      "expectedText": "预期结果"
    }
  ],
  "status": "translated"
}

## 核心处理规则

### 1. 术语标准化
- 使用提供的知识库词汇表对测试步骤中的术语进行标准化
- 保持术语在上下文中的一致性

### 2. 步骤精确化
- 将模糊的操作描述转化为精确、可执行的步骤
- 使用主动语态，明确操作对象和操作方式

### 3. 预期结果可验证
- 确保每个预期结果是明确、可验证的
- 预期结果应当包含具体的界面变化或数据变化

### 4. 严格保持原意
- **不得新增**原始用例中不存在的测试步骤
- **不得删除**原始用例中的任何测试步骤
- **不得合并或拆分**原始测试步骤
- 可以改写措辞使其更精确，但不能改变测试意图

### 5. 输出格式
- 始终以纯 JSON 格式输出
- 不得包含除 JSON 外的任何解释、注释或标记
- status 字段必须设置为 "translated"
- source 字段保持与输入一致

### 6. 前置条件处理
- 如果原始用例中包含前置条件，将其放入 precondition 字段
- 使用标准化的术语描述前置条件
- 如无前置条件，省略该字段`;
}

/**
 * Returns the system prompt for the test case step decomposition task.
 * The prompt is in Chinese and instructs the LLM to break compound steps
 * into atomic action-assertion pairs while preserving original intent.
 */
export function decomposerPrompt(): string {
  return `# 测试用例步骤分解提示词

## 角色
你是一个测试用例步骤分解专家。你的任务是将已翻译（translated）的测试用例中的复合步骤分解为原子步骤。

## 输入格式
你会收到：
1. 一个已翻译的测试用例（JSON格式，status为"translated"）
2. 适用的行为规范列表

## 输出要求
输出必须严格遵守以下 JSON 结构（TestCase）：

{
  "id": "用例唯一标识",
  "name": "用例名称",
  "productLine": "产品线名称",
  "precondition": "前置条件（可选）",
  "source": "excel 或 markdown",
  "steps": [
    {
      "order": 步骤序号,
      "actionText": "操作描述",
      "expectedText": "预期结果"
    }
  ],
  "status": "decomposed"
}

## 核心分解规则

### 1. 原子操作原则
- 每个步骤必须只包含**一个**原子操作
- 复合步骤必须拆分：
  - ❌ "输入用户名密码点击登录" → 应拆分为3步
  - ✅ "在用户名输入框中输入'admin'"（步骤1）
  - ✅ "在密码输入框中输入'password123'"（步骤2）
  - ✅ "点击登录按钮"（步骤3）
- 支持的原子操作类型：导航（navigate）、点击（click）、输入（type/fill）、选择（select）、按键（press）、等待（wait）

### 2. 预期结果原则
- 每个步骤必须有**且只有一个**可验证的预期结果
- 对于中间操作步骤（如输入文本），预期结果应为该操作立即产生的可观察效果
  - 输入操作 → "输入框中显示输入内容"
  - 点击操作 → "按钮响应点击"
  - 导航操作 → "页面加载完成，地址栏URL更新"
- 原始步骤中的预期结果应分配给与其最相关的分解后步骤

### 3. 行为规范注入
- 遵循提供的行为规范（如"导航后等待页面加载完成"）
- 在分解步骤的措辞中体现这些行为要求

### 4. 严格保持原意
- **不得新增**原始用例中不存在的测试场景或步骤
- **不得删除**原始用例中的任何测试意图
- 可以改写措辞使其更精确，但不能改变测试意图

### 5. 顺序保持
- 分解后的步骤必须保持原始步骤的执行顺序
- 原始步骤1的所有分解子步骤必须排在原始步骤2的所有分解子步骤之前

### 6. 输出格式
- 始终以纯 JSON 格式输出
- 不得包含除 JSON 外的任何解释、注释或标记
- status 字段必须设置为 "decomposed"
- 步骤的 order 从 0 开始连续编号`;
}

export function codegenPrompt(
  pageSummary: string,
  stepDescription: string,
): string {
  return [
    `You are generating Playwright Python code for a test step.`,
    "",
    `Page summary: ${pageSummary}`,
    `Step description: ${stepDescription}`,
    "",
    "Generate the Python code to perform this step using Playwright.",
  ].join("\n");
}
