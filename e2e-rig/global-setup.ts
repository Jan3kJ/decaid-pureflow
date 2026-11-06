// Runs once before the rig specs. The rig's machine goes to sleep after its presence minutes with
// no touch (30 by default), and the mocked suite that runs before the rig groups takes longer than
// that: the rig specs would start under the Asleep screen, which covers their buttons. So a sleeping
// machine is woken here, and each spec starts from an awake one. Best effort: with no gateway, the
// specs skip themselves.
const GATEWAY = 'http://localhost:8080';

async function machineState(): Promise<string | undefined> {
  try {
    const response = await fetch(`${GATEWAY}/api/v1/machine/state`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return undefined;
    return ((await response.json()) as { state: { state: string } }).state.state;
  } catch {
    return undefined;
  }
}

export default async function globalSetup(): Promise<void> {
  if ((await machineState()) !== 'sleeping') return;
  await fetch(`${GATEWAY}/api/v1/machine/state/idle`, { method: 'PUT', signal: AbortSignal.timeout(15_000) });
  for (let i = 0; i < 30 && (await machineState()) !== 'idle'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
