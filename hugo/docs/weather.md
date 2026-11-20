# Rain, dry breaks and ground water

Automatic fronts are repeatable functions of the world seed, position, season and elapsed **real weather minutes**. QA samples this timeline faster without changing the production clock. A monsoon hour may contain two rain bursts separated by dry weather. Edges rise over 40 seconds and recede over 45; winter has fewer bursts. Drying uses a weighted window of past rain, so returning clients do not restart with an arbitrarily dry surface. Photo may force clear, cloudy or wet weather. No live temperature is displayed.

Runoff follows strictly lower samples on the rendered surface; level basins do not produce uphill flow. Small depressions and trail ruts collect shallow puddles which contract as storage falls. Medium/High have bounded near rain geometry; saver keeps terrain legible and omits costly effects. There is no flashing lightning. Water depths are simulated, not gauge readings.
