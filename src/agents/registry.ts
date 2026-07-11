export type AgentId =
  | "orchestrator"
  | "voice-agent"
  | "calendar-agent"
  | "email-agent"
  | "search-agent"
  | "task-agent"
  | "notes-agent"
  | "memory-agent"
  | "planner-agent"
  | "code-agent"
  | "screen-agent";

export type AgentDefinition = {
  id: AgentId;
  label: string;
  docPath: string;
  ownsTools: string[];
};

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    docPath: "agents/orchestrator/agent.md",
    ownsTools: [],
  },
  {
    id: "voice-agent",
    label: "Voice Agent",
    docPath: "agents/voice-agent/agent.md",
    ownsTools: ["transcribeAudio", "transcribeFile", "speak", "speakStream"],
  },
  {
    id: "calendar-agent",
    label: "Calendar Agent",
    docPath: "agents/calendar-agent/agent.md",
    ownsTools: ["get_calendar"],
  },
  {
    id: "email-agent",
    label: "Email Agent",
    docPath: "agents/email-agent/agent.md",
    ownsTools: ["get_emails"],
  },
  {
    id: "search-agent",
    label: "Search Agent",
    docPath: "agents/search-agent/agent.md",
    ownsTools: ["search_web", "search_maps", "get_directions"],
  },
  {
    id: "task-agent",
    label: "Task Agent",
    docPath: "agents/task-agent/agent.md",
    ownsTools: ["add_task", "get_tasks", "add_reminder", "list_reminders"],
  },
  {
    id: "notes-agent",
    label: "Notes Agent",
    docPath: "agents/notes-agent/agent.md",
    ownsTools: ["save_note", "get_notes", "create_apple_note", "search_apple_notes"],
  },
  {
    id: "memory-agent",
    label: "Memory Agent",
    docPath: "agents/memory-agent/agent.md",
    ownsTools: ["remember", "recall", "forget_memory"],
  },
  {
    id: "planner-agent",
    label: "Planner Agent",
    docPath: "agents/planner-agent/agent.md",
    ownsTools: ["get_day_plan"],
  },
  {
    id: "code-agent",
    label: "Code Agent",
    docPath: "agents/code-agent/agent.md",
    ownsTools: ["build_software", "fix_self_code", "repair_self", "relaunch_self"],
  },
  {
    id: "screen-agent",
    label: "Screen Agent",
    docPath: "agents/screen-agent/agent.md",
    ownsTools: ["get_screen_context"],
  },
];

export function listAgents() {
  return [...AGENT_DEFINITIONS];
}

export function getAgentDefinition(id: AgentId) {
  return AGENT_DEFINITIONS.find((agent) => agent.id === id) ?? null;
}

export function findAgentForTool(toolName: string) {
  return AGENT_DEFINITIONS.find((agent) => agent.ownsTools.includes(toolName)) ?? null;
}
