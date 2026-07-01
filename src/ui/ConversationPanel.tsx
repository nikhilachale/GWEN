import React, { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { RED, CHROMATIC_TEXT_SHADOW, MAGENTA } from "./theme.js";

type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  createdAt?: number;
  pinned?: boolean;
  preview?: string;
  count: number;
  active: boolean;
};

function timeLabel(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).toUpperCase();
}

export default function ConversationPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  const activeItem = useMemo(() => items.find((item) => item.active), [items]);

  const refresh = (nextQuery = query) => {
    window.gwenBridge?.getConversations?.(nextQuery).then((list) => setItems(list || []));
  };

  useEffect(() => {
    refresh();
    const unsub = window.gwenBridge?.onConversation?.(() => refresh());
    return () => unsub && unsub();
  }, []);

  const switchTo = async (id: string) => {
    await window.gwenBridge?.switchConversation?.(id);
    refresh();
  };

  const createNew = async () => {
    await window.gwenBridge?.newConversation?.("New conversation");
    refresh();
  };

  const clearCurrent = async () => {
    await window.gwenBridge?.clearCurrentConversation?.();
    refresh();
  };

  const startRename = (item: Conversation) => {
    setEditingId(item.id);
    setDraftTitle(item.title);
  };

  const saveRename = async () => {
    const next = draftTitle.trim();
    if (!editingId || !next) {
      setEditingId("");
      setDraftTitle("");
      return;
    }
    await window.gwenBridge?.renameConversation?.(editingId, next);
    setEditingId("");
    setDraftTitle("");
    refresh();
  };

  const togglePin = async (item: Conversation) => {
    await window.gwenBridge?.pinConversation?.(item.id, !item.pinned);
    refresh();
  };

  const deleteItem = async (item: Conversation) => {
    const ok = window.confirm(`Delete "${item.title}"? This removes its saved transcript.`);
    if (!ok) return;
    await window.gwenBridge?.deleteConversation?.(item.id);
    refresh();
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    refresh(value);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>// CONVERSATIONS</span>
        <button style={styles.iconOnly} title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <label style={styles.searchBox}>
        <Search size={14} color={MAGENTA} />
        <input
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search transcripts"
          style={styles.searchInput}
        />
      </label>
      <div style={styles.actions}>
        <button style={styles.actionButton} onClick={createNew}><Plus size={13} /> NEW</button>
        <button style={styles.actionButton} onClick={clearCurrent} disabled={!activeItem}>
          <Trash2 size={13} /> CLEAR
        </button>
      </div>
      <div style={styles.list}>
        {!items.length && <div style={styles.empty}>No matching conversations.</div>}
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              ...styles.row,
              borderColor: item.active ? RED : "rgba(237, 28, 36, 0.28)",
              background: item.active ? "rgba(237, 28, 36, 0.16)" : "rgba(17,17,17,0.72)",
            }}
          >
            <div
              role="button"
              tabIndex={0}
              style={styles.rowMain}
              onClick={() => {
                if (editingId !== item.id) switchTo(item.id);
              }}
              onKeyDown={(event) => {
                if (editingId === item.id) return;
                if (event.key === "Enter" || event.key === " ") switchTo(item.id);
              }}
            >
              {editingId === item.id ? (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveRename();
                    if (event.key === "Escape") {
                      setEditingId("");
                      setDraftTitle("");
                    }
                  }}
                  style={styles.titleInput}
                />
              ) : (
                <span style={styles.rowTitle}>{item.pinned ? "PINNED · " : ""}{item.title}</span>
              )}
              <span style={styles.preview}>{item.preview || "No messages yet."}</span>
              <span style={styles.meta}>{timeLabel(item.updatedAt)} · {item.count} MSG</span>
            </div>
            <div style={styles.rowTools}>
              {editingId === item.id ? (
                <button style={styles.toolButton} title="Save title" onClick={saveRename}><Check size={13} /></button>
              ) : (
                <button style={styles.toolButton} title="Rename" onClick={() => startRename(item)}><Pencil size={13} /></button>
              )}
              <button style={styles.toolButton} title={item.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(item)}>
                {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
              <button style={styles.toolButton} title="Delete" onClick={() => deleteItem(item)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    left: 24,
    top: 24,
    width: 320,
    maxHeight: "calc(100vh - 48px)",
    background: "rgba(7, 7, 10, 0.92)",
    border: "1px solid rgba(237, 28, 36, 0.52)",
    boxShadow: "0 0 24px rgba(237, 28, 36, 0.18)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    zIndex: 20,
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(237, 28, 36, 0.35)",
  },
  title: {
    fontSize: 11,
    letterSpacing: "0.28em",
    color: RED,
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  iconOnly: {
    width: 28,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(237, 28, 36, 0.45)",
    cursor: "pointer",
  },
  searchBox: {
    margin: "12px 12px 0",
    height: 34,
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    alignItems: "center",
    gap: 6,
    padding: "0 10px",
    border: "1px solid rgba(233, 30, 99, 0.34)",
    background: "rgba(255,255,255,0.04)",
  },
  searchInput: {
    minWidth: 0,
    height: 28,
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#fff",
    fontSize: 12,
    letterSpacing: 0,
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 12,
  },
  actionButton: {
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid rgba(237, 28, 36, 0.5)",
    background: "rgba(237, 28, 36, 0.12)",
    color: "#fff",
    fontSize: 10,
    letterSpacing: "0.14em",
    cursor: "pointer",
  },
  list: {
    overflowY: "auto",
    padding: "0 12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  row: {
    border: "1px solid",
    color: "#fff",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    padding: 9,
  },
  rowMain: {
    minWidth: 0,
    textAlign: "left",
    border: 0,
    background: "transparent",
    color: "#fff",
    padding: 0,
    cursor: "pointer",
  },
  rowTitle: {
    display: "block",
    fontSize: 12,
    lineHeight: 1.35,
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  titleInput: {
    width: "100%",
    height: 26,
    marginBottom: 4,
    border: "1px solid rgba(237, 28, 36, 0.5)",
    outline: "none",
    background: "rgba(0,0,0,0.35)",
    color: "#fff",
    padding: "0 6px",
    fontSize: 12,
  },
  preview: {
    display: "block",
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    lineHeight: 1.3,
    marginBottom: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: MAGENTA,
    fontSize: 9,
    letterSpacing: "0.12em",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  rowTools: {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
  },
  toolButton: {
    minWidth: 26,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(237, 28, 36, 0.35)",
    background: "rgba(7, 7, 10, 0.55)",
    color: "#fff",
    fontSize: 8,
    letterSpacing: "0.08em",
    cursor: "pointer",
  },
  empty: {
    padding: "14px 8px",
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    textAlign: "center",
  },
};
