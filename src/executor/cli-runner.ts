import { spawnSync } from 'node:child_process';

export interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

const CLI = ['npx', 'playwright-cli'];
const DEFAULT_TIMEOUT_MS = 30_000;

export function execCli(args: string[]): CliResult {
  try {
    const result = spawnSync(CLI[0], [...CLI.slice(1), ...args], {
      encoding: 'utf-8',
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return {
      success: result.status === 0,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, stdout: '', stderr: err.message };
  }
}

export async function execCliAsync(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliResult> {
  try {
    const proc = Bun.spawn([...CLI, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: npx playwright-cli ${args.join(' ')}`));
      }, timeoutMs);
    });

    const exitCode = await Promise.race([proc.exited, timedOut]);
    clearTimeout(timer);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      success: exitCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, stdout: '', stderr: err.message };
  }
}
