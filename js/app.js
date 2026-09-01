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
const CASE_TRACKER_CASE = "https://rjl-case-tracker.vercel.app/cases";
const DOCKET_FLOW_CASE = "https://rjl-docket-flow.vercel.app/cases";
const LANGUAGE_FLAG = {
  Spanish: "🇪🇸",
  English: "🇺🇸",
  Portuguese: "🇧🇷",
  French: "🇫🇷",
  Arabic: "🇸🇦",
  Vietnamese: "🇻🇳",
  Chinese: "🇨🇳",
  Korean: "🇰🇷",
  German: "🇩🇪",
  Italian: "🇮🇹",
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
  drawerParalegal: "",
  staff: [],
  templates: [],
  selectedTemplateId: null,
  filter: "today",
  search: "",
  staffFilter: "",
  error: "",
  caseNotes: [],
  expandedNotes: {},
  editingNoteId: null,
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

function taskTypes(task) {
  const raw = Array.isArray(task?.types) && task.types.length ? task.types : [task?.type].filter(Boolean);
  return TYPE_ORDER.filter((type) => raw.includes(type));
}

function typeBadges(task) {
  const types = taskTypes(task);
  return types.length ? types.map(badge).join(" ") : badge("todo");
}

function primaryType(task) {
  return taskTypes(task)[0] || "todo";
}

function taskHas(task, type) {
  return taskTypes(task).includes(type);
}

function taskOwners(task) {
  const extra = Array.isArray(task?.additional_owners) ? task.additional_owners : [];
  return [task?.owner_name, ...extra].filter(Boolean);
}

function notesFor(taskId) {
  return (state.caseNotes || []).filter((n) => n.task_id === taskId);
}

function noteCardHtml(n) {
  const editing = state.editingNoteId === n.id;
  const edited = n.updated_at && new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 1000;
  if (editing) {
    return `
      <div class="note-card">
        <textarea data-edit-note-body="${n.id}" rows="3">${escapeHtml(n.body)}</textarea>
        <div class="note-actions">
          <button class="btn pink" data-save-note="${n.id}">Save</button>
          <button class="btn" data-cancel-note="${n.id}">Cancel</button>
        </div>
      </div>`;
  }
  return `
    <div class="note-card">
      <div class="note-head">
        <div class="note-body">${escapeHtml(n.body)}</div>
        <div class="note-actions">
          <button class="btn ghost" data-edit-note="${n.id}">Edit</button>
          <button class="btn ghost" data-delete-note="${n.id}">Delete</button>
        </div>
      </div>
      <div class="muted">${new Date(n.created_at).toLocaleString()}${n.actor_name ? ` · ${escapeHtml(n.actor_name)}` : ""}${edited ? " · edited" : ""}</div>
    </div>`;
}

function caseParalegal() {
  return state.drawerParalegal || state.caseDetail?.overview?.paralegal_name || "";
}

function riskBadge(risk) {
  return `<span class="badge ${risk === "deadline" ? "deadline-risk" : risk}">${RISK_LABEL[risk] || risk}</span>`;
}

function slackUrl(channelId) {
  if (!channelId) return null;
  if (/^https?:\/\//i.test(channelId)) return channelId;
  return `https://ramosjames.slack.com/archives/${channelId}`;
}

function dropboxUrl(path) {
  if (!path) return null;
  return `https://www.dropbox.com/home${path.split("/").map(encodeURIComponent).join("/")}`;
}

function compareCaseNumber(a, b) {
  return String(a.case_number || "").localeCompare(String(b.case_number || ""), undefined, { numeric: true, sensitivity: "base" });
}

function formatLongDate(value) {
  if (value == null || value === "") return "";
  const asNumber = Number(value);
  const date = Number.isFinite(asNumber) && String(value).trim() !== "" && !String(value).includes("-")
    ? new Date(asNumber)
    : new Date(/^\d{4}-\d{2}-\d{2}/.test(String(value)) ? `${String(value).slice(0, 10)}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return value || "";
}

function languageLine(label, value) {
  if (!value) return "";
  const flag = LANGUAGE_FLAG[value] || "";
  return `<div>${label} ${flag ? `${flag} ` : ""}${escapeHtml(value)}</div>`;
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
          <div class="brand-kicker">Ramos James</div>
          <div class="brand-name">Paralegal Checklist</div>
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
        <div class="brand-kicker">Ramos James</div>
        <h1>Paralegal Checklist</h1>
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
  const calls = state.work.filter((t) => taskTypes(t).some((type) => ["urgent_client", "client_contact", "other_call"].includes(type))).length;
  const deadlines = state.work.filter((t) => taskHas(t, "deadline")).length;

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
      ${rows.length ? rows.map(workRow).join("") : `<div class="empty">Nothing in this queue yet. Open a case, import a template, then mark a next action.</div>`}
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
      <div>${typeBadges(task)}</div>
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
      if (state.staffFilter && !taskOwners(t).includes(state.staffFilter)) return false;
      if (state.filter === "mine") {
        const me = state.profile?.staff_label;
        return (me && taskOwners(t).includes(me)) || t.owner_id === state.user.id;
      }
      if (state.filter === "today") return !t.due_at || t.due_at <= today;
      if (state.filter === "upcoming") return t.due_at && t.due_at > today;
      return true;
    })
    .sort((a, b) => {
      const ad = a.due_at || "9999-99-99";
      const bd = b.due_at || "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      return TYPE_ORDER.indexOf(primaryType(a)) - TYPE_ORDER.indexOf(primaryType(b));
    });
}

function casesHtml() {
  const q = state.search.toLowerCase();
  const rows = state.docket.filter((c) => {
    const hay = `${c.client_name} ${c.case_number} ${c.next_action || ""} ${c.paralegal_name || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.staffFilter && c.paralegal_name !== state.staffFilter) return false;
    return true;
  }).sort(compareCaseNumber);
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
          <div>${escapeHtml(c.litigation_status || "—")}</div>
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
  const facts = c.facts || {};
  const active = c.tasks.filter((t) => t.status === "active").slice(0, 3);
  const slack = slackUrl(c.overview.slack_channel_id);
  const dropbox = dropboxUrl(c.overview.dropbox_case_path);
  const tracker = `${CASE_TRACKER_CASE}/${c.overview.case_id}`;
  const docketFlow = `${DOCKET_FLOW_CASE}/${c.overview.case_id}`;
  const slackName = c.overview.slack_channel_name ? `#${c.overview.slack_channel_name.replace(/^#/, "")}` : "Slack channel";
  const summary = [
    c.overview.case_number,
    facts.caseType || c.overview.case_type,
    facts.dateOfIncident ? `DOL ${facts.dateOfIncident}` : "",
  ].filter(Boolean).join(" · ");
  const quo = facts.quoContacts || [];
  return `
    <a href="#/cases" class="muted">← Docket</a>
    <div class="facts-card">
      <div class="facts-top">
        <div>
          <h1>${escapeHtml(c.overview.client_name)}</h1>
          <div class="facts-summary">${escapeHtml(summary)}</div>
        </div>
        <div class="meta">
          ${facts.expectedLitigation ? `<span class="badge todo">${escapeHtml(facts.expectedLitigation === "Litigation" ? "Lit" : facts.expectedLitigation)}</span>` : ""}
          ${facts.status ? `<span class="badge todo">${escapeHtml(facts.status)}</span>` : ""}
        </div>
      </div>
      <div class="facts-links">
        ${slack ? `<a target="_blank" rel="noreferrer" href="${escapeAttr(slack)}">Slack channel ${escapeHtml(slackName)}</a>` : ""}
        <span class="badge todo">Sheet status: ${escapeHtml(c.overview.litigation_status || "—")}</span>
      </div>
      <div class="facts-langs">
        ${languageLine("Primary language", facts.preferredLanguage)}
        ${languageLine("Secondary language", facts.secondaryLanguage)}
      </div>
      ${quo.length ? `
        <div class="facts-quo">
          <div class="label">Quo contacts</div>
          ${quo.map((q) => `
            <div class="quo-row">
              ${q.sms_enabled ? "SMS on " : ""}${escapeHtml(q.display_name || c.overview.client_name)}
              ${q.phone ? `<a href="tel:${escapeAttr(q.phone)}">${escapeHtml(formatPhone(q.phone))}</a>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="facts-grid">
        <div><div class="label">Attorney</div><div class="value">${escapeHtml(c.overview.attorney_name || "—")}</div></div>
        <div><div class="label">Paralegal</div><div class="value">${escapeHtml(c.overview.paralegal_name || "—")}</div></div>
        <div><div class="label">Legal assistant</div><div class="value">${escapeHtml(facts.legalAssistant || "—")}</div></div>
        <div><div class="label">Date signed</div><div class="value">${escapeHtml(facts.dateSigned || "—")}</div></div>
        <div><div class="label">Last reviewed</div><div class="value">${escapeHtml(facts.lastReviewed || "—")}</div></div>
      </div>
      <div class="link-row" style="margin-top:16px;">
        <a class="btn" target="_blank" rel="noreferrer" href="${tracker}">Case Tracker</a>
        <a class="btn" target="_blank" rel="noreferrer" href="${docketFlow}">DocketFlow</a>
        ${slack ? `<a class="btn" target="_blank" rel="noreferrer" href="${escapeAttr(slack)}">Slack</a>` : ""}
        ${dropbox ? `<a class="btn" target="_blank" rel="noreferrer" href="${dropbox}">Dropbox</a>` : ""}
      </div>
    </div>
    <h2 style="font-family:var(--serif);font-weight:560;">Next up</h2>
    ${c.tasks.length ? `
    <div class="next-up">
      ${active.length ? active.map((t) => `
        <div class="card next-card" data-open-task="${t.id}">
          <div class="label">${formatDue(t.due_at)}</div>
          <div style="font-weight:600;margin:8px 0;">${escapeHtml(t.title)}</div>
          ${typeBadges(t)}
        </div>
      `).join("") : `<div class="card">No active next action. Open an item and mark it current.</div>`}
    </div>
    ${STAGE_ORDER.map((stage) => stageBlock(c, stage, true)).join("")}
    ` : importTemplateHtml()}
  `;
}

function importTemplateHtml() {
  const templates = state.templates || [];
  return `
    <div class="card" style="margin-bottom:18px;">
      <div class="label">Checklist</div>
      <p>This case has no checklist yet. Import a template, then edit items on this case only.</p>
      <div class="import-box">
        <select id="import-template" class="search" style="flex:1;min-width:220px">
          ${templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
        </select>
        <button class="btn primary" id="import-template-btn">Import template</button>
      </div>
    </div>
  `;
}

function stageBlock(c, stage, editable) {
  const items = c.tasks.filter((t) => t.stage === stage).sort((a, b) => a.sequence - b.sequence);
  const current = c.overview.stage === stage;
  const done = items.filter((t) => t.status === "completed").length;
  const quiet = items.length > 0 && items.every((t) => t.status === "completed" || t.status === "skipped" || t.status === "na");
  const open = current || !quiet || !items.length;
  return `
    <section class="stage ${current ? "current" : ""} ${quiet ? "quiet" : ""}">
      <button class="stage-head" data-toggle-stage="${stage}">
        <span>${STAGE_LABEL[stage]} ${current ? "· Current" : ""}</span>
        <span class="muted">${done}/${items.length}</span>
      </button>
      <div data-stage-body="${stage}" style="${open ? "" : "display:none"}">
        ${items.map((t) => {
          const notes = notesFor(t.id);
          const open = Boolean(state.expandedNotes[t.id]);
          return `
          <div class="task-block ${t.status}">
            <div class="stage-item ${t.status}">
              <span class="dot ${t.status}"></span>
              <button class="title-btn" data-open-task="${t.id}">${escapeHtml(t.title)}</button>
              <span class="due ${dueClass(t.due_at)}">${t.status === "active" ? formatDue(t.due_at) : ""}</span>
              <span class="type-stack">${typeBadges(t)}</span>
              <button class="note-count ${notes.length ? "has-notes" : ""}" data-toggle-notes="${t.id}" aria-expanded="${open}">Notes ${notes.length}</button>
            </div>
            ${open ? `
              <div class="inline-notes">
                ${notes.length ? notes.map(noteCardHtml).join("") : `<div class="muted">No notes yet.</div>`}
                <div class="inline-note-add">
                  <input data-inline-note="${t.id}" placeholder="Add a note">
                  <button class="btn pink" data-add-inline-note="${t.id}">Add</button>
                </div>
              </div>
            ` : ""}
          </div>`;
        }).join("")}
        ${editable ? `
          <div class="add-row">
            <input data-new-task-title="${stage}" placeholder="Add a task on this case">
            <select data-new-task-type="${stage}">${typeOptions("todo")}</select>
            <button class="btn" data-add-case-task="${stage}">Add</button>
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function typeOptions(selected) {
  return TYPE_ORDER.map((type) => `<option value="${type}" ${type === selected ? "selected" : ""}>${TYPE_LABEL[type]}</option>`).join("");
}

function templatesHtml() {
  const templates = state.templates || [];
  const selected = templates.find((t) => t.id === state.selectedTemplateId) || templates[0];
  const items = (state.templateItems || []).filter((i) => i.template_id === selected?.id);
  return `
    <div class="page-head">
      <div>
        <h1>Templates</h1>
        <p>Edit the library here. Import a template onto a case, then change that case’s copy without affecting other cases.</p>
      </div>
      <button class="btn primary" id="new-template">New template</button>
    </div>
    <div class="template-list" style="margin-bottom:16px;">
      ${templates.map((t) => `<button class="chip ${selected?.id === t.id ? "active" : ""}" data-select-template="${t.id}">${escapeHtml(t.name)}</button>`).join("")}
    </div>
    ${selected ? `
      <div class="toolbar">
        <input class="search" id="template-name" value="${escapeAttr(selected.name)}">
        <button class="btn" id="save-template-name">Rename</button>
        <button class="btn" id="clone-template">Duplicate</button>
      </div>
      ${STAGE_ORDER.map((stage) => {
        const rows = items.filter((i) => i.stage === stage).sort((a, b) => a.sequence - b.sequence);
        return `<section class="stage current">
          <div class="stage-head"><span>${STAGE_LABEL[stage]}</span><span>${rows.length}</span></div>
          ${rows.map((i) => `
            <div class="editor-row">
              <input data-item-title="${i.id}" value="${escapeAttr(i.title)}">
              <select data-item-type="${i.id}">${typeOptions(i.default_type)}</select>
              <button class="btn" data-delete-item="${i.id}">Remove</button>
            </div>
          `).join("")}
          <div class="add-row">
            <input data-new-item-title="${stage}" placeholder="Add a ${STAGE_LABEL[stage].toLowerCase()} item">
            <select data-new-item-type="${stage}">${typeOptions("todo")}</select>
            <button class="btn" data-add-item="${stage}">Add</button>
          </div>
        </section>`;
      }).join("")}
    ` : `<div class="empty">Create a template to get started.</div>`}
  `;
}

function drawerHtml() {
  const t = state.drawerTask;
  const types = taskTypes(t);
  const paralegal = caseParalegal();
  const extra = (t.additional_owners || []).filter((name) => name && name !== (t.owner_name || paralegal));
  const addable = state.staff.filter((name) => name !== (t.owner_name || paralegal) && !extra.includes(name));
  const notes = notesFor(t.id);
  const history = (state.events || []).filter((e) => e.event_type !== "note");
  return `
    <div class="drawer-backdrop" id="drawer-backdrop">
      <aside class="drawer">
        <div class="muted">${STAGE_LABEL[t.stage] || t.stage}</div>
        <h2 style="font-family:var(--serif);margin:6px 0 12px;">${escapeHtml(t.title)}</h2>
        <div class="type-stack">${typeBadges(t)}</div>
        <div class="meta" style="margin:16px 0;">
          <label class="field"><span>Due</span><input type="date" id="task-due" value="${t.due_at || ""}"></label>
          <div class="field">
            <span>Types</span>
            <div class="flag-grid">
              ${TYPE_ORDER.map((type) => `
                <label class="flag">
                  <input type="checkbox" name="task-types" value="${type}" ${types.includes(type) ? "checked" : ""}>
                  ${TYPE_LABEL[type]}
                </label>
              `).join("")}
            </div>
          </div>
          <label class="field"><span>Owner</span>
            <select id="task-owner">
              ${paralegal ? `<option value="${escapeAttr(paralegal)}" ${(!t.owner_name || t.owner_name === paralegal) ? "selected" : ""}>${escapeHtml(paralegal)} (case paralegal)</option>` : `<option value="">Unassigned</option>`}
              ${state.staff.filter((name) => name !== paralegal).map((name) => `<option value="${escapeAttr(name)}" ${t.owner_name === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <div class="field">
            <span>Additional owners</span>
            <div class="owner-chips">
              ${extra.map((name) => `<span class="chip-owner">${escapeHtml(name)} <button type="button" data-remove-owner="${escapeAttr(name)}">×</button></span>`).join("") || `<span class="muted">None</span>`}
            </div>
            ${addable.length ? `
              <select id="add-owner">
                <option value="">Add owner…</option>
                ${addable.map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("")}
              </select>
            ` : ""}
          </div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-bottom:16px;">
          ${t.status === "upcoming" ? `<button class="btn primary" data-activate="${t.id}">Make current</button>` : ""}
          ${t.status !== "completed" ? `<button class="btn primary" data-complete="${t.id}">Complete</button>` : `<button class="btn" data-reopen="${t.id}">Reopen</button>`}
          <button class="btn" data-skip="${t.id}">Skip / N/A</button>
          <button class="btn" id="save-task">Save</button>
          <button class="btn" data-delete-task="${t.id}">Remove</button>
        </div>
        <h3 style="margin:24px 0 8px;font-family:var(--serif);">Notes</h3>
        <div class="notes-list">
          ${notes.length ? notes.map(noteCardHtml).join("") : `<div class="muted">No notes yet.</div>`}
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
          ${history.length ? history.map((e) => `
            <div class="history-item">
              <div><strong>${eventLabel(e)}</strong></div>
              <div class="muted">${new Date(e.created_at).toLocaleString()} ${e.actor_name ? `· ${escapeHtml(e.actor_name)}` : ""}</div>
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
  document.querySelectorAll("[data-activate]").forEach((el) => el.addEventListener("click", () => activateTask(el.dataset.activate)));
  document.querySelectorAll("[data-delete-task]").forEach((el) => el.addEventListener("click", () => deleteTask(el.dataset.deleteTask)));
  document.getElementById("import-template-btn")?.addEventListener("click", importSelectedTemplate);
  document.getElementById("new-template")?.addEventListener("click", createTemplate);
  document.getElementById("save-template-name")?.addEventListener("click", renameTemplate);
  document.getElementById("clone-template")?.addEventListener("click", cloneTemplate);
  document.querySelectorAll("[data-select-template]").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedTemplateId = el.dataset.selectTemplate;
      render();
    });
  });
  document.querySelectorAll("[data-item-title]").forEach((el) => {
    el.addEventListener("change", () => saveTemplateItem(el.dataset.itemTitle));
  });
  document.querySelectorAll("[data-item-type]").forEach((el) => {
    el.addEventListener("change", () => saveTemplateItem(el.dataset.itemType));
  });
  document.querySelectorAll("[data-delete-item]").forEach((el) => {
    el.addEventListener("click", () => deleteTemplateItem(el.dataset.deleteItem));
  });
  document.querySelectorAll("[data-add-item]").forEach((el) => {
    el.addEventListener("click", () => addTemplateItem(el.dataset.addItem));
  });
  document.querySelectorAll("[data-add-case-task]").forEach((el) => {
    el.addEventListener("click", () => addCaseTask(el.dataset.addCaseTask));
  });
  document.querySelectorAll("[data-toggle-notes]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.toggleNotes;
      state.expandedNotes[id] = !state.expandedNotes[id];
      render();
    });
  });
  document.querySelectorAll("[data-add-inline-note]").forEach((el) => {
    el.addEventListener("click", () => addInlineNote(el.dataset.addInlineNote));
  });
  document.querySelectorAll("[data-inline-note]").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addInlineNote(el.dataset.inlineNote);
    });
  });
  document.querySelectorAll("[data-edit-note]").forEach((el) => {
    el.addEventListener("click", () => {
      state.editingNoteId = el.dataset.editNote;
      render();
      document.querySelector(`[data-edit-note-body="${el.dataset.editNote}"]`)?.focus();
    });
  });
  document.querySelectorAll("[data-cancel-note]").forEach((el) => {
    el.addEventListener("click", () => {
      state.editingNoteId = null;
      render();
    });
  });
  document.querySelectorAll("[data-save-note]").forEach((el) => {
    el.addEventListener("click", () => saveEditedNote(el.dataset.saveNote));
  });
  document.querySelectorAll("[data-delete-note]").forEach((el) => {
    el.addEventListener("click", () => deleteNote(el.dataset.deleteNote));
  });
  document.querySelectorAll("[data-edit-note-body]").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEditedNote(el.dataset.editNoteBody);
      if (e.key === "Escape") {
        state.editingNoteId = null;
        render();
      }
    });
  });
  document.getElementById("add-owner")?.addEventListener("change", async (e) => {
    const name = e.target.value;
    if (!name || !state.drawerTask) return;
    const extra = [...new Set([...(state.drawerTask.additional_owners || []), name])];
    await supabase.from("checklist_tasks").update({ additional_owners: extra }).eq("id", state.drawerTask.id);
    await refreshAfterChange(state.drawerTask.id);
  });
  document.querySelectorAll("[data-remove-owner]").forEach((el) => {
    el.addEventListener("click", async () => {
      const name = el.dataset.removeOwner;
      const extra = (state.drawerTask.additional_owners || []).filter((owner) => owner !== name);
      await supabase.from("checklist_tasks").update({ additional_owners: extra }).eq("id", state.drawerTask.id);
      await refreshAfterChange(state.drawerTask.id);
    });
  });
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
  const [{ data, error }, { data: names }] = await Promise.all([
    supabase
      .from("checklist_tasks")
      .select("*, case:cases!inner(id, client_name, case_number, case_type, status)")
      .eq("status", "active")
      .eq("case.status", "active")
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("checklist_case_overview").select("paralegal_name").eq("case_status", "active"),
  ]);
  if (error) throw error;
  state.work = (data || []).filter((t) => t.case);
  state.staff = [...new Set((names || []).map((c) => c.paralegal_name).filter(Boolean))].sort();
}

