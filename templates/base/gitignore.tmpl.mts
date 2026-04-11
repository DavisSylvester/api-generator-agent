export function renderGitignore(): string {
  return `node_modules
dist
out
.env
.env.local
.env.*.local
*.tsbuildinfo
.eslintcache
.DS_Store
coverage
*.lcov
logs
*.log
.docs/
`;
}
