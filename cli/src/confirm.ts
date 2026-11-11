import { createInterface } from "node:readline/promises";

/**
 * Asks a yes/no question, defaulting to no. Input that closes before an
 * answer, as Ctrl-D and Ctrl-C do, is a no too: depending on the Node
 * version, readline either rejects the pending question with ABORT_ERR or
 * leaves it pending forever, and neither may reach the user.
 */
export async function confirm(
  question: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  const rl = createInterface({ input, output });
  const closed = new Promise<undefined>((resolve) =>
    rl.once("close", () => resolve(undefined)),
  );
  try {
    const answer = await Promise.race([
      rl.question(`${question} [y/N] `),
      closed,
    ]);
    return answer !== undefined && /^y(es)?$/i.test(answer.trim());
  } catch (error) {
    if ((error as { code?: unknown }).code === "ABORT_ERR") return false;
    throw error;
  } finally {
    rl.close();
  }
}
