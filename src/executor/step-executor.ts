import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestCase, TestStep, PageSummary, Interaction, StepResult } from '@shared/types';
import type { LlmClient } from '@shared/llm-client';
import type { ExecutionContext, CliCommands, LLMCodeGenOutput } from './types';
import { analyzePage, parseAccessibilityTree } from './page-analyzer';
import { CliSession } from './cli-session';
import { execCli } from './cli-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEPROMPT_PATH = resolve(__dirname, 'codegen-prompt.md');
const SELFHEAL_PROMPT_PATH = resolve(__dirname, 'selfheal-prompt.md');
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
    console.log(`[CODEGEN] step=${order} cmd="${llmOutput.cliCommand}" target=${llmOutput.targetElement?.ref || '-'} reasoning="${llmOutput.reasoning?.slice(0, 80)}"`);

    let cliOk = false;
    let error: string | undefined;
    let pythonCode = llmOutput.pythonCode;

    if (llmOutput.cliCommand) {
      const mismatch = validateCommandMatchesAction(llmOutput.cliCommand, actionText);
      if (mismatch) {
        cliOk = false;
        error = mismatch;
      } else {
        const cliResult = await executeCliAction(cli, llmOutput.cliCommand);
        cliOk = cliResult.success;
        error = cliResult.error;
      }

      if (cliOk) {
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

  const healed = await attemptSelfHeal(first, step, context, pageSummary, interactionLog);
  if (healed) return healed;

  return first;
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
    let pageSummary = await analyzePage(cli.navigate, baseUrl);
    const context: ExecutionContext = { cli, llm, productLine, baseUrl, knowledgeContent, testCase };

    for (const step of testCase.steps) {
      const { result, interaction } = await executeStep(step, context, pageSummary, interactionLog);
      results.push(result);
      interactionLog.push(interaction);

      const isAssertStep = step.actionText.includes('验证') || step.actionText.includes('断言') || step.actionText.includes('检查');

      if (!isAssertStep) {
        await new Promise((r) => setTimeout(r, 500));

        const tabsResult = execCli(['tabs']);
        if (tabsResult.success && tabsResult.stdout.match(/^\s*-\s*1:/m)) {
          execCli(['tabs', 'select', '1']);
          await new Promise((r) => setTimeout(r, 1500));
        }

        const fresh = execCli(['--raw', 'snapshot', '--boxes']);
        const raw = fresh.stdout || fresh.stderr || '';
        const elements = parseAccessibilityTree(raw);
        console.log(`[SNAPSHOT] step=${step.order} success=${fresh.success} rawLen=${raw.length} elements=${elements.length}`);
        const urlOutput = execCli(['eval', '() => location.href']);
        pageSummary = {
          url: urlOutput.success ? (urlOutput.stdout.match(/["']?(https?:\/\/[^\s"']+)["']?/)?.[1] || '') : '',
          title: raw.match(/(?:title|name)\s*:\s*[""](.+?)[""]/i)?.[1] || '',
          elements,
          matchedTerms: [],
        };
      }
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

function fuzzyCjkMatch(expected: string, pageText: string): boolean {
  const chars = [...expected].filter((c) => c.trim());
  if (chars.length < 2) return false;
  const hitCount = chars.filter((c) => pageText.includes(c)).length;
  const ratio = hitCount / chars.length;
  if (ratio >= 0.6) {
    console.log(`[ASSERT-FUZZY] "${expected}" matched ${hitCount}/${chars.length} chars (${(ratio * 100).toFixed(0)}%)`);
    return true;
  }
  return false;
}

const SYSTEM_PROMPT = readFileSync(CODEPROMPT_PATH, 'utf-8');
const SELFHEAL_SYSTEM_PROMPT = readFileSync(SELFHEAL_PROMPT_PATH, 'utf-8');

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
  console.log(`[CODEGEN-PROMPT] url="${pageSummary.url}" title="${pageSummary.title}" elements=${pageSummary.elements.length}`);
  lines.push('');
  lines.push('### 可交互元素');
  const ELEMENT_PRIORITY: Record<string, number> = {
    button: 5, textbox: 5, link: 4, menuitem: 4,
    combobox: 3, listbox: 3, searchbox: 3, checkbox: 3, radio: 3,
    tab: 2, option: 2, switch: 2, slider: 2, spinbutton: 2,
    generic: 0, img: 0, heading: 0, paragraph: 0,
  };
  const sorted = [...pageSummary.elements].sort((a, b) => {
    const aScore = (a.name ? 3 : 0) + (ELEMENT_PRIORITY[a.role] ?? 0);
    const bScore = (b.name ? 3 : 0) + (ELEMENT_PRIORITY[b.role] ?? 0);
    return bScore - aScore;
  });
  const MAX_ELEMENTS = 40;
  const shown = sorted.slice(0, MAX_ELEMENTS);
  for (const el of shown) {
    const matchInfo = el.matchedTerm ? ` (匹配术语: ${el.matchedTerm})` : '';
    lines.push(`- ${el.ref}: ${el.role} "${el.name}"${matchInfo}`);
  }
  if (sorted.length > MAX_ELEMENTS) {
    lines.push(`- ... (共 ${sorted.length} 个元素，按优先级排序，仅显示前 ${MAX_ELEMENTS})`);
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
      case 'run-code':
        result = await execCli(['run-code', args.join(' ')]);
        break;
      case 'assert':
        {
          const text = args.join(' ');
          const lower = text.toLowerCase();

          const snap = execCli(['--raw', 'snapshot']);
          const pageContent = (snap.stdout || '').toLowerCase();
          let found = pageContent.includes(lower);

          if (!found) {
            const bodyEval = execCli(['eval', '() => document.body.innerText']);
            const bodyText = (bodyEval.stdout || '').toLowerCase();
            found = bodyText.includes(lower) || fuzzyCjkMatch(lower, bodyText);
          }

          result = { success: found, stdout: found ? `"${text}" found on page` : '', stderr: found ? '' : `"${text}" not found on page` };
        }
        break;
      case 'expect':
        return { success: false, error: '"expect" 是 Python 断言 API。如需验证页面内容，请使用 assert <文本> 命令。' };
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
  'Not Found', 'Internal Server Error',
  '验证码', '安全验证', 'captcha',
  '登录失败', '用户名或密码错误', '账号或密码错误',
];

async function verifyAfterAction(
  cli: CliCommands,
  expectedText: string,
  command: string,
): Promise<{ verified: boolean; error?: string }> {
  const snapshotResult = execCli(['--raw', 'snapshot', '--boxes']);
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

const MISM = '命令类型与步骤不符，请重新生成';

function validateCommandMatchesAction(command: string, actionText: string): string | null {
  const cmdAction = command.split(/\s+/)[0]?.toLowerCase();
  const text = actionText.toLowerCase();

  // run-code 动作类型在 JS 代码中表达（.click()/.fill()），校验器不做二级分析
  if (cmdAction === 'run-code') return null;

  // 等待/检查步骤不做动作类型限制
  if (text.includes('等待') || text.includes('确认') || text.includes('确保')) {
    return null;
  }

  if (text.includes('输入') || text.includes('键入') || text.includes('填写')) {
    return (cmdAction === 'fill' || cmdAction === 'type') ? null : `${MISM}: 步骤需要fill/type，但LLM生成了${cmdAction}`;
  }
  if (text.includes('点击') || text.includes('单击')) {
    return cmdAction === 'click' ? null : `${MISM}: 步骤需要click，但LLM生成了${cmdAction}`;
  }
  if (text.includes('验证') || text.includes('检查') || text.includes('断言') || text.includes('预期')) {
    return cmdAction === 'assert' ? null : `${MISM}: 步骤需要assert（验证页面内容），但LLM生成了${cmdAction}`;
  }
  if (text.includes('打开') || text.includes('导航') || text.includes('访问')) {
    return (cmdAction === 'navigate' || cmdAction === 'goto' || cmdAction === 'click') ? null : `${MISM}: 步骤需要navigate/click，但LLM生成了${cmdAction}`;
  }

  return null;
}

function pageSummaryFromSnapshot(raw: string): PageSummary {
  const urlResult = execCli(['eval', '() => location.href']);
  const urlMatch = urlResult.success ? urlResult.stdout.match(/["']?(https?:\/\/[^\s"']+)["']?/) : null;
  return {
    url: urlMatch?.[1] || '',
    title: raw.match(/(?:title|name)\s*:\s*[""](.+?)[""]/i)?.[1] || '',
    elements: parseAccessibilityTree(raw),
    matchedTerms: [],
  };
}

async function attemptSelfHeal(
  failed: { result: StepResult; interaction: Interaction },
  step: TestStep,
  context: ExecutionContext,
  pageSummary: PageSummary,
  interactionLog: Interaction[],
): Promise<{ result: StepResult; interaction: Interaction } | null> {
  console.log(`[SELFHEAL] step=${step.order} origCmd="${failed.interaction.cliCommand}" error="${failed.interaction.error}"`);

  const origCmd = failed.interaction.cliCommand?.trim();
  const isAssertFailure = origCmd?.startsWith('assert') && failed.interaction.error?.includes('not found on page');

  if (isAssertFailure) {
    const assertText = origCmd!.split(/\s+/).slice(1).join(' ');
    console.log(`[SELFHEAL] assert retry with delay + innerText fallback, text="${assertText}"`);
    await new Promise((r) => setTimeout(r, 1500));

    const lower = assertText.toLowerCase();
    const bodyEval = execCli(['eval', '() => document.body.innerText']);
    const bodyText = (bodyEval.stdout || '').toLowerCase();
    let found = bodyText.includes(lower);
    if (!found) found = fuzzyCjkMatch(lower, bodyText);

    const screenshotPath = await captureScreenshot(context.cli, step.order);
    if (found) {
      return {
        result: { stepOrder: step.order, status: 'PASS', screenshotPath, pythonCode: failed.interaction.pythonCode },
        interaction: { ...failed.interaction, passed: true, error: undefined, screenshotPath },
      };
    }
    console.log(`[SELFHEAL] assert text still not found in innerText, giving up`);
    return null;
  }

  try {
    if (!origCmd) {
      const freshSnapshot = execCli(['--raw', 'snapshot', '--boxes']);
      const freshSummary = pageSummaryFromSnapshot(freshSnapshot.stdout || freshSnapshot.stderr || '');
      console.log(`[SELFHEAL] empty origCmd, regenerating on current page: ${freshSummary.elements.length} elements, URL="${freshSummary.url}"`);
      const regenPrompt = buildCodeGenPrompt(freshSummary, step.actionText, step.expectedText, interactionLog, context.knowledgeContent);

      const regeneratedOutput = await callLlmForCodegen(context.llm, regenPrompt);
      console.log(`[SELFHEAL] regenerated cliCommand="${regeneratedOutput.cliCommand}"`);
      if (!regeneratedOutput.cliCommand) { console.log('[SELFHEAL] regenerate: empty cmd'); return null; }

      const regenResult = await executeCliAction(context.cli, regeneratedOutput.cliCommand);
      if (!regenResult.success) return null;

      const regenVerify = await verifyAfterAction(context.cli, step.expectedText, regeneratedOutput.cliCommand);
      if (!regenVerify.verified) return null;

      const screenshotPath = await captureScreenshot(context.cli, step.order);
      return {
        result: { stepOrder: step.order, status: 'PASS', screenshotPath, pythonCode: regeneratedOutput.pythonCode },
        interaction: { stepOrder: step.order, pythonCode: regeneratedOutput.pythonCode, cliCommand: regeneratedOutput.cliCommand, targetElement: regeneratedOutput.targetElement, passed: true, screenshotPath },
      };
    }

    const healingPrompt = buildSelfHealPrompt(failed, step, pageSummary, context);
    const messages = [
      { role: 'system', content: SELFHEAL_SYSTEM_PROMPT },
      { role: 'user', content: healingPrompt },
    ];
    const response = await context.llm.chatCompletion(messages, {
      responseFormat: { type: 'json_object' },
    });
    const healed = parseLLMResponse(response.content);
    console.log(`[SELFHEAL] LLM cliCommand="${healed.cliCommand}"`);
    if (!healed.cliCommand) { console.log('[SELFHEAL] no cliCommand, aborting'); return null; }

    const healResult = await executeCliAction(context.cli, healed.cliCommand);
    console.log(`[SELFHEAL] executed "${healed.cliCommand}" → success=${healResult.success} error="${healResult.error}"`);
    if (!healResult.success) return null;

    const verifyResult = await verifyAfterAction(context.cli, step.expectedText, healed.cliCommand);
    console.log(`[SELFHEAL] verifyAfterAction → verified=${verifyResult.verified}`);
    if (!verifyResult.verified) return null;

    const snapshotAfter = execCli(['--raw', 'snapshot', '--boxes']);
    const freshPageText = (snapshotAfter.stdout || snapshotAfter.stderr || '').toLowerCase();

    if (origCmd) {
      const retryResult = await executeCliAction(context.cli, origCmd);
      if (retryResult.success) {
        const verifyRetry = await verifyAfterAction(
          context.cli,
          step.expectedText,
          origCmd,
        );
        if (verifyRetry.verified) {
          const screenshotPath = await captureScreenshot(context.cli, step.order);
          return {
            result: { stepOrder: step.order, status: 'PASS', screenshotPath, pythonCode: healed.pythonCode },
            interaction: { stepOrder: step.order, pythonCode: healed.pythonCode, cliCommand: origCmd, targetElement: healed.targetElement, passed: true, screenshotPath },
          };
        }
      }
    }

    const freshSummary = pageSummaryFromSnapshot(snapshotAfter.stdout || snapshotAfter.stderr || '');
    console.log(`[SELFHEAL] regenerate: freshSummary has ${freshSummary.elements.length} elements, URL="${freshSummary.url}"`);
    const regeneratedPrompt = buildCodeGenPrompt(freshSummary, step.actionText, step.expectedText, interactionLog, context.knowledgeContent);

    try {
      const regeneratedOutput = await callLlmForCodegen(context.llm, regeneratedPrompt);
      console.log(`[SELFHEAL] regenerated cliCommand="${regeneratedOutput.cliCommand}"`);
      if (!regeneratedOutput.cliCommand) { console.log('[SELFHEAL] regenerate: empty cmd'); return null; }

      const regenResult = await executeCliAction(context.cli, regeneratedOutput.cliCommand);
      if (!regenResult.success) return null;

      const regenVerify = await verifyAfterAction(context.cli, step.expectedText, regeneratedOutput.cliCommand);
      if (!regenVerify.verified) return null;

      const screenshotPath = await captureScreenshot(context.cli, step.order);
      return {
        result: { stepOrder: step.order, status: 'PASS', screenshotPath, pythonCode: regeneratedOutput.pythonCode },
        interaction: { stepOrder: step.order, pythonCode: regeneratedOutput.pythonCode, cliCommand: regeneratedOutput.cliCommand, targetElement: regeneratedOutput.targetElement, passed: true, screenshotPath },
      };
    } catch (e) {
      console.log(`[SELFHEAL] regenerate error: ${(e as Error).message}`);
      return null;
    }
  } catch (e) {
    console.log(`[SELFHEAL] error: ${(e as Error).message}`);
    return null;
  }
}

function buildSelfHealPrompt(
  failed: { result: StepResult; interaction: Interaction },
  step: TestStep,
  pageSummary: PageSummary,
  context: ExecutionContext,
): string {
  return [
    `## 失败步骤描述`,
    `操作: ${step.actionText}`,
    `预期结果: ${step.expectedText || '（无）'}`,
    ``,
    `## 原始断裂的 cliCommand`,
    failed.interaction.cliCommand ? `\`${failed.interaction.cliCommand}\`` : '（LLM 未生成命令）',
    ``,
    `## 错误日志`,
    failed.interaction.error || '（无详细错误）',
    ``,
    `## 当前页面快照`,
    `URL: ${pageSummary.url}`,
    `标题: ${pageSummary.title}`,
    `可交互元素:`,
    ...pageSummary.elements.map((el) => `- ${el.ref}: ${el.role} "${el.name}"${el.matchedTerm ? ` (匹配: ${el.matchedTerm})` : ''}`),
    ``,
    context.knowledgeContent ? `## 产品知识库\n${context.knowledgeContent}\n` : '',
  ].join('\n');
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
