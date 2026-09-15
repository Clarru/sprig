import { MeaningEventSchema, type MeaningEvent } from "./story";
import { SemanticOperationSchema, type SemanticOperation } from "../semantic-operations";
import { z } from "zod";
export const UnderstandingEventSchema = z.union([SemanticOperationSchema, MeaningEventSchema]);
export type UnderstandingEvent = SemanticOperation | MeaningEvent;
/** Extract complete events from one streamed tool call. No partial object is executed. */
export class MeaningStream {
  private buffer = "";
  private cursor = 0;
  private arrayStart = -1;
  private objectStart = -1;
  private depth = 0;
  private quoted = false;
  private escaped = false;
  private ended = false;
  push(delta: string): UnderstandingEvent[] {
    this.buffer += delta;
    if (this.buffer.length > 32000)
      throw new Error("Understanding response is too large");
    const events: UnderstandingEvent[] = [];
    if (this.arrayStart < 0) {
      const match = /"events"\s*:\s*\[/.exec(this.buffer);
      if (!match) return events;
      this.arrayStart = match.index + match[0].length;
      this.cursor = this.arrayStart;
    }
    for (; this.cursor < this.buffer.length && !this.ended; this.cursor++) {
      const c = this.buffer[this.cursor];
      if (this.quoted) {
        if (c === '"' && !this.escaped) this.quoted = false;
        this.escaped = c === "\\" && !this.escaped;
        continue;
      }
      if (c === '"') {
        this.quoted = true;
        this.escaped = false;
        continue;
      }
      if (c === "{") {
        if (this.depth === 0) this.objectStart = this.cursor;
        this.depth++;
      } else if (c === "}") {
        this.depth--;
        if (this.depth < 0) throw new Error("Malformed understanding response");
        if (this.depth === 0 && this.objectStart >= 0) {
          events.push(
            UnderstandingEventSchema.parse(
              JSON.parse(this.buffer.slice(this.objectStart, this.cursor + 1)),
            ),
          );
          this.objectStart = -1;
        }
      } else if (c === "]" && this.depth === 0) this.ended = true;
    }
    return events;
  }
  get arguments() {
    return this.buffer;
  }
}
