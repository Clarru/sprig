import { expect, it } from "vitest";
import { MeaningStream } from "./stream";
it("emits complete events incrementally, including escaped quotes and braces in labels", () => {
  const stream = new MeaningStream();
  expect(
    stream.push('{"events":[{"type":"concept","id":"a","label":"A'),
  ).toEqual([]);
  expect(stream.push(' \\"quoted\\" {thing}"},')).toEqual([
    { type: "concept", id: "a", label: 'A "quoted" {thing}' },
  ]);
  expect(
    stream.push(
      '{"type":"concept","id":"b","label":"B"}],"summary":"Two things"}',
    ),
  ).toEqual([{ type: "concept", id: "b", label: "B" }]);
});
it("does not execute a partial or invalid event", () => {
  const stream = new MeaningStream();
  expect(stream.push('{"events":[{"type":"concept"')).toEqual([]);
  expect(() => stream.push(',"id":"a"}]}')).toThrow();
});
