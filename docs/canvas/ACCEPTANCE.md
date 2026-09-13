# Foundation acceptance checkpoint

The foundation goal remains active. This matrix separates implemented behavior from the remaining UI evidence.

| Requirement | Current evidence | Still needed |
|---|---|---|
| Freestyle explanation → incremental sketch | Real Luna/LiveSession recordings: running-app scope, welcome/register/walkthrough, correction; physical parcel workflow; browser/service calls | Final browser check of the current voice/manual combination |
| Understanding is general language, not phrase mapping | One streamed `update_story` tool; typed identity, relationship and sketch policy; direct script is optional | Continue collecting failures during use; no claim of universal accuracy |
| Manual drawing references and corrections | Manual-adoption tests; actual model renamed a selected manual card while retaining ID, position and dimensions | End-to-end UI replay after the newest handoff fixes |
| Ongoing speech, manual move, undo, stop and restart | Production LiveSession tests for continuation, stale revision reconsideration, manual history cancellation, late events and unique session IDs | Live UI confirmation after unlock |
| Native whiteboard controls | CUA: rectangle shortcut/drag, text editing, rapid duplicate/undo, reload, select-all/group and grouped copy/paste | Remaining tool shortcuts, Space-pan/zoom, delete/ungroup, shortcut isolation and full image/document UI round trip |
| Public interactive scenarios | All 12 branches exercised via CUA; Back/Restart and editable-copy return checked; corrected onboarding paint order captured | Final mobile pass and full browser-suite execution |
| Local agent access | Real HTTP action reached the browser; duplicate request replay retained the original revision; unit tests cover stale edits, timeouts, disconnection and atomic scripts | Final check alongside an active voice session |
| Lower drawing overhead | Optional script executes without model requests; 92-byte sample script generated 772 bytes of operations | No universal billed-cost claim; measure representative real use |
| Portability and portfolio integration | Current root/standalone builds, 191 tests in both workspaces, case-study and workbench contracts passed | Final browser/import checks |
| Public release | Authenticated Vercel/GitHub destinations checked; clean release preflight installs, passes 191 tests and builds; licenses included | Deploy finished demo to existing portfolio, create Clarru/sprig, and switch portfolio to a pinned release as detailed in RELEASE.md |
| Diagram visual iteration | Research and brief in DESIGN-NEXT.md | Requested material/card iterations after foundation verification |

The macOS computer-use surface reported that the Mac was locked and automatic unlock was paused. It requires the user to unlock it manually. No unlock workaround was attempted. Code/model verification continued; the UI rows above remain pending.


## Release verification — Sprig

The Mac is unlocked and the remaining browser checks have now run. Nine Playwright tests pass: the full authored branch set, manual editing, all listed tool shortcuts, held Space/hand pan, zoom, clipboard, grouping/ungrouping, delete/undo, image and document round trips, mobile/public layout, late microphone permission cleanup, controlled streamed edits during manual dragging/undo, and coalesced smooth camera follow with manual cancellation. The decorative card layer is checked against actual native geometry. 191 unit tests and production builds pass. See DESIGN-NEXT.md for the completed visual iteration. Deployment, GitHub creation and the pinned-package consumer migration remain the final release steps.
