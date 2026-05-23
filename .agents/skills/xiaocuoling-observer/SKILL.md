---
name: xiaocuoling-observer
description: Use this skill when the user wants Codex work to be tracked by 小搓灵. It helps Codex define task goals, preserve scope, run verification, and write a structured session summary for growth scoring.
---

# Xiaocuoling Observer

1. Before editing, restate the task goal.
2. Identify scope: what files or areas should change.
3. Identify constraints: what must not be changed.
4. Prefer small focused changes.
5. After editing, run the most relevant verification command:
   - npm run build
   - npm test
   - git diff --stat
6. If verification fails, attempt one repair cycle.
7. At the end, write `.xiaocuoling/session-summary.json` with:
   - taskGoal
   - changedAreas
   - commandsRun
   - verificationPassed
   - buildSuccess
   - testSuccess
   - detectedSkills
   - deliveryStatus: inactive / unverified / working / delivered / breakthrough
   - summary
8. Do not write secrets, API keys, or full private logs.
9. Do not claim success unless verification actually ran.
