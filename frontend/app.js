/**
 * 업무 네비게이터 화면.
 *
 * 백엔드와는 docs/API.md 의 계약으로만 이야기한다. 검색이 어떻게 도는지,
 * 어떤 모델을 쓰는지는 화면이 알 필요가 없다.
 */

const API = "/api/v1";

const el = (id) => document.getElementById(id);
const state = {
  workflowId: null, // 사용자가 고른 업무. 질문에 함께 보낸다
  workflowName: null,
  documentId: null, // 원문 보기에서 열어 둔 문서
  chunkId: null,
};

async function call(path, options = {}) {
  const response = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // 계약상 에러는 언제나 {"error": {code, message}} 형태다.
    const message = body?.error?.message || `요청이 실패했습니다 (${response.status})`;
    throw new Error(message);
  }
  return body;
}

/* ---------- 업무 목록 ---------- */

async function loadWorkflows() {
  const list = el("workflow-list");
  try {
    const { workflows } = await call("/workflows");
    list.innerHTML = "";
    workflows.forEach((workflow) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.id = workflow.workflow_id;
      button.innerHTML =
        `<span class="name"></span><span class="progress"></span>`;
      button.querySelector(".name").textContent = workflow.name;
      button.querySelector(".progress").textContent =
        `${workflow.completed_step_count}/${workflow.step_count} 단계` +
        (workflow.current_step ? ` · 지금 ${workflow.current_step}` : " · 완료");
      button.addEventListener("click", () => selectWorkflow(workflow));
      item.appendChild(button);
      list.appendChild(item);
    });
    if (!workflows.length) {
      list.innerHTML = '<li class="muted">등록된 업무가 없습니다.</li>';
    }
  } catch (error) {
    list.innerHTML = `<li class="muted">업무를 불러오지 못했습니다. ${error.message}</li>`;
  }
}

function selectWorkflow(workflow) {
  const same = state.workflowId === workflow.workflow_id;
  state.workflowId = same ? null : workflow.workflow_id;
  state.workflowName = same ? null : workflow.name;

  document.querySelectorAll("#workflow-list button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.id === state.workflowId);
  });
  el("scope").textContent = state.workflowId
    ? `${state.workflowName} 업무로 한정해서 답합니다`
    : "";
}

/* ---------- 질문 ---------- */

async function ask(question) {
  const button = el("ask-button");
  const status = el("status");
  button.disabled = true;
  el("answer").hidden = true;
  status.hidden = false;
  status.className = "status";

  const started = Date.now();
  const timer = setInterval(() => {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    status.textContent = `문서를 찾고 답을 만드는 중… ${seconds}초`;
  }, 100);

  try {
    const body = await call("/query", {
      method: "POST",
      body: JSON.stringify({
        query: question,
        workflow_id: state.workflowId,
      }),
    });
    render(body);
    status.hidden = true;
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message;
  } finally {
    clearInterval(timer);
    button.disabled = false;
  }
}

function render(response) {
  el("answer").hidden = false;
  el("message").textContent = response.message;

  const data = response.data;
  renderWorkflow(data);
  renderActions(data.next_actions);
  renderTimeline(data.timeline || []);
  renderDocuments(data.documents);
}

/* ---------- 업무 흐름 ---------- */

async function renderWorkflow(data) {
  const box = el("workflow-box");
  el("feedback-form").hidden = true;
  el("feedback-result").hidden = true;

  if (!data.workflow) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.dataset.workflowId = data.workflow.workflow_id;
  el("workflow-name").textContent = data.workflow.name;
  await renderSteps(data.workflow.workflow_id);
}

async function renderSteps(workflowId) {
  const list = el("steps");
  list.innerHTML = '<li class="muted">단계를 불러오는 중…</li>';
  try {
    const detail = await call(`/workflows/${encodeURIComponent(workflowId)}`);
    list.innerHTML = "";
    detail.steps.forEach((step) => {
      list.appendChild(stepRow(workflowId, step));
    });
  } catch (error) {
    list.innerHTML = `<li class="muted">${error.message}</li>`;
  }
}

