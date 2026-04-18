
## Task Type: endpoint
The code exports an Elysia plugin. Create a test Elysia instance, mount the plugin with `.use()`, and test via `.handle()`. Example:
```typescript
import { Elysia } from 'elysia'
import { fooRoutes } from '../code/src/api/foo/router.mts'

const testApp = new Elysia().use(fooRoutes)
const res = await testApp.handle(new Request('http://localhost/api/v1/foo'))
```
