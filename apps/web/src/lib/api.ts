export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
  requestId?: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: Record<string, string>;

  constructor(
    status: number,
    title: string,
    detail: string,
    code: string,
    errors?: Record<string, string>,
  ) {
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.errors = errors;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ApiProblem | null = null;
  try {
    problem = (await response.json()) as ApiProblem;
  } catch {
    problem = null;
  }
  return new ApiError(
    response.status,
    problem?.title ?? `Request failed (${response.status})`,
    problem?.detail ?? problem?.title ?? 'The server could not complete the request.',
    problem?.code ?? 'REQUEST_FAILED',
    problem?.errors,
  );
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return (await response.text()) as unknown as T;
  }
  return (await response.json()) as T;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!response.ok) throw await toApiError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail || error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError && error.errors) return error.errors;
  return {};
}
