/**
 * Shell allowlist parsing (spec §8.4): `&&`, `;`, `|`, `||`, subshells, backticks,
 * redirections to sensitive paths and `bash -c`/`sh -c` do NOT inherit a binary's
 * allow status. We tokenize conservatively: anything we cannot prove simple is
 * treated as a compound command.
 */
export interface ShellAnalysis {
  simple: boolean;          // exactly one command, no operators or substitution
  binary?: string;          // argv[0] if simple
  operators: string[];      // which operators were found
  wraps_interpreter: boolean; // bash -c, sh -c, python -c, eval, xargs
}

const OPERATORS = ['&&', '||', ';', '|', '`', '$(', '>(', '<(', '\n', '&'];
const INTERPRETER_WRAPPERS = new Set(['bash', 'sh', 'zsh', 'dash', 'eval', 'xargs', 'python', 'python3', 'node', 'perl', 'ruby', 'env', 'sudo', 'nohup', 'time']);

export function analyzeShell(command: string): ShellAnalysis {
  const operators: string[] = [];
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    const two = command.slice(i, i + 2);
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (inSingle) continue;
    // In double quotes, $( and backticks still execute.
    for (const op of OPERATORS) {
      if (op.length === 2 ? two === op : ch === op) {
        if (inDouble && op !== '$(' && op !== '`') continue;
        if (op === '&' && two === '&&') continue; // counted as &&
        operators.push(op);
      }
    }
  }
  const argv = command.trim().split(/\s+/).filter(Boolean);
  const binary = argv[0]?.split('/').pop();
  const wraps = !!binary && INTERPRETER_WRAPPERS.has(binary) && (argv.includes('-c') || binary === 'eval' || binary === 'xargs' || binary === 'env' || binary === 'sudo' || binary === 'nohup' || binary === 'time');
  const simple = operators.length === 0 && !wraps && argv.length > 0;
  return { simple, ...(simple && binary ? { binary } : {}), operators, wraps_interpreter: wraps };
}
