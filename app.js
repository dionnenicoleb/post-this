// Post This — Content Library
// Capture ideas. Track posts. Know what's working. Export everything.

const SUPABASE_URL     = "https://rmftvqqxktjwinpypeva.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Oh8nexfc-GYcp2PpAO_cxA_mpCf88JT";
const AUTOSAVE_KEY     = "postthis_capture_v2";

// ── Supabase helpers ──────────────────────────────────────────────────────────

const BASE_HEADERS = {
  apikey:        SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: BASE_HEADERS });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPatch(table, id, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...BASE_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: BASE_HEADERS,
  });
  if (!r.ok) throw new Error(await r.text());
}

// ── App state ─────────────────────────────────────────────────────────────────

const state = {
  projects:       [],   // all projects with embedded post counts
  currentProject: null, // project object
  currentTab:     "draft",
  posts:          [],   // posts for current tab
  postLogs:       {},   // { postId: [log, ...] }
  thisWeek:       [],   // posts scheduled this week (capture screen)
  search:         "",
  editPost:       null, // post being edited in modal
  autoSaveTimer:  null,
  recording:      false,
  recognition:    null,
};

// ── DOM shorthand ─────────────────────────────────────────────────────────────

const el = (id) => document.getElementById(id);

// ── Screen navigation ─────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s =>
    s.classList.toggle("active", s.dataset.screen === name)
  );
}

function showLibraryView(name) {
  el("view-projects").hidden = (name !== "projects");
  el("view-project").hidden  = (name !== "project");
}

// ── Data: projects ────────────────────────────────────────────────────────────

async function loadProjects() {
  try {
    // Load projects with all posts (just id/status/starred for counts)
    state.projects = await sbGet(
      "projects?select=*,posts(id,status,starred)&order=created_at.asc"
    );
  } catch (e) {
    console.error("loadProjects:", e);
    state.projects = [];
  }
}

// ── Data: posts for current project + tab ─────────────────────────────────────

async function loadPosts() {
  const { currentProject, currentTab, search } = state;
  if (!currentProject) return;

  let q = `posts?project_id=eq.${currentProject.id}&order=created_at.desc`;
  if (currentTab === "starred") {
    q += "&starred=eq.true";
  } else {
    q += `&status=eq.${currentTab}`;
  }
  if (search.trim()) {
    q += `&text=ilike.*${encodeURIComponent(search.trim())}*`;
  }

  try {
    state.posts = await sbGet(q);
    await loadPostLogs(state.posts.map(p => p.id));
  } catch (e) {
    console.error("loadPosts:", e);
    state.posts = [];
  }
}

async function loadPostLogs(ids) {
  if (!ids.length) { state.postLogs = {}; return; }
  try {
    const logs = await sbGet(
      `post_logs?post_id=in.(${ids.join(",")})&order=posted_at.desc`
    );
    state.postLogs = {};
    for (const log of logs) {
      if (!state.postLogs[log.post_id]) state.postLogs[log.post_id] = [];
      state.postLogs[log.post_id].push(log);
    }
  } catch (e) {
    console.error("loadPostLogs:", e);
    state.postLogs = {};
  }
}

// ── Data: this week (capture screen) ─────────────────────────────────────────

async function loadThisWeek() {
  const today = todayStr();
  const in7   = offsetDate(7);
  try {
    state.thisWeek = await sbGet(
      `posts?status=eq.ready&scheduled_date=gte.${today}&scheduled_date=lte.${in7}` +
      `&order=scheduled_date.asc&select=*,projects(name)`
    );
  } catch (e) {
    console.error("loadThisWeek:", e);
    state.thisWeek = [];
  }
}

// ── Data: up next for current project ────────────────────────────────────────

async function loadUpNext() {
  if (!state.currentProject) return [];
  const today = todayStr();
  const in7   = offsetDate(7);
  try {
    return await sbGet(
      `posts?project_id=eq.${state.currentProject.id}` +
      `&status=eq.ready&scheduled_date=gte.${today}&scheduled_date=lte.${in7}` +
      `&order=scheduled_date.asc`
    );
  } catch (e) {
    console.error("loadUpNext:", e);
    return [];
  }
}

// ── Auto-save ─────────────────────────────────────────────────────────────────

