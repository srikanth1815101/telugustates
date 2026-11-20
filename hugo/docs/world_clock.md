# World time is not your watch

The published `living/world.json` comes from `config/world.json`. Everyone using the default has the same epoch, 4-real-hour cycle and 28-real-day year. Two-hour and six-hour alternatives change only the visual day; Live shows the IST sky for the current instant. Manual hour and Photo overrides are local. The details sheet separately shows the actual device-local time.

A typical four-hour cycle allocates 15 minutes each to dawn/dusk, 150 to daylight and 60 to night. The astronomical calculation adds local latitude and seasonal variation. The offset comes from UTC elapsed milliseconds, not a timer reset at launch. Minor device clock corrections ease in; a long background interval or a substantial wall-clock change re-anchors. Offline devices with wrong clocks cannot be perfectly synchronized. No server clock or permission is required. The economy uses real Asia/Kolkata civil dates, never the visual clock.
