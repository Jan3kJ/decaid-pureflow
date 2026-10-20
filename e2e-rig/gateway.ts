import type { HotWaterData, Profile, RinseData, SteamSettings, Workflow, WorkflowContext } from '../src/api';

/** The workflow as the rig's Decaid answers it: every part is there. */
export type RigWorkflow = Workflow & {
  profile: Profile;
  context: WorkflowContext;
  steamSettings: SteamSettings;
  hotWaterData: HotWaterData;
  rinseData: RinseData;
};
