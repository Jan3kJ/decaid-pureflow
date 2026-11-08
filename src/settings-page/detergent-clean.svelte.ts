// The clean with detergent's state and requests. A part of `Skin`, since the run goes on when the
// settings page is left and the card shows where it is when it is opened again. The only writes
// to the machine are the profile's load and its way back, and the states the procedure asks for.
import type { DecaidClient, MachineSnapshot, RequestedMachineState, Workflow } from '../api';
import { errorMessage } from '../error-message';
import { frameTime } from '../shell/shot';
import { loadRecord } from '../shell/profiles';
import {
  DETERGENT_TITLE,
  NOT_ON_MACHINE,
  NOT_STARTED,
  RUN_SETTLE_MS,
  abandoned,
  begun,
  earlierOf,
  flushBackPatch,
  flushSetPatch,
  flushIsOver,
  follow,
  followsRun,
  frameOf,
  machineRuns,
  readStored,
  restorePatch,
  type Detergent,
} from './detergent';
import { WAKE_TIMEOUT_MS, started } from './maintenance';

/** The state and the earlier profile survive a reload of the page. */
export const DETERGENT_KEY = 'pureflow.detergent-clean';

/** The procedure's name in its messages; the same as its card's. */
export const DETERGENT_NAME = 'Clean with detergent';

/** What the procedure reads and writes of the skin. */
export interface DetergentHost {
  readonly client: DecaidClient;
  workflow: Workflow | null;
  readonly snapshot: MachineSnapshot | null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadState(): Detergent {
  try {
    return readStored(localStorage.getItem(DETERGENT_KEY));
  } catch {
    return NOT_STARTED;
  }
}

export class DetergentClean {
  state: Detergent = $state.raw(loadState());
  message: string | null = $state(null);
  /** a request of the card is in flight; frames wait, so they do not judge a state half set */
  busy = $state(false);
  private readonly host: DetergentHost;
  /** the skin's stop of this flush has gone out */
  private flushStopped = false;
  /** ms, when the last run left the machine; the earlier profile waits for Decaid to settle */
  private runEndedAt = 0;
  /** the way back after the cycle was tried; the card's 'try again' asks again */
  private restoreTried = false;

  constructor(host: DetergentHost) {
    this.host = host;
  }

  private set(next: Detergent): void {
    this.state = next;
    try {
      if (next.earlier) localStorage.setItem(DETERGENT_KEY, JSON.stringify(next));
      else localStorage.removeItem(DETERGENT_KEY);
    } catch {
      // no storage: the earlier profile lasts until the page unloads
    }
  }

  /** A frame of the machine. */
  frame(frame: MachineSnapshot): void {
    if (this.busy || this.state.stage === 'idle') return;
    if (abandoned(this.state, this.host.workflow?.profile?.title)) {
      void this.checkAbandoned();
      return;
    }
    const at = frameTime(frame.timestamp);
    const next = follow(this.state, frameOf(frame, at, Date.now(), this.host.workflow));
    if (this.state.stage === 'run' && next.stage !== 'run') this.runEndedAt = Date.now();
    if (next !== this.state) this.set(next);
    if (next.stage !== 'flush') this.flushStopped = false;
    else if (flushIsOver(next, at) && !this.flushStopped) {
      this.flushStopped = true;
      void this.ask('idle', 'The flush was not stopped');
    }
    if (next.stage === 'done' && next.earlier && !this.restoreTried) void this.restoreAfterCycle();
  }

  /** A workflow read from before the load may be what says so: the machine's own answer decides. */
  private async checkAbandoned(): Promise<void> {
    await this.act(`${DETERGENT_NAME} did not go on`, async () => {
      const workflow = await this.host.client.getWorkflow();
      this.host.workflow = workflow;
      if (abandoned(this.state, workflow.profile?.title)) this.set(NOT_STARTED);
    });
  }

  /** The card stays while the run starts; home opens by itself otherwise. */
  holdsScreen(screen: string): boolean {
    return screen === 'settings' && followsRun(this.state);
  }

