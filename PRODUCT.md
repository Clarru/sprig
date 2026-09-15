# Sprig
<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Sprig is a live meeting copilot for designers and product teams. It turns natural speech into a presentation-ready, editable diagram while the conversation is happening, then quietly reviews its own interpretation without interrupting the speaker.

## Primary Users

Designers, product managers, researchers, and technical collaborators who explain, critique, and iterate on ideas in meetings. They already reach for a blank canvas but cannot draw, present, and watch the room at the same time.

## Product Contract

- A stable spoken phrase should produce a useful concept or connection in roughly one to two seconds.
- One conversation can create several typed scenes on one infinite canvas.
- Story and Flow scenes are production features. System, Hierarchy, and Comparison are experimental until their evaluation gates pass.
- Sprig edits semantic intent; the application owns validation, layout, routing, visual semantics, persistence, and permissions.
- The deeper reviewer can restructure AI-owned work and cannot overwrite manually protected content, geometry, or style.
- Excalidraw remains the native editing foundation. Shapes, text, connections, bindings, selection, and gestures stay native.

## Local-First Privacy

Boards, transcript text, notes, and semantic evidence are stored locally through a storage adapter. Audio is never stored. Standard exports omit transcript text; an explicit export action includes it. The storage contract permits optional cloud sync later without changing the board format.

## Visual Commitments

The shared diagram language is neobrutalist: pure white canvas, #eeeeee dot grid, black ink, bold local display type, filled-tip orthogonal arrows, true diamond decisions, and sampled lime, yellow, pink, and #fc702c accents. Shape, label, line style, and grouping communicate meaning in addition to color.

## Current Architecture

Board document version 2 contains first-class semantic scenes, transcript evidence, field ownership, layout state, native-only elements, and a reconstructable native cache. Version 1 files migrate deterministically and receive a recoverable local backup.

## Release Priorities

1. Semantic correctness and preservation of manual work.
2. Stable live placement and complete connections.
3. Fast, non-blocking feedback during speech.
4. Presentation clarity and visual expression.
5. Extensible recipes and optional persistence adapters.
