import * as acp from "@agentclientprotocol/sdk";
import type {
  AcpActivity,
  AcpCommand,
  AcpConfigOption,
  AcpConfigOptionChoice,
  AcpElicitationField,
  AcpElicitationRequest,
  AcpPendingRequest,
  AcpPermissionRequest,
  AcpSessionEvent,
  JsonValue,
} from "@ainide/shared";

const MAX_ACTIVITY_TEXT = 1_000_000;
const MAX_COMMANDS = 100;
const MAX_COMMAND_NAME = 200;
const MAX_COMMAND_DESCRIPTION = 4_000;
const MAX_COMMAND_HINT = 500;
const MAX_TITLE_LENGTH = 80;
const SECRET_KEY = /token|secret|password|api[-_]?key|authorization|credential|^env$/i;

export interface NormalizedAcpUpdate {
  activities: AcpActivity[];
  configOptions?: AcpConfigOption[];
  availableCommands?: AcpCommand[];
  title?: string;
}

export interface SequencedAcpEvent {
  sequence: number;
  event: AcpSessionEvent;
}

export class AcpEventLog {
  private sequence = 0;
  private entries: SequencedAcpEvent[] = [];

  constructor(private readonly maxEntries = 2_000) {}

  append(event: AcpSessionEvent): SequencedAcpEvent {
    const entry = { sequence: ++this.sequence, event };
    this.entries = [...this.entries, entry].slice(-this.maxEntries);
    return entry;
  }

  get currentSequence(): number {
    return this.sequence;
  }

