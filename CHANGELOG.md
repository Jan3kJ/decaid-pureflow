# Changelog

What changed in each version of pureflow, newest first. From 0.7.0 on a section is written by
the release script (`npm run release`) from the commits' `Changelog:` lines; the sections up to
0.6.1 summarise the hand-over builds that came before it.

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
