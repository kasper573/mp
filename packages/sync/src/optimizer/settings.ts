const globals = {
  isPatchOptimizerEnabled: true,
};

export function isPatchOptimizerEnabled(): boolean {
  return globals.isPatchOptimizerEnabled;
}

export function setPatchOptimizerEnabled(enabled: boolean): void {
  globals.isPatchOptimizerEnabled = enabled;
}
