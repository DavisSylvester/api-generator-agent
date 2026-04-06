const LANGGRAPH_API = 'http://localhost:2024';
const UI_PORT = 3333;

interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly name?: string };
}

interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly conditional: boolean;
  readonly data?: string;
}

interface GraphData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

function graphToMermaid(name: string, graph: GraphData): string {
  const lines: string[] = [
    `graph TD;`,
  ];

  for (const node of graph.nodes) {
    if (node.id === '__start__') {
      lines.push(`  __start__([START]):::startNode;`);
    } else if (node.id === '__end__') {
      lines.push(`  __end__([END]):::endNode;`);
    } else {
      lines.push(`  ${node.id}["${node.data.name ?? node.id}"]:::agentNode;`);
    }
  }

  for (const edge of graph.edges) {
    if (edge.conditional) {
      const label = edge.data ? `|${edge.data}|` : '';
      lines.push(`  ${edge.source} -.-> ${label} ${edge.target};`);
    } else {
      lines.push(`  ${edge.source} --> ${edge.target};`);
    }
  }

  return lines.join('\n');
}

async function fetchGraphs(): Promise<{ pipeline: GraphData | null; taskLoop: GraphData | null }> {
  let pipeline: GraphData | null = null;
  let taskLoop: GraphData | null = null;

  try {
    const assistants = await fetch(`${LANGGRAPH_API}/assistants/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then((r) => r.json()) as Array<{ assistant_id: string; graph_id: string; name: string }>;

    for (const a of assistants) {
      const graph = await fetch(`${LANGGRAPH_API}/assistants/${a.assistant_id}/graph`)
        .then((r) => r.json()) as GraphData;
      if (a.graph_id === 'pipeline') pipeline = graph;
      if (a.graph_id === 'task_loop') taskLoop = graph;
    }
  } catch (e) {
    console.error('Failed to fetch graphs from LangGraph API:', e);
  }

  return { pipeline, taskLoop };
}

function buildHtml(pipelineMermaid: string, taskLoopMermaid: string, info: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LangGraph - API Generator Agent</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; font-size: 1.8rem; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; }
    .card h2 { color: #79c0ff; margin-bottom: 1rem; font-size: 1.2rem; }
    .mermaid { background: #0d1117; border-radius: 6px; padding: 1rem; display: flex; justify-content: center; }
    .mermaid svg { max-width: 100%; }
    .info-bar { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .badge { background: #21262d; border: 1px solid #30363d; border-radius: 20px; padding: 0.4rem 1rem; font-size: 0.85rem; }
    .badge.ok { border-color: #238636; color: #3fb950; }
    .endpoints { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; }
    .endpoints h2 { color: #79c0ff; margin-bottom: 1rem; }
    .endpoint { font-family: monospace; background: #0d1117; border-radius: 4px; padding: 0.5rem 1rem; margin-bottom: 0.5rem; font-size: 0.9rem; }
    .method { color: #3fb950; font-weight: bold; margin-right: 0.5rem; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>LangGraph - API Generator Agent</h1>
  <p class="subtitle">Multi-agent pipeline for generating Elysia APIs from PRDs</p>

  <div class="info-bar">
    <span class="badge ok">Server: Running</span>
    <span class="badge">${info}</span>
    <span class="badge"><a href="https://smith.langchain.com/studio?baseUrl=http://localhost:2024" target="_blank">Open LangSmith Studio</a></span>
    <span class="badge"><a href="${LANGGRAPH_API}/info" target="_blank">API /info</a></span>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Pipeline Graph</h2>
      <p style="color:#8b949e;margin-bottom:1rem;font-size:0.9rem;">PRD &rarr; Plan &rarr; Collect Code &rarr; Documentation</p>
      <div class="mermaid">
${pipelineMermaid}
      </div>
    </div>
    <div class="card">
      <h2>Task Fix-Loop Graph</h2>
      <p style="color:#8b949e;margin-bottom:1rem;font-size:0.9rem;">CodeGen &rarr; ESLint &rarr; QA &rarr; retry or save</p>
      <div class="mermaid">
${taskLoopMermaid}
      </div>
    </div>
  </div>

  <div class="endpoints">
    <h2>API Endpoints</h2>
    <div class="endpoint"><span class="method">GET</span>  <a href="${LANGGRAPH_API}/ok">/ok</a> - Health check</div>
    <div class="endpoint"><span class="method">GET</span>  <a href="${LANGGRAPH_API}/info">/info</a> - Server info</div>
    <div class="endpoint"><span class="method">POST</span> /assistants/search - List graphs</div>
    <div class="endpoint"><span class="method">GET</span>  /assistants/:id/graph - Get graph structure</div>
    <div class="endpoint"><span class="method">POST</span> /threads - Create thread</div>
    <div class="endpoint"><span class="method">POST</span> /threads/:id/runs - Invoke a graph</div>
    <div class="endpoint"><span class="method">POST</span> /threads/:id/runs/stream - Stream graph execution</div>
  </div>

  <script>
    mermaid.initialize({
      theme: 'dark',
      themeVariables: {
        primaryColor: '#238636',
        primaryTextColor: '#c9d1d9',
        primaryBorderColor: '#30363d',
        lineColor: '#58a6ff',
        secondaryColor: '#21262d',
        tertiaryColor: '#161b22',
        edgeLabelBackground: '#161b22',
      },
      flowchart: { curve: 'basis', padding: 20 },
    });
  </script>
</body>
</html>`;
}

const server = Bun.serve({
  port: UI_PORT,
  async fetch(_req): Promise<Response> {
    const url = new URL(_req.url);

    if (url.pathname !== '/') {
      return new Response('Not Found', { status: 404 });
    }

    const { pipeline, taskLoop } = await fetchGraphs();

    const pipelineMermaid = pipeline
      ? graphToMermaid('Pipeline', pipeline)
      : 'graph TD;\n  error["Failed to load pipeline graph"]:::errorNode;';

    const taskLoopMermaid = taskLoop
      ? graphToMermaid('Task Loop', taskLoop)
      : 'graph TD;\n  error["Failed to load task loop graph"]:::errorNode;';

    let info = 'unknown';
    try {
      const infoData = await fetch(`${LANGGRAPH_API}/info`).then((r) => r.json()) as { version: string; langgraph_js_version: string };
      info = `CLI v${infoData.version} | LangGraph.js v${infoData.langgraph_js_version}`;
    } catch { /* ignore */ }

    const html = buildHtml(pipelineMermaid, taskLoopMermaid, info);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
});

console.log(`Dashboard running at http://localhost:${UI_PORT}`);
