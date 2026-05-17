import { execCli } from './cli-runner';

export class CliSession {
  /**
   * Open a browser session. Optionally navigate to a URL on open.
   */
  static async open(url?: string): Promise<{ success: boolean; error?: string }> {
    const args = ['open'];
    if (url) args.push(url);
    const result = execCli(args);
    return { success: result.success, error: result.stderr || undefined };
  }

  /**
   * Close the current browser session.
   */
  static async close(): Promise<{ success: boolean; error?: string }> {
    const result = execCli(['close']);
    return { success: result.success, error: result.stderr || undefined };
  }

  /**
   * List active browser sessions.
   */
  static async list(): Promise<string[]> {
    const result = execCli(['ls']);
    if (!result.success) return [];
    return result.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
