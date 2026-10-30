// A short text made from an A-Flow 3.0 profile's values: what the picker
// shows under the graph. It is made when it is shown and never stored, so a change of wording
// changes every profile. English, facts only, a phase that is off left out.
import type { EditField } from '../editor/curve';
import { formatValue } from '../editor/fields';
import { hasSecondFill, resolveParams } from './generator';
import type { AFlowParams } from './types';

export interface DescribeOptions {
  /** false for a profile whose dose is not its own (one read from an older A-Flow profile's steps) */
  dose?: boolean;
}

/** A value as the editor shows it, at most one decimal: a value read from another profile may have more. */
function format(field: EditField, value: number): string {
  return formatValue(field, Math.round(value * 10) / 10);
}

/** The ratio of yield to dose, '1:2.6': one decimal, a whole number without it. */
function ratio(dose: number, stopWeight: number): string {
  return `1:${(stopWeight / dose).toFixed(1).replace(/\.0$/, '')}`;
}

/** Three to five sentences: dose and yield, the fill, the infuse, the 2nd fill and its pause, the pour. */
export function describeAFlow(params: AFlowParams, options: DescribeOptions = {}): string {
  const p = resolveParams(params);
  const sentences: string[] = [];

  const out = format('stopWeight', p.stopWeight);
  if (p.stopWeight <= 0) sentences.push('No stop weight.');
  else if (options.dose === false || p.dose <= 0) sentences.push(`${out} out.`);
  else sentences.push(`${format('dose', p.dose)} in, ${out} out, a ratio of ${ratio(p.dose, p.stopWeight)}.`);

  // A temperature is named with the first phase and again where it changes.
  let named: number | null = null;
  const at = (temperature: number): string => {
    if (named !== null && Math.abs(temperature - named) < 1e-6) return '';
    named = temperature;
    return `at ${format('fillTemperature', temperature)}`;
  };
  const sentence = (...parts: string[]) => `${parts.filter((part) => part !== '').join(', ')}.`;

  if (p.fillTime > 0) {
    sentences.push(
      sentence(
        `Fills at ${format('fillFlow', p.fillFlow)} until ${format('fillExitPressure', p.fillExitPressure)} or ${format('fillTime', p.fillTime)}`,
        at(p.fillTemperature),
      ),
    );
  }

  if (p.infuseTime > 0) {
    const until = p.infuseWeight > 0 ? ` or until ${format('infuseWeight', p.infuseWeight)}` : '';
    sentences.push(
      sentence(
        `Infuses at ${format('infusePressure', p.infusePressure)}`,
        p.infuseFlowLimit > 0 ? `${format('infuseFlowLimit', p.infuseFlowLimit)} at most` : '',
        `for ${format('infuseTime', p.infuseTime)}${until}`,
        at(p.infuseTemperature),
      ),
    );
  }

  if (hasSecondFill(p)) {
    sentences.push(
      sentence(
        `A second fill at ${format('secondFillFlow', p.secondFillFlow)}`,
        at(p.secondFillTemperature),
        `then a pause of up to ${format('pauseDuration', p.pauseDuration)}`,
      ),
    );
  }

  const pressure = format('pourPressure', p.pourPressure);
  const start = format('pourFlow', p.pourFlow);
  const end = format('pourEndFlow', p.pourEndFlow);
  const time = format('pourTime', p.pourTime);
  // Without a ramp the pour starts at its flow at once (the generator's Flow Start).
  const ramp = p.rampTime > 0 ? `Ramps to ${pressure} in ${format('rampTime', p.rampTime)}` : '';
  const pours = `${ramp ? 'then pours' : 'Pours at once'} at ${start}`;
  const flow =
    end === start ? `${pours} for ${time}` : `${pours}, ${p.pourEndFlow > p.pourFlow ? 'rising' : 'falling'} to ${end} over ${time}`;
  const limit = p.pourPressureLimit;
  sentences.push(
    sentence(
      ramp,
      ramp ? at(p.rampTemperature) : '',
      flow,
      limit > 0 && Math.abs(limit - p.pourPressure) > 1e-6 ? `at most ${format('pourPressureLimit', limit)}` : '',
      at(p.pourTemperature),
    ),
  );

  return sentences.join(' ');
}