  history(): SequencedAcpEvent[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

export function normalizeConfigOptions(options: readonly acp.SessionConfigOption[] | null | undefined): AcpConfigOption[] {
  if (!options) return [];
  return options.flatMap((option): AcpConfigOption[] => {
    if (option.type === "boolean") {
      return [{
        id: option.id,
        label: cleanText(option.name, option.id),
        type: "boolean",
        ...(option.category ? { category: option.category } : {}),
        currentValue: option.currentValue,
      }];
    }
    const choices = option.options.flatMap((choice): AcpConfigOptionChoice[] => {
      if ("options" in choice) return choice.options.map((item) => ({ value: item.value, label: cleanText(item.name, item.value) }));
      return [{ value: choice.value, label: cleanText(choice.name, choice.value) }];
    });
    return [{
      id: option.id,
      label: cleanText(option.name, option.id),
      type: "select",
      ...(option.category ? { category: option.category } : {}),
      currentValue: option.currentValue,
      choices,
    }];
  });
}

export function normalizeSessionUpdate(update: acp.SessionUpdate): NormalizedAcpUpdate {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
      return { activities: contentActivity(update.messageId, "user", update.content, "markdown") };
    case "agent_message_chunk":
      return { activities: contentActivity(update.messageId, "agent", update.content, "markdown") };
    case "agent_thought_chunk":
      return { activities: contentActivity(update.messageId, "agent", update.content, "markdown", true) };
    case "tool_call":
      return { activities: toolActivities(update) };
    case "tool_call_update":
      return { activities: toolUpdateActivities(update) };
    case "plan":
      return { activities: [{ type: "plan", id: `plan-${stableId(update)}`, text: planText(update.entries) }] };
    case "plan_update":
      return { activities: [{ type: "plan", id: update.plan.planId, text: planUpdateText(update.plan) }] };
    case "plan_removed":
      return { activities: [{ type: "plan", id: update.planId, text: "Plan removed", status: "completed" }] };
    case "config_option_update":
      return { activities: [], configOptions: normalizeConfigOptions(update.configOptions) };
    case "available_commands_update":
      return { activities: [], availableCommands: normalizeAvailableCommands(update.availableCommands) };
    case "session_info_update":
      {
        const title = cleanOptionalTitle(update.title);
        return { activities: [], ...(title ? { title } : {}) };
      }
    case "usage_update":
      return { activities: [{ type: "usage", totalTokens: update.used }] };
    case "current_mode_update":
      return { activities: [{ type: "unknown", name: "current_mode_update", data: { currentModeId: update.currentModeId } }] };
    case "compaction_update":
    case "compaction_summary_chunk":
      return { activities: [{ type: "unknown", name: update.sessionUpdate, data: safeJson(update) }] };
    default:
      return { activities: [{ type: "unknown", name: unknownUpdateName(update), data: safeJson(update) }] };
  }
}

export function normalizePermissionRequest(params: acp.RequestPermissionRequest, requestId: string): AcpPendingRequest {
  const request: AcpPermissionRequest = {
    requestId,
    title: cleanText(params.toolCall.title, "Permission requested"),
    options: params.options.map((option) => ({ id: option.optionId, label: cleanText(option.name, option.optionId), kind: option.kind })),
  };
  return { type: "permission", request };
}

export function normalizeElicitationRequest(params: acp.CreateElicitationRequest, requestId: string): AcpPendingRequest {
  const form = acp.CreateElicitationRequest.isForm(params)
    ? params as acp.ElicitationFormMode & { mode: "form"; message: string }
    : undefined;
  const fields = form ? Object.entries(form.requestedSchema.properties ?? {}).flatMap(([id, property]) => {
    const type = property.type === "boolean" ? "boolean" : property.type === "number" || property.type === "integer" ? "number" : property.type === "string" ? "text" : property.type === "array" ? "select" : undefined;
    if (!type) return [];
    const choices = "enum" in property && Array.isArray(property.enum)
      ? property.enum.filter((value): value is string => typeof value === "string").map((value) => ({ value, label: value }))
      : undefined;
    const field: AcpElicitationField = {
      id,
      label: cleanText("title" in property && typeof property.title === "string" ? property.title : id, id),
      type,
      ...(form.requestedSchema.required?.includes(id) ? { required: true } : {}),
      ...(choices?.length ? { choices } : {}),
    };
    return [field];
  }) : [];
  const request: AcpElicitationRequest = {
    requestId,
    title: cleanText(params.message, "Input requested"),
    ...(form?.requestedSchema.description ? { description: form.requestedSchema.description } : {}),
    fields,
  };
  return { type: "elicitation", request };
}

export function appendAcpActivity(history: AcpActivity[], activity: AcpActivity, maxItems = 2_000): AcpActivity[] {
  const last = history[history.length - 1];
  if (last?.type === "message" && activity.type === "message" && last.id === activity.id && last.role === activity.role) {
    return [...history.slice(0, -1), { ...last, text: boundedText(`${last.text}${activity.text}`) }];
  }
  if (last?.type === "tool_call" && activity.type === "tool_call" && last.id === activity.id) {
    return [...history.slice(0, -1), {
      ...last,
      ...activity,
      input: activity.input ?? last.input,
      output: activity.output ?? last.output,
    }];
  }
  const next = [...history, activity];
  return next.length > maxItems ? next.slice(next.length - maxItems) : next;
}

/** Cursor currently assigns a new ID to each streamed thought fragment. */
export function stabilizeCursorMessageChunk(history: AcpActivity[], activity: AcpActivity): AcpActivity {
  const last = history[history.length - 1];
  if (last?.type === "message" && activity.type === "message" && activity.role === "agent" && last.role === activity.role && last.format === activity.format && Boolean(last.thought) === Boolean(activity.thought)) {
    return { ...activity, id: last.id };
  }
  return activity;
}

export function activityEvents(sessionId: string, activities: AcpActivity[]): AcpSessionEvent[] {
  return activities.map((activity) => ({ type: "activity", sessionId, activity }));
}

function contentActivity(messageId: string | null | undefined, role: "user" | "agent", content: acp.ContentBlock, format?: "plain" | "markdown", thought = false): AcpActivity[] {
  const text = contentText(content);
  if (text === undefined) return [{ type: "unknown", name: `content:${content.type}`, data: safeJson(content) }];
  return [{ type: "message", id: messageId ?? `${role}-${Date.now()}`, role, text: boundedText(text), ...(format ? { format } : {}), ...(thought ? { thought: true } : {}) }];
}

function normalizeAvailableCommands(commands: readonly unknown[] | null | undefined): AcpCommand[] {
  if (!Array.isArray(commands)) return [];
  const names = new Set<string>();
  const normalized: AcpCommand[] = [];
  for (const item of commands.slice(0, MAX_COMMANDS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const command = item as Record<string, unknown>;
    const name = commandName(command.name);
    const description = commandField(command.description, MAX_COMMAND_DESCRIPTION);
    if (!name || !description || names.has(name)) continue;
    names.add(name);
    const input = command.input;
    const inputHint = input && typeof input === "object" && !Array.isArray(input)
      ? commandField((input as Record<string, unknown>).hint, MAX_COMMAND_HINT)
      : undefined;
    normalized.push({ name, description, ...(inputHint ? { inputHint } : {}) });
  }
  return normalized;
}

function toolActivities(update: acp.ToolCall): AcpActivity[] {
  const activities: AcpActivity[] = [{
    type: "tool_call",
    id: update.toolCallId,
    title: cleanText(update.title, "Tool call"),
    status: toolStatus(update.status),
    ...(update.rawInput !== undefined ? { input: safeString(update.rawInput) } : {}),
    ...(update.rawOutput !== undefined ? { output: safeString(update.rawOutput) } : {}),
  }];
  return activities.concat(toolContentActivities(update.toolCallId, update.content ?? undefined, update.locations ?? undefined));
}

function toolUpdateActivities(update: acp.ToolCallUpdate): AcpActivity[] {
  const activities: AcpActivity[] = [{
    type: "tool_call",
    id: update.toolCallId,
    title: cleanText(update.title, `Tool ${update.toolCallId}`),
    status: toolStatus(update.status),
    ...(update.rawInput !== undefined ? { input: safeString(update.rawInput) } : {}),
    ...(update.rawOutput !== undefined ? { output: safeString(update.rawOutput) } : {}),
  }];
  return activities.concat(toolContentActivities(update.toolCallId, update.content ?? undefined, update.locations ?? undefined));
}

function toolContentActivities(toolId: string, content: acp.ToolCallContent[] | undefined, locations: acp.ToolCallLocation[] | undefined): AcpActivity[] {
  const activities: AcpActivity[] = [];
  for (const item of content ?? []) {
    if (item.type === "diff") {
      activities.push({ type: "diff", id: `${toolId}-diff-${activities.length}`, path: item.path, diff: diffText(item.oldText, item.newText) });
    } else if (item.type === "terminal") {
      activities.push({ type: "terminal", id: item.terminalId });
    } else if (item.type === "content") {
      const text = contentText(item.content);
      if (text !== undefined) activities.push({ type: "terminal", id: `${toolId}-output-${activities.length}`, output: text });
    }
  }
  for (const location of locations ?? []) {
    activities.push({ type: "location", path: location.path, ...(validLine(location.line) ? { line: location.line } : {}) });
  }
  return activities;
}

function contentText(content: acp.ContentBlock): string | undefined {
  if (content.type === "text") return content.text;
  if (content.type === "resource" && "text" in content.resource) return content.resource.text;
  if (content.type === "resource_link") return content.name;
  return undefined;
}

function planText(entries: acp.PlanEntry[]): string {
  return entries.map((entry) => `[${entry.status}] ${entry.content}`).join("\n");
}

function planUpdateText(plan: acp.PlanUpdateContent): string {
  if (plan.type === "markdown") return plan.content;
  if (plan.type === "items") return planText(plan.entries);
  return `Plan file: ${plan.uri}`;
}

function diffText(oldText: string | null | undefined, newText: string): string {
  return boundedText(`--- original\n+++ updated\n${oldText ?? ""}\n${newText}`);
}

function toolStatus(status: acp.ToolCallStatus | null | undefined): "running" | "completed" | "failed" | "cancelled" {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "running";
}

function validLine(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function stableId(value: object): string {
  return safeString(value).slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function unknownUpdateName(update: object): string {
  const value = (update as { sessionUpdate?: unknown }).sessionUpdate;
  return typeof value === "string" ? value : "unknown_update";
}

function cleanText(value: string | null | undefined, fallback: string): string {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean || fallback;
}

function cleanOptionalText(value: string | null | undefined): string | undefined {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean || undefined;
}

function cleanOptionalTitle(value: unknown): string | undefined {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, MAX_TITLE_LENGTH) : undefined;
}

function commandField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (clean.length <= maxLength) return clean;
  const marker = "\n[truncated]";
  return `${clean.slice(0, maxLength - marker.length)}${marker}`;
}

function commandName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= MAX_COMMAND_NAME ? clean : undefined;
}

function safeString(value: unknown): string {
  if (typeof value === "string") return boundedText(value);
  try { return boundedText(JSON.stringify(safeJson(value)) ?? ""); } catch { return "[unavailable]"; }
}

function safeJson(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return boundedText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => safeJson(item, seen));
    if (value.length > 100) items.push("[truncated]");
    return items;
  }
  const result: { [key: string]: JsonValue } = {};
  const entries = Object.entries(value);
  for (const [key, nested] of entries.slice(0, 100)) {
    if (SECRET_KEY.test(key)) continue;
    result[key] = safeJson(nested, seen);
  }
  if (entries.length > 100) result._truncated = true;
  return result;
}

function boundedText(value: string): string {
  if (value.length <= MAX_ACTIVITY_TEXT) return value;
  const marker = "\n[truncated]";
  return `${value.slice(0, MAX_ACTIVITY_TEXT - marker.length)}${marker}`;
}
