/** Maps validated RFC 9457-like backend problems to safe presentation issues. */

const STATUS_POLICY = Object.freeze({
  401: { recoveryAction: "reauthenticate", retryable: false },
  403: { recoveryAction: "request-access", retryable: false },
  404: { recoveryAction: "go-to-list", retryable: false },
  409: { recoveryAction: "reload-latest", retryable: true },
  412: { recoveryAction: "reload-latest", retryable: true },
  422: { recoveryAction: "none", retryable: false },
  429: { recoveryAction: "retry", retryable: true },
  500: { recoveryAction: "retry", retryable: true },
  502: { recoveryAction: "retry", retryable: true },
  503: { recoveryAction: "retry", retryable: true },
  504: { recoveryAction: "retry", retryable: true },
});

export function mapProblemToUiIssue(problem) {
  const policy = STATUS_POLICY[problem.status] ?? { recoveryAction: "contact-support", retryable: false };
  return Object.freeze({
    code: problem.code,
    title: problem.title,
    userMessage: problem.detail,
    fieldErrors: problem.field_errors?.map((field) => Object.freeze({ ...field })),
    retryable: policy.retryable,
    supportId: problem.trace_id,
    retryAfter: problem.retry_after,
    recoveryAction: policy.recoveryAction,
  });
}

export function offlineIssue() {
  return Object.freeze({
    code: "OFFLINE",
    title: "네트워크에 연결할 수 없습니다",
    userMessage: "입력 내용은 유지됩니다. 연결을 확인한 뒤 다시 시도하세요.",
    retryable: true,
    recoveryAction: "retry",
  });
}

export function contractIssue(error) {
  return Object.freeze({
    code: "CONTRACT_RESPONSE_INVALID",
    title: "응답 형식을 확인할 수 없습니다",
    userMessage: "안전하지 않은 응답은 화면에 표시하지 않았습니다. 지원 ID와 함께 관리자에게 문의하세요.",
    retryable: false,
    supportId: error.path ?? "runtime-schema",
    recoveryAction: "contact-support",
  });
}
