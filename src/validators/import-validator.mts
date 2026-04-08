import { posix } from 'node:path';
import type { Logger } from 'winston';
import type { CodeFile } from '../agents/codegen-agent.mts';

export interface ImportError {
  readonly sourceFile: string;
  readonly importPath: string;
  readonly resolvedPath: string;
  readonly suggestion?: string;
  readonly type: 'missing' | 'wrong-path' | 'missing-barrel';
}

const IMPORT_PATTERN = /from\s+['"](\.[^'"]+)['"]/g;

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
