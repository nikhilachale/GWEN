import React, { useEffect, useState } from "react";
import { RED, CHROMATIC_TEXT_SHADOW, MAGENTA } from "./theme.js";

const providerOptions = ["anthropic", "ollama"];
const brainOptions = ["auto", "anthropic", "ollama"];
const codeOptions = ["codex", "claude"];
const ttsOptions = ["fish", "macos"];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.gwenBridge?.getSettings?.().then(setSettings);
  }, []);

  const update = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...(prev || {}), [key]: value }));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await window.gwenBridge?.updateSettings?.(settings);
      if (next) setSettings(next);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>// SETTINGS</span>
        <button style={styles.close} onClick={onClose}>X</button>
      </div>

      <div style={styles.body}>
        <Section title="Models">
          <Select label="Brain route" value={settings.brainProvider} options={brainOptions} onChange={(v) => update("brainProvider", v)} />
          <Select label="Default" value={settings.defaultProvider} options={providerOptions} onChange={(v) => update("defaultProvider", v)} />
          <Select label="Discussion" value={settings.discussionProvider} options={providerOptions} onChange={(v) => update("discussionProvider", v)} />
          <Select label="Smart/tools" value={settings.smartProvider} options={providerOptions} onChange={(v) => update("smartProvider", v)} />
          <Input label="Brain model" value={settings.brainModel} onChange={(v) => update("brainModel", v)} />
          <Input label="Discussion model" value={settings.discussionModel} onChange={(v) => update("discussionModel", v)} />
          <Input label="Smart model" value={settings.smartModel} onChange={(v) => update("smartModel", v)} />
          <Input label="Ollama model" value={settings.ollamaModel} onChange={(v) => update("ollamaModel", v)} />
        </Section>

        <Section title="Code">
          <Select label="Code agent" value={settings.codeAgent} options={codeOptions} onChange={(v) => update("codeAgent", v)} />
        </Section>

        <Section title="Budget">
          <NumberInput label="Daily USD" value={settings.dailyModelBudgetUsd} onChange={(v) => update("dailyModelBudgetUsd", v)} />
          <NumberInput label="Monthly USD" value={settings.monthlyModelBudgetUsd} onChange={(v) => update("monthlyModelBudgetUsd", v)} />
          <NumberInput label="Warn at %" value={settings.modelBudgetWarningPercent} onChange={(v) => update("modelBudgetWarningPercent", v)} />
          <NumberInput label="Input $/MTok" value={settings.anthropicInputUsdPerMtok} onChange={(v) => update("anthropicInputUsdPerMtok", v)} />
          <NumberInput label="Output $/MTok" value={settings.anthropicOutputUsdPerMtok} onChange={(v) => update("anthropicOutputUsdPerMtok", v)} />
        </Section>

        <Section title="Assistant">
          <Input label="Your name" value={settings.userName} onChange={(v) => update("userName", v)} />
          <Select label="Voice provider" value={settings.ttsProvider} options={ttsOptions} onChange={(v) => update("ttsProvider", v)} />
          <Toggle label="Text mode (quiet)" checked={settings.textMode || false} onChange={(v) => update("textMode", v)} />
          <Toggle label="Passive memory" checked={settings.passiveMemory} onChange={(v) => update("passiveMemory", v)} />
          <Toggle label="Screen vision" checked={settings.screenVision} onChange={(v) => update("screenVision", v)} />
          <Toggle label="Startup greeting" checked={settings.startupBriefing} onChange={(v) => update("startupBriefing", v)} />
          <Toggle label="Confirm sensitive actions" checked={settings.confirmSensitiveActions} onChange={(v) => update("confirmSensitiveActions", v)} />
          <Toggle label="Safe demo mode" checked={settings.safeMode} onChange={(v) => update("safeMode", v)} />
        </Section>
      </div>

      <div style={styles.footer}>
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "SAVING" : "SAVE"}</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input style={styles.input} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input
        style={styles.input}
        type="number"
        min={0}
        step="0.01"
        value={Number.isFinite(Number(value)) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <select style={styles.input} value={value || options[0]} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
      </select>
    </label>
  );
}

function optionLabel(option: string) {
  if (option === "fish") return "gwen";
  if (option === "macos") return "macOS";
  return option;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={styles.toggle}>
      <span style={styles.label}>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    right: 24,
    top: 24,
    width: 380,
    maxHeight: "calc(100vh - 48px)",
    background: "rgba(7, 7, 10, 0.94)",
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
  close: {
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(237, 28, 36, 0.45)",
    cursor: "pointer",
  },
  body: {
    overflowY: "auto",
    padding: 14,
  },
  section: {
    display: "grid",
    gap: 9,
    paddingBottom: 16,
    marginBottom: 14,
    borderBottom: "1px solid rgba(237, 28, 36, 0.24)",
  },
  sectionTitle: {
    color: MAGENTA,
    fontSize: 10,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  field: {
    display: "grid",
    gridTemplateColumns: "125px 1fr",
    alignItems: "center",
    gap: 10,
  },
  label: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    letterSpacing: "0.08em",
  },
  input: {
    minWidth: 0,
    height: 30,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(237, 28, 36, 0.36)",
    color: "#fff",
    padding: "0 8px",
    fontSize: 12,
  },
  toggle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footer: {
    padding: 12,
    borderTop: "1px solid rgba(237, 28, 36, 0.35)",
  },
  save: {
    width: "100%",
    height: 34,
    border: "1px solid rgba(237, 28, 36, 0.7)",
    background: "rgba(237, 28, 36, 0.18)",
    color: "#fff",
    cursor: "pointer",
    letterSpacing: "0.18em",
  },
};
