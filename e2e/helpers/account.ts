import type { Page } from "@playwright/test";

export interface Account {
  username: string;
  password: string;
}

let counter = 0;

// Registers a fresh throwaway account by clicking through the sign-in flow, which redirects back to the
// game. A unique username per call keeps parallel tests apart.
export async function register(page: Page): Promise<Account> {
  if (new URL(page.url()).pathname !== "/play") await page.goto("/play");
  await page.getByRole("button", { name: "Sign in to play" }).click();
  await page.getByRole("link", { name: /register/i }).click();

  const account = newAccount();
  // Field ids are Keycloak's stable, locale-independent contract.
  await page.locator("#username").fill(account.username);
  await page.locator("#email").fill(email(account));
  await page.locator("#password").fill(account.password);
  await page.locator("#password-confirm").fill(account.password);
  await fillIfPresent(page, "#firstName", account.username);
  await fillIfPresent(page, "#lastName", account.username);
  await page.getByRole("button", { name: /register/i }).click();
  return account;
}

function newAccount(): Account {
  counter += 1;
  // Lowercase alphanumerics (Keycloak's username rules), unique across parallel workers and retries.
  const username = `tester${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
  return { username, password: `Passw0rd-${username}` };
}

function email(account: Account): string {
  return `${account.username}@example.com`;
}

async function fillIfPresent(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  if ((await field.count()) > 0) {
    await field.fill(value);
  }
}
