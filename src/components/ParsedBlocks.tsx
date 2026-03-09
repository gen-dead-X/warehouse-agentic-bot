import {
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import ReactMarkdown from "react-markdown";
import type {
  ChartBlock,
  MetricBlock,
  ParsedChatResponse,
  TableBlock,
} from "../types/chat";

function renderChange(change?: string) {
  if (!change) {
    return null;
  }

  const positive = change.trim().startsWith("+");
  return <Tag color={positive ? "green" : "red"}>{change}</Tag>;
}

function MetricView({ block }: { block: MetricBlock }) {
  return (
    <Card size="small">
      <Space direction="vertical" size={4}>
        <Typography.Text type="secondary">{block.label}</Typography.Text>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {block.value}
        </Typography.Title>
        {renderChange(block.change)}
      </Space>
    </Card>
  );
}

function TableView({ block }: { block: TableBlock }) {
  const columns: ColumnsType<Record<string, unknown>> = block.columns.map(
    (item) => ({
      title: item.label,
      dataIndex: item.key,
      key: item.key,
    }),
  );

  return (
    <Card size="small" title={block.title}>
      <Table
        size="small"
        pagination={false}
        columns={columns}
        rowKey={(_, index) => String(index ?? Math.random())}
        dataSource={block.rows}
        scroll={{ x: true }}
      />
    </Card>
  );
}

function ChartView({ block }: { block: ChartBlock }) {
  const points = block.datasets.flatMap((dataset) => dataset.data);
  const max = points.length > 0 ? Math.max(...points) : 1;

  return (
    <Card size="small" title={block.title ?? `${block.chartType} chart`}>
      <Space direction="vertical" style={{ width: "100%" }} size={14}>
        {block.datasets.map((dataset) => (
          <div key={dataset.label}>
            <Typography.Text strong>{dataset.label}</Typography.Text>
            <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
              {dataset.data.map((value, index) => {
                const percent = max === 0 ? 0 : Math.round((value / max) * 100);
                const label = block.labels[index] ?? `Item ${index + 1}`;
                return (
                  <Col span={24} key={`${dataset.label}-${label}`}>
                    <Space
                      style={{ width: "100%", justifyContent: "space-between" }}
                    >
                      <Typography.Text>{label}</Typography.Text>
                      <Typography.Text>{value}</Typography.Text>
                    </Space>
                    <Progress percent={percent} size="small" showInfo={false} />
                  </Col>
                );
              })}
            </Row>
          </div>
        ))}
      </Space>
    </Card>
  );
}

export function ParsedBlocks({ parsed }: { parsed: ParsedChatResponse }) {
  if (
    !parsed.summary &&
    parsed.insights.length === 0 &&
    parsed.data.length === 0
  ) {
    return <ReactMarkdown>{parsed.raw}</ReactMarkdown>;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {parsed.summary ? (
        <Card size="small">
          <Statistic
            title="Summary"
            value={parsed.summary}
            valueStyle={{ fontSize: 16, fontWeight: 500 }}
          />
        </Card>
      ) : null}

      {parsed.insights.length > 0 ? (
        <Card size="small" title="Insights">
          <Space direction="vertical" size={4}>
            {parsed.insights.map((insight) => (
              <Typography.Text key={insight}>- {insight}</Typography.Text>
            ))}
          </Space>
        </Card>
      ) : null}

      {parsed.data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No structured data returned"
        />
      ) : (
        parsed.data.map((section, index) => {
          if (section.type === "metric") {
            return (
              <MetricView key={`metric-${index}`} block={section.content} />
            );
          }

          if (section.type === "table") {
            return <TableView key={`table-${index}`} block={section.content} />;
          }

          if (section.type === "chart") {
            return <ChartView key={`chart-${index}`} block={section.content} />;
          }

          return (
            <Card key={`text-${index}`} size="small">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </Card>
          );
        })
      )}
    </Space>
  );
}