function stepRow(workflowId, step) {
  const row = document.createElement("li");
  row.className = step.status;

  const marker = document.createElement("span");
  marker.className = "marker";
  marker.textContent =
    step.status === "completed" ? "✓" : step.status === "current" ? "▶" : "·";

  const name = document.createElement("span");
  name.className = "step-name";
  name.textContent = step.name;

  row.append(marker, name);

  if (step.completed_at) {
    const date = document.createElement("span");
    date.className = "step-date";
    date.textContent = step.completed_at.slice(0, 10);
    row.appendChild(date);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = step.status === "completed" ? "되돌리기" : "완료";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await call(
        `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(step.step_id)}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ completed: step.status !== "completed" }),
        },
      );
      await renderSteps(workflowId);
      await loadWorkflows();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });
  row.appendChild(button);
  return row;
}

/* ---------- 할 일 ---------- */

function renderActions(actions) {
  const box = el("actions-box");
  const list = el("actions");
  list.innerHTML = "";
  box.hidden = !actions.length;

  actions.forEach((action) => {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.className = "action-title";
    title.textContent = action.title;
    item.appendChild(title);
    if (action.description) {
      const description = document.createElement("div");
      description.className = "action-desc";
      description.textContent = action.description;
      item.appendChild(description);
    }
    list.appendChild(item);
  });
}

/* ---------- 진행 흐름 ---------- */

function renderTimeline(entries) {
  const box = el("timeline-box");
  const list = el("timeline");
  list.innerHTML = "";
  box.hidden = entries.length < 2; // 한 건뿐이면 흐름이라 할 것이 없다

  entries.forEach((entry) => {
    const item = document.createElement("li");

    const date = document.createElement("span");
    date.className = "tl-date";
    date.textContent = entry.date || "날짜 미상";

    const audience = document.createElement("span");
    // 담당자가 알고 싶은 것은 "이걸 교육청에 내야 하나"다
    const label = entry.audience || (entry.direction === "received" ? "교육청 수신" : "내부 진행");
    audience.className = "tl-audience " + label.replace(/\s/g, "-");
    audience.textContent = label;

    const kind = document.createElement("span");
    kind.className = "tl-kind";
    kind.textContent = entry.kind;

    const title = document.createElement("span");
    title.className = "tl-title";
    title.textContent = entry.title;

    item.append(date, audience, kind, title);
    list.appendChild(item);
  });
}

/* ---------- 근거 문서 ---------- */

function renderDocuments(documents) {
  const box = el("documents-box");
  const list = el("documents");
  list.innerHTML = "";
  box.hidden = false;

  if (!documents.length) {
    list.innerHTML = '<li class="muted">관련 문서를 찾지 못했습니다.</li>';
    return;
  }

  documents.forEach((document_) => {
    const item = document.createElement("li");

    const head = document.createElement("div");
    head.className = "doc-head";
    const title = document.createElement("span");
    title.className = "doc-title";
    title.textContent = document_.title;
    const score = document.createElement("span");
    score.className = "doc-score";
    score.textContent =
      (document_.page ? `p.${document_.page} · ` : "") +
      `관련도 ${document_.relevance}`;
    head.append(title, score);

    const snippet = document.createElement("p");
    snippet.className = "doc-snippet";
    snippet.textContent = document_.snippet || "";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "doc-open";
    open.textContent = "원문 보기";
    open.addEventListener("click", () =>
      openChunk(document_.document_id, document_.chunk_id),
    );

    item.append(head, snippet, open);
    list.appendChild(item);
  });
}

/* ---------- 원문 보기 ---------- */

async function openChunk(documentId, chunkId) {
  if (!chunkId) return;
  state.documentId = documentId;
  state.chunkId = chunkId;

  el("viewer").hidden = false;
  el("viewer-body").textContent = "불러오는 중…";
  try {
    const chunk = await call(
      `/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}`,
    );
    el("viewer-title").textContent = chunk.title;
    el("viewer-meta").textContent =
      (chunk.page ? `${chunk.page}쪽 · ` : "") + chunk.chunk_id;
    el("viewer-body").textContent = chunk.content;
    el("viewer-prev").disabled = !chunk.prev_chunk_id;
    el("viewer-next").disabled = !chunk.next_chunk_id;
    el("viewer-prev").dataset.target = chunk.prev_chunk_id || "";
    el("viewer-next").dataset.target = chunk.next_chunk_id || "";
  } catch (error) {
    el("viewer-body").textContent = error.message;
  }
}

/* ---------- 피드백 ---------- */

async function sendFeedback(event) {
  event.preventDefault();
  const workflowId = el("workflow-box").dataset.workflowId;
  const description = el("feedback-description").value.trim();
  if (!workflowId || !description) return;

  try {
    const body = await call(
      `/workflows/${encodeURIComponent(workflowId)}/feedback`,
      {
        method: "POST",
        body: JSON.stringify({
          type: el("feedback-type").value,
          description,
        }),
      },
    );
    const result = el("feedback-result");
    result.hidden = false;
    result.innerHTML = "";
    const message = document.createElement("div");
    message.textContent = body.message;
    const diff = document.createElement("div");
    diff.className = "diff";
    diff.textContent = `예상: ${body.diff.expected.join(" → ")}  /  실제: ${body.diff.reported.join(" → ")}`;
    result.append(message, diff);

    el("feedback-form").hidden = true;
    el("feedback-description").value = "";
  } catch (error) {
    alert(error.message);
  }
}

/* ---------- 연결 ---------- */

el("ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const question = el("question").value.trim();
  if (question) ask(question);
});

el("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el("ask-form").requestSubmit();
  }
});

el("examples").addEventListener("click", (event) => {
  if (event.target.tagName !== "BUTTON") return;
  el("question").value = event.target.textContent;
  el("ask-form").requestSubmit();
});

el("feedback-toggle").addEventListener("click", () => {
  const form = el("feedback-form");
  form.hidden = !form.hidden;
});
el("feedback-form").addEventListener("submit", sendFeedback);

el("viewer-close").addEventListener("click", () => {
  el("viewer").hidden = true;
});
el("viewer").addEventListener("click", (event) => {
  if (event.target.id === "viewer") el("viewer").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") el("viewer").hidden = true;
});
["viewer-prev", "viewer-next"].forEach((id) => {
  el(id).addEventListener("click", (event) => {
    const target = event.currentTarget.dataset.target;
    if (target) openChunk(state.documentId, target);
  });
});

loadWorkflows();
