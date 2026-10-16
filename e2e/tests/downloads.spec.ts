import { expect, test } from "@playwright/test";

const platforms = [
  { tab: "Linux", release: "linux-x86_64", executable: "" },
  { tab: "Windows", release: "windows-x86_64", executable: ".exe" },
  { tab: "macOS", release: "macos-arm64", executable: "" },
];

test("each platform's tab links its files from that platform's release", async ({ page }) => {
  await page.goto("/downloads");
  for (const platform of platforms) {
    await page.getByRole("tab", { name: platform.tab }).click();
    const panel = page.getByRole("tabpanel", { name: platform.tab });
    const files = [
      `desktop-client${platform.executable}`,
      "rift.env",
      `editor${platform.executable}`,
      `game-server${platform.executable}`,
      "rift-example-game.zip",
    ];
    for (const file of files) {
      const link = panel.getByRole("link", { name: file, exact: true });
      await expect(link).toHaveAttribute("href", new RegExp(`/${platform.release}/${file.replaceAll(".", "\\.")}$`));
    }
  }
});
