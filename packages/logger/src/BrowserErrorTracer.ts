export class BrowserErrorTracer {
  constructor(
    private window: Window,
    private handleError: (error: unknown) => unknown,
  ) {}

  start = () => {
    this.stop();
    this.window.addEventListener("error", this.onError);
    this.window.addEventListener(
      "unhandledrejection",
      this.onUnhandledRejection,
    );
  };

  stop = () => {
    this.window.removeEventListener("error", this.onError);
    this.window.removeEventListener(
      "unhandledrejection",
      this.onUnhandledRejection,
    );
  };

  private onError = (event: ErrorEvent) => {
    this.handleError(event.error);
  };

  private onUnhandledRejection = (event: PromiseRejectionEvent) => {
    this.handleError(event.reason);
  };
}
