# Troubleshooting

Checked against pureflow 0.6.1. For the DE1 itself, see
[Decent's documentation](https://decentespresso.com/docs).

## The connection

The top line says when something is missing.

| The skin says | What it means | What to do |
|---|---|---|
| **Connecting** | the skin is starting | wait a moment |
| **Decaid is not reachable** | no answer from Decaid; the skin keeps trying | make sure Decaid runs, and open the skin through Decaid |
| **Decaid closed the connection** | Decaid answered with errors for 30 s | tap **reconnect** at the bottom of the screen |
| **No machine connected** | Decaid runs, but the DE1 is not connected | connect the machine in Decaid, or under Settings > 2. Connections > 1. Machine |
| **Asleep**, 'touch to wake' | the machine sleeps | touch the screen to wake it |

## The scale

Without a scale the top line reads **scale ⚠ not connected, tap to retry**. The skin looks for a
known scale by itself when it drops. A tap on the warning, or on **tare**, looks again. If that
does not find it, wake the scale and connect it under **Settings > 2. Connections > 2. Scale**.

Without a scale there is no stop at weight, and the steam timer has no mug and milk to count
from.

## The steam timer

- **set timer** is grey: no milk is on the scale yet. Put the mug with milk on it, or use one
  of the three timer chips.
- The mug size is wrong: set the weights of your empty mugs under
  **Settings > 6. Skin > Steam**.
- The milk comes out too hot or too cold: change the calibration there, or use the adjust
  buttons on the steam page.
- 'The machine's timer is … s, not the … s set here': another app changed the timer. Tap
  **set timer** again.
- The steam page says **Off** and shows **steam on**: the steam heater is off. Tap **steam on**,
  or use the menu.

## The bag photo

**photo** opens the live camera. Where Decaid's window refuses it, the dialog says so and
shows **take a picture**, which opens the tablet's own camera instead. The skin does not read
the bag: type the name and the roaster.

## A profile does not load

The picker says **The profile could not be loaded** and why.
Check that the machine is connected and not asleep. An old A-Flow profile that the editor cannot
read opens in the step editor instead.

## Go back to Streamline

Open **Settings > 6. Skin > Active Skin** and tap **Streamline.js**, Decaid's own skin. The skin asks first, then
Decaid makes Streamline its default and opens it. You can also choose the skin in Decaid's own
skin selector (see [Decaid's skin page](https://github.com/decentespresso/decaid/blob/v0.8.8/doc/Skins.md)).
pureflow stays installed; select it the same way to come back.

## Report a problem

Open an issue on [GitHub](https://github.com/Jan3kJ/decaid-pureflow/issues). Say:

- the skin's version (top right of its settings page) and Decaid's version;
- the tablet;
- what you did, what happened, and what you expected.