function triggerAutoSave() {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => {
    const data = {
      text:       el("thought").value,
      visualIdea: el("visual-idea").value,
      projectId:  el("project-select").value,
      platform:   el("platform-select").value,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    showStatus("autosave-status", "autosaved ✓");
  }, 800);
}

function restoreAutoSave() {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (d.text)       el("thought").value          = d.text;
    if (d.visualIdea) el("visual-idea").value       = d.visualIdea;
    if (d.platform)   el("platform-select").value   = d.platform;
    if (d.projectId)  el("project-select").value    = d.projectId;
    refreshCaptureButtons();
    if (d.text) showStatus("autosave-status", "restored ·");
  } catch {}
}

function clearAutoSave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// ── Capture screen helpers ────────────────────────────────────────────────────

function refreshCaptureButtons() {
  const has = el("thought").value.trim().length > 0;
  el("save-draft-btn").disabled    = !has;
  el("clear-capture-btn").disabled = !has;
}

function populateProjectDropdown(selectId) {
  const sel = el(selectId);
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">No project</option>' +
    state.projects.map(p =>
      `<option value="${p.id}">${escHtml(p.name)}</option>`
    ).join("");
  if (cur) sel.value = cur;
}

// ── Render: This Week ─────────────────────────────────────────────────────────

function renderThisWeek() {
  const list = el("this-week-list");
  if (!state.thisWeek.length) {
    list.innerHTML = '<p class="empty-note">Nothing scheduled this week.</p>';
    return;
  }
  list.innerHTML = state.thisWeek.map(post =>
    weekCard(post, post.projects?.name)
  ).join("");
}

function postBtnLabel(platform) {
  return platform === "linkedin" ? "Post it" : "Copy + Open";
}

function weekCard(post, projName) {
  const d = fmtDate(post.scheduled_date);
  return `
    <div class="week-card" data-id="${post.id}">
      <div class="week-card-meta">
        <span class="badge badge-platform">${post.platform}</span>
        ${projName ? `<span class="week-proj">${escHtml(projName)}</span>` : ""}
        <span class="week-date">${d}</span>
      </div>
      <p class="week-text">${escHtml(truncate(post.text, 140))}</p>
      <div class="week-actions">
        <button class="btn-small" onclick="postIt('${post.id}','week')">${postBtnLabel(post.platform)}</button>
        <button class="btn-small ghost" onclick="pushWeek('${post.id}','week')">Push a week</button>
        <button class="btn-small ghost" onclick="backToDraft('${post.id}','week')">↩ Draft</button>
      </div>
    </div>`;
}

// ── Render: Projects list ─────────────────────────────────────────────────────

function renderProjectsView() {
  // Global stats
  const all    = state.projects.flatMap(p => p.posts || []);
  const total  = all.length;
  const drafts = all.filter(p => p.status === "draft").length;
  const ready  = all.filter(p => p.status === "ready").length;
  const posted = all.filter(p => p.status === "posted").length;

  el("global-stats").innerHTML = `
    <div class="global-stats">
      <span>${total} posts</span>
      <span class="stat-sep">·</span>
      <span>${drafts} drafts</span>
      <span class="stat-sep">·</span>
      <span>${ready} ready</span>
      <span class="stat-sep">·</span>
      <span>${posted} posted</span>
    </div>`;

  // Project cards
  el("projects-list").innerHTML =
    state.projects.map(p => {
      const posts   = p.posts || [];
      const d       = posts.filter(x => x.status === "draft").length;
      const r       = posts.filter(x => x.status === "ready").length;
      const ps      = posts.filter(x => x.status === "posted").length;
      const starred = posts.filter(x => x.starred).length;
      return `
        <button class="project-card" onclick="openProject('${p.id}')">
          <div class="project-card-name">${escHtml(p.name)}</div>
          <div class="project-card-stats">
            <span>${posts.length} posts</span>
            <span class="stat-sep">·</span>
            <span>${d} drafts</span>
            <span class="stat-sep">·</span>
            <span>${r} ready</span>
            <span class="stat-sep">·</span>
            <span>${ps} posted</span>
            ${starred ? `<span class="stat-sep">·</span><span class="starred-count">⭐ ${starred}</span>` : ""}
          </div>
        </button>`;
    }).join("") +
    `<button class="project-card project-card-add" onclick="promptNewProject()">+ New project</button>`;
}

