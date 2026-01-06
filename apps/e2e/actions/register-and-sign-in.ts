import { faker } from "@faker-js/faker";
import type { Page } from "@playwright/test";

export async function registerAndSignIn(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).click();
  await page.getByRole("link", { name: /register/i }).click();

  const username = faker.internet.username();
  const usernameEl = page.getByLabel(/username/i);
  await usernameEl.click();
  await usernameEl.fill(username);

  const pwd = faker.internet.password();
  const password = page.getByLabel("Password *", { exact: true });
  await password.click();
  await password.fill(pwd);

  const confirmPassword = page.getByLabel(/confirm password/i, { exact: true });
  await confirmPassword.click();
  await confirmPassword.fill(pwd);

  const email = page.getByLabel(/email/i);
  await email.click();
  await email.fill(faker.internet.email());

  const firstName = page.getByLabel(/first name/i);
  await firstName.click();
  await firstName.fill(faker.person.firstName());

  const lastName = page.getByLabel(/last name/i);
  await lastName.click();
  await lastName.fill(faker.person.lastName());

  const register = page.getByRole("button", { name: /register/i });
  await register.click();

  return { username };
}
