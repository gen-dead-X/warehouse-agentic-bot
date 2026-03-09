import { parseChatResponse } from "../lib/chat-parser";
import type {
  ApiEnvelope,
  ChatMessageDto,
  ChatMessageResponse,
  ChatModel,
  ChatSessionDetail,
  ChatSessionSummary,
  ParsedChatResponse,
} from "../types/chat";

type StreamOptions = {
  signal?: AbortSignal;
  onToken: (chunk: string) => void;
  onSessionId?: (sessionId: string) => void;
};

function withAuth(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

export async function listModels(
  baseUrl: string,
  token: string,
): Promise<ChatModel[]> {
  const response = await fetch(`${baseUrl}/chat/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ChatModel[];
}

export async function listSessions(
  baseUrl: string,
  token: string,
): Promise<ChatSessionSummary[]> {
  const response = await fetch(`${baseUrl}/chat/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const json = (await response.json()) as ApiEnvelope<ChatSessionSummary[]>;
  return json.data;
}

export async function getSession(
  baseUrl: string,
  token: string,
  sessionId: string,
): Promise<ChatSessionDetail | null> {
  const response = await fetch(`${baseUrl}/chat/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const json = (await response.json()) as ApiEnvelope<ChatSessionDetail | null>;
  return json.success ? json.data : null;
}

export async function deleteSession(
  baseUrl: string,
  token: string,
  sessionId: string,
): Promise<boolean> {
  const response = await fetch(`${baseUrl}/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const json = (await response.json()) as ApiEnvelope<null>;
  return json.success;
}

export async function sendMessage(
  baseUrl: string,
  token: string,
  payload: ChatMessageDto,
): Promise<ChatMessageResponse> {
  const response = await fetch(`${baseUrl}/chat/message`, {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const json = (await response.json()) as ApiEnvelope<ChatMessageResponse>;
  const data = json.data;

  // Defensive fallback in case parser payload is missing or inconsistent.
  const parsed: ParsedChatResponse =
    data.parsed ?? parseChatResponse(data.reply);

  return {
    ...data,
    parsed,
  };
}

export async function streamMessage(
  baseUrl: string,
  token: string,
  payload: ChatMessageDto,
  options: StreamOptions,
): Promise<string | null> {
  const response = await fetch(`${baseUrl}/chat/stream`, {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(await parseError(response));
  }

  const sessionId = response.headers.get("X-Session-Id");
  if (sessionId && options.onSessionId) {
    options.onSessionId(sessionId);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    options.onToken(chunk);
  }

  return sessionId;
}
