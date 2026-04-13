import { createInterface } from 'node:readline';

/**
 * Prompt the user with a yes/no question on stdin.
 * Returns `true` for yes, `false` for no.
 * An empty answer resolves to `defaultYes`.
 */
export async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? `Y/n` : `y/N`;

  return new Promise<boolean>((resolve) => {
    rl.question(`${question} [${hint}] `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === ``) {
        resolve(defaultYes);
      } else {
        resolve(trimmed === `y` || trimmed === `yes`);
      }
    });
  });
}

/**
 * Prompt the user to pick from a numbered list of choices, or skip.
 * Returns the chosen value or `undefined` if the user skips.
 */
export async function askChoice<T extends string>(
  question: string,
  choices: readonly { readonly label: string; readonly value: T }[],
): Promise<T | undefined> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const lines = [
    question,
    ...choices.map((c, i) => `  ${i + 1}) ${c.label}`),
    `  0) Skip`,
    ``,
  ];

  return new Promise<T | undefined>((resolve) => {
    rl.question(lines.join(`\n`) + `Choose [0]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === `` || trimmed === `0`) {
        resolve(undefined);
        return;
      }
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx]!.value);
      } else {
        resolve(undefined);
      }
    });
  });
}
