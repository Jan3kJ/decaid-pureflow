// After a photo is taken a double tap can land on the bean list behind the closed camera and select
// another bean, which drops the unsaved photo. For this long after the capture such taps are ignored.

/** How long after a capture the taps that select another bean or leave the form are ignored, in milliseconds. */
export const CAPTURE_GUARD_MS = 1000;

let capturedAt = -Infinity;

/** The photo was just taken. */
export function markCapture(now: number = Date.now()) {
  capturedAt = now;
}

/** Whether a tap that would select another bean or leave the form is ignored now. */
export function captureGuarded(now: number = Date.now()): boolean {
  return now - capturedAt < CAPTURE_GUARD_MS;
}

/** No capture is remembered. */
export function resetCaptureGuard() {
  capturedAt = -Infinity;
}
