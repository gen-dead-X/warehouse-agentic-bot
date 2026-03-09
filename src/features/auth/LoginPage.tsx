import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Typography,
} from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithEmailPassword } from "../../api/auth-api";
import { getAccessToken, saveAuthTokens } from "../../lib/auth-storage";
import "./login-page.css";

type LoginFormValues = {
  email: string;
  password: string;
};

export function LoginPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [responsePreview, setResponsePreview] = useState("");

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
