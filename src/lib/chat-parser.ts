import type {
  ChartBlock,
  ChatSection,
  MetricBlock,
  ParsedChatResponse,
  TableBlock,
} from "../types/chat";

const BLOCK_PATTERN = /^(table|chart|metric)$/i;
const SUMMARY_PATTERN = /^#+\s*summary$/i;
const INSIGHTS_PATTERN = /^#+\s*insights?$/i;
const DATA_PATTERN = /^#+\s*data$/i;
const BULLET_PATTERN = /^[*\-•]\s+(.+)$/;

export function parseChatResponse(markdown: string): ParsedChatResponse {
  const result: ParsedChatResponse = {
    summary: "",
    insights: [],
    data: [],
    raw: markdown,
  };

  const lines = markdown.split("\n");
  let section: "none" | "summary" | "insights" | "data" = "none";
  let blockType: "table" | "chart" | "metric" | null = null;
  let blockBuffer = "";
  let textBuffer: string[] = [];

  const flushText = () => {
    const text = textBuffer.join(" ").trim();
    textBuffer = [];
    if (!text) {
      return;
    }

    if (section === "summary") {
      result.summary = result.summary ? `${result.summary} ${text}` : text;
      return;
    }

    if (section === "data") {
      result.data.push({ type: "text", content: text });
      return;
    }

    if (section === "none") {
      result.data.push({ type: "text", content: text });
    }
  };

  const pushParsedBlock = () => {
    if (!blockType) {
      return;
    }

    const raw = blockBuffer.trim();
    blockBuffer = "";

    try {
      const parsed = JSON.parse(raw) as TableBlock | ChartBlock | MetricBlock;
      result.data.push({ type: blockType, content: parsed } as ChatSection);
    } catch {
      result.data.push({
        type: "text",
        content: `\`\`\`${blockType}\n${raw}\n\`\`\``,
      });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (blockType) {
      if (trimmed === "```") {
        pushParsedBlock();
        blockType = null;
      } else {
        blockBuffer += `${line}\n`;
      }
      continue;
    }

    if (SUMMARY_PATTERN.test(trimmed)) {
      flushText();
      section = "summary";
      continue;
    }

    if (INSIGHTS_PATTERN.test(trimmed)) {
      flushText();
      section = "insights";
      continue;
    }

    if (DATA_PATTERN.test(trimmed)) {
      flushText();
      section = "data";
      continue;
    }

    if (trimmed.startsWith("```")) {
      const blockMatch = trimmed.replace("```", "").trim().toLowerCase();
      if (BLOCK_PATTERN.test(blockMatch)) {
        flushText();
        blockType = blockMatch as "table" | "chart" | "metric";
        blockBuffer = "";
        continue;
      }
    }

    if (section === "insights") {
      const bullet = trimmed.match(BULLET_PATTERN);
      if (bullet && bullet[1]) {
        result.insights.push(bullet[1].trim());
        continue;
      }
    }

    if (trimmed) {
      textBuffer.push(trimmed);
    }
  }

  flushText();

  if (blockType) {
    pushParsedBlock();
  }

  return result;
}

export function isConversational(parsed: ParsedChatResponse): boolean {
  return (
    !parsed.summary && parsed.insights.length === 0 && parsed.data.length === 0
  );
}