// ── Render: Project detail ────────────────────────────────────────────────────

async function openProject(id) {
  state.currentProject = state.projects.find(p => p.id === id);
  state.currentTab     = "draft";
  state.search         = "";
  el("project-title").textContent = state.currentProject.name;
  el("project-search").value = "";
  showLibraryView("project");
  await refreshProjectView();
}

async function refreshProjectView() {
  await loadPosts();
  renderTabCounts();
  renderPostList();
  await renderUpNextSection();
}

function renderTabCounts() {
  const posts = state.currentProject.posts || [];
  const counts = {
    draft:   posts.filter(p => p.status === "draft").length,
    ready:   posts.filter(p => p.status === "ready").length,
    posted:  posts.filter(p => p.status === "posted").length,
    starred: posts.filter(p => p.starred).length,
  };
  ["draft","ready","posted","starred"].forEach(tab => {
    const btn = el(`tab-${tab}`);
    if (!btn) return;
    btn.textContent = (tab === "starred" ? "⭐" : capitalize(tab)) + ` ${counts[tab]}`;
    btn.classList.toggle("active", state.currentTab === tab);
  });
}

async function renderUpNextSection() {
  const upNext = await loadUpNext();
  const section = el("up-next");
  if (!upNext.length) { section.hidden = true; return; }
  section.hidden = false;
  el("up-next-list").innerHTML = upNext.map(p => weekCard(p, null)).join("");
}

function renderPostList() {
  const list = el("posts-list");
  if (!state.posts.length) {
    const label = state.currentTab === "starred" ? "starred" : state.currentTab;
    list.innerHTML = `<p class="empty-note">No ${label} posts yet.</p>`;
    return;
  }
  list.innerHTML = state.posts.map(postCard).join("");
}

function postCard(post) {
  const logs    = state.postLogs[post.id] || [];
  const last    = logs[0];
  const logText = last
    ? `Posted ${logs.length}× · Last: ${capitalize(last.platform)} · ${fmtDate(last.posted_at)}`
    : "Never posted";
  const schedText = (post.status === "ready" && post.scheduled_date)
    ? `<span class="post-scheduled">Scheduled: ${fmtDate(post.scheduled_date)}</span>`
    : "";

  return `
    <div class="post-card" data-id="${post.id}">
      <div class="post-card-header">
        <div class="post-badges">
          <span class="badge badge-status badge-${post.status}">${post.status}</span>
          <span class="badge badge-platform">${post.platform}</span>
        </div>
        <div class="post-card-actions">
          <button class="icon-btn ${post.starred ? "starred" : ""}"
            onclick="toggleStar('${post.id}')" title="${post.starred ? "Unstar" : "Star"}">⭐</button>
          <button class="icon-btn" onclick="copyPost('${post.id}')" title="Copy text">⎘</button>
          <button class="icon-btn" onclick="openEdit('${post.id}')" title="Edit">✎</button>
        </div>
      </div>
      <p class="post-text">${escHtml(post.text)}</p>
      ${post.visual_idea ? `<p class="post-visual">📷 ${escHtml(post.visual_idea)}</p>` : ""}
      <div class="post-card-footer">
        <span class="post-log-text">${logText}</span>
        ${schedText}
      </div>
    </div>`;
}

// ── Edit modal ────────────────────────────────────────────────────────────────

async function openEdit(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  state.editPost = { ...post };

  const logs = state.postLogs[id] || [];
  el("edit-text").value     = post.text;
  el("edit-visual").value   = post.visual_idea || "";
  el("edit-platform").value = post.platform;
  el("edit-status").value   = post.status;
  el("edit-date").value     = post.scheduled_date || "";
  el("edit-date-row").hidden = post.status !== "ready";

  // Project dropdown in modal
  populateProjectDropdown("edit-project");
  el("edit-project").value = post.project_id || "";

  // Post history
  el("edit-log").innerHTML = logs.length
    ? logs.map(l =>
        `<div class="log-entry">${capitalize(l.platform)} · ${fmtDate(l.posted_at)}</div>`
      ).join("")
    : '<div class="log-entry empty">No post history yet.</div>';

  el("modal").hidden = false;
}

function closeModal() {
  el("modal").hidden = true;
  state.editPost = null;
}

