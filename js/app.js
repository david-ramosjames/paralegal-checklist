import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.getElementById("root");

const TYPE_LABEL = {
  deadline: "Deadline",
  urgent_client: "Urgent client",
  urgent_task: "Urgent task",
  client_contact: "Client contact",
  other_call: "Other call",
  todo: "To do",
};

const STAGE_LABEL = {
  intake: "Intake",
  investigation: "Investigation",
  medical_billing: "Medical / Billing",
  subrogation: "Subrogation",
  demand: "Demand",
  petition_service: "Petition / Service",
  discovery: "Discovery",
  mediation: "Mediation",
  trial: "Trial",
  settlement_close: "Settlement / Close",
};

const STAGE_ORDER = Object.keys(STAGE_LABEL);
const TYPE_ORDER = ["deadline", "urgent_client", "urgent_task", "client_contact", "other_call", "todo"];
const RISK_LABEL = {
  overdue: "Overdue",
  deadline: "Deadline",
  urgent: "Urgent",
  on_track: "On track",
  needs_plan: "Needs plan",
};

const state = {
  user: null,
  profile: null,
  route: parseRoute(),
  work: [],
  docket: [],
  caseDetail: null,
  drawerTask: null,
  events: [],
  staff: [],
  filter: "today",
  search: "",
  staffFilter: "",
  error: "",
};

