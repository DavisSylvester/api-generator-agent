export function renderTsconfig(projectName: string): string {
  const kebab = toKebabCase(projectName);

  return JSON.stringify({
    compilerOptions: {
      lib: ["ESNext"],
      target: "ESNext",
      module: "Preserve",
      moduleDetection: "force",
      allowJs: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      paths: {
        [`@${kebab}/shared`]: ["./libs/shared/src/index.mts"],
        [`@${kebab}/shared/*`]: ["./libs/shared/src/*"],
      },
    },
    include: ["src/**/*.mts", "tests/**/*.mts"],
  }, null, 2) + "\n";
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
