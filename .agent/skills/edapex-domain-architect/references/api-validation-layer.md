# API, Validation, & Config Constraints

Guided by the overarching `api-design-principles` and `backend-security-coder` skills, the `controllers/`, `validators/`, and `middleware/` layers interact directly with edge traffic.

## 1. Zod Payload Exclusivity
The `validators/` layer holds the absolute authority over incoming payloads. 
- Controllers MUST NEVER manually parse or manually validate required attributes.
- Use `z.object({...}).parse()` inside the Controller try-catch loop. The validator schema should live cleanly in `src/validators/`.

## 2. Unified Request Envelopes
To enforce consistent API boundaries (`api-patterns`), controllers must output a unified response envelope.
- Success: `{ status: "success", data: X, message?: "..." }`
- Errors MUST be anonymized before leaving the Controller. Raw SQL or stack traces escaping the controller constitutes a critical leaky abstraction.

## 3. Role-Based and Policy-Based Access Control (PBAC)
- Do not check `userType` statically inside a Controller if it requires querying the database first.
- The `middleware/` layer must intercept requests, resolve the `tenantId`, and attach authenticated contexts to `req.user` or `req.tenant`.
- Use pre-built decorators or specific middleware injections to reject unauthorized access *before* the Controller even fires.

## 4. Config Abstraction
The `config/` layer hides raw `process.env`.
- Do not use `process.env.STRIPE_KEY` anywhere except inside `src/config/index.ts`. All downstream dependencies MUST import the parsed and strongly typed `config` object.
