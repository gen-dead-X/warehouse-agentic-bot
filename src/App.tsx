import {
  App as AntApp,
  Alert,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  LockOutlined,
  LoadingOutlined,
  LogoutOutlined,
  MailOutlined,
  RobotOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { type ReactNode, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { loginWithEmailPassword } from "./api/auth-api";
import { ParsedBlocks } from "./components/ParsedBlocks";
import { parseChatResponse } from "./lib/chat-parser";
import {
  clearAuthTokens,
  getAccessToken,
  saveAuthTokens,
} from "./lib/auth-storage";
import { listModels, streamMessage } from "./api/chat-api";
import type { ChatModel, ChatUIMessage } from "./types/chat";
import "./App.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3030";
const DEFAULT_MODEL = "llama3.1:8b";

type LoginFormValues = {
  email: string;
  password: string;
};

function LoginPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [responsePreview, setResponsePreview] = useState<string>("");

  useEffect(() => {
    if (getAccessToken()) {
      navigate("/chat", { replace: true });
    }
  }, [navigate]);

  const handleFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setResponsePreview("");

    try {
      const data = await loginWithEmailPassword({
        email: values.email,
        password: values.password,
      });

      saveAuthTokens({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      });
      localStorage.setItem("auth.email", values.email);
      setResponsePreview(JSON.stringify(data, null, 2));
      message.success("Login request succeeded, tokens saved");
      navigate("/chat", { replace: true });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Login failed";
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <Space direction="vertical" size={4}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              Sign In
            </Typography.Title>
            <Typography.Text type="secondary">
              Endpoint: <code>/user/auth/login</code>
            </Typography.Text>
          </Space>

          <Form<LoginFormValues>
            layout="vertical"
            onFinish={handleFinish}
            requiredMark={false}
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Enter a valid email address" },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={loading}>
              Login
            </Button>
          </Form>

          <Alert
            type="info"
            showIcon
            message="Request Body"
            description='{ "email": "string", "password": "string" }'
          />

          {responsePreview ? (
            <div className="response-preview">
              <Typography.Text strong>Response</Typography.Text>
              <pre>{responsePreview}</pre>
            </div>
          ) : null}
        </Space>
      </Card>
    </div>
  );
}

function AiChatPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    DEFAULT_MODEL,
  );
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    const loadModels = async () => {
      try {
        const data = await listModels(BASE_URL, token);
        setModels(data);
        if (data.length > 0) {
          setSelectedModel(data[0].id);
        } else {
          message.warning(
            "No models reported by server, using default model fallback.",
          );
        }
      } catch (error) {
        const textError =
          error instanceof Error
            ? error.message
            : "Failed to load available models";
        message.error(textError);
      }
    };

    void loadModels();
  }, [message]);

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
      id: `${Date.now()}-user`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      status: "done",
    };

    const assistantId = `${Date.now()}-assistant`;

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
          warehouseId: warehouseId || undefined,
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
              loading={models.length === 0}
            />
            <Input
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              placeholder="Warehouse ID (optional)"
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
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <AiChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <Navigate to={getAccessToken() ? "/chat" : "/login"} replace />
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#14532d",
          borderRadius: 12,
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
