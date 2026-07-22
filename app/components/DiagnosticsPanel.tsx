"use client";

type DiagnosticTool = {
  id?: string;
  name: string;
  input?: string;
  output?: string;
  error?: string;
  hasError?: boolean;
};

type DiagnosticMetrics = {
  toolCount?: number;
  durationMs?: number;
  model?: string;
  maxSteps?: number;
};

type DiagnosticsPanelProps = {
  tools?: DiagnosticTool[];
  metrics?: DiagnosticMetrics;
  isLoading?: boolean;
};

function getDetectedError(tool: DiagnosticTool) {
  if (tool.hasError && tool.error) {
    return tool.error;
  }

  if (tool.error) {
    return tool.error;
  }

  const output = tool.output ?? "";
  const jsonError = /"error"\s*:\s*"([^"]+)"/i.exec(output);

  if (jsonError?.[1]) {
    return jsonError[1];
  }

  if (/błąd|blad|nie znalaz|nie udało|nie udalo|timeout|przekroczono limit|niedostępna|niedostepna/i.test(output)) {
    return output;
  }

  return "";
}

function formatDuration(durationMs?: number) {
  if (!durationMs) {
    return "0.0s";
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatToolInput(input?: string) {
  if (!input) {
    return "";
  }

  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    const firstValue = Object.values(parsed).find((value) => typeof value === "string" || typeof value === "number");

    if (firstValue !== undefined) {
      return `("${String(firstValue)}")`;
    }
  } catch {
    // Plain text preview is fine when the input is not JSON.
  }

  return `(${input})`;
}

function getProgressClass(steps: number) {
  if (steps >= 5) {
    return "red";
  }

  if (steps === 4) {
    return "yellow";
  }

  return "green";
}

export function DiagnosticsPanel({
  tools = [],
  metrics,
  isLoading = false,
}: DiagnosticsPanelProps) {
  const maxSteps = metrics?.maxSteps ?? 5;
  const steps = isLoading ? Math.max(metrics?.toolCount ?? tools.length, 1) : metrics?.toolCount ?? tools.length;
  const progress = Math.min((steps / maxSteps) * 100, 100);
  const progressClass = getProgressClass(steps);
  const errors = tools
    .map((tool) => ({ tool, message: getDetectedError(tool) }))
    .filter((item) => item.message);
  const toolCounts = tools.reduce<Record<string, number>>((counts, tool) => {
    counts[tool.name] = (counts[tool.name] ?? 0) + 1;
    return counts;
  }, {});
  const status = isLoading ? "W trakcie..." : steps >= maxSteps ? "Limit kroków" : "Ukończone";

  return (
    <section className="diagnostics-panel" aria-label="Diagnostyka agenta">
      <div className="diagnostics-header">
        <strong>Diagnostyka</strong>
        <span>{isLoading ? "pracuję" : errors.length ? "sprawdź alerty" : "bez błędów"}</span>
      </div>

      <div className="diagnostics-progress">
        <div>
          <span>Kroki</span>
          <strong>
            {steps}/{maxSteps}
          </strong>
        </div>
        <div className="diagnostics-progress-track">
          <span className={progressClass} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="diagnostics-grid">
        <div>
          <span>Narzędzia</span>
          <strong>
            {Object.entries(toolCounts).length
              ? Object.entries(toolCounts)
                  .map(([name, count]) => `${name}(${count})`)
                  .join(", ")
              : "brak"}
          </strong>
        </div>
        <div>
          <span>Błędy</span>
          <strong>{errors.length}</strong>
        </div>
        <div>
          <span>Czas</span>
          <strong>{formatDuration(metrics?.durationMs)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </div>

      {errors.length ? (
        <div className="diagnostics-alerts" aria-label="Błędy narzędzi">
          {errors.map(({ tool, message }, index) => (
            <div className="diagnostics-alert" key={`${tool.id ?? tool.name}-${index}`}>
              <strong>
                {tool.name}
                {formatToolInput(tool.input)}
              </strong>
              <span>{message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