async function saveEdit() {
  if (!state.editPost) return;
  const status = el("edit-status").value;
  const data = {
    text:           el("edit-text").value.trim(),
    visual_idea:    el("edit-visual").value.trim() || null,
    platform:       el("edit-platform").value,
    project_id:     el("edit-project").value || null,
    status,
    scheduled_date: status === "ready" ? (el("edit-date").value || null) : null,
    updated_at:     new Date().toISOString(),
  };
  if (!data.text) return;

  try {
    await sbPatch("posts", state.editPost.id, data);
    closeModal();
    await loadProjects();
    renderProjectsView();
    await refreshProjectView();
  } catch (e) {
    console.error("saveEdit:", e);
  }
}

async function deletePost() {
  if (!state.editPost) return;
  if (!confirm("Delete this post? This can't be undone.")) return;
  try {
    await sbDelete("posts", state.editPost.id);
    closeModal();
    await loadProjects();
    renderProjectsView();
    await refreshProjectView();
  } catch (e) {
    console.error("deletePost:", e);
  }
}

// ── Save draft (capture screen) ───────────────────────────────────────────────

async function saveDraft() {
  const text = el("thought").value.trim();
  if (!text) return;

  el("save-draft-btn").disabled = true;
  el("save-draft-btn").textContent = "Saving…";

  try {
    await sbPost("posts", {
      text,
      visual_idea: el("visual-idea").value.trim() || null,
      project_id:  el("project-select").value || null,
      platform:    el("platform-select").value,
      status:      "draft",
    });

    // Clear form
    el("thought").value    = "";
    el("visual-idea").value = "";
    clearAutoSave();
    refreshCaptureButtons();
    showStatus("autosave-status", "Saved.", 2500);

    // Refresh downstream state
    await loadProjects();
    await loadThisWeek();
    renderThisWeek();
    populateProjectDropdown("project-select");
  } catch (e) {
    console.error("saveDraft:", e);
    showStatus("autosave-status", "Not saved. Try again.");
  } finally {
    el("save-draft-btn").textContent = "Save Draft";
    refreshCaptureButtons();
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

// source: "week" = from this-week panel, "project" = from project view
async function postIt(id, source) {
  const post = source === "week"
    ? state.thisWeek.find(p => p.id === id)
    : state.posts.find(p => p.id === id);
  if (!post) return;

  // Copy text + open platform
  await navigator.clipboard.writeText(post.text).catch(() => {});
  const urls = {
    linkedin:  "https://www.linkedin.com/feed/?shareActive=true&text=" + encodeURIComponent(post.text),
    instagram: "https://www.instagram.com/",
    substack:  "https://substack.com/",
  };
  window.open(urls[post.platform] || urls.linkedin, "_blank", "noopener,noreferrer");

  // Mark posted + log it
  try {
    await sbPatch("posts", id, { status: "posted", updated_at: new Date().toISOString() });
    await sbPost("post_logs", {
      post_id:   id,
      platform:  post.platform,
      posted_at: todayStr(),
    });
    await loadProjects();
    await loadThisWeek();
    renderThisWeek();
    if (source === "project") await refreshProjectView();
    renderProjectsView();
  } catch (e) {
    console.error("postIt:", e);
  }
}

async function pushWeek(id, source) {
  const post = source === "week"
    ? state.thisWeek.find(p => p.id === id)
    : state.posts.find(p => p.id === id);
  if (!post?.scheduled_date) return;

  // Parse date as local midnight to avoid off-by-one
  const [y, m, d] = post.scheduled_date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 7);
  const newDate = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

  try {
    await sbPatch("posts", id, { scheduled_date: newDate });
    await loadThisWeek();
    renderThisWeek();
    if (source === "project") await refreshProjectView();
  } catch (e) {
    console.error("pushWeek:", e);
  }
}

async function backToDraft(id, source) {
  try {
    await sbPatch("posts", id, { status: "draft", scheduled_date: null });
    await loadProjects();
    await loadThisWeek();
    renderThisWeek();
    if (source === "project") await refreshProjectView();
    renderProjectsView();
  } catch (e) {
    console.error("backToDraft:", e);
  }
}

async function toggleStar(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  try {
    await sbPatch("posts", id, { starred: !post.starred });
    await loadProjects();
    await refreshProjectView();
    renderProjectsView();
  } catch (e) {
    console.error("toggleStar:", e);
  }
}

async function copyPost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  await navigator.clipboard.writeText(post.text).catch(() => {});
}

