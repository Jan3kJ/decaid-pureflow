# Changelog

What changed in each version of pureflow, newest first. From 0.7.0 on a section is written by
the release script (`npm run release`) from the commits' `Changelog:` lines; the sections up to
0.6.1 summarise the hand-over builds that came before it.

## 0.12.0 - 2026-11-09

### Changed

- On home the title 'Home' stands at the right end, on the same right edge as hot water and steam. (Z98)
- The camera has two arrow buttons, turn left and turn right, each turning the view a quarter. (Z99)
- Clean with detergent says 1 teaspoon and to empty the drip tray first, and the steps stand evenly apart with a line between them. (Z100)
- Home keeps your last shot during the clean with detergent; the cleaning run is not drawn there as a shot. (Z103)
- The slow start of a line drag is shorter: fine for the first 5 % of the plot's height, back to the full pace at 20 %. (Z116)
- The skin's look turns to dark glass: a near-black background with two faint lights, glass panels, brighter quantity colours, thin read numbers. (Z104)
- Buttons, chips and pad keys are glass lines that light when pressed or selected; the stop is a red outline with a slowly pulsing glow. (Z105)
- The header is one glass line on home, steam and hot water: the menu is a bare icon top right with the page's title beside it, the readings are centred over the main frame, and the state is a light behind the header instead of a word. (Z106)
- Hot water's values are thin lines with the number above: tap to light one, drag sideways to change it from where it was, tap its number again to type; while hot water runs the time and weight lines fill with the live values and there is no ring on this page. (Z107)
- Hot water's four lines sit in a glass frame like the graph on home: the same thin border, rounded corners and glass, with the lines and their numbers clear of the edge. (Z117)
- The scale row looks the same on steam and hot water: a thin 3 rem line with its caption centred against the number, and the 'last shot' caption on hot water is centred too. (Z118)
- Graphs are drawn as light: each measured curve glows softly in its colour and fades toward its start, the profile's dashed targets are thinner and have no glow, the grid is a faint trace, the axis labels are small and dim, and a curve draws in once when a page opens (not with reduced motion, never on a live update). (Z109)
- Steam is in glass: the timer is a thin number in the time colour with a soft glow, its caption small capitals, the timer and adjust chips are round edge-only glass chips that light when selected, and mug and milk are plain lines without boxes. (Z111)
- Home is in glass: the shot's live numbers are thin with a faint glow in their colour, captions are small capitals, the profile and bean cards light when pressed, the ring's arc is flow blue with a soft glow, and the profile picker's rows and panels are glass with the faint edge. (Z110)
- The profile editor is in glass: cards, fields and buttons are glass lines without fills, the open step card has the glowing edge, and a chip on the graph or a cycle chip glows in its quantity's colour while dragged, opened or pressed. (Z112)
- History, beans and the date picker are in glass: a list is rows on one glass panel with faint separators and the chosen row has the glowing edge, fields are a bottom line that glows in the text colour while typed in, and buttons are glass lines without fills. (Z113)
- Settings is in glass: the category column is text on a glass panel and the chosen category glows, rows and sections have faint edges, fields are a bottom line that glows while typed in, and value buttons, tiles and cards are glass lines without fills. (Z114)
- The user guide and its pictures show the dark glass: the eight screenshots are taken again, and the pages name the header, the top left corner and the lines instead of the state line. (Z115)
- Home's column keeps 'stops at' on one row and spaces its rows like the steam page. (Z120)
- The menu, the shot history and the dialogs have a dense dark surface, and the page behind the menu is darker. (Z121)
- The graphs' glow is dimmer and fades out softly, with no hard edge beside the line. (Z122)
- The graphs name their units in the legend ('flow · ml/s') and draw no unit text over the axes. (Z123)

### Fixed

- The clean's low-water warning no longer blinks during the run. (Z101)
- Clean with detergent flushes for 10 s whatever your flush time is, and gives your flush time back afterwards. (Z102)
- Steam's header shows no last steam while the heater is off, and every caption is lower case. (Z119)
- The camera overlay, turned a quarter, fills the screen with the video large and every button whole. (Z124)

Checks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.

## 0.11.0 - 2026-11-07

### Added

- A filter on the settings page finds a setting in every category, working where it is listed, and the profile picker's filter now finds words in any order. (Z83)
- Maintenance has 'Clean with detergent' before 'Clean': it loads Cleaning/Forward Flush x5 for you to start at the machine, follows the run, then leads you through a 10 s flush and the machine's cleaning cycle, and loads your earlier profile again at the end or on cancel. (Z87)
- The user guide tells how to clean with detergent, step by step. (Z87)
- The tank's ml can come from your own tank table, on the state line, in the water alert's note and in the clean's 350 ml check alike; the clean now reads the level between two mm as the state line does. (Z90)
- Settings > Quick Adjustments has 'Tank calibration': empty the tank, pour 250 ml at a time and tap next once the level is steady; 'done' from 1000 ml makes the skin use your own tank table, and 'back to decent's table' goes back. (Z90)
- The user guide tells how to make your own tank table, and the tank calibration's value and buttons sit together at the right of their row. (Z90)
- The tank calibration's help starts lower case, as every hint of the settings does. (Z90)
- The camera has a turn button that turns the whole view a quarter clockwise per tap, and for a second after the capture taps on the beans list are ignored. (Z95)

