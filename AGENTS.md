<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project-level development rules

- Use Node.js 20.9 or newer and npm. The application stack is Next.js, TypeScript with strict checking, Prisma, and Vitest.
- Before changing code, read `package.json`, the existing tests that cover the behavior, and the related implementation. For Next.js work, also follow the generated rules above and consult the installed Next.js documentation they identify.
- Prefer the smallest change that satisfies the acceptance criteria. Do not include unrelated refactors, formatting rewrites, or opportunistic cleanup.
- Never use real Qwen, S3, database, or user credentials in development, tests, CI, documentation, logs, or committed files. Use mocks or explicitly CI-only dummy values with isolated services.
- Keep ordinary code defects and CI repairs in the same Issue, branch, and pull request as the task that exposed them. Do not create a parallel task or PR to bypass a failing gate.
- Never push directly to `main`. All changes must use a task branch and pull request review.
- Every pull request must report the files changed, the exact test commands run, each command's real exit code, and every item that remains unverified.
