# LLM Agent Coding Instructions

- When writing React/Preact code, do not use `useEffect` inside application code (code that resides in `/apps` or `/integrations`). It should only be used as an implementation detail when building custom hooks. If you need an effect, look for existing custom hooks that achieve what you're trying to do, or create a new custom hook instead inside a resuable location, preferably inside the `libraries` workspace.

- When writing code inside `/integrations/db`, never include auth checks or input validations. These should always be handled in the application code that calls the database procedures.

- You must read and understand the [README.md](README.md) file for documentation on the project structure and conventions. Any and all additional documentation linked from the README.md must also be read and understood.

- Only write comments that explain why something is done, never how. The code itself should be clear enough to explain what it does, and even ideally why it does it. Only when you observe a piece of code and realize that it is not clear at all why it is the way it is, should you write a comment explaining the reasoning behind it.

- In classes, prefer javascript native private fields and methods (using the `#` syntax) over Typescript's `private` modifier, since the former provides true privacy at runtime, while the latter is only a compile-time construct that can be easily bypassed.

- Prefer composition over inheritance

- Prefer functional and prodecural patterns over object-oriented programming. This doesn't mean classes are banned completely, but they should be used sparingly and only when they provide a clear benefit.

- Prioritize terseness and simplicity in your code, but not at the expense of readability and maintainability, both in the micro and macro aspects of the codebase. Strive to write code that is as concise as possible while still being clear and easy to understand. As opposed to writing code that works and solves the problem but is needlessly verbose and complex, which is extremely typical of LLM generated code, so you must be especially vigilant about this.

## Typescript

When writing typescript you must adhere to principal engineer and advanced level typescript practices and strictness.
This includes but is not limited to:

- Avoiding the use of `any` and `never` types and type assertions unless absolutely necessary, and even then, providing clear comments explaining why their use is justified. Your training will likely cause you to give up easily and use `any` or `never` to quickly solve a problem, but you must resist this urge at all costs, because truly 99% of the time, there is a better way to solve the problem that doesn't involve sacrificing type safety, but typescript is so popular and unfortunately widely used by mediocre developers that most of LLM training data is polluted with bad practices like this, which is why you should be especially vigilant about this.
- Don't work around type issues by using `as unknown as T` or similar patterns, as this is a clear indication that you are trying to bypass the type system rather than working with it to find a proper solution. Instead, take the time to understand the underlying type issue and address it directly, which will lead to more robust and maintainable code.
- Using generics where appropriate to create reusable and flexible code.
- Leveraging TypeScript's advanced type features such as union types, intersection types, mapped types, conditional types, and type guards to create robust and type-safe code.
- Always use `undefined` over `null` to represent the absence of a value, and where possible use typescripts optional properties and parameters rather than `T | undefined` unions, as this is the most idiomatic approach in typescript.
- Prefer function syntax over arrow functions when defining functions in general. Only use arrow syntax for simple expressions, or for when you explicitly want to capture the `this` context of the surrounding code.

# Verification

Before you start working on your task run `pnpm -F world bench` and save the results to a temp file.

- After finishing your task, always run and ensure the following commands pass:
  - `pnpm lint`
  - `pnpm format`
  - `pnpm test`
  - `pnpm build`
  - `pnpm -F e2e start:dev:with-services`
  - `pnpm -F world bench`

Compare the new benchmark results with the ones you saved before starting your task.

- If there is a significant regression in benchmarks, investigate and address the issue before considering the task complete.

- If the benchmark demonstrates poor benchmarks from a practical standpoint even if it wasn't introduced by your changes, you should also address the issue before considering the task complete.
