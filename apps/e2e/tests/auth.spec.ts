import { test } from "@playwright/test";
import { faker } from "@faker-js/faker";

test.use({
  // It can take a while for keycloak to initialize in CI,
  // since it has to run its initial setup so we need to increase the timeout.
  navigationTimeout: 60_000,
});

test("can register, sign in, then sign out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).click();

  // Since keycloak takes a while to start in CI, we have to explicitly wait for it to be ready.
  // This is a bit of a hack since we now depend on the implementation detail of the auth url,
  // but it's way simpler than figuring out how to wait for keycloak to be finished setting up.
  await page.waitForURL(new RegExp(`auth\\.${process.env.MP_DOMAIN}`));

  await page.getByRole("link", { name: /register/i }).click();

  const username = page.getByLabel(/username/i);
  await username.click();
  await username.fill(faker.internet.username());

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

  await page.getByRole("link", { name: /sign out/i }).click();
  await page.getByRole("heading", { name: /you are logged out/i }).click();
});
