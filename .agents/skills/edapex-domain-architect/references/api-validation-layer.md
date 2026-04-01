# API, Validation, & Config Constraints

Guided by the overarching `api-design-principles` and `backend-security-coder` skills, the `controllers/`, `validators/`, and `middleware/` layers interact directly with edge traffic.

## 1. Zod Payload Exclusivity
The `validators/` layer holds the absolute authority over incoming payloads. 
- Controllers MUST NEVER manually parse or manually validate required attributes.
- Use `z.object({...}).parse()` inside the Controller try-catch loop. The validator schema should live cleanly in `src/validators/`.
- Validators MUST be co-located by domain: `src/validators/finance.validator.ts`, `src/validators/lms.validator.ts`.

## 2. Unified Request Envelopes
To enforce consistent API boundaries (`api-patterns`), controllers must output a unified response envelope via `BaseController`:
- Success: `BaseController.sendSuccess(c, data, message?, status?)` → `{ success: true, message, data }`
- Error: `BaseController.sendError(c, message, status?)` → `{ success: false, message }`
- Errors MUST be anonymized before leaving the Controller. Raw SQL or stack traces escaping the controller constitutes a critical leaky abstraction.

## 3. Role-Based and Policy-Based Access Control (PBAC)
- Do not check `userType` statically inside a Controller if it requires querying the database first.
- The `middleware/` layer must intercept requests, resolve the `tenantId`, and attach authenticated contexts to `c.get('user')` or `c.get('tenant')`.
- Use pre-built middleware injections to reject unauthorized access *before* the Controller even fires.
- PBAC policies MUST be documented in `docs/domains/[module].md` under the "PBAC & Security" section.

## 4. Config Abstraction
The `config/` layer hides raw `process.env`.
- Do not use `process.env.STRIPE_KEY` anywhere except inside `src/config/index.ts`. All downstream dependencies MUST import the parsed and strongly typed `config` object.
- For Cloudflare Workers, use `c.env` bindings mapped through a typed `Env` interface.

## 5. Controller Pattern
All controllers MUST extend `BaseController` and follow this structure:

```typescript
import { BaseController } from './BaseController';
import { Context } from 'hono';
import { createFinanceValidator } from '../validators/finance.validator';

export class FinanceController extends BaseController {
  static async createLedgerEntry(c: Context) {
    try {
      const body = createFinanceValidator.parse(await c.req.json());
      const tenantId = c.get('tenantId');
      const result = await financeService.createEntry(tenantId, body);
      return BaseController.sendSuccess(c, result, 'Ledger entry created', 201);
    } catch (error) {
      return BaseController.sendError(c, 'Failed to create ledger entry');
    }
  }
}
```