function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/work";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "cases" && parts[1]) return { name: "case", id: parts[1], taskId: new URLSearchParams(location.hash.split("?")[1] || "").get("task") };
  if (parts[0] === "cases") return { name: "cases" };
  if (parts[0] === "templates") return { name: "templates" };
  return { name: "work" };
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  state.drawerTask = null;
  render();
  loadRoute();
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDue(value) {
  if (!value) return "—";
  const today = todayISO();
  if (value === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (value === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueClass(value) {
  if (!value) return "";
  if (value < todayISO()) return "overdue";
  if (value === todayISO()) return "today";
  return "";
}

function badge(type) {
  return `<span class="badge ${type}">${TYPE_LABEL[type] || type}</span>`;
}

function riskBadge(risk) {
  return `<span class="badge ${risk === "deadline" ? "deadline-risk" : risk}">${RISK_LABEL[risk] || risk}</span>`;
}

function slackUrl(channelId) {
  return channelId ? `https://slack.com/app_redirect?channel=${channelId}` : null;
}

function dropboxUrl(path) {
  if (!path) return null;
  return `https://www.dropbox.com/home${path.split("/").map(encodeURIComponent).join("/")}`;
}

function navLink(href, label, name) {
  return `<a href="${href}" class="${state.route.name === name ? "active" : ""}">${label}</a>`;
}

function shell(content) {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-kicker">Case operations</div>
          <div class="brand-name">Checklist</div>
        </div>
        <nav class="nav">
          ${navLink("#/work", "My Work", "work")}
          ${navLink("#/cases", "Cases", "cases")}
          ${navLink("#/templates", "Templates", "templates")}
        </nav>
        <div class="sidebar-foot">
          <div>${state.profile?.display_name || state.user.email}</div>
          <select id="who-am-i" class="search" style="margin-top:8px;background:#122847;color:#e8eef6;border-color:#365379">
            <option value="">I am…</option>
            ${state.staff.map((name) => `<option value="${escapeAttr(name)}" ${state.profile?.staff_label === name ? "selected" : ""}>${name}</option>`).join("")}
          </select>
          <button id="sign-out">Sign out</button>
        </div>
      </aside>
      <main class="main">
        <div class="muted" style="margin-bottom:8px;letter-spacing:.12em;font-size:12px;">${day}</div>
        ${content}
      </main>
    </div>
    ${state.drawerTask ? drawerHtml() : ""}
  `;
}

function isFirmEmail(email) {
  return splitDomain(email) === "ramosjames.com";
}

function splitDomain(email) {
  const parts = String(email || "").trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function loginHtml() {
  return `
    <div class="login">
      <div class="login-card">
        <div class="brand-kicker">Case operations</div>
        <h1>Case Checklist</h1>
        <p>Sign in with your Ramos James Google account.</p>
        <div class="error">${state.error}</div>
        <button class="google-btn" id="google-login" type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>
        <p class="login-note">Only @ramosjames.com accounts are accepted.</p>
      </div>
    </div>
  `;
}

function workHtml() {
  const rows = visibleWork();
  const overdue = state.work.filter((t) => t.due_at && t.due_at < todayISO()).length;
  const dueToday = state.work.filter((t) => t.due_at === todayISO()).length;
  const calls = state.work.filter((t) => ["urgent_client", "client_contact", "other_call"].includes(t.type)).length;
  const deadlines = state.work.filter((t) => t.type === "deadline").length;

  return `
    <div class="page-head">
      <div>
        <h1>My Work</h1>
        <p>Overdue stays pinned. Complete, reschedule, or open details without leaving the queue.</p>
      </div>
    </div>
    <div class="cards">
      <div class="card overdue"><div class="label">Overdue</div><div class="value">${overdue}</div></div>
      <div class="card today"><div class="label">Due today</div><div class="value">${dueToday}</div></div>
      <div class="card calls"><div class="label">Client calls</div><div class="value">${calls}</div></div>
      <div class="card deadlines"><div class="label">Deadlines</div><div class="value">${deadlines}</div></div>
    </div>
    <div class="toolbar">
      <input class="search" id="search" placeholder="Search client, case number, or task" value="${escapeAttr(state.search)}">
      <div class="chips">
        ${["today", "upcoming", "all", "mine"].map((f) => `<button class="chip ${state.filter === f ? "active" : ""}" data-filter="${f}">${filterLabel(f)}</button>`).join("")}
      </div>
      <select id="staff-filter" class="search" style="flex:0 0 200px">
        <option value="">All paralegals</option>
        ${state.staff.map((name) => `<option value="${escapeAttr(name)}" ${state.staffFilter === name ? "selected" : ""}>${name}</option>`).join("")}
      </select>
    </div>
    <div class="queue">
      <div class="queue-row table-head"><div>Task</div><div>Due</div><div>Type</div><div></div></div>
      ${rows.length ? rows.map(workRow).join("") : `<div class="empty">Nothing in this queue.</div>`}
    </div>
  `;
}

function filterLabel(f) {
  return { today: "Today", upcoming: "Upcoming", all: "All", mine: "Assigned to me" }[f];
}

function workRow(task) {
  const client = task.case?.client_name || "Unknown client";
  return `
    <div class="queue-row">
      <div class="clickable" data-open-case="${task.case_id}" data-open-task="${task.id}">
        <div class="case-name">${escapeHtml(client)}</div>
        <div class="task-title">${escapeHtml(task.title)}</div>
      </div>
      <div class="due ${dueClass(task.due_at)}">${formatDue(task.due_at)}</div>
      <div>${badge(task.type)}</div>
      <div class="actions">
        <button class="btn primary" data-complete="${task.id}">Complete</button>
        <button class="btn" data-reschedule="${task.id}" data-when="tomorrow">Tomorrow</button>
        <button class="btn" data-reschedule="${task.id}" data-when="week">Next week</button>
        <button class="btn ghost" data-open-task="${task.id}">Details</button>
      </div>
    </div>
  `;
}

function visibleWork() {
  const today = todayISO();
  return state.work
    .filter((t) => {
      const hay = `${t.title} ${t.case?.client_name || ""} ${t.case?.case_number || ""}`.toLowerCase();
      if (state.search && !hay.includes(state.search.toLowerCase())) return false;
      if (state.staffFilter && t.owner_name !== state.staffFilter) return false;
      if (state.filter === "mine") {
        const me = state.profile?.staff_label;
        return (me && t.owner_name === me) || t.owner_id === state.user.id;
      }
      if (state.filter === "today") return !t.due_at || t.due_at <= today;
      if (state.filter === "upcoming") return t.due_at && t.due_at > today;
      return true;
    })
    .sort((a, b) => {
      const ad = a.due_at || "9999-99-99";
      const bd = b.due_at || "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
}

function casesHtml() {
  const q = state.search.toLowerCase();
  const rows = state.docket.filter((c) => {
    const hay = `${c.client_name} ${c.case_number} ${c.next_action || ""} ${c.paralegal_name || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.staffFilter && c.paralegal_name !== state.staffFilter) return false;
    return true;
  });
  return `
    <div class="page-head">
      <div>
        <h1>Cases</h1>
        <p>Next action, due date, and risk across the docket.</p>
      </div>
    </div>
    <div class="toolbar">
      <input class="search" id="search" placeholder="Search client, case number, or next action" value="${escapeAttr(state.search)}">
      <select id="staff-filter" class="search" style="flex:0 0 200px">
        <option value="">All paralegals</option>
        ${state.staff.map((name) => `<option value="${escapeAttr(name)}" ${state.staffFilter === name ? "selected" : ""}>${name}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap">
      <div class="table-head docket"><div>Case</div><div>Stage</div><div>Next action</div><div>Due</div><div>Risk</div><div>Owner</div></div>
      ${rows.map((c) => `
        <div class="docket-row clickable" data-open-case="${c.case_id}">
          <div>
            <div class="case-name">${escapeHtml(c.client_name || "Untitled")}</div>
            <div class="muted">#${escapeHtml(c.case_number || "—")}</div>
          </div>
          <div>${STAGE_LABEL[c.stage] || c.litigation_status || "—"}</div>
          <div>${c.next_action ? escapeHtml(c.next_action) : '<span class="muted">Needs plan</span>'}</div>
          <div class="due ${dueClass(c.next_due_at)}">${formatDue(c.next_due_at)}</div>
          <div>${riskBadge(c.risk)}</div>
          <div>${escapeHtml(c.paralegal_name || "—")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function caseHtml() {
  const c = state.caseDetail;
  if (!c) return `<div class="empty">Loading case…</div>`;
  const active = c.tasks.filter((t) => t.status === "active").slice(0, 3);
  const slack = slackUrl(c.overview.slack_channel_id);
  const dropbox = dropboxUrl(c.overview.dropbox_case_path);
  return `
    <div class="case-header">
      <div>
        <a href="#/cases" class="muted">← Docket</a>
        <h1 style="margin:8px 0 0;font-family:var(--serif);font-size:40px;">${escapeHtml(c.overview.client_name)}</h1>
        <div class="meta">
          <span class="badge todo">#${escapeHtml(c.overview.case_number || "—")}</span>
          <span class="badge todo">${STAGE_LABEL[c.overview.stage] || "Intake"}</span>
          ${c.overview.paralegal_name ? `<span class="badge todo">${escapeHtml(c.overview.paralegal_name)}</span>` : ""}
          ${c.overview.attorney_name ? `<span class="badge todo">${escapeHtml(c.overview.attorney_name)}</span>` : ""}
        </div>
      </div>
      <div class="link-row">
        ${slack ? `<a class="btn" target="_blank" rel="noreferrer" href="${slack}">Slack</a>` : ""}
        ${dropbox ? `<a class="btn" target="_blank" rel="noreferrer" href="${dropbox}">Dropbox</a>` : ""}
      </div>
    </div>
    <h2 style="font-family:var(--serif);font-weight:560;">Next up</h2>
    <div class="next-up">
      ${active.length ? active.map((t) => `
        <div class="card next-card" data-open-task="${t.id}">
          <div class="label">${formatDue(t.due_at)}</div>
          <div style="font-weight:600;margin:8px 0;">${escapeHtml(t.title)}</div>
          ${badge(t.type)}
        </div>
      `).join("") : `<div class="card">No active next action. Open a stage item to make it current.</div>`}
    </div>
    ${STAGE_ORDER.map((stage) => stageBlock(c, stage)).join("")}
  `;
}

function stageBlock(c, stage) {
  const items = c.tasks.filter((t) => t.stage === stage).sort((a, b) => a.sequence - b.sequence);
  if (!items.length) return "";
  const current = c.overview.stage === stage;
  const done = items.filter((t) => t.status === "completed").length;
  const quiet = items.every((t) => t.status === "completed" || t.status === "skipped" || t.status === "na");
  const open = current || !quiet;
  return `
    <section class="stage ${current ? "current" : ""} ${quiet ? "quiet" : ""}">
      <button class="stage-head" data-toggle-stage="${stage}">
        <span>${STAGE_LABEL[stage]} ${current ? "· Current" : ""}</span>
        <span class="muted">${done}/${items.length}</span>
      </button>
      <div data-stage-body="${stage}" style="${open ? "" : "display:none"}">
        ${items.map((t) => `
          <button class="stage-item ${t.status}" data-open-task="${t.id}">
            <span class="dot ${t.status}"></span>
            <span class="title">${escapeHtml(t.title)}</span>
            <span class="due ${dueClass(t.due_at)}">${t.status === "active" ? formatDue(t.due_at) : ""}</span>
            ${t.status === "active" ? badge(t.type) : `<span class="muted">${t.status}</span>`}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function templatesHtml() {
  const items = state.templateItems || [];
  return `
    <div class="page-head"><div><h1>Templates</h1><p>Personal Injury — Core. Case-level edits stay on the case.</p></div></div>
    ${STAGE_ORDER.map((stage) => {
      const rows = items.filter((i) => i.stage === stage);
      if (!rows.length) return "";
      return `<section class="stage current"><div class="stage-head"><span>${STAGE_LABEL[stage]}</span><span>${rows.length}</span></div>
        ${rows.map((i) => `<div class="stage-item"><span class="dot upcoming"></span><span>${escapeHtml(i.title)}</span><span></span>${badge(i.default_type)}</div>`).join("")}
      </section>`;
    }).join("")}
  `;
}

function drawerHtml() {
  const t = state.drawerTask;
  return `
    <div class="drawer-backdrop" id="drawer-backdrop">
      <aside class="drawer">
        <div class="muted">${STAGE_LABEL[t.stage] || t.stage}</div>
        <h2 style="font-family:var(--serif);margin:6px 0 12px;">${escapeHtml(t.title)}</h2>
        ${badge(t.type)}
        <div class="meta" style="margin:16px 0;">
          <label class="field"><span>Due</span><input type="date" id="task-due" value="${t.due_at || ""}"></label>
          <label class="field"><span>Type</span>
            <select id="task-type">${TYPE_ORDER.map((type) => `<option value="${type}" ${t.type === type ? "selected" : ""}>${TYPE_LABEL[type]}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Owner</span>
            <select id="task-owner">
              <option value="">Unassigned</option>
              ${state.staff.map((name) => `<option value="${escapeAttr(name)}" ${t.owner_name === name ? "selected" : ""}>${name}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-bottom:16px;">
          ${t.status !== "completed" ? `<button class="btn primary" data-complete="${t.id}">Complete</button>` : `<button class="btn" data-reopen="${t.id}">Reopen</button>`}
          <button class="btn" data-skip="${t.id}">Skip / N/A</button>
          <button class="btn" id="save-task">Save</button>
        </div>
        <label class="field"><span>Add note</span><textarea id="task-note" rows="3" placeholder="Attempted call, waiting on records…"></textarea></label>
        <button class="btn pink" id="add-note">Save note</button>
        <h3 style="margin:24px 0 8px;font-family:var(--serif);">Follow-up</h3>
        <div class="actions" style="justify-content:flex-start;">
          <input type="date" id="follow-due">
          <button class="btn" id="create-followup">Create follow-up</button>
        </div>
        <h3 style="margin:24px 0 8px;font-family:var(--serif);">History</h3>
        <div class="history">
          ${state.events.length ? state.events.map((e) => `
            <div class="history-item">
              <div><strong>${eventLabel(e)}</strong></div>
              <div class="muted">${new Date(e.created_at).toLocaleString()} ${e.actor_name ? `· ${escapeHtml(e.actor_name)}` : ""}</div>
              ${e.note ? `<div>${escapeHtml(e.note)}</div>` : ""}
            </div>
          `).join("") : `<div class="muted">No history yet.</div>`}
        </div>
      </aside>
    </div>
  `;
}

function eventLabel(e) {
  if (e.event_type === "note") return e.note ? "Note" : "Note added";
  if (e.event_type === "status_changed") return `${e.old_value || "—"} → ${e.new_value}`;
  if (e.event_type === "due_changed") return `Due ${e.old_value || "none"} → ${e.new_value || "none"}`;
  if (e.event_type === "owner_changed") return `Owner ${e.old_value || "none"} → ${e.new_value || "none"}`;
  if (e.event_type === "type_changed") return `Type ${e.old_value} → ${e.new_value}`;
  if (e.event_type === "reopened") return "Reopened";
  if (e.event_type === "follow_up_created") return "Follow-up created";
  return e.event_type;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function render() {
  if (!state.user) {
    root.innerHTML = loginHtml();
    bind();
    return;
  }
  if (state.route.name === "work") root.innerHTML = shell(workHtml());
  else if (state.route.name === "cases") root.innerHTML = shell(casesHtml());
  else if (state.route.name === "case") root.innerHTML = shell(caseHtml());
  else if (state.route.name === "templates") root.innerHTML = shell(templatesHtml());
  bind();
}

function bind() {
  document.getElementById("google-login")?.addEventListener("click", onGoogleLogin);
  document.getElementById("sign-out")?.addEventListener("click", onSignOut);
  document.getElementById("who-am-i")?.addEventListener("change", async (e) => {
    const staff_label = e.target.value || null;
    await supabase.from("checklist_profiles").update({ staff_label, display_name: staff_label || state.profile?.display_name }).eq("user_id", state.user.id);
    if (state.profile) state.profile.staff_label = staff_label;
    render();
  });
  document.getElementById("search")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.getElementById("search");
    if (input) {
      input.focus();
      input.setSelectionRange(pos, pos);
    }
  });
  document.getElementById("staff-filter")?.addEventListener("change", (e) => {
    state.staffFilter = e.target.value;
    render();
  });
  document.querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      state.filter = el.dataset.filter;
      render();
    });
  });
  document.querySelectorAll("[data-complete]").forEach((el) => el.addEventListener("click", () => completeTask(el.dataset.complete)));
  document.querySelectorAll("[data-reschedule]").forEach((el) => el.addEventListener("click", () => rescheduleTask(el.dataset.reschedule, el.dataset.when)));
  document.querySelectorAll("[data-open-task]").forEach((el) => el.addEventListener("click", () => openTask(el.dataset.openTask, el.dataset.openCase)));
  document.querySelectorAll("[data-open-case]").forEach((el) => {
    if (el.dataset.openTask) return;
    el.addEventListener("click", () => { location.hash = `#/cases/${el.dataset.openCase}`; });
  });
  document.querySelectorAll("[data-toggle-stage]").forEach((el) => {
    el.addEventListener("click", () => {
      const body = document.querySelector(`[data-stage-body="${el.dataset.toggleStage}"]`);
      if (body) body.style.display = body.style.display === "none" ? "" : "none";
    });
  });
  document.getElementById("drawer-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "drawer-backdrop") {
      state.drawerTask = null;
      render();
    }
  });
  document.getElementById("save-task")?.addEventListener("click", saveTask);
  document.getElementById("add-note")?.addEventListener("click", addNote);
  document.getElementById("create-followup")?.addEventListener("click", createFollowUp);
  document.querySelectorAll("[data-reopen]").forEach((el) => el.addEventListener("click", () => reopenTask(el.dataset.reopen)));
  document.querySelectorAll("[data-skip]").forEach((el) => el.addEventListener("click", () => skipTask(el.dataset.skip)));
}

function consumeAuthRedirectError() {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(location.search);
  const raw = fromHash.get("error_description") || fromHash.get("error") || fromQuery.get("error_description") || fromQuery.get("error");
  if (!raw) return;
  state.error = decodeURIComponent(raw.replaceAll("+", " "));
  history.replaceState({}, "", location.pathname);
}

async function onGoogleLogin() {
  state.error = "";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}${location.pathname}`,
      queryParams: {
        hd: "ramosjames.com",
        prompt: "select_account",
      },
    },
  });
  if (error) {
    state.error = error.message;
    render();
  }
}

async function rejectIfNotFirm(user) {
  if (!user) return null;
  const providers = user.app_metadata?.providers || [];
  const googleOk = providers.includes("google") || user.app_metadata?.provider === "google";
  if (isFirmEmail(user.email) && googleOk) return user;
  await supabase.auth.signOut();
  state.error = "Only @ramosjames.com Google accounts can sign in.";
  return null;
}

async function onSignOut() {
  await supabase.auth.signOut();
  state.user = null;
  render();
}

async function loadProfile() {
  const { data } = await supabase.from("checklist_profiles").select("*").eq("user_id", state.user.id).maybeSingle();
  if (data) {
    state.profile = data;
    return;
  }
  const display = state.user.email?.split("@")[0] || "Paralegal";
  const { data: created } = await supabase.from("checklist_profiles").insert({
    user_id: state.user.id,
    display_name: display,
    role: "paralegal",
  }).select().maybeSingle();
  state.profile = created;
}

async function loadWork() {
  const { data, error } = await supabase
    .from("checklist_tasks")
    .select("*, case:cases!inner(id, client_name, case_number, case_type, status)")
    .eq("status", "active")
    .eq("case.status", "active")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  state.work = (data || []).filter((t) => t.case);
  state.staff = [...new Set(state.work.map((t) => t.owner_name).filter(Boolean))].sort();
}

async function loadDocket() {
  const { data, error } = await supabase
    .from("checklist_case_overview")
    .select("*")
    .eq("case_status", "active")
    .order("next_due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rank = { overdue: 0, deadline: 1, urgent: 2, needs_plan: 3, on_track: 4 };
  state.docket = (data || []).sort((a, b) => (rank[a.risk] ?? 9) - (rank[b.risk] ?? 9) || String(a.next_due_at || "9").localeCompare(String(b.next_due_at || "9")));
  state.staff = [...new Set(state.docket.map((c) => c.paralegal_name).filter(Boolean))].sort();
}

async function loadCase(id) {
  const [{ data: overview }, { data: tasks }] = await Promise.all([
    supabase.from("checklist_case_overview").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("checklist_tasks").select("*").eq("case_id", id).order("sequence"),
  ]);
  if (!overview) {
    await supabase.rpc("initialize_case_checklist", { p_case_id: id });
    return loadCase(id);
  }
  state.caseDetail = { overview, tasks: tasks || [] };
  if (state.route.taskId) await openTask(state.route.taskId);
}

async function loadTemplates() {
  const { data } = await supabase.from("checklist_template_items").select("*").order("sequence");
  state.templateItems = data || [];
}

async function openTask(taskId, caseId) {
  let task = state.work.find((t) => t.id === taskId) || state.caseDetail?.tasks.find((t) => t.id === taskId);
  if (!task) {
    const { data } = await supabase.from("checklist_tasks").select("*").eq("id", taskId).maybeSingle();
    task = data;
  }
  if (!task) return;
  if (caseId && state.route.name !== "case") location.hash = `#/cases/${caseId}?task=${taskId}`;
  const { data: events } = await supabase.from("checklist_task_events").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
  state.drawerTask = task;
  state.events = events || [];
  render();
}

async function completeTask(id) {
  await supabase.from("checklist_tasks").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    completed_by: state.user.id,
  }).eq("id", id);
  await refreshAfterChange(id);
}

