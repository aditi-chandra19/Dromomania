import {
  TavilySearch,
  type TavilySearchResponse,
} from "@langchain/tavily";

export type TravelSearchResult = {
  query: string;
  summary: string;
  sources: string[];
};

type TravelSearchInput = {
  agentName: string;
  query: string;
  maxResults?: number;
};

let tavilySearchTool: TavilySearch | null = null;

function getTavilyApiKey() {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY for Tavily-powered travel research.");
  }

  return apiKey;
}

function getTavilySearchTool() {
  if (!tavilySearchTool) {
    tavilySearchTool = new TavilySearch({
      tavilyApiKey: getTavilyApiKey(),
      maxResults: 5,
      includeAnswer: true,
      includeRawContent: "markdown",
      includeFavicon: true,
      searchDepth: "advanced",
      topic: "general",
    });
  }

  return tavilySearchTool;
}

function isTavilySearchResponse(
  value: TavilySearchResponse | { error: string },
): value is TavilySearchResponse {
  return "results" in value;
}

function compactText(text: string | null | undefined, maxLength = 360) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export async function searchTravelWeb({
  agentName,
  query,
  maxResults = 5,
}: TravelSearchInput): Promise<TravelSearchResult> {
  const tool = getTavilySearchTool();
  const response = await tool.invoke({
    query,
    searchDepth: "advanced",
    topic: "general",
  });

  if (!isTavilySearchResponse(response)) {
    throw new Error(`${agentName} search failed: ${response.error}`);
  }

  if (!response.results.length) {
    throw new Error(`${agentName} search returned no Tavily results.`);
  }

  const topResults = response.results.slice(0, maxResults);
  const lines = topResults.map((result, index) => {
    const content = compactText(result.raw_content ?? result.content);
    return [
      `${index + 1}. ${result.title}`,
      `URL: ${result.url}`,
      `Score: ${result.score}`,
      `Key details: ${content}`,
    ].join("\n");
  });

  return {
    query: response.query,
    summary: [
      `Agent: ${agentName}`,
      response.answer ? `Tavily answer: ${compactText(response.answer, 420)}` : "",
      "Top research findings:",
      lines.join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n"),
    sources: topResults.map((result) => result.url),
  };
}
