// src/tools/notes.js — markdown note CRUD
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_DIR = path.resolve(__dirname, "../../data/notes");

function ensureDir() {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function uniqueSlug(slug) {
  let candidate = slug;
  let n = 2;
  while (fs.existsSync(path.join(NOTES_DIR, `${candidate}.md`))) {
    candidate = `${slug}-${n}`;
    n++;
  }
  return candidate;
}

export async function save({ title, content } = {}) {
  if (!title || !title.trim()) return "What should I call this note?";
  if (!content || !content.trim()) return "What's the note content?";
  ensureDir();
  const slug = uniqueSlug(slugify(title));
  const filePath = path.join(NOTES_DIR, `${slug}.md`);
  const body = `# ${title.trim()}\nDate: ${new Date().toISOString().slice(0, 10)}\n\n${content.trim()}\n`;
  fs.writeFileSync(filePath, body);
  return `Saved as "${title.trim()}".`;
}

export async function search({ query } = {}) {
  ensureDir();
  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return "You don't have any notes yet.";

  const all = files.map((f) => {
    const full = fs.readFileSync(path.join(NOTES_DIR, f), "utf8");
    const titleLine = full.split("\n")[0]?.replace(/^#\s*/, "") || f.replace(/\.md$/, "");
    const dateMatch = full.match(/^Date:\s*(.+)$/m);
    return {
      slug: f.replace(/\.md$/, ""),
      title: titleLine,
      date: dateMatch?.[1] || "",
      preview: full.slice(0, 200),
    };
  });

  if (!query) return all.slice(0, 10);

  const q = query.toLowerCase();
  const matches = all.filter(
    (n) => n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q)
  );
  if (matches.length === 0) return "I don't have any notes matching that.";
  return matches.slice(0, 10);
}

export function getNote(title) {
  ensureDir();
  const slug = slugify(title);
  const filePath = path.join(NOTES_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}
