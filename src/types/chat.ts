export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessageDto {
  message: string;
  sessionId?: string;
  warehouseId?: string;
  model?: string;
  history?: unknown[];
}

export interface ChatModel {
  id: string;
  name: string;
}

export interface SessionMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
  timestamp: string;
}

export interface ChatSessionSummary {
  _id: string;
  title: string;
  warehouseContext?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail {
  _id: string;
  userId: string;
  title: string;
  warehouseContext?: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MetricBlock {
  label: string;
  value: string;
  change?: string;
  icon?: string;
}

export interface TableBlock {
  title?: string;
  columns: Array<{ key: string; label: string }>;
  rows: Record<string, unknown>[];
}

export interface ChartBlock {
  chartType: "bar" | "line" | "pie" | "doughnut" | "area";
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export type ChatSection =
  | { type: "text"; content: string }
  | { type: "table"; content: TableBlock }
  | { type: "chart"; content: ChartBlock }
  | { type: "metric"; content: MetricBlock };

export interface ParsedChatResponse {
  summary: string;
  insights: string[];
  data: ChatSection[];
  raw: string;
}

export interface ChatMessageResponse {
  reply: string;
  parsed: ParsedChatResponse;
  sessionId: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ChatUIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parsed?: ParsedChatResponse;
  status?: "streaming" | "done" | "error";
  createdAt: string;
}