async function loadDocket() {
  const { data, error } = await supabase
    .from("checklist_case_overview")
    .select("*")
    .eq("case_status", "active")
    .order("next_due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  state.docket = (data || []).sort(compareCaseNumber);
  state.staff = [...new Set(state.docket.map((c) => c.paralegal_name).filter(Boolean))].sort();
}

async function loadCase(id) {
  await loadTemplates();
  const [{ data: overview }, { data: tasks }, { data: caseRow }] = await Promise.all([
    supabase.from("checklist_case_overview").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("checklist_tasks").select("*").eq("case_id", id).order("sequence"),
    supabase.from("cases").select("case_type, status, date_of_incident, preferred_language, secondary_language, client_phone, assigned_contact_ids, created_at").eq("id", id).maybeSingle(),
  ]);
  if (!overview) {
    state.caseDetail = null;
    state.error = "Case not found.";
    return;
  }
  const [{ data: tracker }, { data: notes }] = await Promise.all([
    supabase.from("case_tracker_entries").select("id, expected_litigation, last_reviewed_at, date_signed_override, client_phone").eq("case_number", overview.case_number).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    (tasks || []).length
      ? supabase.from("checklist_task_notes").select("*").in("task_id", (tasks || []).map((t) => t.id)).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const assignedIds = caseRow?.assigned_contact_ids || [];
  const [{ data: staffContacts }, { data: quo }] = await Promise.all([
    assignedIds.length
      ? supabase.from("contacts").select("id, name, role").in("id", assignedIds)
      : Promise.resolve({ data: [] }),
    tracker?.id
      ? supabase.from("case_quo_contacts").select("display_name, phone, sms_enabled").eq("tracker_entry_id", tracker.id)
      : Promise.resolve({ data: [] }),
  ]);
  const assistant = (staffContacts || []).find((person) => person.role === "legal_assistant");
  const facts = {
    caseType: caseRow?.case_type || overview.case_type || "",
    status: caseRow?.status ? String(caseRow.status).replace(/^./, (ch) => ch.toUpperCase()) : "",
    dateOfIncident: formatLongDate(caseRow?.date_of_incident),
    preferredLanguage: caseRow?.preferred_language || "",
    secondaryLanguage: caseRow?.secondary_language || "",
    expectedLitigation: tracker?.expected_litigation || "",
    legalAssistant: assistant?.name || "",
    dateSigned: formatLongDate(tracker?.date_signed_override || caseRow?.created_at),
    lastReviewed: formatLongDate(tracker?.last_reviewed_at),
    quoContacts: (quo && quo.length)
      ? quo
      : (tracker?.client_phone ? [{ display_name: overview.client_name, phone: tracker.client_phone, sms_enabled: true }] : []),
  };
  state.caseNotes = notes || [];
  state.caseDetail = { overview, tasks: tasks || [], facts };
  const names = [overview.paralegal_name, overview.attorney_name, ...state.staff];
  state.staff = [...new Set(names.filter(Boolean))].sort();
  if (state.route.taskId) await openTask(state.route.taskId);
}

async function loadTemplates() {
  const [{ data: templates }, { data: items }] = await Promise.all([
    supabase.from("checklist_templates").select("*").eq("active", true).order("created_at"),
    supabase.from("checklist_template_items").select("*").order("sequence"),
  ]);
  state.templates = templates || [];
  state.templateItems = items || [];
  if (!state.selectedTemplateId && state.templates[0]) state.selectedTemplateId = state.templates[0].id;
}

async function importSelectedTemplate() {
  const templateId = document.getElementById("import-template")?.value;
  const caseId = state.caseDetail?.overview?.case_id;
  if (!templateId || !caseId) return;
  const { error } = await supabase.rpc("import_case_checklist", {
    p_case_id: caseId,
    p_template_id: templateId,
  });
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  await loadCase(caseId);
  render();
}

async function createTemplate() {
  const name = window.prompt("Template name", "New template");
  if (!name) return;
  const { data, error } = await supabase.from("checklist_templates").insert({
    name,
    case_type: "custom",
    version: 1,
    active: true,
  }).select().maybeSingle();
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  state.selectedTemplateId = data.id;
  await loadTemplates();
  render();
}

async function renameTemplate() {
  const name = document.getElementById("template-name")?.value?.trim();
  if (!name || !state.selectedTemplateId) return;
  await supabase.from("checklist_templates").update({ name }).eq("id", state.selectedTemplateId);
  await loadTemplates();
  render();
}

async function cloneTemplate() {
  const source = (state.templates || []).find((t) => t.id === state.selectedTemplateId);
  if (!source) return;
  const { data: created, error } = await supabase.from("checklist_templates").insert({
    name: `${source.name} copy`,
    case_type: source.case_type,
    version: 1,
    active: true,
  }).select().maybeSingle();
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  const items = (state.templateItems || []).filter((i) => i.template_id === source.id).map((i) => ({
    template_id: created.id,
    title: i.title,
    stage: i.stage,
    default_type: i.default_type,
    default_owner_role: i.default_owner_role,
    sequence: i.sequence,
    default_due_rule: i.default_due_rule,
  }));
  if (items.length) await supabase.from("checklist_template_items").insert(items);
  state.selectedTemplateId = created.id;
  await loadTemplates();
  render();
}

async function saveTemplateItem(id) {
  const title = document.querySelector(`[data-item-title="${id}"]`)?.value?.trim();
  const type = document.querySelector(`[data-item-type="${id}"]`)?.value;
  if (!title) return;
  await supabase.from("checklist_template_items").update({ title, default_type: type }).eq("id", id);
  await loadTemplates();
}

async function deleteTemplateItem(id) {
  await supabase.from("checklist_template_items").delete().eq("id", id);
  await loadTemplates();
  render();
}

async function addTemplateItem(stage) {
  const title = document.querySelector(`[data-new-item-title="${stage}"]`)?.value?.trim();
  const type = document.querySelector(`[data-new-item-type="${stage}"]`)?.value || "todo";
  if (!title || !state.selectedTemplateId) return;
  const existing = (state.templateItems || []).filter((i) => i.template_id === state.selectedTemplateId);
  const sequence = Math.max(0, ...existing.map((i) => i.sequence)) + 10;
  await supabase.from("checklist_template_items").insert({
    template_id: state.selectedTemplateId,
    title,
    stage,
    default_type: type,
    default_owner_role: "paralegal",
    sequence,
    default_due_rule: "manual",
  });
  await loadTemplates();
  render();
}

async function addCaseTask(stage) {
  const title = document.querySelector(`[data-new-task-title="${stage}"]`)?.value?.trim();
  const type = document.querySelector(`[data-new-task-type="${stage}"]`)?.value || "todo";
  const caseId = state.caseDetail?.overview?.case_id;
  if (!title || !caseId) return;
  const sequence = Math.max(0, ...(state.caseDetail.tasks || []).map((t) => t.sequence)) + 10;
  await supabase.from("checklist_tasks").insert({
    case_id: caseId,
    title,
    stage,
    sequence,
    owner_name: state.caseDetail.overview.paralegal_name,
    owner_role: "paralegal",
    status: "upcoming",
    type,
    types: [type],
  });
  await loadCase(caseId);
  render();
}

async function activateTask(id) {
  await supabase.from("checklist_tasks").update({ status: "active" }).eq("id", id);
  await refreshAfterChange(id);
}

async function deleteTask(id) {
  await supabase.from("checklist_tasks").delete().eq("id", id);
  state.drawerTask = null;
  await loadRoute();
}

async function openTask(taskId, caseId) {
  let task = state.work.find((t) => t.id === taskId) || state.caseDetail?.tasks.find((t) => t.id === taskId);
  if (!task) {
    const { data } = await supabase.from("checklist_tasks").select("*").eq("id", taskId).maybeSingle();
    task = data;
  }
  if (!task) return;
  if (caseId && state.route.name !== "case") location.hash = `#/cases/${caseId}?task=${taskId}`;
  const [{ data: events }, { data: notes }, { data: overview }] = await Promise.all([
    supabase.from("checklist_task_events").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("checklist_task_notes").select("*").eq("task_id", taskId).order("created_at"),
    supabase.from("checklist_case_overview").select("paralegal_name, attorney_name").eq("case_id", task.case_id).maybeSingle(),
  ]);
  state.drawerParalegal = overview?.paralegal_name || state.caseDetail?.overview?.paralegal_name || "";
  const names = [state.drawerParalegal, overview?.attorney_name, ...state.staff];
  state.staff = [...new Set(names.filter(Boolean))].sort();
  if (!task.owner_name && state.drawerParalegal) {
    await supabase.from("checklist_tasks").update({ owner_name: state.drawerParalegal, owner_role: "paralegal" }).eq("id", task.id);
    task = { ...task, owner_name: state.drawerParalegal };
  }
  state.caseNotes = [
    ...(state.caseNotes || []).filter((n) => n.task_id !== taskId),
    ...(notes || []),
  ];
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
  const types = [...document.querySelectorAll("input[name='task-types']:checked")].map((el) => el.value);
  const owner = document.getElementById("task-owner").value || caseParalegal() || null;
  await supabase.from("checklist_tasks").update({
    due_at: document.getElementById("task-due").value || null,
    types: types.length ? types : ["todo"],
    type: types.length ? TYPE_ORDER.find((type) => types.includes(type)) : "todo",
    owner_name: owner,
  }).eq("id", t.id);
  await refreshAfterChange(t.id);
}

async function addNote() {
  await saveNote(state.drawerTask?.id, document.getElementById("task-note")?.value);
}

async function addInlineNote(taskId) {
  const input = document.querySelector(`[data-inline-note="${taskId}"]`);
  await saveNote(taskId, input?.value);
  state.expandedNotes[taskId] = true;
}

async function saveNote(taskId, raw) {
  const body = String(raw || "").trim();
  if (!taskId || !body) return;
  const { error } = await supabase.from("checklist_task_notes").insert({
    task_id: taskId,
    body,
    actor_id: state.user.id,
    actor_name: state.profile?.display_name || state.user.email,
  });
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  await reloadTaskNotes(taskId);
}

async function saveEditedNote(noteId) {
  const body = document.querySelector(`[data-edit-note-body="${noteId}"]`)?.value?.trim();
  const note = (state.caseNotes || []).find((n) => n.id === noteId);
  if (!note || !body) return;
  const { error } = await supabase.from("checklist_task_notes").update({
    body,
    updated_at: new Date().toISOString(),
  }).eq("id", noteId);
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  state.editingNoteId = null;
  state.expandedNotes[note.task_id] = true;
  await reloadTaskNotes(note.task_id);
}

async function deleteNote(noteId) {
  const note = (state.caseNotes || []).find((n) => n.id === noteId);
  if (!note || !window.confirm("Delete this note?")) return;
  const { error } = await supabase.from("checklist_task_notes").delete().eq("id", noteId);
  if (error) {
    state.error = error.message;
    render();
    return;
  }
  if (state.editingNoteId === noteId) state.editingNoteId = null;
  state.expandedNotes[note.task_id] = true;
  await reloadTaskNotes(note.task_id);
}

async function reloadTaskNotes(taskId) {
  const { data: notes } = await supabase.from("checklist_task_notes").select("*").eq("task_id", taskId).order("created_at");
  state.caseNotes = [
    ...(state.caseNotes || []).filter((n) => n.task_id !== taskId),
    ...(notes || []),
  ];
  if (state.drawerTask?.id === taskId) await openTask(taskId);
  else render();
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
    owner_name: t.owner_name || caseParalegal(),
    owner_role: t.owner_role,
    status: "active",
    type: primaryType(t),
    types: taskTypes(t),
    additional_owners: t.additional_owners || [],
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
