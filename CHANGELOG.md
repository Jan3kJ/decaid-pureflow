# Changelog

What changed in each version of pureflow, newest first. From 0.7.0 on a section is written by
the release script (`npm run release`) from the commits' `Changelog:` lines; the sections up to
0.6.1 summarise the hand-over builds that came before it.

## 0.9.0 - 2026-10-30

### Added

- The bean form reads a bag's photo in the OCR build. (Z43)

### Changed

- The space between controls now follows four steps. (Z41)

Checks: npm ci, npm run verify, npm run e2e and the rig suite passed.

## 0.8.0 - 2026-10-29

### Changed

- Every button says what it does in lower case, as 'save', 'cancel', 'discard and load' and 'use for the next shot'. (Z29)
- Warnings are orange with a '⚠', deleting is an orange outline, and a button that is off looks off. (Z30)
- On the steam and hot water pages the scale's row is the tare button, the numbers line up, and without a scale one line says the chips set the timer. (Z34)
- The profile picker opens with the loaded profile selected and shown, and the description's lower border lights up while there is more text below. (Z32)
- A selected chip, mode or tab is always the white fill, and the row whose detail is shown beside its list is always the white outline. (Z33)
- Home's profile and bean buttons show the name first, with the profile's family or the bean's roaster in a small line under it. (Z35)
- Every button is at least 3 rem on its short side, so the page dots, the step card's - and +, the graph's 'infuse to' and 'stop at' chips and the settings' sub-entries are easier to hit. (Z36)
- The settings' adjust fields read '−8 s', '−4 s', '+5 s' as on the steam page, 'Settings' and 'Beans and grinders' are headed like the other pages, and the corner menu's 'Steam heater' says 'on' or 'off'. (Z37)
- The grinder's step is a value chip with - and + on its own row, no longer beside 'numbers' and 'named positions'. (Z38)
- The A-Flow editor's detail view shows the fill and flow time under each phase's name. (Z39)
- The history's three filter chips, 'all', bean and grinder, are one width, the chosen one filled white. (Z40)

### Fixed

- Two browser tests that failed now and then on a busy machine pass every time, and the test run's pictures no longer stop a release. (Z26)
- The profile picker's estimate caption is never cut, and a forgotten device found again stays in the list. (Z44)
- The scale's weight no longer flickers between '-0.0' and '0.0 g' around zero. (Z31)
- In the A-Flow editor a dragged pressure, flow or temperature line follows the finger until it lifts; the page no longer starts to move. (Z45)

Checks: npm ci, npm run verify, npm run e2e and the rig suite passed.

## 0.7.0 - 2026-10-26

### Added

- The profile picker describes an A-Flow profile in a few short sentences (dose and yield, fill, infuse, 2nd fill, pour) after your own notes. (Z16)
- The hot water ring shows the target under its values, 'target 50 g' with a scale and 'target 50 ml' without. (Z22)
- While steam runs, a tap on an adjust button changes the running steam timer at once. (Z24)
- Move a stored profile's row to the right in the picker to rename it. (Z20)
- The picker has edit beside load; edit loads the profile and opens its editor. (Z21)

### Changed

- A bean's photo is kept as a photo; the skin no longer tries to read the bag. (Z19)
- README is the skin's front page, and the camera test page is gone from Settings > Skin. (P2)
- The tank unit is set under Quick Adjustments > Water Tank, beside the machine's tank settings. (Z18)
- The state word and the page title are the size of the profile and bean names. (Z23)
- The state says Pouring during a shot, and home keeps the profile and bean buttons in place, dimmed, while it runs. (Z25)

### Fixed

- The swipe back works on the whole screen, from the lists and columns, the graph's empty space and the left edge. (Z17)

Checks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.

## 0.6.1 - 2026-10-25

### Added

- The profile picker shows an estimate of the shot a profile would give: its flow, pressure and
  temperature.
- The state line can show the tank's water in ml; Skin > Display chooses ml or mm.
- While a shot runs, the header names the running step.

### Changed

- The menu sits in the top left corner of home, hot water and steam, and no screen has a back
  arrow: a swipe from left to right goes back.
- While hot water or flush runs, every screen shows one large ring with stop in it.
- No strip above home's graph; the graph takes its height.
- One size per kind of text: the profile and the bean on home are the same size, as are the rows
  of the profile, bean and grinder lists.
