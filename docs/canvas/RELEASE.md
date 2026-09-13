# Demo deployment and open-source extraction

Requested release order: finish the foundation, complete the diagram/material design iteration, deploy the public demo to Vercel, then create the separate open-source GitHub project.

## Verified destinations

- GitHub CLI is authenticated as `Clarru`. `Clarru/sprig` is now public at https://github.com/Clarru/sprig.
- Vercel CLI is authenticated as `clarru`, in scope `clarrus-projects`.
- Existing Vercel project: `clarru-portfolio`, production domain `https://www.clarru.com`, root directory `.`, Next.js preset, Node 24.x, default Next build/output settings.
- Public demo route: `/playground/sprig`. Case study: `/sprig`. These portfolio routes already use the authored scenario player and do not import the standalone listening server or local agent client.

The demo belongs in the existing portfolio deployment. The local Node/WebSocket app remains part of the open-source repository for users to run with their own API key. No hosted key collection or funded trial is planned.

## Release steps

1. Complete the remaining checks in ACCEPTANCE.md and the design iterations in DESIGN-NEXT.md. Inspect the public routes at mobile and desktop sizes.
2. Prepare a clean portfolio release checkout containing only Sprig-related changes. Preserve unrelated working-tree edits, currently including `src/components/story-timeline.tsx` and `docs/car-wrap-shop-website-guide.md`.
3. Build and check that checkout, link it to `clarru-portfolio` in `clarrus-projects`, and deploy with the Vercel CLI. Verify the actual deployed `/playground/sprig` and `/sprig` routes, including that public interaction makes no microphone or AI requests. Record the resulting deployment URL and source revision.
4. Export the finished package and standalone app to a separate local folder using `scripts/export-canvas.mjs`. Install, test and build there. Review the exported file list and dependency/license notices. The exporter excludes credentials/configuration files, environment files except the empty template, dependencies, build output and Vercel linkage.
5. Initialize a clean Git history in that folder, add the verified demo URL to its README, then create the public `Clarru/sprig` repository and push the reviewed source. Do not reuse the portfolio's Git history or remote.
6. Publish a versioned package artifact from the new repository and switch the portfolio to the pinned package release. Verify that the portfolio renders the same components and redeploy the consumer change. The standalone repository then becomes the source of truth.

A GitHub release tarball can provide the pinned package without assuming an npm registry publication. Keep exact artifact integrity in the portfolio lockfile. Recheck repository/package names at release time and record the actual URLs rather than presenting planned URLs as live.

## Release content

Include `packages/canvas`, `apps/canvas`, Sprig documentation/tests, MIT license, and dependency/upstream notices. Exclude unrelated portfolio application/content, `.env` values, private package-manager configuration, local deployment linkage, logs and generated build directories. The generated README contains local run/build/test instructions and explains the silent assistant and optional script/agent interface.

The public demo and case study are deployed at https://www.clarru.com/playground/sprig and https://www.clarru.com/sprig. The standalone source of truth is https://github.com/Clarru/sprig. Versioned package tarballs are published through GitHub Releases; the portfolio consumes an exact release URL with lockfile integrity. The local checkout is now the sibling `../sprig`, with the ignored local server environment retained there.

References: [Vercel project configuration](https://vercel.com/docs/project-configuration), [Vercel deployments](https://vercel.com/docs/deployments). Existing project settings above were read from the authenticated Vercel CLI.
