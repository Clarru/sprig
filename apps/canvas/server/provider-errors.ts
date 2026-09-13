export type ProviderFailure = {
  kind:
    | "authentication"
    | "access"
    | "quota"
    | "rate-limit"
    | "configuration"
    | "timeout"
    | "connection"
    | "backpressure";
};
/** Only classify metadata. Never forward provider messages, headers, keys, or transcripts. */
export function classifyProviderFailure(error: {
  code?: unknown;
  status?: unknown;
  param?: unknown;
}): ProviderFailure {
  if (error.status === 401 || error.code === "invalid_api_key")
    return { kind: "authentication" };
  if (
    error.code === "insufficient_quota" ||
    error.code === "billing_hard_limit_reached"
  )
    return { kind: "quota" };
  if (
    error.status === 403 ||
    error.code === "model_not_found" ||
    error.code === "permission_denied"
  )
    return { kind: "access" };
  if (error.status === 429 || error.code === "rate_limit_exceeded")
    return { kind: "rate-limit" };
  if (error.code === "ETIMEDOUT" || error.code === "timeout")
    return { kind: "timeout" };
  if (
    error.status === 400 ||
    error.code === "invalid_value" ||
    error.code === "invalid_request_error" ||
    error.code === "unknown_parameter"
  )
    return { kind: "configuration" };
  return { kind: "connection" };
}
export function providerFailureMessage(failure: ProviderFailure): string {
  const messages: Record<ProviderFailure["kind"], string> = {
    authentication:
      "OpenAI rejected the API key. Check OPENAI_API_KEY in apps/canvas/.env, then restart Sprig.",
    access:
      "Your API project cannot access the configured model. Check model access and key permissions.",
    quota:
      "Your OpenAI API quota is exhausted. Check API billing and available credits, then reconnect.",
    "rate-limit":
      "OpenAI’s rate limit was reached. Wait a moment, then reconnect.",
    configuration:
      "OpenAI rejected the session settings. Restart Sprig to load the updated transcription setup.",
    timeout:
      "OpenAI did not respond in time. Check your connection, then reconnect.",
    connection:
      "The OpenAI connection stopped. Check your connection, then reconnect. Your board is safe.",
    backpressure:
      "Audio could not keep up with the connection. Reconnect to continue.",
  };
  return messages[failure.kind];
}
