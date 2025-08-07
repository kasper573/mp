// Based on https://github.com/ssyrell/timespan-ts

export class TimeSpan {
  static readonly MillisecondsPerSecond = 1000;
  static readonly MillisecondsPerMinute = 60000;
  static readonly MillisecondsPerHour = 3600000;
  static readonly MillisecondsPerDay = 86400000;
  static readonly MaxValue = new TimeSpan(Number.MAX_SAFE_INTEGER);
  static readonly MinValue = new TimeSpan(Number.MIN_SAFE_INTEGER);
  static readonly Zero = new TimeSpan(0);

  private constructor(public readonly ms: number) {
    if (ms > Number.MAX_SAFE_INTEGER || ms < Number.MIN_SAFE_INTEGER) {
      throw new RangeError("TimeSpan is too long");
    }

    // Don't allow -0 values
    this.ms = Object.is(ms, -0) ? 0 : ms;
  }

  static fromMilliseconds(milliseconds: number): TimeSpan {
    return this.fromTime(
      undefined,
      undefined,
      undefined,
      undefined,
      milliseconds,
    );
  }

  static fromSeconds(seconds: number): TimeSpan {
    return this.fromTime(undefined, undefined, undefined, seconds);
  }

  static fromMinutes(minutes: number): TimeSpan {
    return this.fromTime(undefined, undefined, minutes);
  }

  static fromHours(hours: number): TimeSpan {
    return this.fromTime(undefined, hours);
  }

  static fromDays(days: number): TimeSpan {
    return this.fromTime(days);
  }

  static fromTime(
    days?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    milliseconds?: number,
  ): TimeSpan {
    const daysMilliseconds = (days ?? 0) * TimeSpan.MillisecondsPerDay;
    const hourMilliseconds = (hours ?? 0) * TimeSpan.MillisecondsPerHour;
    const minuteMilliseconds = (minutes ?? 0) * TimeSpan.MillisecondsPerMinute;
    const secondMilliseconds = (seconds ?? 0) * TimeSpan.MillisecondsPerSecond;

    return new TimeSpan(
      daysMilliseconds +
        hourMilliseconds +
        minuteMilliseconds +
        secondMilliseconds +
        (milliseconds ?? 0),
    );
  }

  static fromDateDiff(start: Date, end: Date): TimeSpan {
    return new TimeSpan(end.valueOf() - start.valueOf());
  }

  get totalMilliseconds(): number {
    return this.ms;
  }

  get totalSeconds(): number {
    return Number(this.ms / TimeSpan.MillisecondsPerSecond);
  }

  get totalMinutes(): number {
    return Number(this.ms / TimeSpan.MillisecondsPerMinute);
  }

  get totalHours(): number {
    return Number(this.ms / TimeSpan.MillisecondsPerHour);
  }

  get totalDays(): number {
    return Number(this.ms / TimeSpan.MillisecondsPerDay);
  }

  get milliseconds(): number {
    const value = Math.trunc(this.totalMilliseconds % 1000);
    return Object.is(value, -0) ? 0 : value;
  }

  get seconds(): number {
    const value = Math.trunc(this.totalSeconds % 60);
    return Object.is(value, -0) ? 0 : value;
  }

  get minutes(): number {
    const value = Math.trunc(this.totalMinutes % 60);
    return Object.is(value, -0) ? 0 : value;
  }

  get hours(): number {
    const value = Math.trunc(this.totalHours % 24);
    return Object.is(value, -0) ? 0 : value;
  }

  get days(): number {
    const value = Math.trunc(this.totalDays);
    return Object.is(value, -0) ? 0 : value;
  }

  /**
   * Compares two TimeSpan instances and returns an integer that indicates whether
   * the first value is shorter than, equal to, or longer than the second value.
   * @param t1 The first time interval to compare.
   * @param t2 The second time interval to compare.
   * @returns One of the following values:
   * | Value | Description               |
   * |:------|:--------------------------|
   * | -1    | `t1` is shorter than `t2` |
   * | 0     | `t1` is equal to `t2`     |
   * | 1     | `t1` is longer than `t2`  |
   */
  static compare(t1: TimeSpan, t2: TimeSpan): number {
    if (t1.ms < t2.ms) {
      return -1;
    }

    if (t1.ms === t2.ms) {
      return 0;
    }

    // t1 must be greater than t2
    return 1;
  }

  compareTo(value: TimeSpan): number {
    return TimeSpan.compare(this, value);
  }

  add(ts: TimeSpan): TimeSpan {
    return new TimeSpan(this.ms + ts.ms);
  }

  subtract(ts: TimeSpan): TimeSpan {
    return new TimeSpan(this.ms - ts.ms);
  }

  multiply(factor: number): TimeSpan {
    return new TimeSpan(this.ms * factor);
  }

  divide(divisor: number): TimeSpan {
    return new TimeSpan(this.ms / divisor);
  }

  duration(): TimeSpan {
    return new TimeSpan(Math.abs(this.ms));
  }

  negate(): TimeSpan {
    return new TimeSpan(this.ms * -1);
  }
}
