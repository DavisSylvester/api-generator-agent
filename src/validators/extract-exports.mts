import type { CodeFile } from '../agents/codegen-agent.mts';

export interface ExportInfo {
  readonly name: string;
  readonly file: string;
  readonly kind: 'const' | 'function' | 'class' | 'type' | 'interface';
}

export function extractExports(codeFiles: readonly CodeFile[]): readonly ExportInfo[] {
  const exports: ExportInfo[] = [];

  for (const file of codeFiles) {
    const lines = file.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // export const NAME
      const constMatch = /^export\s+const\s+(\w+)/.exec(trimmed);
      if (constMatch?.[1]) {
        exports.push({ name: constMatch[1], file: file.path, kind: 'const' });
        continue;
      }

      // export function NAME
      const funcMatch = /^export\s+(?:async\s+)?function\s+(\w+)/.exec(trimmed);
      if (funcMatch?.[1]) {
        exports.push({ name: funcMatch[1], file: file.path, kind: 'function' });
        continue;
      }

      // export class NAME
      const classMatch = /^export\s+class\s+(\w+)/.exec(trimmed);
      if (classMatch?.[1]) {
        exports.push({ name: classMatch[1], file: file.path, kind: 'class' });
        continue;
      }

      // export type NAME
      const typeMatch = /^export\s+type\s+(\w+)/.exec(trimmed);
      if (typeMatch?.[1]) {
        exports.push({ name: typeMatch[1], file: file.path, kind: 'type' });
        continue;
      }

      // export interface NAME
      const ifaceMatch = /^export\s+interface\s+(\w+)/.exec(trimmed);
      if (ifaceMatch?.[1]) {
        exports.push({ name: ifaceMatch[1], file: file.path, kind: 'interface' });
        continue;
      }

      // export { NAME } or export { NAME } from '...'
      // Also handles export { NAME, OTHER_NAME }
      const reExportMatch = /^export\s+\{([^}]+)\}/.exec(trimmed);
      if (reExportMatch?.[1]) {
        const names = reExportMatch[1].split(',');
        for (const raw of names) {
          // Handle "Name as Alias" — use the alias (exported name)
          const asMatch = /(\w+)\s+as\s+(\w+)/.exec(raw.trim());
          const exportedName = asMatch ? asMatch[2]! : raw.trim();
          if (exportedName && /^\w+$/.test(exportedName)) {
            exports.push({ name: exportedName, file: file.path, kind: 'const' });
          }
        }
      }
    }
  }

  return exports;
}
