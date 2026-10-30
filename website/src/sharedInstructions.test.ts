import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hoistSharedInstructions } from "./sharedInstructions";
import type { InstallConfig } from "./types";

const NOTES = "Replace <database> with the database to connect to.";
const CONFIG = { servers: { toolbox: { command: "toolbox" } } };

function installConfig(tool: string, instructions?: string): InstallConfig {
  return instructions === undefined
    ? { tool, config: CONFIG }
    : { tool, config: CONFIG, instructions };
}

describe("hoistSharedInstructions", () => {
  it("hoists the notes every entry of a trust-derived card inherited", () => {
    const result = hoistSharedInstructions(
      [
        installConfig("theia-ide", NOTES),
        installConfig("theia-ide-next", NOTES),
      ],
      undefined,
    );
    assert.equal(result.hoisted, NOTES);
    assert.deepEqual(result.installConfigs, [
      installConfig("theia-ide"),
      installConfig("theia-ide-next"),
    ]);
  });

  it("drops notes the generic config box already shows, without hoisting them", () => {
    const result = hoistSharedInstructions(
      [
        installConfig("theia-ide", NOTES),
        installConfig("theia-ide-next", NOTES),
      ],
      NOTES,
    );
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, [
      installConfig("theia-ide"),
      installConfig("theia-ide-next"),
    ]);
  });

  it("keeps an entry's own instructions next to one that inherited the shown notes", () => {
    const result = hoistSharedInstructions(
      [
        installConfig("theia-ide", NOTES),
        installConfig("theia-ide-next", "Sign in first."),
      ],
      NOTES,
    );
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, [
      installConfig("theia-ide"),
      installConfig("theia-ide-next", "Sign in first."),
    ]);
  });

  it("never hoists from a single entry, so a one-tool card renders as before", () => {
    const configs = [installConfig("theia-ide", NOTES)];
    const result = hoistSharedInstructions(configs, undefined);
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, configs);
  });

  it("leaves differing instructions on their entries", () => {
    const configs = [
      installConfig("theia-ide", "One"),
      installConfig("theia-ide-next", "Two"),
    ];
    const result = hoistSharedInstructions(configs, undefined);
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, configs);
  });

  it("hoists nothing when one entry has no instructions, since the text wouldn't apply to it", () => {
    const configs = [
      installConfig("theia-ide", NOTES),
      installConfig("theia-ide-next"),
    ];
    const result = hoistSharedInstructions(configs, undefined);
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, configs);
  });

  it("hoists nothing from entries without instructions", () => {
    const configs = [
      installConfig("theia-ide"),
      installConfig("theia-ide-next"),
    ];
    const result = hoistSharedInstructions(configs, undefined);
    assert.equal(result.hoisted, undefined);
    assert.deepEqual(result.installConfigs, configs);
  });

  it("leaves the install configs it was given untouched", () => {
    const configs = [
      installConfig("theia-ide", NOTES),
      installConfig("theia-ide-next", NOTES),
    ];
    hoistSharedInstructions(configs, undefined);
    hoistSharedInstructions(configs, NOTES);
    assert.deepEqual(configs, [
      installConfig("theia-ide", NOTES),
      installConfig("theia-ide-next", NOTES),
    ]);
  });
});
