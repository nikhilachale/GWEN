import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { add, complete, getAll, getDueToday, getOverdue, list, remove } from "../src/tools/tasks.js";

const taskFile = new URL("../data/tasks.json", import.meta.url);

function resetTasks() {
  fs.rmSync(taskFile, { force: true });
}

test("add validates task text", async () => {
  resetTasks();

  assert.equal(await add({ text: "   " }), "What should I remind you about?");
  assert.deepEqual(getAll(), []);
});

test("add trims and persists open tasks", async () => {
  resetTasks();

  assert.equal(await add({ text: "  Buy milk  " }), 'Got it. Added "Buy milk".');

  const tasks = getAll();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, "Buy milk");
  assert.equal(tasks[0].done, false);
  assert.equal(typeof tasks[0].id, "string");
});

test("add stores parsed due dates and reports unparseable due text", async () => {
  resetTasks();

  assert.equal(await add({ text: "File taxes", due: "January 1 2030 at 9 AM" }), 'Got it. Added "File taxes" for January 1 2030 at 9 AM.');
  assert.equal(await add({ text: "Mystery reminder", due: "not a real date" }), 'Got it — saved "Mystery reminder", but I couldn\'t parse the due time.');

  const [datedTask, undatedTask] = getAll();
  assert.equal(Number.isNaN(new Date(datedTask.due).getTime()), false);
  assert.equal(undatedTask.due, null);
});

test("list returns open tasks and complete hides completed tasks", async () => {
  resetTasks();
  await add({ text: "Pay rent" });
  const [task] = getAll();

  assert.deepEqual(await list(), [
    { id: task.id, text: "Pay rent", due: null, done: false },
  ]);

  complete(task.id);

  assert.equal(await list(), "No tasks on the list.");
  assert.deepEqual(await list({ filter: "all" }), [
    { id: task.id, text: "Pay rent", due: null, done: true },
  ]);
});

test("list handles today and overdue filters", async () => {
  resetTasks();
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const today = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

  fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
  fs.writeFileSync(taskFile, JSON.stringify([
    { id: "overdue", text: "Overdue task", due: yesterday, done: false },
    { id: "today", text: "Today task", due: today, done: false },
    { id: "future", text: "Future task", due: tomorrow, done: false },
    { id: "done", text: "Done task", due: today, done: true },
  ]));

  assert.deepEqual(await list({ filter: "today" }), [
    { id: "today", text: "Today task", due: today, done: false },
  ]);
  assert.deepEqual(await list({ filter: "overdue" }), [
    { id: "overdue", text: "Overdue task", due: yesterday, done: false },
    { id: "today", text: "Today task", due: today, done: false },
  ]);
  assert.deepEqual(getDueToday().map((task) => task.id), ["today"]);
  assert.deepEqual(getOverdue().map((task) => task.id), ["overdue", "today"]);
});

test("list returns an overdue-specific empty message", async () => {
  resetTasks();

  assert.equal(await list({ filter: "overdue" }), "Nothing overdue.");
});

test("remove deletes a persisted task by id", async () => {
  resetTasks();
  await add({ text: "Archive receipt" });
  const [task] = getAll();

  assert.equal(remove(task.id), true);
  assert.equal(remove(task.id), false);
  assert.deepEqual(getAll(), []);
});
