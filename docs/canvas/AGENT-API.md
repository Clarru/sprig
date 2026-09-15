# Local Sprig agent API

Run `npm run dev:canvas` and open `http://127.0.0.1:5191`. The standalone editor registers a control connection automatically. This connection never captures audio or calls OpenAI. The portfolio examples do not register it.

Read `/api/bootstrap` on that loopback origin and keep its temporary `token` in memory. Send it as `Authorization: Bearer <token>` on agent HTTP requests. Do not put it in source, logs, exported documents or URLs shared with others. It expires when the server restarts. The OpenAI key is separate and is never needed for these drawing operations.

1. `GET /api/agent/boards` lists connected editors with document versions, IDs, titles, revisions, scene counts and active scene IDs. When several are open, choose the intended editor explicitly. Its ID also appears in Connection debug → Local agent tools.
2. `GET /api/agent/boards/:id` returns the versioned board, selected objects, editing state and a compact text summary. Native drawing data is included for lossless document operations.
3. `POST /api/agent/boards/:id/actions` accepts JSON as shown below. Supply the revision you just read and a unique request ID. The response waits for the live browser to acknowledge the edit.

```json
{
  "requestId": "onboarding-first-pass",
  "baseRevision": 0,
  "action": {
    "kind": "script",
    "script": "screen welcome \"Welcome\"\nafter welcome register \"Register\"\nafter register walkthrough \"Walkthrough\""
  }
}
```

A script is a small drawing vocabulary, not JavaScript. No `eval` or arbitrary code execution occurs. All lines validate before any edit is applied, and the request creates one undo entry. Use `rename`, `between`, `branch`, `connect`, `group`, `style`, and the other commands documented in the compiler. A syntax error identifies its line. The optional debug script console invokes the same compiler directly with zero model calls.

The preferred v2 API sends typed semantic operations:

```json
{
  "requestId": "onboarding-semantic-v2",
  "baseRevision": 0,
  "action": {
    "kind": "semantic",
    "operations": [
      {"type":"openScene","id":"signup","title":"Signup","kind":"flow","transition":"explicit","confidence":1},
      {"type":"upsertNode","sceneId":"signup","node":{"id":"email","label":"Enter email","role":"screen"}},
      {"type":"upsertNode","sceneId":"signup","node":{"id":"verify","label":"Verify email","role":"action"}},
      {"type":"setPath","sceneId":"signup","ids":["email","verify"]}
    ]
  }
}
```

Use `setPath` for a complete main path, `setRetry` for a condition returning to its original action, `setParallel` for simultaneous work, and `setGroup` for chapter or lane ownership. `openScene`, `activateScene`, `renameScene`, `changeSceneKind`, `upsertNode`, `reviseNode`, `removeNode`, `connect`, `disconnect`, and `focusScene` complete the public semantic vocabulary. These operations share the same validation, ownership rules, projection and native renderer as speech.

Version-1 clients may continue sending `{"kind":"meaning","events":[...]}` using `MeaningEventSchema` for one compatibility cycle. `{"kind":"history","direction":"undo"}` and `redo` use the shared manual/AI history. Run a history operation separately from a semantic or drawing action.

The server rejects stale revisions, a board in a manual gesture, simultaneous pending edits, invalid inputs and disconnected editors. The browser checks revision/editing/expiry again at application time. A 409 means read and reconsider. After a 504 acknowledgement timeout, inspect the board before sending another edit: it may already have applied. Repeating the exact request ID/body returns the retained result without applying twice; changing the body under that ID is rejected. The server retains the most recent 50 request results per connection.

Limits: 100 KB HTTP body, 16,000 script characters, 150 script lines, 100 resulting operations per transaction, five seconds for browser acknowledgement, and the normal document limits. The server binds to 127.0.0.1, requires its exact Host, checks browser Origins, and exposes no CORS access to other sites.
