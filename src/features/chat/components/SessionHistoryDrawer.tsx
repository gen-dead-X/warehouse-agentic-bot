import { ClockCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, List, Space, Tag, Typography } from "antd";
import type { ChatSessionSummary } from "../../../types/chat";

type Props = {
  open: boolean;
  loading: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId?: string;
  onClose: () => void;
  onReload: () => void;
  onSelectSession: (sessionId: string) => void;
};

export function SessionHistoryDrawer({
  open,
  loading,
  sessions,
  activeSessionId,
  onClose,
  onReload,
  onSelectSession,
}: Props) {
  return (
    <Drawer
      title="Chat History"
      placement="right"
      width={360}
      open={open}
      onClose={onClose}
      extra={
        <Button size="small" onClick={onReload}>
          Refresh
        </Button>
      }
    >
      <List
        loading={loading}
        dataSource={sessions}
        locale={{ emptyText: "No history yet" }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="open"
                type="link"
                onClick={() => onSelectSession(item._id)}
              >
                Open
              </Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<ClockCircleOutlined />}
              title={
                <Space>
                  <Typography.Text>{item.title}</Typography.Text>
                  {item._id === activeSessionId ? (
                    <Tag color="blue">Current</Tag>
                  ) : null}
                </Space>
              }
              description={new Date(item.updatedAt).toLocaleString()}
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
