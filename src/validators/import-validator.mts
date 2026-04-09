import { posix } from 'node:path';
import type { Logger } from 'winston';
import type { CodeFile } from '../agents/codegen-agent.mts';
import { extractExportsFromContent } from './extract-exports.mts';

export interface ImportError {
  readonly sourceFile: string;
  readonly importPath: string;
  readonly resolvedPath: string;
  readonly suggestion?: string;
  readonly type: 'missing' | 'wrong-path' | 'missing-barrel';
}

export interface ExportValidationError {
  readonly sourceFile: string;
  readonly importedName: string;
  readonly fromFile: string;
  readonly actualExports: readonly string[];
  readonly type: 'missing-named-export' | 'missing-file' | 'wrong-path' | 'missing-barrel';
}

const IMPORT_PATTERN = /from\s+['"](\.[^'"]+)['"]/g;
const NAMED_IMPORT_PATTERN = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;
const RE_EXPORT_PATTERN = /export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;

export function validateImports(
  codeFiles: readonly CodeFile[],
  depCodeFiles: readonly CodeFile[],
  logger: Logger,
): readonly ImportError[] {
  const errors: ImportError[] = [];

  // Build a map of all known file paths (normalized to posix)
  const allFiles = new Map<string, string>();
  for (const file of codeFiles) {
    const normalized = normalizePath(file.path);
    allFiles.set(normalized, normalized);
  }
  for (const file of depCodeFiles) {
    const normalized = normalizePath(file.path);
    // Only add dep files that don't collide with task files
    if (!allFiles.has(normalized)) {
      allFiles.set(normalized, normalized);
    }
  }

  // Build a basename-to-paths index for "did you mean?" suggestions
  const basenameIndex = new Map<string, string[]>();
  for (const filePath of allFiles.keys()) {
    const base = posix.basename(filePath);
    const existing = basenameIndex.get(base);
    if (existing) {
      existing.push(filePath);
    } else {
      basenameIndex.set(base, [filePath]);
    }
  }

  // Validate each code file's imports
  for (const file of codeFiles) {
    const sourceNormalized = normalizePath(file.path);
    const sourceDir = posix.dirname(sourceNormalized);
    const importMatches = file.content.matchAll(IMPORT_PATTERN);

    for (const match of importMatches) {
      const importPath = match[1]!;
      const resolved = resolveImportPath(sourceDir, importPath);

      // Check if the resolved path exists in known files
      if (allFiles.has(resolved)) {
        continue;
      }

      // Try with common extensions
      const withExtension = tryResolveWithExtensions(resolved, allFiles);
      if (withExtension) {
        continue;
      }

      // Check if it resolves to a directory with index.mts
      const indexPath = `${resolved}/index.mts`;
      if (allFiles.has(indexPath)) {
        continue;
      }

      // Not found — check if a file with the same basename exists elsewhere
      const importBasename = posix.basename(resolved);
      const candidates = basenameIndex.get(importBasename) ?? [];
      // Also check with .mts extension appended
      const baseWithExt = importBasename.endsWith(`.mts`) ? importBasename : `${importBasename}.mts`;
      const extCandidates = basenameIndex.get(baseWithExt) ?? [];
      const allCandidates = [...new Set([...candidates, ...extCandidates])].filter(
        (c) => c !== resolved,
      );

      if (allCandidates.length > 0) {
        const bestMatch = allCandidates[0]!;
        const correctRelative = computeRelativePath(sourceDir, bestMatch);
        errors.push({
          sourceFile: file.path,
          importPath,
          resolvedPath: resolved,
          suggestion: correctRelative,
          type: `wrong-path`,
        });
        logger.debug(
          `[import-validator] Wrong path: ${file.path} imports "${importPath}" — found at "${bestMatch}", suggest "${correctRelative}"`,
        );
      } else {
        errors.push({
          sourceFile: file.path,
          importPath,
          resolvedPath: resolved,
          type: `missing`,
        });
        logger.debug(
          `[import-validator] Missing: ${file.path} imports "${importPath}" — resolved to "${resolved}" — not found anywhere`,
        );
      }
    }
  }

  // Barrel validation: check directories with 2+ .mts files have an index.mts
  const dirFileCounts = new Map<string, string[]>();
  for (const file of codeFiles) {
    const normalized = normalizePath(file.path);
    if (!normalized.endsWith(`.mts`)) continue;
    const dir = posix.dirname(normalized);
    const existing = dirFileCounts.get(dir);
    if (existing) {
      existing.push(normalized);
    } else {
      dirFileCounts.set(dir, [normalized]);
    }
  }

  for (const [dir, files] of dirFileCounts) {
    // Only check dirs with 2+ non-index .mts files
    const nonIndex = files.filter((f) => posix.basename(f) !== `index.mts`);
    if (nonIndex.length < 2) continue;

    const indexPath = `${dir}/index.mts`;
    if (!allFiles.has(indexPath)) {
      errors.push({
        sourceFile: indexPath,
        importPath: indexPath,
        resolvedPath: indexPath,
        type: `missing-barrel`,
      });
      logger.debug(
        `[import-validator] Missing barrel: directory "${dir}" has ${nonIndex.length} .mts files but no index.mts`,
      );
    }
  }

  return errors;
}