// ── Projects ──────────────────────────────────────────────────────────────────

async function promptNewProject() {
  const name = prompt("Project name:");
  if (!name?.trim()) return;
  try {
    await sbPost("projects", { name: name.trim() });
    await loadProjects();
    renderProjectsView();
    populateProjectDropdown("project-select");
  } catch (e) {
    console.error("promptNewProject:", e);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportCSV() {
  try {
    const posts = await sbGet(
      "posts?select=*,projects(name),post_logs(platform,posted_at)&order=created_at.desc"
    );
    const rows = [[
      "id","project","text","visual_idea","platform",
      "status","scheduled_date","starred","created_at",
      "times_posted","last_platform","last_posted"
    ]];
    for (const p of posts) {
      const logs = p.post_logs || [];
      rows.push([
        p.id,
        csvCell(p.projects?.name || ""),
        csvCell(p.text || ""),
        csvCell(p.visual_idea || ""),
        p.platform || "",
        p.status || "",
        p.scheduled_date || "",
        p.starred ? "yes" : "no",
        (p.created_at || "").split("T")[0],
        logs.length,
        logs[0]?.platform || "",
        logs[0]?.posted_at || "",
      ]);
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    downloadFile(csv, `postthis-${todayStr()}.csv`, "text/csv");
    showStatus("export-status", "Downloaded.", 3000);
  } catch (e) {
    console.error("exportCSV:", e);
    showStatus("export-status", "Failed.");
  }
}

async function copyForAI() {
  try {
    const posts = await sbGet(
      "posts?select=*,projects(name),post_logs(platform,posted_at)&order=created_at.desc"
    );

    // Group by project
    const byProject = {};
    for (const p of posts) {
      const key = p.projects?.name || "No project";
      if (!byProject[key]) byProject[key] = [];
      byProject[key].push(p);
    }

    let out = `# Post This — Content Export\nGenerated: ${todayStr()}\n\n`;

    for (const [proj, items] of Object.entries(byProject)) {
      out += `## ${proj}\n\n`;
      const starred  = items.filter(p => p.starred);
      const drafts   = items.filter(p => p.status === "draft");
      const ready    = items.filter(p => p.status === "ready");
      const posted   = items.filter(p => p.status === "posted");

      if (starred.length) {
        out += `### ⭐ Top Performers — remix these\n`;
        for (const p of starred) {
          const logs = p.post_logs || [];
          out += `\n"${p.text}"\n`;
          out += `  Platform: ${p.platform} | Posted ${logs.length}× | Last: ${logs[0]?.platform || "—"} ${logs[0]?.posted_at || ""}\n`;
          if (p.visual_idea) out += `  Visual: ${p.visual_idea}\n`;
        }
        out += "\n";
      }

      if (ready.length) {
        out += `### Ready to post\n`;
        for (const p of ready) {
          out += `\n"${p.text}"\n`;
          out += `  Platform: ${p.platform}${p.scheduled_date ? " | Scheduled: " + p.scheduled_date : ""}\n`;
          if (p.visual_idea) out += `  Visual: ${p.visual_idea}\n`;
        }
        out += "\n";
      }

      if (drafts.length) {
        out += `### Drafts / raw ideas\n`;
        for (const p of drafts) {
          out += `\n- ${p.text}\n`;
          if (p.visual_idea) out += `  Visual: ${p.visual_idea}\n`;
        }
        out += "\n";
      }

      if (posted.length) {
        out += `### Posted (${posted.length} total)\n`;
        for (const p of posted.slice(0, 15)) {
          const logs = p.post_logs || [];
          out += `\n- "${p.text}"\n  ${logs.length}× on ${p.platform}\n`;
        }
        if (posted.length > 15) out += `\n  …and ${posted.length - 15} more\n`;
        out += "\n";
      }
    }

    await navigator.clipboard.writeText(out);
    showStatus("export-status", "Copied for AI ✓", 3000);
  } catch (e) {
    console.error("copyForAI:", e);
    showStatus("export-status", "Failed to copy.");
  }
}

// ── Voice / mic ───────────────────────────────────────────────────────────────

function initMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { el("mic-btn").hidden = true; return; }

  const recognition = new SR();
  recognition.continuous    = true;
  recognition.interimResults = true;
  recognition.lang          = "en-US";
  state.recognition         = recognition;

  let finalText = "";

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + " ";
      else interim = t;
    }
    const base = el("thought").dataset.baseText || "";
    el("thought").value = base + finalText + interim;
    refreshCaptureButtons();
    triggerAutoSave();
  };

  recognition.onend = () => {
    if (state.recording) recognition.start(); // keep going until stopped
  };

  recognition.onerror = (e) => {
    if (e.error === "not-allowed") {
      showStatus("autosave-status", "Mic access denied.", 3000);
      stopRecording();
    }
  };
}

