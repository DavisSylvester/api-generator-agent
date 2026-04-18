
## Task Type: repository
Write pure unit tests. Import the repository class, instantiate it with a test database (in-memory SQLite), and test CRUD methods. Do NOT create any Elysia instance or use .handle().

### bun:sqlite in Tests
Use `import { Database } from 'bun:sqlite'` — NOT `Bun.Database` (which does not exist):
```typescript
import { Database } from 'bun:sqlite'
const db = new Database(':memory:')
```
