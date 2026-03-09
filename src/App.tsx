import {
  App as AntApp,
  Badge,
  Button,
  Card,
  ConfigProvider,
  Divider,
  Empty,
  Flex,
  Input,
  Layout,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Bubble,
  Conversations,
  Prompts,
  Sender,
  Welcome,
  XProvider,
} from "@ant-design/x";
import type { BubbleItemType } from "@ant-design/x/es/bubble";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteSession,
  getSession,
  listModels,
  listSessions,
  sendMessage,
  streamMessage,
} from "./api/chat-api";
import { parseChatResponse } from "./lib/chat-parser";
import { ParsedBlocks } from "./components/ParsedBlocks";
import type {
  ChatModel,
  ChatSessionSummary,
  ChatUIMessage,
  ParsedChatResponse,
} from "./types/chat";
import "./App.css";

const DEFAULT_BASE_URL = "http://localhost:3030";
const DEFAULT_MODEL = "llama3.1:8b";
const QUICK_PROMPTS = [
  { key: "p1", label: "Show low stock products in this warehouse" },
  { key: "p2", label: "Give me last 7 days IN/OUT trend" },
  { key: "p3", label: "Compare product A and B in warehouse X" },
  { key: "p4", label: "Show top selling products this month" },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toUiMessage(
  role: "user" | "assistant",
  content: string,
  parsed?: ParsedChatResponse,
): ChatUIMessage {
  return {
    id: makeId(),
    role,
    content,
    parsed,
    status: "done",
    createdAt: new Date().toISOString(),
  };
}

function toBubbleStatus(
  status?: ChatUIMessage["status"],
): BubbleItemType["status"] {
  if (status === "streaming") {
    return "loading";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "done") {
    return "success";
  }

  return undefined;
}

function App() {
  const { message } = AntApp.useApp();
  const [token, setToken] = useState(localStorage.getItem("chat.token") ?? "");
  const [baseUrl, setBaseUrl] = useState(
    localStorage.getItem("chat.baseUrl") ?? DEFAULT_BASE_URL,
  );
  const [warehouseId, setWarehouseId] = useState(
    localStorage.getItem("chat.warehouseId") ?? "",
  );
  const [model, setModel] = useState(
    localStorage.getItem("chat.model") ?? DEFAULT_MODEL,
  );
  const [models, setModels] = useState<ChatModel[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [streamMode, setStreamMode] = useState(true);

  useEffect(() => {
    localStorage.setItem("chat.token", token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem("chat.baseUrl", baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    localStorage.setItem("chat.warehouseId", warehouseId);
  }, [warehouseId]);

  useEffect(() => {
    localStorage.setItem("chat.model", model);
  }, [model]);

  const loadBootstrap = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const [modelItems, sessionItems] = await Promise.all([
        listModels(baseUrl, token),
        listSessions(baseUrl, token),
      ]);

      setModels(modelItems);
      setSessions(sessionItems);
      if (
        modelItems.length > 0 &&
        !modelItems.some((item) => item.id === model)
      ) {
        setModel(modelItems[0].id);
      }
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Failed to load chat metadata";
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, message, model, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadBootstrap();
  }, [loadBootstrap, token]);

  const handleSelectSession = useCallback(
    async (targetSessionId: string) => {
      if (!token) {
        message.error("Set access token first");
        return;
      }

      setLoadingSession(true);
      try {
        const detail = await getSession(baseUrl, token, targetSessionId);
        if (!detail) {
          message.warning("Session no longer exists. Start a new chat.");
          setSessionId(undefined);
          setMessages([]);
          await loadBootstrap();
          return;
        }

        const restored = detail.messages
          .filter((item) => item.role === "user" || item.role === "assistant")
          .map((item) => {
            const parsed =
              item.role === "assistant"
                ? parseChatResponse(item.content)
                : undefined;
            const role: ChatUIMessage["role"] =
              item.role === "assistant" ? "assistant" : "user";
            return {
              id: makeId(),
              role,
              content: item.content,
              parsed,
              createdAt: item.timestamp,
              status: "done" as const,
            };
          });

        setSessionId(detail._id);
        setMessages(restored);
        setWarehouseId(detail.warehouseContext ?? warehouseId);
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Failed to load session";
        message.error(text);
      } finally {
        setLoadingSession(false);
      }
    },
    [baseUrl, loadBootstrap, message, token, warehouseId],
  );

  const handleDeleteSession = useCallback(async () => {
    if (!token || !sessionId) {
      return;
    }

    try {
      const ok = await deleteSession(baseUrl, token, sessionId);
      if (ok) {
        message.success("Session deleted");
      } else {
        message.warning("Session not found");
      }

      setSessionId(undefined);
      setMessages([]);
      await loadBootstrap();
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Failed to delete session";
      message.error(text);
    }
  }, [baseUrl, loadBootstrap, message, sessionId, token]);

  const handleSend = useCallback(
    async (value: string) => {
      const text = value.trim();
      if (!text || loading) {
        return;
      }

      if (!token) {
        message.error("Authorization token is required");
        return;
      }

      const userMessage = toUiMessage("user", text);
      const assistantId = makeId();

      setInputValue("");
      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          status: streamMode ? "streaming" : "done",
          createdAt: new Date().toISOString(),
        },
      ]);

      setLoading(true);
      try {
        const payload = {
          message: text,
          sessionId,
          warehouseId: warehouseId || undefined,
          model: model || undefined,
        };

        if (streamMode) {
          const returnedSession = await streamMessage(baseUrl, token, payload, {
            onToken: (chunk) => {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        content: `${item.content}${chunk}`,
                        status: "streaming",
                      }
                    : item,
                ),
              );
            },
            onSessionId: (nextSessionId) => {
              setSessionId(nextSessionId);
            },
          });

          setMessages((prev) =>
            prev.map((item) => {
              if (item.id !== assistantId) {
                return item;
              }
              const parsed = parseChatResponse(item.content);
              return {
                ...item,
                status: "done",
                parsed,
              };
            }),
          );

          if (returnedSession) {
            setSessionId(returnedSession);
          }
        } else {
          const response = await sendMessage(baseUrl, token, payload);

          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: response.reply,
                    parsed: response.parsed,
                    status: "done",
                  }
                : item,
            ),
          );

          setSessionId(response.sessionId);
        }

        await loadBootstrap();
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "Connection interrupted. Please retry.";
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  status: "error",
                  content:
                    item.content || "Connection interrupted. Please retry.",
                }
              : item,
          ),
        );
        message.error(text);
      } finally {
        setLoading(false);
      }
    },
    [
      baseUrl,
      loadBootstrap,
      loading,
      message,
      model,
      sessionId,
      streamMode,
      token,
      warehouseId,
    ],
  );

  const bubbleItems = useMemo(
    () =>
      messages.map((item) => ({
        key: item.id,
        role: item.role === "user" ? "user" : "ai",
        content:
          item.role === "assistant"
            ? { text: item.content, parsed: item.parsed }
            : item.content,
        status: toBubbleStatus(item.status),
      })),
    [messages],
  );

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#0f766e",
          colorInfo: "#0f766e",
          borderRadius: 12,
          wireframe: false,
        },
      }}
    >
      <XProvider>
        <Layout className="chat-app-layout">
          <Layout.Sider
            width={320}
            className="chat-app-sider"
            breakpoint="lg"
            collapsedWidth="0"
          >
            <div className="sider-inner">
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Warehouse AI Chat
                </Typography.Title>
                <Typography.Text type="secondary">
                  Authenticated chat with sessions, model routing, and
                  warehouse-aware prompts.
                </Typography.Text>
              </Space>

              <Card size="small" title="Connection">
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input.Password
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Bearer access token"
                  />
                  <Input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="API base URL"
                  />
                  <Input
                    value={warehouseId}
                    onChange={(event) => setWarehouseId(event.target.value)}
                    placeholder="Warehouse ID (optional)"
                  />
                  <Select
                    value={model}
                    options={models.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                    onChange={setModel}
                    placeholder="Select model"
                    notFoundContent="No models returned"
                  />
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => void loadBootstrap()}
                    loading={loading}
                  >
                    Refresh models and sessions
                  </Button>
                </Space>
              </Card>

              <Card size="small" title="Session Control">
                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setSessionId(undefined);
                      setMessages([]);
                    }}
                  >
                    New chat
                  </Button>

                  <Popconfirm
                    title="Delete active session?"
                    disabled={!sessionId}
                    onConfirm={() => void handleDeleteSession()}
                  >
                    <Button
                      icon={<DeleteOutlined />}
                      danger
                      disabled={!sessionId}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>

                <Divider style={{ margin: "12px 0" }} />

                <Space
                  style={{ width: "100%", justifyContent: "space-between" }}
                >
                  <Typography.Text>Streaming mode</Typography.Text>
                  <Switch
                    checkedChildren={<ThunderboltOutlined />}
                    unCheckedChildren={<SendOutlined />}
                    checked={streamMode}
                    onChange={setStreamMode}
                  />
                </Space>
              </Card>

              <Card size="small" title="Sessions" bodyStyle={{ padding: 8 }}>
                {loadingSession ? (
                  <Flex justify="center" style={{ padding: 20 }}>
                    <Spin />
                  </Flex>
                ) : sessions.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No sessions yet"
                  />
                ) : (
                  <Conversations
                    activeKey={sessionId}
                    items={sessions.map((item) => ({
                      key: item._id,
                      label: item.title,
                      icon: <MessageOutlined />,
                    }))}
                    onActiveChange={(value) => {
                      if (typeof value === "string") {
                        void handleSelectSession(value);
                      }
                    }}
                  />
                )}
              </Card>
            </div>
          </Layout.Sider>

          <Layout.Content className="chat-app-content">
            <div className="chat-stage">
              <Welcome
                icon={<RobotOutlined />}
                title="Warehouse Intelligence Assistant"
                description="Ask about products, inventory, transactions, dashboard, suppliers, and customer analytics."
                extra={
                  <Space>
                    <Tag color="cyan">/chat/stream</Tag>
                    <Tag color="green">/chat/message</Tag>
                    <Badge
                      status={token ? "success" : "warning"}
                      text={token ? "Token set" : "Token missing"}
                    />
                  </Space>
                }
              />

              {messages.length === 0 ? (
                <Prompts
                  title="Try one of these"
                  items={QUICK_PROMPTS}
                  wrap
                  onItemClick={(info) => {
                    const text =
                      typeof info.data.label === "string"
                        ? info.data.label
                        : "";
                    setInputValue(text);
                  }}
                />
              ) : (
                <Bubble.List
                  items={bubbleItems}
                  autoScroll
                  role={{
                    ai: {
                      placement: "start",
                      avatar: <RobotOutlined />,
                      variant: "shadow",
                      shape: "corner",
                      contentRender: (content) => {
                        if (typeof content === "string") {
                          return content;
                        }

                        const payload = content as {
                          text: string;
                          parsed?: ParsedChatResponse;
                        };
                        if (!payload.text) {
                          return <Spin size="small" />;
                        }

                        const parsed =
                          payload.parsed ?? parseChatResponse(payload.text);
                        return <ParsedBlocks parsed={parsed} />;
                      },
                    },
                    user: {
                      placement: "end",
                      variant: "filled",
                      shape: "round",
                    },
                  }}
                />
              )}

              <Sender
                value={inputValue}
                onChange={(nextValue) => setInputValue(nextValue)}
                onSubmit={(text) => {
                  void handleSend(text);
                }}
                loading={loading}
                submitType="enter"
                placeholder="Ask about your warehouse operations..."
                footer={
                  <Typography.Text type="secondary">
                    Internal tool-call text is filtered from UI. If a stream
                    drops, partial output is kept for retry.
                  </Typography.Text>
                }
              />
            </div>
          </Layout.Content>
        </Layout>
      </XProvider>
    </ConfigProvider>
  );
}

export default function RootApp() {
  return (
    <AntApp>
      <App />
    </AntApp>
  );
}
