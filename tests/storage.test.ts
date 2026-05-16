import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendToArray,
  deleteArrayItem,
  readJSON,
  updateArrayItem,
  writeJSON,
} from "../src/skills/storage.js";

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gwen-storage-test-"));
  return path.join(dir, "nested", "items.json");
}

test("readJSON returns the provided default when the file does not exist", () => {
  assert.deepEqual(readJSON(tempFile(), [{ fallback: true }]), [{ fallback: true }]);
});

test("writeJSON creates parent folders and writes formatted JSON", () => {
  const file = tempFile();

  writeJSON(file, { ok: true });

  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { ok: true });
});

test("readJSON throws corrupt JSON parse errors", () => {
  const file = tempFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "{bad json");
  const originalError = console.error;
  console.error = () => {};

  try {
    assert.throws(() => readJSON(file), SyntaxError);
  } finally {
    console.error = originalError;
  }
});

test("appendToArray assigns an id and persists the item", () => {
  const file = tempFile();

  const item = appendToArray(file, { text: "ship tests" });

  assert.equal(typeof item.id, "string");
  assert.deepEqual(readJSON(file), [item]);
});

test("updateArrayItem and deleteArrayItem mutate matching records only", () => {
  const file = tempFile();
  writeJSON(file, [
    { id: "a", done: false },
    { id: "b", done: false },
  ]);

  assert.deepEqual(updateArrayItem(file, "b", { done: true }), { id: "b", done: true });
  assert.equal(updateArrayItem(file, "missing", { done: true }), null);
  assert.equal(deleteArrayItem(file, "a"), true);
  assert.equal(deleteArrayItem(file, "missing"), false);
  assert.deepEqual(readJSON(file), [{ id: "b", done: true }]);
});
