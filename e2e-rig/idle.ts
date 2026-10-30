/**
 * The state line of an idle machine: the DE1 says idle while it heats, and home says Heating
 * until the group is 3 °C under its target; the simulated group is often cooler.
 */
export const IDLE = /^(Idle|Heating)$/;
