import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestCase, TestStep, PageSummary, Interaction, StepResult } from '@shared/types';
import type { LlmClient } from '@shared/llm-client';
import type { ExecutionContext, CliCommands, LLMCodeGenOutput } from './types';
import { analyzePage } from './page-analyzer';
import { CliSession } from './cli-session';
import { execCli } from './cli-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEPROMPT_PATH = resolve(__dirname, 'codegen-prompt.md');
const SCREENSHOT_DIR = resolve(__dirname, '../../data/screenshots');

export async function executeStep(
  step: TestStep,
  context: ExecutionContext,
  pageSummary: PageSummary,
  interactionLog: Interaction[],
): Promise<{ result: StepResult; interaction: Interaction }> {
  const { llm, cli } = context;
  const { actionText, expectedText, order } = step;

  const doAttempt = async (retryError?: string): Promise<{ result: StepResult; interaction: Interaction }> => {
    const prompt = buildCodeGenPrompt(pageSummary, actionText, expectedText, interactionLog, context.knowledgeContent, retryError);
    const llmOutput = await callLlmForCodegen(llm, prompt);

    let cliOk = false;
    let error: string | undefined;
    let pythonCode = llmOutput.pythonCode;

    if (llmOutput.cliCommand) {
      const cliResult = await executeCliAction(cli, llmOutput.cliCommand);
      cliOk = cliResult.success;
      error = cliResult.error;

      if (cliOk && expectedText) {
        const verifyResult = await verifyAfterAction(cli, expectedText, llmOutput.cliCommand);
        if (!verifyResult.verified) {
          cliOk = false;
          error = verifyResult.error;
        }
      }
    } else {
      error = 'LLM did not produce a cliCommand';
    }

    const screenshotPath = await captureScreenshot(cli, order);

    const status = cliOk ? 'PASS' : classifyFailure(error || '');

    const interaction: Interaction = {
      stepOrder: order,
      pythonCode,
      cliCommand: llmOutput.cliCommand,
      targetElement: llmOutput.targetElement,
      passed: cliOk,
      error: cliOk ? undefined : error,
      screenshotPath,
    };

    const result: StepResult = {
      stepOrder: order,
      status,
      screenshotPath: cliOk ? screenshotPath : undefined,
      error: cliOk ? undefined : error,
      pythonCode,
    };

    return { result, interaction };
  };

  const first = await doAttempt();
  if (first.result.status === 'PASS' || first.result.status === 'BLOCK') {
    return first;
  }

  return doAttempt(first.interaction.error);
}

export async function executeTestCase(
  testCase: TestCase,
  productLine: string,
  baseUrl: string,
  knowledgeContent: string,
  llm: LlmClient,
  cli: CliCommands,
): Promise<{ results: StepResult[]; interactionLog: Interaction[] }> {
  const session = await CliSession.open(baseUrl);
  if (!session.success) {
    throw new Error(`Failed to open browser session: ${session.error}`);
  }

  await cli.resize(1920, 1080);

  const dimsResult = await cli.evalPage('() => ({ w: Math.max(document.body.scrollWidth, 1920), h: Math.max(document.body.scrollHeight, 1080) })');
  try {
    const dims = JSON.parse(dimsResult.stdout) as { w: number; h: number };
    if (dims.w > 1920 || dims.h > 1080) {
      await cli.resize(Math.min(dims.w, 2560), Math.min(dims.h, 4096));
    }
  } catch {}

  const results: StepResult[] = [];
  const interactionLog: Interaction[] = [];

  try {
    const pageSummary = await analyzePage(cli.navigate, baseUrl);
    const context: ExecutionContext = { cli, llm, productLine, baseUrl, knowledgeContent, testCase };

    for (const step of testCase.steps) {
      const { result, interaction } = await executeStep(step, context, pageSummary, interactionLog);
      results.push(result);
      interactionLog.push(interaction);
    }
  } finally {
    await CliSession.close();
  }

  return { results, interactionLog };
}

const BLOCK_PATTERNS = [
  'timeout', 'TimeoutError', 'ERR_CONNECTION',
  'captcha', 'CAPTCHA', 'security verification',
  '网络不给力', '百度安全验证',
];

export function classifyFailure(error: string): 'FAIL' | 'BLOCK' {
  return BLOCK_PATTERNS.some((p) => error?.includes(p)) ? 'BLOCK' : 'FAIL';
}

const SYSTEM_PROMPT = readFileSync(CODEPROMPT_PATH, 'utf-8');

function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

function buildUserPrompt(
  pageSummary: PageSummary,
  actionText: string,
  expectedText: string,
  interactionLog: Interaction[],
  knowledgeContent: string,
  retryError?: string,
): string {
  const lines: string[] = [];

  if (knowledgeContent) {
    lines.push('## 产品知识库');
    lines.push(knowledgeContent);
    lines.push('');
  }

  lines.push('## 页面摘要');
  lines.push(`URL: ${pageSummary.url}`);
  lines.push(`标题: ${pageSummary.title}`);
  lines.push('');
  lines.push('### 可交互元素');
  for (const el of pageSummary.elements) {
    const matchInfo = el.matchedTerm ? ` (匹配术语: ${el.matchedTerm})` : '';
    lines.push(`- ${el.ref}: ${el.role} "${el.name}"${matchInfo}`);
  }
  lines.push('');

  if (pageSummary.matchedTerms.length > 0) {
    lines.push('### 匹配的知识库术语');
    for (const mt of pageSummary.matchedTerms) {
      lines.push(`- ${mt.term} → ${mt.locator} (元素: ${mt.elementRef})`);
    }
    lines.push('');
  }

  lines.push('## 当前步骤');
  lines.push(`操作: ${actionText}`);
  lines.push(`预期结果: ${expectedText}`);
  lines.push('');

  if (interactionLog.length > 0) {
    lines.push('## 之前的交互记录');
    for (const ix of interactionLog) {
      const status = ix.passed ? '✅' : '❌';
      lines.push(`- [步骤 ${ix.stepOrder}] ${status} CLI: ${ix.cliCommand}`);
      if (ix.error) lines.push(`  错误: ${ix.error}`);
    }
    lines.push('');
  }

  if (retryError) {
    lines.push('## 上次执行失败');
    lines.push(`错误信息: ${retryError}`);
    lines.push('请根据错误信息生成不同的命令重试。');
    lines.push('');
  }

  return lines.join('\n');
}

