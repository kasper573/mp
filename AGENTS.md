# LLM Agent Coding Instructions

- When writing React/Preact code, do not use `useEffect` inside application code (code that resides in `/apps` or `/integrations`). It should only be used as an implementation detail when building custom hooks. If you need an effect, look for existing custom hooks that achieve what you're trying to do, or create a new custom hook instead inside a resuable location, preferably inside the `libraries` workspace.

- When writing code inside `/integrations/db`, never include auth checks or input validations. These should always be handled in the application code that calls the database procedures.

- You must read and understand the [README.md](README.md) file for documentation on the project structure and conventions. Any and all additional documentation linked from the README.md must also be read and understood.

- After finishing your task, always run and ensure the following commands pass:
  - `pnpm lint`
  - `pnpm format`
  - `pnpm test`
  - `pnpm build`
  - `pnpm -F e2e start:dev:with-services`
