# Sprig

A quiet canvas for explaining ideas. Speak naturally; the assistant builds and revises a sketch, communicating through a pebble mascot and short status bubbles. It never speaks back.

Sprig is experimental. This repository contains the portable React components, standalone editor, local listening server, examples, tests and project notes.

[Interactive demo](https://www.clarru.com/playground/sprig) · [Case study](https://www.clarru.com/sprig)

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5191. Interactive examples need no API key. For live listening, copy `apps/canvas/.env.example` to `apps/canvas/.env` and configure your own key. Keep it server-side; do not prefix it with VITE_. The server binds to loopback.

## Build and verify

```sh
npm test
npm run build
```

The [local agent API](docs/canvas/AGENT-API.md) and drawing-script console can edit the same board without another model request. The [project guide](docs/canvas/README.md) explains component embedding. See [architecture](docs/canvas/ARCHITECTURE.md), [validation](docs/canvas/VALIDATION.md), and [recorded measurements](docs/canvas/evals/RESULTS.md) for the current experimental limits.

## License

Original code is MIT. Preserve [third-party notices](packages/canvas/THIRD_PARTY_NOTICES.md), including the vendored Bloub license and pinned upstream revision.


## Rehearse a Sprig demo

The [recording script](docs/canvas/DEMO-SCRIPT.md) explains Sprig while it draws its own flow. The [listening companion](docs/canvas/LISTENING-COMPANION.md) documents the persistent mascot control, real speech reactions, concise change history, arrival emphasis, and optional playground sounds. `npm run rehearse:demo` is an opt-in, billable test using the local server's configured model.