async function reopenTask(id) {
  await supabase.from("checklist_tasks").update({ status: "active", completed_at: null, completed_by: null }).eq("id", id);
  await refreshAfterChange(id);
}

async function skipTask(id) {
  await supabase.from("checklist_tasks").update({ status: "na", skip_reason: "Skipped / N/A" }).eq("id", id);
  await refreshAfterChange(id);
}

async function rescheduleTask(id, when) {
  const due = new Date();
  if (when === "tomorrow") due.setDate(due.getDate() + 1);
  if (when === "week") due.setDate(due.getDate() + 7);
  await supabase.from("checklist_tasks").update({ due_at: due.toISOString().slice(0, 10) }).eq("id", id);
  await refreshAfterChange(id);
}

async function saveTask() {
  const t = state.drawerTask;
  await supabase.from("checklist_tasks").update({
    due_at: document.getElementById("task-due").value || null,
    type: document.getElementById("task-type").value,
    owner_name: document.getElementById("task-owner").value || null,
  }).eq("id", t.id);
  await refreshAfterChange(t.id);
}

async function addNote() {
  const note = document.getElementById("task-note").value.trim();
  if (!note) return;
  await supabase.from("checklist_task_events").insert({
    task_id: state.drawerTask.id,
    event_type: "note",
    note,
    actor_id: state.user.id,
    actor_name: state.profile?.display_name || state.user.email,
  });
  document.getElementById("task-note").value = "";
  await openTask(state.drawerTask.id);
}

