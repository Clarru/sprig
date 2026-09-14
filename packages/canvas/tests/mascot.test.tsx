import React from "react";
import {readFileSync} from "node:fs";
import {sprigBrand,sprigIconSvg} from "../src/sprig-brand";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MascotFrame, mascotStates, sampleMascot } from "../src/mascot";
import type { AssistantState } from "../src/model";
import reference from "./bloub-reference.json";
it("preserves the pinned motion engine and renders the shared seedling in every state", () => {
  for (const [state, upstream] of Object.entries(mascotStates)) {
    for (const t of [0, 0.5, 1.2]) {
      const frame = sampleMascot(state as AssistantState, t);
      const hash = createHash("sha256")
        .update(JSON.stringify(frame))
        .digest("hex");
      expect(hash).toBe(
        (reference as Record<string, Record<string, string>>)[upstream][
          String(t)
        ],
      );
      const svg = renderToStaticMarkup(
        <MascotFrame
          frame={frame}
          animation={upstream}
          time={t}
          id="test"
          color="#0a0a0c"
          background="#f1efe9"
        />,
      );
      expect(svg).toContain(sprigBrand.body);
      for(const leaf of sprigBrand.leaves)expect(svg).toContain(leaf);
      expect(svg).toContain('data-character="sprig-seedling"');
      expect(svg).toContain("url(#test-mask)");
    }
  }
});

it("keeps the shipped icon generated from the same artwork as the mascot",()=>{
 expect(readFileSync(new URL("../src/sprig-icon.svg",import.meta.url),"utf8")).toBe(sprigIconSvg());
});
