export function sanitizeJsonArguments(raw: unknown): string {
  if (raw === null || raw === undefined) return "{}";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "{}";
    }
  }
  if (typeof raw !== "string") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "{}";
    }
  }
  let s = raw.trim();
  if (!s || s === "undefined" || s === "null" || s === "{}" || s === "None") return "{}";

  // Strip markdown code fences if model generated them
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Fast path: already valid JSON
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    return JSON.stringify({ value: parsed });
  } catch {}

  // Attempt common JSON repairs
  let fixed = s.replace(/,\s*([\]}])/g, "$1"); // remove trailing commas
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":'); // quote unquoted keys
  if (fixed.includes("'")) {
    fixed = fixed.replace(/'([^']*)'/g, '"$1"'); // single to double quotes
  }

  try {
    const parsed = JSON.parse(fixed);
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
  } catch {}

  // Try closing unclosed braces/brackets if stream was truncated
  const openBraces = (fixed.match(/{/g) || []).length - (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
  let closed = fixed;
  if (closed.endsWith(",")) closed = closed.slice(0, -1);
  if (openBrackets > 0) closed += "]".repeat(openBrackets);
  if (openBraces > 0) closed += "}".repeat(openBraces);

  try {
    const parsed = JSON.parse(closed);
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
  } catch {}

  // Safe universal fallback guaranteed to be valid JSON
  return JSON.stringify({ input: s });
}

export function cleanToolCallArgumentsInPayload(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  let changed = false;

  // 1. OpenAI Chat Completions messages array
  if (Array.isArray(payload.messages)) {
    for (const msg of payload.messages) {
      if (!msg || typeof msg !== "object") continue;

      // OpenAI format: tool_calls
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc && tc.function) {
            const original = tc.function.arguments;
            const sanitized = sanitizeJsonArguments(original);
            if (original !== sanitized) {
              tc.function.arguments = sanitized;
              changed = true;
            }
          }
        }
      }

      // CamelCase format: toolCalls
      if (Array.isArray(msg.toolCalls)) {
        for (const tc of msg.toolCalls) {
          if (tc && tc.function) {
            const original = tc.function.arguments;
            const sanitized = sanitizeJsonArguments(original);
            if (original !== sanitized) {
              tc.function.arguments = sanitized;
              changed = true;
            }
          }
        }
      }
    }
  }

  // 2. OpenAI Responses API input array
  if (Array.isArray(payload.input)) {
    for (const item of payload.input) {
      if (item && item.type === "function_call" && item.function) {
        const original = item.function.arguments;
        const sanitized = sanitizeJsonArguments(original);
        if (original !== sanitized) {
          item.function.arguments = sanitized;
          changed = true;
        }
      }
    }
  }

  return changed;
}

export function createResilientFetch(originalFetch = globalThis.fetch): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let currentInit = init ? { ...init } : undefined;
    let parsedBody: any = null;

    if (currentInit && typeof currentInit.body === "string") {
      try {
        parsedBody = JSON.parse(currentInit.body);
        if (cleanToolCallArgumentsInPayload(parsedBody)) {
          currentInit.body = JSON.stringify(parsedBody);
        }
      } catch {
        // Not JSON body, proceed normally
      }
    }

    const res = await originalFetch(input, currentInit);

    // Handle OpenAI 400 "Assistant tool call ... arguments must be valid JSON"
    if (res.status === 400) {
      const bodyText = await res.clone().text().catch(() => "");
      if (
        bodyText.includes("arguments must be valid JSON") ||
        bodyText.includes("Assistant tool call")
      ) {
        if (parsedBody && Array.isArray(parsedBody.messages)) {
          for (const msg of parsedBody.messages) {
            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                if (tc?.function) tc.function.arguments = "{}";
              }
            }
            if (Array.isArray(msg.toolCalls)) {
              for (const tc of msg.toolCalls) {
                if (tc?.function) tc.function.arguments = "{}";
              }
            }
          }
          currentInit = { ...currentInit, body: JSON.stringify(parsedBody) };
          return await originalFetch(input, currentInit);
        }
      }
    }

    return res;
  };
}
