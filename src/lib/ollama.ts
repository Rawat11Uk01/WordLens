/**
 * Minimal client for a locally running Ollama instance.
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Everything here is fully local — requests go to http://localhost:11434 by
 * default and never touch the cloud.
 */

export class OllamaError extends Error {
  readonly kind: 'not-running' | 'model-missing' | 'http' | 'unknown'
  constructor(message: string, kind: OllamaError['kind']) {
    super(message)
    this.name = 'OllamaError'
    this.kind = kind
  }
}

export interface OllamaTag {
  name: string
}

/** Check whether Ollama is reachable and return installed model names. */
export async function listModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`${stripTrailingSlash(baseUrl)}/api/tags`, { signal })
  } catch {
    throw new OllamaError(
      'Could not reach Ollama. Make sure it is installed and running (run "ollama serve").',
      'not-running'
    )
  }
  if (!res.ok) {
    throw new OllamaError(`Ollama responded with status ${res.status}.`, 'http')
  }
  const data = (await res.json()) as { models?: OllamaTag[] }
  return (data.models ?? []).map((m) => m.name)
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function buildPrompt(word: string, context: string): string {
  const trimmedContext = context.trim().slice(0, 1500)
  return [
    'You are a helpful reading assistant embedded in a PDF reader.',
    `Explain the meaning of the word "${word}" *as it is used in the passage below*.`,
    'Keep it short (2-4 sentences), clear, and beginner-friendly.',
    'If the word has a special or technical meaning in this context, focus on that.',
    '',
    'Passage:',
    `"""${trimmedContext}"""`,
    '',
    `Explanation of "${word}" in this context:`
  ].join('\n')
}

export interface ExplainOptions {
  baseUrl: string
  model: string
  word: string
  context: string
  signal?: AbortSignal
  /** Called with incremental text as the model streams its response. */
  onToken?: (chunk: string) => void
}

/**
 * Ask the local LLM to explain a word in context. Streams tokens via onToken
 * and resolves with the full text.
 */
export async function explainInContext(opts: ExplainOptions): Promise<string> {
  const { baseUrl, model, word, context, signal, onToken } = opts
  const prompt = buildPrompt(word, context)

  let res: Response
  try {
    res = await fetch(`${stripTrailingSlash(baseUrl)}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true }),
      signal
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new OllamaError(
      'Could not reach Ollama. Make sure it is installed and running (run "ollama serve").',
      'not-running'
    )
  }

  if (res.status === 404) {
    throw new OllamaError(
      `Model "${model}" is not installed. Run: ollama pull ${model}`,
      'model-missing'
    )
  }
  if (!res.ok || !res.body) {
    throw new OllamaError(`Ollama responded with status ${res.status}.`, 'http')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  // Ollama streams newline-delimited JSON objects.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed) as { response?: string; error?: string }
        if (json.error) {
          throw new OllamaError(json.error, 'unknown')
        }
        if (json.response) {
          full += json.response
          onToken?.(json.response)
        }
      } catch (e) {
        if (e instanceof OllamaError) throw e
        // Ignore partial/invalid JSON fragments.
      }
    }
  }

  return full.trim()
}