  /** The card's start: the earlier profile kept first, then the load; without the profile nothing is loaded. */
  async start(): Promise<void> {
    this.restoreTried = false;
    await this.act(`${DETERGENT_NAME} did not start`, async () => {
      const record = (await this.host.client.listProfiles()).find((candidate) => candidate.profile.title === DETERGENT_TITLE);
      if (!record) {
        this.message = NOT_ON_MACHINE;
        return;
      }
      await this.awake();
      this.set(begun(earlierOf(await this.host.client.getWorkflow())));
      try {
        // Its target weight is 0, which leaves the earlier one in the workflow: no stop at a weight in this run.
        this.host.workflow = await loadRecord(this.host.client, record, { targetYield: 0 });
      } catch (cause) {
        this.set(NOT_STARTED);
        throw cause;
      }
      // The flush runs 10 s, the machine's own button's too; restore() gives the earlier time back.
      const flushPatch = flushSetPatch(this.host.workflow?.rinseData);
      if (flushPatch) this.host.workflow = await this.host.client.updateWorkflow(flushPatch);
    });
  }

  /** The second step's button: the machine's flush, as its own button starts it. */
  async flush(): Promise<void> {
    await this.act('The flush did not start', async () => {
      await this.awake();
      await this.host.client.requestMachineState('flush');
    });
  }

  /** The last step's button: the machine's cleaning cycle. */
  async cycle(): Promise<void> {
    const before = this.state;
    await this.act('The cleaning cycle did not start', async () => {
      this.set({ ...before, stage: 'cycle', stopped: false, cycle: started(Date.now()) });
      try {
        await this.awake();
        await this.host.client.requestMachineState('cleaning');
      } catch (cause) {
        this.set(before);
        throw cause;
      }
      this.set({ ...this.state, cycle: started(Date.now()) });
    });
  }

  /** Cancel and finish: what runs stops, the earlier profile comes back, the card closes. */
  async cancel(): Promise<void> {
    await this.act(`${DETERGENT_NAME} was not stopped`, async () => {
      if (machineRuns(this.state)) await this.host.client.requestMachineState('idle');
      if (this.state.stage === 'run') this.runEndedAt = Date.now();
      await this.restore();
      this.set(NOT_STARTED);
    });
  }

  /** After the cycle the card says Ready; it offers another try while the profile is not back. */
  async restoreAfterCycle(): Promise<void> {
    this.restoreTried = true;
    await this.act('The earlier profile was not loaded again', async () => {
      await this.restore();
      this.set({ ...this.state, earlier: null });
    });
  }

  /** The workflow's profile, target weight and dose as they were, unless another profile was loaded meanwhile; the flush time too, unless changed. */
  private async restore(): Promise<void> {
    const { earlier } = this.state;
    if (!earlier) return;
    const settling = this.runEndedAt + RUN_SETTLE_MS - Date.now();
    if (settling > 0) await wait(settling);
    const current = await this.host.client.getWorkflow();
    const profileBack = current.profile?.title === DETERGENT_TITLE ? restorePatch(earlier) : {};
    const patch = { ...profileBack, ...flushBackPatch(earlier, current.rinseData) };
    if (Object.keys(patch).length) this.host.workflow = await this.host.client.updateWorkflow(patch);
  }

  /** A sleeping DE1 drops a request: wake it first and wait, then ask anyway. */
  private async awake(): Promise<void> {
    const asleep = () => this.host.snapshot?.state.state === 'sleeping';
    if (!asleep()) return;
    await this.host.client.requestMachineState('idle');
    for (let waited = 0; waited < WAKE_TIMEOUT_MS && asleep(); waited += 250) await wait(250);
  }

  private async ask(state: RequestedMachineState, failure: string): Promise<void> {
    try {
      await this.host.client.requestMachineState(state);
    } catch (cause) {
      this.message = `${failure}: ${errorMessage(cause)}`;
    }
  }

  private async act(failure: string, run: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = null;
    try {
      await run();
    } catch (cause) {
      this.message = `${failure}: ${errorMessage(cause)}`;
    } finally {
      this.busy = false;
    }
  }
}
