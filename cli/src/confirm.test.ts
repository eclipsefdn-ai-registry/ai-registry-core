import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { confirm } from "./confirm.js";

function ask(input: PassThrough): Promise<boolean> {
  return confirm("Install it?", input, new PassThrough());
}

describe("confirm", () => {
  for (const answer of ["y", "yes", " YES "]) {
    it(`reads ${JSON.stringify(answer)} as yes`, async () => {
      const input = new PassThrough();
      const answered = ask(input);
      input.write(`${answer}\n`);
      assert.equal(await answered, true);
    });
  }

  for (const answer of ["", "n", "sure"]) {
    it(`reads ${JSON.stringify(answer)} as no`, async () => {
      const input = new PassThrough();
      const answered = ask(input);
      input.write(`${answer}\n`);
      assert.equal(await answered, false);
    });
  }

  // Ctrl-D closes the input; Ctrl-C closes the prompt. Either is a no, not a
  // stack trace.
  it("reads input that ends before an answer as no", async () => {
    const input = new PassThrough();
    const answered = ask(input);
    input.end();
    assert.equal(await answered, false);
  });
});