async function callLlmForCodegen(
  llm: LlmClient,
  prompt: string,
): Promise<LLMCodeGenOutput> {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: prompt },
  ];

  const response = await llm.chatCompletion(messages, {
    responseFormat: { type: 'json_object' },
  });

  return parseLLMResponse(response.content);
}

function buildCodeGenPrompt(
  pageSummary: PageSummary,
  actionText: string,
  expectedText: string,
  interactionLog: Interaction[],
  knowledgeContent: string,
  retryError?: string,
): string {
  return buildUserPrompt(pageSummary, actionText, expectedText, interactionLog, knowledgeContent, retryError);
}

function parseLLMResponse(content: string): LLMCodeGenOutput {
  let json = content.trim();
  const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    json = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;

    return {
      cliCommand: typeof parsed.cliCommand === 'string' ? parsed.cliCommand : '',
      pythonCode: typeof parsed.pythonCode === 'string' ? parsed.pythonCode : '',
      targetElement: parsed.targetElement
        ? {
            ref: String((parsed.targetElement as Record<string, unknown>).ref || ''),
            role: String((parsed.targetElement as Record<string, unknown>).role || ''),
            name: String((parsed.targetElement as Record<string, unknown>).name || ''),
            matchedTerm: (parsed.targetElement as Record<string, unknown>).matchedTerm as string | undefined,
            pythonLocator: (parsed.targetElement as Record<string, unknown>).pythonLocator as string | undefined,
          }
        : undefined,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return {
      cliCommand: '',
      pythonCode: `# Failed to parse LLM response:\n# ${json.slice(0, 200)}`,
      reasoning: 'Failed to parse LLM JSON output',
    };
  }
}

interface CliActionResult {
  success: boolean;
  error?: string;
}

async function executeCliAction(cli: CliCommands, cliCommand: string): Promise<CliActionResult> {
  const parts = parseCliCommand(cliCommand);
  if (!parts) {
    return { success: false, error: `Unable to parse cliCommand: "${cliCommand}"` };
  }

  const { action, args } = parts;

  try {
    let result: { success: boolean; stdout: string; stderr: string };

    switch (action) {
      case 'click':
        result = await cli.click(args[0]);
        break;
      case 'fill':
        result = await cli.fill(args[0], args.slice(1).join(' '));
        break;
      case 'type':
        result = await cli.type(args.join(' '));
        break;
      case 'navigate':
      case 'goto':
        result = await cli.navigate(args.join(' '));
        break;
      case 'press':
        result = await cli.press(args[0]);
        break;
      case 'screenshot':
        result = await cli.screenshot(args[0]);
        break;
      default:
        return { success: false, error: `Unknown CLI action: "${action}"` };
    }

    return {
      success: result.success,
      error: result.success ? undefined : result.stderr || 'Command failed',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

function parseCliCommand(cmd: string): { action: string; args: string[] } | null {
  if (!cmd || !cmd.trim()) return null;

  const parts = cmd.trim().split(/\s+/);
  const action = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (!action) return null;

  return { action, args };
}

const VERIFY_ERROR_PATTERNS = [
  '页面不存在', '系统错误', '服务器错误', '网络不给力', '访问出错',
  '404', 'Not Found', 'Internal Server Error',
  '验证码', '安全验证', 'captcha',
  '登录失败', '用户名或密码错误', '账号或密码错误',
];

async function verifyAfterAction(
  cli: CliCommands,
  expectedText: string,
  command: string,
): Promise<{ verified: boolean; error?: string }> {
  const snapshotResult = execCli(['--raw', 'snapshot']);
  const pageText = (snapshotResult.stdout || snapshotResult.stderr || '').toLowerCase();

  for (const pattern of VERIFY_ERROR_PATTERNS) {
    if (pageText.includes(pattern.toLowerCase())) {
      return { verified: false, error: `页面检测到异常: ${pattern}` };
    }
  }

  const cmdName = command.split(/\s+/)[0]?.toLowerCase();
  if (cmdName === 'navigate' || cmdName === 'goto') {
    const urlResult = execCli(['eval', '() => location.href']);
    if (urlResult.success) {
      const url = urlResult.stdout.trim();
      const targetUrl = command.split(/\s+/).slice(1).join(' ');
      if (targetUrl && url === targetUrl && pageText.length < 100) {
        return { verified: false, error: `导航到 ${targetUrl} 后页面内容为空，可能加载失败` };
      }
    }
  }

  return { verified: true };
}

async function captureScreenshot(cli: CliCommands, stepOrder: number): Promise<string | undefined> {
  const timestamp = Date.now();
  const filename = `step-${stepOrder}-${timestamp}.png`;
  const filePath = `${SCREENSHOT_DIR}/${filename}`;
  const result = await cli.screenshot(filePath).catch(() => ({ success: false, stdout: '', stderr: '' }));
  if (result.success) {
    return filePath;
  }
  return undefined;
}