function toggleMic() {
  if (!state.recognition) return;
  if (state.recording) {
    stopRecording();
  } else {
    el("thought").dataset.baseText = el("thought").value;
    state.recognition.start();
    state.recording = true;
    el("mic-btn").classList.add("recording");
    el("mic-btn").title = "Stop recording";
    showStatus("autosave-status", "Listening…");
  }
}

function stopRecording() {
  state.recognition.stop();
  state.recording = false;
  el("mic-btn").classList.remove("recording");
  el("mic-btn").title = "Record idea";
  delete el("thought").dataset.baseText;
  showStatus("autosave-status", "");
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showStatus(id, msg, clearAfter = 0) {
  const s = el(id);
  if (!s) return;
  s.textContent = msg;
  if (clearAfter) setTimeout(() => { if (s.textContent === msg) s.textContent = ""; }, clearAfter);
}

function escHtml(str) {
  return (str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function offsetDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

function fmtDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function csvCell(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

function downloadFile(content, filename, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {

  // ── Screen nav
  el("library-btn").onclick = async () => {
    showScreen("library");
    showLibraryView("projects");
    await loadProjects();
    renderProjectsView();
  };
  el("back-to-capture-btn").onclick = () => showScreen("capture");
  el("back-to-projects-btn").onclick = () => showLibraryView("projects");

  // ── Capture form
  el("thought").addEventListener("input", () => { refreshCaptureButtons(); triggerAutoSave(); });
  el("visual-idea").addEventListener("input", triggerAutoSave);
  el("project-select").addEventListener("change", triggerAutoSave);
  el("platform-select").addEventListener("change", triggerAutoSave);

  el("save-draft-btn").onclick = saveDraft;
  el("clear-capture-btn").onclick = () => {
    el("thought").value     = "";
    el("visual-idea").value = "";
    clearAutoSave();
    refreshCaptureButtons();
    showStatus("autosave-status", "");
  };
  el("mic-btn").onclick = toggleMic;

  // Cmd/Ctrl+Enter to save draft
  el("thought").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!el("save-draft-btn").disabled) saveDraft();
    }
  });

  // ── Library: tabs
  ["draft","ready","posted","starred"].forEach(tab => {
    el(`tab-${tab}`).onclick = async () => {
      state.currentTab = tab;
      renderTabCounts();
      await loadPosts();
      renderPostList();
    };
  });

  // ── Library: search
  el("project-search").addEventListener("input", async (e) => {
    state.search = e.target.value;
    await loadPosts();
    renderPostList();
  });

  // ── Modal
  el("edit-status").addEventListener("change", () => {
    el("edit-date-row").hidden = el("edit-status").value !== "ready";
  });
  el("modal-close").onclick   = closeModal;
  el("modal-cancel-btn").onclick = closeModal;
  el("modal-backdrop").onclick   = closeModal;
  el("modal-save-btn").onclick   = saveEdit;
  el("modal-delete-btn").onclick = deletePost;

  // Close modal on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("modal").hidden) closeModal();
  });

  // ── Export
  el("export-csv-btn").onclick  = exportCSV;
  el("copy-ai-btn").onclick     = copyForAI;

  // ── Mic
  initMic();

  // ── Bootstrap data
  await loadProjects();
  populateProjectDropdown("project-select");
  await loadThisWeek();
  renderThisWeek();
  restoreAutoSave();
  refreshCaptureButtons();
}

document.addEventListener("DOMContentLoaded", init);

// Service worker (silent fail)
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
