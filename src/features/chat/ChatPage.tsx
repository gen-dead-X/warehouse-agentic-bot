import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Flex,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  HistoryOutlined,
  LoadingOutlined,
  LogoutOutlined,
  RobotOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSession,
  listModels,
  listSessions,
  streamMessage,
} from "../../api/chat-api";
import { listWarehouses } from "../../api/warehouse-api";
import { ParsedBlocks } from "../../components/ParsedBlocks";
import { parseChatResponse } from "../../lib/chat-parser";
import { clearAuthTokens, getAccessToken } from "../../lib/auth-storage";
import type {
  ChatModel,
  ChatSessionSummary,
  ChatUIMessage,
} from "../../types/chat";
import type { Warehouse } from "../../types/warehouse";
import { SessionHistoryDrawer } from "./components/SessionHistoryDrawer";
import "./chat-page.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3030";
const DEFAULT_MODEL = "llama3.1:8b";

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [value, setValue] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    DEFAULT_MODEL,
  );

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);

  const [messages, setMessages] = useState<ChatUIMessage[]>([]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        label: warehouse.name,
        value: warehouse._id,
      })),
    [warehouses],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    const bootstrap = async () => {
      try {
        const [modelList, warehouseList] = await Promise.all([
          listModels(BASE_URL, token),
          listWarehouses(BASE_URL, token),
        ]);

        setModels(modelList);
        if (modelList.length > 0) {
          setSelectedModel(modelList[0].id);
        }

        setWarehouses(warehouseList);
      } catch (error) {
        const textError =
          error instanceof Error
            ? error.message
            : "Failed to load chat metadata";
        message.error(textError);
      }
    };

    void bootstrap();
  }, [message]);

  const loadHistory = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    setHistoryLoading(true);
    try {
      const history = await listSessions(BASE_URL, token);
      setSessions(history);
    } catch (error) {
      const textError =
        error instanceof Error ? error.message : "Failed to load chat history";
      message.error(textError);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setHistoryOpen(true);
    void loadHistory();
  };

  const handleLoadSession = async (selectedSessionId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    setHistoryLoading(true);
    try {
      const detail = await getSession(BASE_URL, token, selectedSessionId);
      if (!detail) {
        message.warning("Session not found");
        return;
      }

      setSessionId(detail._id);
      setWarehouseId(detail.warehouseContext);

      const restored: ChatUIMessage[] = detail.messages
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
          id: makeMessageId(item.role),
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
          parsed:
            item.role === "assistant"
              ? parseChatResponse(item.content)
              : undefined,
          status: "done",
          createdAt: item.timestamp,
        }));

      setMessages(restored);
      setHistoryOpen(false);
    } catch (error) {
      const textError =
        error instanceof Error
          ? error.message
          : "Failed to load selected session";
      message.error(textError);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthTokens();
    navigate("/login", { replace: true });
  };

  const handleSend = async () => {
    const token = getAccessToken();
    if (!token) {
      message.error("Access token missing. Please login again.");
      navigate("/login", { replace: true });
      return;
    }

    const text = value.trim();
    if (!text || sending) {
      return;
    }

    const userMessage: ChatUIMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      status: "done",
    };

    const assistantId = makeMessageId("assistant");

    setSending(true);
    setValue("");
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        status: "streaming",
      },
    ]);

    try {
      const nextSessionId = await streamMessage(
        BASE_URL,
        token,
        {
          message: text,
          sessionId,
          warehouseId,
          model: selectedModel,
        },
        {
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
        },
      );

      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== assistantId) {
            return item;
          }

          return {
            ...item,
            status: "done",
            parsed: parseChatResponse(item.content),
          };
        }),
      );

      if (nextSessionId) {
        setSessionId(nextSessionId);
      }
    } catch (error) {
      const textError =
        error instanceof Error ? error.message : "Chat request failed";
      message.error(textError);

      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                status: "error",
                content:
                  item.content ||
                  "Connection interrupted. Please retry this message.",
              }
            : item,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <Card className="chat-card" bordered={false}>
        <Space direction="vertical" style={{ width: "100%" }} size={14}>
          <div className="chat-header">
            <Typography.Title level={4} style={{ margin: 0 }}>
              <RobotOutlined /> Warehouse AI Chat
            </Typography.Title>
            <Flex gap={10}>
              <Button icon={<HistoryOutlined />} onClick={openHistory}>
                History
              </Button>
              <Tag color="blue">Session: {sessionId ?? "new"}</Tag>
              <Button icon={<LogoutOutlined />} onClick={handleLogout}>
                Logout
              </Button>
            </Flex>
          </div>

          <Alert
            showIcon
            type="success"
            message="Streaming enabled with /chat/stream"
            description="Replies render token-by-token in real time and keep context by sending sessionId in each request body."
          />

          <div className="chat-toolbar">
            <Select
              className="chat-model-select"
              value={selectedModel}
              options={models.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              placeholder="Select model"
              onChange={setSelectedModel}
            />
            <Select
              className="chat-model-select"
              value={warehouseId}
              options={warehouseOptions}
              placeholder="Select warehouse (optional)"
              onChange={(nextWarehouseId) => setWarehouseId(nextWarehouseId)}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </div>

          <div className="chat-list">
            {messages.length === 0 ? (
              <Typography.Text type="secondary">
                Start the conversation by sending a message.
              </Typography.Text>
            ) : (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={
                      item.role === "user"
                        ? "bubble-row bubble-row-user"
                        : "bubble-row bubble-row-ai"
                    }
                  >
                    <div
                      className={
                        item.role === "user"
                          ? "bubble bubble-user"
                          : "bubble bubble-ai"
                      }
                    >
                      {item.role === "assistant" && item.parsed ? (
                        <ParsedBlocks parsed={item.parsed} />
                      ) : (
                        <Typography.Text
                          className={
                            item.role === "user"
                              ? "bubble-user-text"
                              : "bubble-ai-text"
                          }
                        >
                          {item.content ||
                            (item.status === "streaming" ? "Streaming..." : "")}
                        </Typography.Text>
                      )}
                      {item.role === "assistant" &&
                      item.status === "streaming" ? (
                        <div className="streaming-indicator">
                          <LoadingOutlined /> Streaming...
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </div>

          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Ask your warehouse assistant..."
              onPressEnter={() => {
                void handleSend();
              }}
              disabled={sending}
            />
            <Button
              type="primary"
              icon={
                sending ? (
                  <Spin indicator={<LoadingOutlined spin />} size="small" />
                ) : (
                  <SendOutlined />
                )
              }
              onClick={() => void handleSend()}
              disabled={!value.trim()}
            >
              Send
            </Button>
          </Space.Compact>
        </Space>
      </Card>

      <SessionHistoryDrawer
        open={historyOpen}
        loading={historyLoading}
        sessions={sessions}
        activeSessionId={sessionId}
        onClose={() => setHistoryOpen(false)}
        onReload={() => {
          void loadHistory();
        }}
        onSelectSession={(selectedSessionId) => {
          void handleLoadSession(selectedSessionId);
        }}
      />
    </div>
  );
}
