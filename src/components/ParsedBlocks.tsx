import { Card, Empty, Space, Statistic, Table, Tag, Typography } from "antd";
import { Area, Column, Line, Pie } from "@ant-design/charts";
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
  const primaryDataset = block.datasets[0] ?? { label: "Series", data: [] };
  const chartData = block.labels.map((label, index) => ({
    label,
    value: primaryDataset.data[index] ?? 0,
  }));

  const pieData = block.labels.flatMap((label, index) =>
    block.datasets.map((dataset) => ({
      type: `${dataset.label} - ${label}`,
      value: dataset.data[index] ?? 0,
    })),
  );

  return (
    <Card size="small" title={block.title ?? `${block.chartType} chart`}>
      {block.chartType === "line" ? (
        <Line data={chartData} xField="label" yField="value" height={260} />
      ) : null}

      {block.chartType === "area" ? (
        <Area data={chartData} xField="label" yField="value" height={260} />
      ) : null}

      {block.chartType === "bar" ? (
        <Column data={chartData} xField="label" yField="value" height={260} />
      ) : null}

      {(block.chartType === "pie" || block.chartType === "doughnut") &&
      pieData.length > 0 ? (
        <Pie
          data={pieData}
          angleField="value"
          colorField="type"
          innerRadius={block.chartType === "doughnut" ? 0.55 : 0}
          height={260}
          label={{
            text: "value",
          }}
        />
      ) : null}

      {chartData.length === 0 && pieData.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chart data is empty"
        />
      ) : null}
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
