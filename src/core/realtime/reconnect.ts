const MIN_DELAY = 1_000
const MAX_DELAY = 30_000

export class ExponentialBackoff {
  private attempt = 0

  next(): number {
    const delay = Math.min(MIN_DELAY * 2 ** this.attempt, MAX_DELAY)
    this.attempt++
    return delay
  }

  reset(): void {
    this.attempt = 0
  }
}