export function validateNamedExports(
  codeFiles: readonly CodeFile[],
  logger: Logger,
): readonly ExportValidationError[] {
  const errors: ExportValidationError[] = [];

  // Build a map of file path -> export names
  const fileExportsMap = new Map<string, readonly string[]>();
  const allFiles = new Map<string, CodeFile>();

  for (const file of codeFiles) {
    const normalized = normalizePath(file.path);
    const exportEntries = extractExportsFromContent(file.content);
    const exportNames = exportEntries.map((e) =>
      e.kind === 'type' || e.kind === 'interface' ? `${e.kind} ${e.name}` : e.name,
    );
    const rawNames = exportEntries.map((e) => e.name);
    // Store both decorated and raw names — imports use raw names
    fileExportsMap.set(normalized, rawNames);
    allFiles.set(normalized, file);
  }

  // Check each file's named imports and re-exports
  for (const file of codeFiles) {
    const sourceNormalized = normalizePath(file.path);
    const sourceDir = posix.dirname(sourceNormalized);

    // Check named imports: import { A, B } from './path.mts'
    const importMatches = file.content.matchAll(NAMED_IMPORT_PATTERN);
    for (const match of importMatches) {
      const namesStr = match[1]!;
      const importPath = match[2]!;

      const resolved = resolveAndFindFile(sourceDir, importPath, allFiles);
      if (!resolved) {
        // File doesn't exist — already caught by validateImports, skip
        continue;
      }

      const targetExports = fileExportsMap.get(resolved);
      if (!targetExports) {
        continue;
      }

      const importedNames = parseNamesList(namesStr);
      for (const name of importedNames) {
        if (!targetExports.includes(name)) {
          const decorated = getDecoratedExports(resolved, codeFiles);
          errors.push({
            sourceFile: file.path,
            importedName: name,
            fromFile: importPath,
            actualExports: decorated,
            type: 'missing-named-export',
          });
          logger.debug(
            `[import-validator] Named export missing: ${file.path} imports '${name}' from '${importPath}', but that file exports: [${targetExports.join(', ')}]`,
          );
        }
      }
    }

    // Check re-exports: export { A, B } from './path.mts'
    const reExportMatches = file.content.matchAll(RE_EXPORT_PATTERN);
    for (const match of reExportMatches) {
      const namesStr = match[1]!;
      const importPath = match[2]!;

      const resolved = resolveAndFindFile(sourceDir, importPath, allFiles);
      if (!resolved) {
        continue;
      }

      const targetExports = fileExportsMap.get(resolved);
      if (!targetExports) {
        continue;
      }

      const reExportedNames = parseNamesList(namesStr);
      for (const name of reExportedNames) {
        if (!targetExports.includes(name)) {
          const decorated = getDecoratedExports(resolved, codeFiles);
          errors.push({
            sourceFile: file.path,
            importedName: name,
            fromFile: importPath,
            actualExports: decorated,
            type: 'missing-named-export',
          });
          logger.debug(
            `[import-validator] Re-export missing: ${file.path} re-exports '${name}' from '${importPath}', but that file exports: [${targetExports.join(', ')}]`,
          );
        }
      }
    }
  }

  return errors;
}

function resolveAndFindFile(
  sourceDir: string,
  importPath: string,
  allFiles: Map<string, CodeFile>,
): string | undefined {
  const resolved = posix.normalize(posix.join(sourceDir, importPath));

  if (allFiles.has(resolved)) {
    return resolved;
  }

  // Try common extensions
  const extensions = ['.mts', '.ts', '.mjs', '.js'];
  for (const ext of extensions) {
    const withExt = `${resolved}${ext}`;
    if (allFiles.has(withExt)) {
      return withExt;
    }
  }

  // Try index file
  const indexPath = `${resolved}/index.mts`;
  if (allFiles.has(indexPath)) {
    return indexPath;
  }

  return undefined;
}

function parseNamesList(namesStr: string): readonly string[] {
  return namesStr
    .split(',')
    .map((raw) => {
      const trimmed = raw.trim();
      // Handle "Name as Alias" — the original name is what needs to exist in the source
      const asMatch = /^(\w+)\s+as\s+\w+$/.exec(trimmed);
      return asMatch ? asMatch[1]! : trimmed;
    })
    .filter((name) => /^\w+$/.test(name));
}

function getDecoratedExports(
  normalizedPath: string,
  codeFiles: readonly CodeFile[],
): readonly string[] {
  const file = codeFiles.find((f) => normalizePath(f.path) === normalizedPath);
  if (!file) {
    return [];
  }
  const entries = extractExportsFromContent(file.content);
  return entries.map((e) =>
    e.kind === 'type' || e.kind === 'interface' ? `${e.kind} ${e.name}` : e.name,
  );
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, `/`).replace(/^(src\/)+/, `src/`);
}

function resolveImportPath(sourceDir: string, importPath: string): string {
  const joined = posix.join(sourceDir, importPath);
  return posix.normalize(joined);
}

function tryResolveWithExtensions(
  resolved: string,
  allFiles: Map<string, string>,
): string | undefined {
  const extensions = [`.mts`, `.ts`, `.mjs`, `.js`];
  for (const ext of extensions) {
    if (allFiles.has(`${resolved}${ext}`)) {
      return `${resolved}${ext}`;
    }
  }
  return undefined;
}

function computeRelativePath(fromDir: string, toFile: string): string {
  let rel = posix.relative(fromDir, toFile);
  if (!rel.startsWith(`.`)) {
    rel = `./${rel}`;
  }
  return rel;
}