async function createFollowUp() {
  const t = state.drawerTask;
  const due = document.getElementById("follow-due").value || todayISO();
  const { data } = await supabase.from("checklist_tasks").insert({
    case_id: t.case_id,
    follow_up_of_task_id: t.id,
    title: `Follow up: ${t.title}`,
    stage: t.stage,
    sequence: t.sequence + 1,
    owner_name: t.owner_name,
    owner_role: t.owner_role,
    status: "active",
    type: t.type,
    due_at: due,
  }).select().maybeSingle();
  if (data) {
    await supabase.from("checklist_task_events").insert({
      task_id: t.id,
      event_type: "follow_up_created",
      new_value: data.id,
      actor_id: state.user.id,
      actor_name: state.profile?.display_name,
    });
  }
  await refreshAfterChange(t.id);
}

async function refreshAfterChange(taskId) {
  await loadRoute();
  if (state.drawerTask) await openTask(taskId);
  else render();
}

async function loadRoute() {
  try {
    if (state.route.name === "work") await loadWork();
    if (state.route.name === "cases") await loadDocket();
    if (state.route.name === "case") await loadCase(state.route.id);
    if (state.route.name === "templates") await loadTemplates();
    render();
  } catch (err) {
    state.error = err.message;
    render();
  }
}

async function boot() {
  consumeAuthRedirectError();
  const { data } = await supabase.auth.getSession();
  state.user = await rejectIfNotFirm(data.session?.user || null);
  if (!state.user) {
    render();
    return;
  }
  await loadProfile();
  await loadRoute();
}

boot();
