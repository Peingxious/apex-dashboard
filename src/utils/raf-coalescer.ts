export class RafCoalescer<T> {
  private rafId: number | null = null;
  private latest: T | null = null;

  schedule(value: T, fn: (value: T) => void): void {
    this.latest = value;
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const v = this.latest;
      this.latest = null;
      if (v !== null) fn(v);
    });
  }

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.latest = null;
  }
}
