import { describe, it, expect } from 'bun:test'

// Re-implement the functions here since they're not exported
function looksLikeTestCode(code: string): boolean {
  return code.includes('bun:test') || code.includes('describe(') || code.includes('it(')
}

function parseTestFile(content: string): string | undefined {
  const fencedBlockPattern = /```[^\n]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fencedBlockPattern.exec(content)) !== null) {
    const code = match[1]?.trim()
    if (code && looksLikeTestCode(code)) {
      return code
    }
  }

  const importStart = content.indexOf('import ')
  if (importStart !== -1) {
    const rawCode = content.substring(importStart).trim()
    if (looksLikeTestCode(rawCode)) {
      return rawCode
    }
  }

  return undefined
}

function parseJsonBlock(content: string): string | undefined {
  const fenced = /```(?:json)?\n([\s\S]*?)```/.exec(content)
  if (fenced?.[1]) return fenced[1].trim()

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  return jsonMatch?.[0]?.trim()
}

function stripThinkTags(raw: string): string {
  return raw
    .replace(/<think[^>]*>[\s\S]*?<\/think>/g, '')
    .replace(/<think[^>]*>[\s\S]*$/g, '')
    .trim()
}

describe('stripThinkTags', () => {
  it('should strip a single think block', () => {
    const input = '<think>some reasoning</think>Here is the answer'
    expect(stripThinkTags(input)).toBe('Here is the answer')
  })

  it('should strip multiple think blocks', () => {
    const input = '<think>first</think>Hello <think>second</think>World'
    expect(stripThinkTags(input)).toBe('Hello World')
  })

  it('should strip think tags with attributes', () => {
    const input = '<think type="reasoning">deep thought</think>Result'
    expect(stripThinkTags(input)).toBe('Result')
  })

  it('should strip unclosed trailing think block', () => {
    const input = 'Some content<think>model got cut off here and never closed'
    expect(stripThinkTags(input)).toBe('Some content')
  })

  it('should return content unchanged when no think tags', () => {
    const input = 'Just a normal response with ```code```'
    expect(stripThinkTags(input)).toBe('Just a normal response with ```code```')
  })

  it('should handle empty think blocks', () => {
    const input = '<think></think>Answer'
    expect(stripThinkTags(input)).toBe('Answer')
  })

  it('should handle multiline think blocks', () => {
    const input = `<think>
Let me think about this step by step.
1. First consideration
2. Second consideration
</think>

Here is the test code.`
    expect(stripThinkTags(input)).toBe('Here is the test code.')
  })
})

describe('parseTestFile', () => {
  it('should parse a ```typescript fenced block', () => {
    const content = `Here is the test:

\`\`\`typescript
import { describe, it, expect } from 'bun:test'

describe('my test', () => {
  it('works', () => {
    expect(1).toBe(1)
  })
})
\`\`\`
`
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain("import { describe, it, expect } from 'bun:test'")
    expect(result).toContain('expect(1).toBe(1)')
  })

  it('should parse a ```ts fenced block', () => {
    const content = `\`\`\`ts
import { describe, it, expect } from 'bun:test'
describe('test', () => { it('x', () => { expect(true).toBe(true) }) })
\`\`\``
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('bun:test')
  })

  it('should parse a ```mts fenced block', () => {
    const content = `\`\`\`mts
import { describe, it, expect } from 'bun:test'
describe('test', () => { it('x', () => { expect(true).toBe(true) }) })
\`\`\``
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('bun:test')
  })

  it('should parse a path-style fenced block like ```tests/setup-project.test.mts', () => {
    const content = `\`\`\`tests/setup-project.test.mts
import { describe, it, expect } from 'bun:test'
import { app } from '../code/src/index.mts'

describe('setup', () => {
  it('should respond', async () => {
    const res = await app.handle(new Request('http://localhost/'))
    expect(res.status).toBe(200)
  })
})
\`\`\``
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('app.handle')
    expect(result).toContain('expect(res.status).toBe(200)')
  })

  it('should parse a bare ``` fenced block with no language', () => {
    const content = `\`\`\`
import { describe, it, expect } from 'bun:test'
describe('bare', () => { it('works', () => { expect(2).toBe(2) }) })
\`\`\``
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('bun:test')
  })

  it('should skip non-test code blocks and find the test block', () => {
    const content = `Here is some config:

\`\`\`json
{ "name": "test" }
\`\`\`

And here are the tests:

\`\`\`typescript
import { describe, it, expect } from 'bun:test'
describe('real test', () => { it('passes', () => { expect(true).toBe(true) }) })
\`\`\``
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('real test')
    expect(result).not.toContain('"name"')
  })

  it('should extract raw code with no fences (fallback)', () => {
    const content = `Here is the test file:

import { describe, it, expect } from 'bun:test'

describe('unfenced', () => {
  it('still works', () => {
    expect(42).toBe(42)
  })
})`
    const result = parseTestFile(content)
    expect(result).toBeDefined()
    expect(result).toContain('bun:test')
    expect(result).toContain('expect(42).toBe(42)')
  })

  it('should return undefined for content with no test code', () => {
    const content = 'This is just a text response with no code at all.'
    expect(parseTestFile(content)).toBeUndefined()
  })

  it('should return undefined for a code block without test imports', () => {
    const content = `\`\`\`typescript
const x = 1
console.log(x)
\`\`\``
    expect(parseTestFile(content)).toBeUndefined()
  })

  it('should handle think-stripped content with test code', () => {
    const raw = `<think>
Let me analyze the code and write tests.
I need to test the user routes.
</think>

Here is the comprehensive test suite:

\`\`\`tests/setup-project.test.mts
import { describe, it, expect } from 'bun:test'
import { app } from '../code/src/index.mts'

describe('User API', () => {
  it('should create user', async () => {
    const res = await app.handle(new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com' }),
    }))
    expect(res.status).toBe(201)
  })
})
\`\`\``
    const stripped = stripThinkTags(raw)
    const result = parseTestFile(stripped)
    expect(result).toBeDefined()
    expect(result).toContain('User API')
    expect(result).toContain('app.handle')
    expect(result).toContain('expect(res.status).toBe(201)')
  })
})

describe('parseJsonBlock', () => {
  it('should parse a ```json fenced block', () => {
    const content = `\`\`\`json
{ "v": 3, "name": "test collection" }
\`\`\``
    const result = parseJsonBlock(content)
    expect(result).toBeDefined()
    expect(result).toContain('"v": 3')
  })

  it('should parse a bare ``` fenced block with JSON', () => {
    const content = `\`\`\`
{ "v": 3, "name": "test" }
\`\`\``
    const result = parseJsonBlock(content)
    expect(result).toBeDefined()
    expect(result).toContain('"v": 3')
  })

  it('should fall back to raw JSON extraction', () => {
    const content = `Here is the collection: { "v": 3, "name": "test" }`
    const result = parseJsonBlock(content)
    expect(result).toBeDefined()
    expect(result).toContain('"v": 3')
  })

  it('should return undefined for no JSON', () => {
    expect(parseJsonBlock('no json here')).toBeUndefined()
  })
})