### Changed

- The stop reason ("stopped by hand") now lies under the temperature row. (Z75)
- The mug size on the steam page is a plain S, M or L, no frame and no background. (Z76)
- Anything selected now looks like the profile picker's row, a white frame on a slightly lighter background, on every page. (Z77)
- The captions beside the time, weight, pressure, flow and temperature are centred in their rows. (Z80)
- A new release holds pureflow.zip and pureflow-ocr.zip without a version in the name; Skin version installs an older release from that release's own pureflow.zip. (Z81)
- The space under a profile's description is the same as above it. (Z82)
- With the machine asleep and the app awake, the menu keeps 'Machine and app sleep' and the two-finger swipe down sends the app to sleep too. (Z84)
- The bag's photo thumbnail shows the whole photo in its own shape, a portrait photo upright and a landscape one wide. (Z85)
- The editor's message shows over the top of the graph for 10 s, a failure too, and a tap closes it; the graph no longer makes room for a row. (Z88)
- With the machine asleep, the menu shows 'Wake machine' before 'Machine and app sleep', which stays last. (Z94)
- On home the profile card starts level with the graph's top edge, and the title 'Home' stands at the top right. (Z96)
- In the editor a line dragged on the graph moves slowly at first, so small changes like a flow of 0.1 ml/s are easy, and faster the farther you drag. (Z97)

### Fixed

- The bag's reading finds a name printed up the side of the bag, as well as the upright lines. (Z86)
- The modelled shot no longer draws a pressure peak when a step's flow falls; the pressure only falls once the pump stops pushing. (Z89)
- The modelled shot is checked on every profile of a user's export, not only on the bundled ones. (Z93)
- The modelled shot no longer jumps where a step ends: the pressure the puck holds falls slowly and the flow falls over seconds. (Z93)
- The modelled flow comes down to a step's flow limit smoothly, without a last step down. (Z93)
- The architecture notes name the modelled shot, its fit check and the export profiles it is tested on. (Z93)

Checks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.

## 0.10.0 - 2026-11-01

### Added

- In the step editor's cards tab a tap on the graph opens the step under the finger and centres its card, as a tap on the card does. (Z55)
- A build can be installed on the tablet from a server on the PC before it is published: Settings > Skin > Backup and version > developer options shows Skin > Developer, which lists the server's ZIPs and has Decaid install one. (Z46)
- After 'check for skin updates' Settings > Skin > Active Skin says when Decaid holds another pureflow than the screen runs, and 'reload' loads it. (Z66)
- When Decaid stops a shot because 'scale required' is on and no scale is connected, a popup says so, with 'look for the scale' and 'close'. (Z71)
- After a shot, home says under its time and weight why it stopped: 'stopped at the target weight', 'stopped at the target volume', 'stopped by hand' or 'ended by the machine'. (Z72)
- When the scale drops during a shot with a target weight, a notice says to stop it by hand; when a shot ends abnormally, a popup says why. (Z73)
- Settings > Skin > Skin version picks the flavour, small or with the bean bag reading, lists pureflow's releases from GitHub on a tap, newest first, and has Decaid install the chosen one, then 'reload' loads it. (Z67)

### Changed

- Each release also carries the ZIPs as pureflow.zip and pureflow-ocr.zip, so Decaid's asset field can name one for good. (Z65)
- A selected chip or button has dark numbers, units and small lines on its white fill, so the hot water ratio chips read well. (Z49)
- Every label and hint in Settings starts lower case, titles keep their capital. (Z48)
- The picker's panel has more room for the description: no estimate caption and no A-Flow line, a smaller gap to edit and load. (Z50)
- In the profile picker rename sits beside delete at a row's right end, and a swipe to the right on a closed row goes back. (Z52)
- Home's time, weight and values read as on the steam page: caption at the left, number and unit at the right, 'stops at' on a second line under 'weight'. (Z53)
- On the steam page the captions scale, mug and milk sit centred beside their numbers, and the mug's size badge is as large as the number with its frame. (Z54)
- Settings > Quick Adjustments > Flush shows flow and duration only; the flush temperature had no effect, the water is at the group's temperature from the loaded profile. (Z64)
- Rows, fields and buttons come in three heights, so settings rows sit a little lower and dialog and form buttons a little taller. (Z56)
- A shot of 0 g or none shows a dash on home as on hot water, and hot water's ratio buttons are then grayed out and do nothing. (Z70)
- A shot picked from the history no longer shows the 'last shot with' row and its 'dismiss' over the graph; the graph starts right under the header and stays until the next shot. (Z68)
- The water level alert takes every whole mm from 0 to 69, so a typed 8 stays 8 instead of becoming 10. (Z69)
- Home's menu lines are one height, so the steam heater's text no longer sits at the top of its button; a two-finger swipe down on hot water, home or steam does 'Machine and app sleep'.

### Fixed

- Hot water shows the same last shot weight as home. (Z47)
- In the picker a pressure ramp's dotted target falls at the step's own pace, so the estimate of Advanced spring lever follows its target a second behind. (Z51)

Checks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.

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
