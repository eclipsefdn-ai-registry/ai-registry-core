// Reading and editing `chat.pluginLocations` in VS Code's user settings.json,
// which is JSON with comments and trailing commas. Edits go through
// jsonc-parser, so comments, formatting and every other setting stay as they
// were. Pure: the probe reads the file and the executor writes it.
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  stripComments,
  type ParseError,
} from "jsonc-parser";

export const PLUGIN_LOCATIONS = "chat.pluginLocations";

/**
 * The entries of `chat.pluginLocations` (folder → whether VS Code loads it),
 * none when the file is missing, empty or doesn't set it. Not ok, with what is
 * wrong, when the file can't be parsed, isn't an object, or sets
 * `chat.pluginLocations` to anything but an object: then it can't be edited
 * safely.
 */
export function readPluginLocations(
  text: string | undefined,
):
  | { ok: true; locations: Record<string, unknown> }
  | { ok: false; problem: string } {
  // jsonc-parser reads a file of nothing but comments as an error.
  if (isBlank(text)) return { ok: true, locations: {} };
  const errors: ParseError[] = [];
  const settings: unknown = parse(text!, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length) {
    const [first] = errors;
    return {
      ok: false,
      problem: `It can't be parsed (${printParseErrorCode(first!.error)} at offset ${first!.offset}).`,
    };
  }
  if (!isObject(settings)) {
    return { ok: false, problem: "It isn't a JSON object." };
  }
  const locations = settings[PLUGIN_LOCATIONS];
  if (locations === undefined) return { ok: true, locations: {} };
  if (!isObject(locations)) {
    return { ok: false, problem: `\`${PLUGIN_LOCATIONS}\` isn't an object.` };
  }
  return { ok: true, locations };
}

/**
 * The settings text with `chat.pluginLocations` setting `add` to true and
 * without each key in `remove`, everything else kept as written. A missing or
 * empty file becomes settings holding only that. Throws, with what is wrong,
 * on settings readPluginLocations rejects.
 */
export function editPluginLocations(
  text: string | undefined,
  add: string,
  remove: string[],
): string {
  const read = readPluginLocations(text);
  if (!read.ok) throw new Error(read.problem);
  const blank = isBlank(text);
  let edited = blank ? "" : text!;
  const formattingOptions = formattingOf(text ?? "");
  for (const [key, value] of [
    ...remove.map((key) => [key, undefined] as const),
    [add, true] as const,
  ]) {
    edited = applyEdits(
      edited,
      modify(edited, [PLUGIN_LOCATIONS, key], value, { formattingOptions }),
    );
  }
  if (!blank) return edited;
  // Comments with no object yet stay above the new one.
  const comments = text?.trim()
    ? `${text.trimEnd()}${formattingOptions.eol}`
    : "";
  return `${comments}${edited}${formattingOptions.eol}`;
}

// The indentation and line endings the file already uses; VS Code's own (a
// tab, \n) for a new file.
function formattingOf(text: string): {
  insertSpaces: boolean;
  tabSize: number;
  eol: string;
} {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^([ \t]+)\S/m.exec(text)?.[1];
  if (!indent || indent.startsWith("\t")) {
    return { insertSpaces: false, tabSize: 4, eol };
  }
  return { insertSpaces: true, tabSize: indent.length, eol };
}

// Missing, empty, or nothing but whitespace and comments: no object to edit.
function isBlank(text: string | undefined): boolean {
  return !text || !stripComments(text).trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