- The picker's graph is one square box for every profile; a long description scrolls under it.
- The bean photo is prepared and read better, and knows the roasters and beans of your catalogue.

## 0.6.0 - 2026-10-24

### Changed

- The graph's unit line puts a dot between every two units ('bar · ml/s · g/s').
- The '+ infuse' and '+ pressurize' buttons sit in the row of the phase names.
- The home menu's 'Beans and grinders' and 'Clean' have no second line.
- The date picker scrolls through the months with a finger drag or the mouse wheel.
- Convert to 3.0 reads a Pre Fill at its own temperature and says why a profile cannot be read.

### Fixed

- The finished shot keeps its weight; hot water, flush or steam no longer change it.
- Home shows the last shot again after a wake, a reload or the screen coming back on.

## 0.5.0 - 2026-10-23

### Added

- A bean can be filled in from a photo of its bag.
- The bean form's roast date opens a date picker.
- Without a scale, hot water stops at a volume in ml.

### Changed

- Home and the shot are one screen; the profile and bean buttons sit at the top of the right
  column while no shot runs.
- Three page dots and a history handle replace the edge tabs.
- The state line starts the header in the same place on home, steam and hot water.
- The state words (idle, heating, off) follow the heater, and the temperatures are filtered.
- The steam graph draws the flow; the steam clock runs from the first pouring frame to the last.
- A touch of the skin counts as presence, so the machine sleeps after the presence minutes from
  the last touch.

### Fixed

- Hot water values set quickly one after another are all sent.

## 0.4.0 - 2026-10-21

### Added

- Beans and grinders from home's menu, and the pick for the next shot; the history filters by
  bean and grinder.
- The picker deletes a stored profile with a swipe on its row.
- Skin > Profile > Convert to 3.0 converts the old A-Flow profiles.
- 'Machine and app sleep' in home's menu; 'Machine sleep' keeps the app awake.
- Skin > Active Skin and Display Size, the Bengle pages, the user manual and the firmware upload
  in the settings.

### Changed

- Every A-Flow profile opens in the A-Flow 3.0 editor.
- The hot water and flush ring shows on every screen.
- A swipe from left to right in an editor goes home.

## 0.3.0 - 2026-10-20

### Added

- Swipe between hot water, home and steam.
- The profile picker filters, shows a description and a preview, and loads with a button.
- The five A-Flow 3.0 defaults are kept in the skin and listed first.
- The finished shot stays over home with a table per phase.
- The menu's Clean opens the machine's clean with the tank in ml.

### Changed

- The espresso graph goes to 10 bar, has no tail after the shot, and its time axis follows the
  expected length.
- 'Heating' on home and steam, and one type scale.
- The editor shows its save state in one status line.
- The history lists the newest 20 shots first.

### Fixed

- The installed skin lost its stylesheet when the page was served with Windows line endings.

## 0.2.0 - 2026-10-18

### Added

- A step editor for profiles that are not A-Flow, with a curve preview and a SCRIPT tab.
- The hot water page, with stop at weight, ratio favourites and tare.
- The settings page, ported from Streamline.
- Steam off and on in home's menu, and machine off as sleep.
- The A-Flow values are kept in the profile's metadata.

### Changed

- The steam page has its graph, a countdown, adjust buttons and 140 to 170 °C.
- The A-Flow editor's detail mode has an end flow; infuse is drawn by its move-on weight.
- The scale page is gone: a tap on the weight tares.

## 0.1.1 - 2026-10-15

### Added

- The settings are backed up to Decaid and restored from it.
- The settings page names the skin's version.
- The skin asks before it loads a profile over unsaved edits.

### Changed

- The shot graph draws the weight flow in g/s.
- The editor's temperature axis is 80 to 100 °C and widens for a value outside.

## 0.1.0 - 2026-10-14

The first beta.

### Added

- Home with a live shot graph (blue flow, green pressure, red temperature, yellow weight), the
  profile picker, and the menu.
- The A-Flow 3.0 editor, in simple and detail mode, writing to the machine.
- The steam page with the timer set from the milk's weight.
- The shot history, with restore.
- Sleep and wake, and a reconnect.
