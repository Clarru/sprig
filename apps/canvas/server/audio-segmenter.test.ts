import { expect, it, vi } from "vitest";
import { AudioSegmenter } from "./audio-segmenter";
const silence = () => Buffer.alloc(4800);
const speech = () => {
  const b = Buffer.alloc(4800);
  for (let i = 0; i < b.length; i += 2) b.writeInt16LE(2000, i);
  return b;
};
it("keeps idle silence local and includes 300 ms of pre-roll", () => {
  const append = vi.fn(),
    commit = vi.fn();
  const segmenter = new AudioSegmenter(append, commit);
  for (let i = 0; i < 30; i++) segmenter.push(silence());
  expect(append).not.toHaveBeenCalled();
  segmenter.push(speech());
  expect(append.mock.calls[0][0]).toHaveLength(14400);
  expect(append.mock.calls[1][0]).toHaveLength(4800);
  expect(commit).not.toHaveBeenCalled();
});
it("commits after a pause, but keeps short pauses inside the utterance", () => {
  const append = vi.fn(),
    commit = vi.fn();
  const segmenter = new AudioSegmenter(append, commit);
  segmenter.push(speech());
  for (let i = 0; i < 6; i++) segmenter.push(silence());
  expect(commit).not.toHaveBeenCalled();
  segmenter.push(speech());
  for (let i = 0; i < 7; i++) segmenter.push(silence());
  expect(commit).toHaveBeenCalledOnce();
  for (let i = 0; i < 20; i++) segmenter.push(silence());
  expect(commit).toHaveBeenCalledOnce();
});
it("bounds continuous speech segments and resumes immediately", () => {
  const append = vi.fn(),
    commit = vi.fn();
  const segmenter = new AudioSegmenter(append, commit);
  for (let i = 0; i < 200; i++) segmenter.push(speech());
  expect(commit).toHaveBeenCalledOnce();
  segmenter.push(speech());
  expect(append).toHaveBeenCalledTimes(201);
});
it("ignores malformed PCM without throwing or committing", () => {
  const append = vi.fn(),
    commit = vi.fn();
  const segmenter = new AudioSegmenter(append, commit);
  segmenter.push(Buffer.from([1]));
  segmenter.push(Buffer.alloc(0));
  expect(append).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
it("can bypass the gate for diagnosis and manually finish an utterance", () => {
  const append = vi.fn(),
    commit = vi.fn();
  const segmenter = new AudioSegmenter(append, commit);
  segmenter.configure({ threshold: 0.02, pauseMs: 1500, continuous: true });
  segmenter.push(silence());
  expect(append).toHaveBeenCalledOnce();
  expect(segmenter.flush()).toBe(true);
  expect(commit).toHaveBeenCalledOnce();
  expect(segmenter.flush()).toBe(false);
});
