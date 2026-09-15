# Neobrutalist diagram revision

Run the existing local app (`npm run dev`) and open http://127.0.0.1:5191/directions. Neobrutalism is the default lab direction; the live editor at `/` uses the same shared material.

The user-provided reference supersedes Frosted glass. Color-managed sRGB sampling produced lime #b5ff2c, yellow #ffd000, pink #ff006f and orange #fb5707. The user subsequently replaced orange with #fc702c; that is the active token for notes, failures, and error surfaces. The canvas remains white with #eeeeee dots. Black 2px node borders, hard offset shadows, uppercase titles and filled arrowheads follow the reference.

The conditional diamond is native geometry, not just a diamond icon. Its overlay mask and hover hit test follow the shape, and automatic layout reserves the central text area. Actions are rectangles; entry and end states are capsules; notes and failures are orange. Containers remain native frames with transparent interiors and shape surfaces clipped to their frame. Cross-frame edges keep their source and target semantics.

Arrow generation supplies explicit fixed ports for elbowed native arrows. This is required by Excalidraw; setting the elbow flag without ports drops the bindings and breaks round-trip semantics. Existing arbitrary native drawing and unaffected model behavior remain in place.

Verification covers diamond dragging, native arrow binding retention, transparent frames, parent movement, wrapping, masked native text, and cross-frame semantic round trips. The shared renderer changes apply to future story playback, but this task did not regenerate the private narration video or make any release/deployment.

## Controls and all surrounding containers

The redesign also covers the listening pill and its conversation history panel, native drawing toolbars and history controls, canvas menus, section captions, the native properties panel, color palettes, inputs, sliders, dialogs, example choice panels and diagnostic sections. The lab's surrounding controls follow the same treatment when Neobrutalism is selected.

Listening state is explicit: lime idle/listening, yellow connecting/working, pink clarification, orange error/interruption, white paused. Labels and behavior remain intact. On mobile, the Debug trigger sits above the listening area so it cannot cover the details button.

Color swatches use square selection outlines with a white separation gap; focus remains independently visible. Manual fill, stroke color and stroke width flow into the styled surfaces. Native drawing metadata marks the one-time theme migration so subsequent board updates do not continually reset a user's property choices.

Final combined verification: 236 unit tests and seven browser tests pass, including color and stroke changes retained after an explicit rename, palette opening, listening details at mobile width, native diamond dragging and bound elbow arrows, muted paint masks, parent moves and undo. The production build also passes. The swatch-selection correction is captured in `.impeccable/review/neo/swatch-selection.png`.


## Native editing consistency correction

The former labeled-card overlay created two competing appearances: empty shapes and text editing used native Excalidraw, while labeled rectangles/diamonds used HTML cards; ellipses never entered that overlay. This caused visible font/corner/style changes when typing.

The live editor now leaves all actual shape and text paint to Excalidraw. `NativeSurfaces` draws only hard-shadow silhouettes behind the native canvas, including empty rectangles, diamonds and ellipses. It never masks either native canvas and never paints duplicate text. The static `/directions` study still uses its presentation card components.

Fresh editor defaults are crisp strokes, solid yellow fill, Cascadia text and filled arrowheads. Explicit user choices for roughness, rounded corners, fill/stroke/font settings remain native and persist through text editing and subsequent semantic edits. There is no longer a label-dependent geometry or style switch. Native text can still expand a shape when needed to fit long content.

A related model bug was fixed: deleting a shape's bound text now clears its semantic title and detail instead of retaining the previous text. Browser regressions exercise drawing, typing, clearing and reopening rectangles, diamonds and ellipses, plus rounded/hand-drawn settings; existing native properties, arrows, frame movement and undo cases remain covered.

Native-consistency verification: 237 unit tests, nine browser tests and the production build pass. Screenshots of empty, editing and labeled states are in `.impeccable/review/native-consistency/`. No native canvas is masked; the decoration layer contains no duplicate card text.


## Arrow and font defaults

Generated connectors and the manual arrow tool now share `DIAGRAM_ARROW_STYLE` and `DIAGRAM_ARROW_TOOL`. Arrow-tool activation reapplies the filled triangular end, no start head, black 2px solid stroke, zero roughness and native elbow routing. This includes both toolbar and A-key entry, so stale shape preferences in an already-open editor cannot produce a different default arrow.

The diagram/chrome monospace previously resolved to platform Courier. Cascadia Code is now bundled locally under the CSS alias `Sprig Mono`; Hanken remains the regular UI face. The standalone editor serves its native Cascadia file from `/excalidraw/fonts/Cascadia/`. Browser checks inspect the actual rendered font with Chrome's font API and verify local native-font loading with external requests blocked.

Combined arrow/font verification passes: 237 unit tests, 11 browser tests and the production build. The font regression test verifies the rendered font with the browser's platform-font API, keeps external requests blocked, and confirms the live editor loads Cascadia from its local font path. Manual arrow tests cover both toolbar and A-key entry after changing unrelated drawing settings.
