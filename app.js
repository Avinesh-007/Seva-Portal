/**
 * app.js — SEVA Portal
 * All UI logic, DOM manipulation, section renderers, and event wiring.
 * Depends on: backend.js (Auth, Users, Applications, Complaints, OTP, SERVICES, Session)
 * All backend calls are async — functions that use them are async too.
 */

/* ══════════════════════════════════════════
   STATE
   ══════════════════════════════════════════ */
let currentUser    = null;
let selectedService = null;   // { name, dept }
let selectedAppId   = null;   // set when opening status-update modal
let pendingRegData  = null;   // registration payload waiting for OTP

/* ══════════════════════════════════════════
   TOAST NOTIFICATION
   ══════════════════════════════════════════ */
function showToast(msg, type = "success") {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const toast = document.getElementById("toast");
  document.getElementById("toast-icon").textContent = icons[type] || "✅";
  document.getElementById("toast-msg").textContent = msg;
  toast.className = "toast " + type + " show";
  setTimeout(() => toast.classList.remove("show"), 3000);
}

/* ══════════════════════════════════════════
   AUTH UI
   ══════════════════════════════════════════ */
function switchTab(tab) {
  const isLogin = tab === "login";
  document.querySelectorAll(".auth-tab").forEach((t, i) =>
    t.classList.toggle("active", isLogin ? i === 0 : i === 1)
  );
  document.getElementById("login-form").classList.toggle("hidden", !isLogin);
  document.getElementById("register-form").classList.toggle("hidden", isLogin);
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.add("show");
}
function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}
function setAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = "form-alert show " + type;
}

/* ── OTP helpers ── */
function generateOtp() {
  const code = OTP.generate();
  document.getElementById("otp-hint").textContent = "🔑 Demo OTP: " + code;
  showToast("OTP sent: " + code, "success");
}

function otpMove(el, idx) {
  const digits = document.querySelectorAll(".otp-digit");
  if (el.value && idx < 5) digits[idx + 1].focus();
  if (el.value.length > 1) el.value = el.value.slice(-1);
}

/* ── Department field visibility on role change ── */
document.getElementById("reg-role").addEventListener("change", function () {
  const show = this.value === "department_head";
  document.getElementById("dept-select-wrap").classList.toggle("hidden", !show);
});

/* ── REGISTER ── */
async function doRegister() {
  const name     = document.getElementById("reg-name").value.trim();
  const username = document.getElementById("reg-username").value.trim();
  const aadhar   = document.getElementById("reg-aadhar").value.trim();
  const mobile   = document.getElementById("reg-mobile").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const role     = document.getElementById("reg-role").value;
  const dept     = document.getElementById("reg-dept").value;
  const pwd      = document.getElementById("reg-pwd").value;
  const pwd2     = document.getElementById("reg-pwd2").value;

  ["err-name", "err-username", "err-aadhar", "err-mobile", "err-role", "err-pwd", "err-pwd2"].forEach(hideErr);
  document.getElementById("reg-alert").classList.remove("show");

  let valid = true;
  if (!name)  { showErr("err-name", "Please enter your full name"); valid = false; }
  if (!username) { showErr("err-username", "Please choose a username"); valid = false; }
  if (!/^\d{12}$/.test(aadhar)) { showErr("err-aadhar", "Aadhar must be exactly 12 digits"); valid = false; }
  if (!/^\d{10}$/.test(mobile)) { showErr("err-mobile", "Enter a valid 10-digit mobile"); valid = false; }
  if (!role)  { showErr("err-role", "Please select a role"); valid = false; }
  if (pwd.length < 6) { showErr("err-pwd", "Password must be at least 6 characters"); valid = false; }
  if (pwd !== pwd2)   { showErr("err-pwd2", "Passwords do not match"); valid = false; }
  if (!valid) return;

  // Check uniqueness via API
  if (await Users.usernameExists(username)) {
    showErr("err-username", "Username already taken"); return;
  }
  if (await Users.aadharExists(aadhar)) {
    showErr("err-aadhar", "Aadhar already registered"); return;
  }

  const otpSection = document.getElementById("otp-section");

  // First click → show OTP input
  if (!otpSection.classList.contains("show")) {
    pendingRegData = { name, username, aadhar, mobile, email, role, dept, password: pwd };
    otpSection.classList.add("show");
    document.getElementById("reg-btn").textContent = "Verify OTP & Create Account";
    generateOtp();
    return;
  }

  // Second click → verify OTP and save user via API
  const digits = document.querySelectorAll(".otp-digit");
  const enteredOtp = [...digits].map(d => d.value).join("");
  if (!OTP.verify(enteredOtp)) {
    setAlert("reg-alert", "❌ Invalid OTP. Please check and try again.", "error");
    return;
  }

  const result = await Users.create(pendingRegData);
  OTP.clear();
  pendingRegData = null;

  if (result.ok) {
    setAlert("reg-alert", "✅ Account created successfully! You can now sign in.", "success");
    document.getElementById("reg-btn").textContent = "Send OTP & Continue";
    otpSection.classList.remove("show");
    setTimeout(() => switchTab("login"), 1800);
  } else {
    setAlert("reg-alert", "❌ Registration failed. " + (result.error || ""), "error");
  }
}

/* ── LOGIN ── */
async function doLogin() {
  const loginId = document.getElementById("login-id").value.trim();
  const pwd     = document.getElementById("login-pwd").value;
  const role    = document.getElementById("login-role").value;

  document.getElementById("login-alert").classList.remove("show");
  if (!loginId || !pwd || !role) {
    setAlert("login-alert", "Please fill in all fields.", "error");
    return;
  }

  const result = await Auth.login(loginId, pwd, role);

  if (!result.ok) {
    if (result.error === "locked") {
      setAlert("login-alert", "🔒 Account locked due to too many failed attempts. Contact admin.", "error");
    } else {
      const left = result.attemptsLeft;
      const warn = document.getElementById("attempts-warn");
      document.getElementById("attempts-left").textContent = left;
      warn.style.display = left < 3 ? "block" : "none";
      setAlert("login-alert",
        "❌ Invalid credentials or role mismatch. " +
        (left > 0 ? left + " attempts left." : "Account locked."),
        "error"
      );
    }
    return;
  }

  loadApp(result.user);
}

/* ── LOGOUT ── */
function doLogout() {
  Auth.logout();
  currentUser = null;
  document.getElementById("app-page").style.display = "none";
  document.getElementById("auth-page").style.display = "flex";
  ["login-id", "login-pwd"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("login-role").value = "";
  document.getElementById("login-alert").classList.remove("show");
}

/* ══════════════════════════════════════════
   APP BOOTSTRAP
   ══════════════════════════════════════════ */
function loadApp(user) {
  currentUser = user;
  document.getElementById("auth-page").style.display = "none";
  document.getElementById("app-page").style.display = "block";

  document.getElementById("sidebar-name").textContent = user.name;
  document.getElementById("sidebar-role").textContent = user.role.replace("_", " ");
  document.getElementById("sidebar-avatar").textContent = user.name[0].toUpperCase();

  ["nav-citizen", "nav-dept", "nav-admin"].forEach(n =>
    document.getElementById(n).classList.add("hidden")
  );
  const navMap = { citizen: "nav-citizen", department_head: "nav-dept", admin: "nav-admin" };
  document.getElementById(navMap[user.role]).classList.remove("hidden");

  showSection("dashboard");
  updateStats();
}

/* ══════════════════════════════════════════
   SECTION ROUTING
   ══════════════════════════════════════════ */
const PAGE_TITLES = {
  dashboard:      "Dashboard",
  services:       "Apply for Services",
  myapps:         "My Applications",
  complaints:     "Complaints",
  track:          "Track Application",
  idcard:         "Digital ID Card",
  allapps:        "All Applications",
  allusers:       "User Management",
  analytics:      "Analytics",
  assignments:    "Work Assignments",
  deptapps:       "Department Applications",
  deptcomplaints: "Department Complaints"
};

function showSection(name) {
  document.querySelectorAll(".section-page").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const sec = document.getElementById("sec-" + name);
  if (sec) sec.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(n => {
    if (n.getAttribute("onclick") && n.getAttribute("onclick").includes(`'${name}'`))
      n.classList.add("active");
  });

  document.getElementById("page-title").textContent = PAGE_TITLES[name] || name;
  document.getElementById("page-subtitle").textContent = currentUser ? "Logged in as " + currentUser.name : "";

  const loaders = {
    services:       loadServices,
    myapps:         loadMyApps,
    complaints:     loadComplaints,
    allapps:        () => loadAllApps(),
    allusers:       loadAllUsers,
    analytics:      loadAnalytics,
    deptapps:       loadDeptApps,
    deptcomplaints: loadDeptComplaints,
    idcard:         loadIdCard,
    assignments:    loadAssignments
  };
  if (loaders[name]) loaders[name]();
}

/* ══════════════════════════════════════════
   STATS (dashboard counts)
   ══════════════════════════════════════════ */
async function updateStats() {
  if (!currentUser) return;

  if (currentUser.role === "citizen") {
    document.getElementById("citizen-stats").classList.remove("hidden");
    document.getElementById("admin-stats").classList.add("hidden");
    const mine = await Applications.getByUser(currentUser.id);
    document.getElementById("cit-apps").textContent = mine.length;
    document.getElementById("cit-approved").textContent = mine.filter(a => a.status === "approved").length;
    document.getElementById("cit-pending").textContent  = mine.filter(a => a.status === "pending").length;
    const comps = await Complaints.getByUser(currentUser.id);
    document.getElementById("cit-complaints").textContent = comps.length;
    document.getElementById("badge-apps").textContent = mine.filter(a => a.status === "pending").length;
  } else {
    document.getElementById("admin-stats").classList.remove("hidden");
    document.getElementById("citizen-stats").classList.add("hidden");
    const [allApps, allUsers] = await Promise.all([Applications.getAll(), Users.getAll()]);
    document.getElementById("adm-citizens").textContent = allUsers.filter(u => u.role === "citizen").length;
    document.getElementById("adm-apps").textContent     = allApps.length;
    document.getElementById("adm-pending").textContent  = allApps.filter(a => a.status === "pending").length;
  }
}

/* ══════════════════════════════════════════
   SERVICES SECTION
   ══════════════════════════════════════════ */
const DEPT_COLORS = {
  Revenue:   "var(--accent)",
  Health:    "var(--green)",
  Education: "var(--purple)",
  Transport: "var(--gold)",
  Municipal: "var(--teal)"
};

function loadServices() { renderServices(SERVICES); }

function filterServices(query) {
  const q = query.toLowerCase();
  renderServices(SERVICES.filter(s =>
    s.name.toLowerCase().includes(q) || s.dept.toLowerCase().includes(q)
  ));
}

function renderServices(list) {
  document.getElementById("services-grid").innerHTML = list.map(s => `
    <div class="service-card" onclick="openApply('${s.name}','${s.dept}')">
      <div class="service-tag" style="color:${DEPT_COLORS[s.dept] || "var(--accent2)"};">${s.tag}</div>
      <div class="service-name">${s.name}</div>
      <div class="service-desc">${s.desc}</div>
      <div class="service-time">⏱ Avg. processing: ${s.time}</div>
    </div>`
  ).join("");
}

/* ══════════════════════════════════════════
   APPLY MODAL
   ══════════════════════════════════════════ */
function openApply(name, dept) {
  if (!currentUser) return;
  selectedService = { name, dept };
  document.getElementById("modal-service-name").textContent = name + " · " + dept + " Department";
  document.getElementById("apply-name").value = currentUser.name;
  document.getElementById("apply-modal").classList.add("show");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}

async function submitApplication() {
  const note = document.getElementById("apply-note").value;
  const app = await Applications.create({
    userId:   currentUser.id,
    userName: currentUser.name,
    service:  selectedService.name,
    dept:     selectedService.dept,
    remark:   note || ""
  });
  closeModal("apply-modal");
  showToast("Application " + app.id + " submitted!", "success");
  updateStats();
}

/* ══════════════════════════════════════════
   MY APPLICATIONS (citizen)
   ══════════════════════════════════════════ */
async function loadMyApps() {
  const apps = await Applications.getByUser(currentUser.id);
  document.getElementById("my-apps-tbody").innerHTML = apps.length
    ? apps.map(a => `
        <tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${a.id}</td>
          <td style="font-weight:500;">${a.service}</td>
          <td>${a.dept}</td>
          <td>${a.date}</td>
          <td><span class="badge badge-${a.status}">${a.status.toUpperCase()}</span></td>
          <td>
            <button style="background:none;border:none;color:var(--accent2);cursor:pointer;font-size:12px;"
                    onclick="quickTrack('${a.id}')">Track →</button>
          </td>
        </tr>`
    ).join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">
         No applications yet.
         <span style="color:var(--accent2);cursor:pointer;" onclick="showSection('services')">Apply now →</span>
       </td></tr>`;
}

function quickTrack(id) {
  document.getElementById("track-id").value = id;
  showSection("track");
  trackApp();
}

/* ══════════════════════════════════════════
   COMPLAINTS (citizen)
   ══════════════════════════════════════════ */
async function loadComplaints() {
  const comps = await Complaints.getByUser(currentUser.id);
  document.getElementById("my-complaints-list").innerHTML = comps.length
    ? comps.map(c => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-weight:500;font-size:13px;">${c.subject}</div>
            <span class="badge badge-${c.status === "open" ? "pending" : "approved"}">${c.status.toUpperCase()}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${c.dept} · ${c.category}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${c.date}</div>
        </div>`
    ).join("")
    : "<div style=\"text-align:center;color:var(--text-muted);padding:24px;font-size:13px;\">No complaints raised yet.</div>";
}

async function submitComplaint() {
  const dept    = document.getElementById("comp-dept").value;
  const cat     = document.getElementById("comp-cat").value;
  const subject = document.getElementById("comp-subject").value.trim();
  const desc    = document.getElementById("comp-desc").value.trim();

  if (!dept || !cat || !subject || !desc) {
    showToast("Please fill all fields", "error");
    return;
  }

  await Complaints.create({ userId: currentUser.id, dept, category: cat, subject, desc });
  ["comp-dept", "comp-cat", "comp-subject", "comp-desc"].forEach(id => {
    document.getElementById(id).value = "";
  });
  showToast("Complaint submitted!", "success");
  loadComplaints();
  updateStats();
}

/* ══════════════════════════════════════════
   TRACK APPLICATION
   ══════════════════════════════════════════ */
async function trackApp() {
  const raw = document.getElementById("track-id").value.trim();
  const all = await Applications.getAll();
  const app = all.find(a =>
    a.id === raw ||
    (currentUser && a.userId === currentUser.id && a.id.includes(raw))
  );

  if (!app) { showToast("Application not found", "error"); return; }

  document.getElementById("track-result").classList.remove("hidden");
  document.getElementById("track-info").innerHTML =
    `<strong style="color:var(--text-primary);">${app.service}</strong> · ${app.dept} Department · Applied on ${app.date}`;

  const steps   = ["Submitted", "Received", "Processing", "Decision", "Completed"];
  const progMap = { pending: 1, processing: 2, approved: 4, rejected: 3 };
  const cur     = progMap[app.status] || 1;

  document.getElementById("track-steps").innerHTML = steps.map((s, i) => `
    <div class="step-circle ${i < cur ? "done" : i === cur ? "active" : "pending"}">${i < cur ? "✓" : i + 1}</div>
    ${i < steps.length - 1 ? `<div class="step-line ${i < cur - 1 ? "done" : ""}"></div>` : ""}
  `).join("");

  document.getElementById("track-labels").innerHTML = steps.map(s =>
    `<div style="font-size:10px;color:var(--text-muted);flex:1;text-align:center;">${s}</div>`
  ).join("");
}

/* ══════════════════════════════════════════
   DIGITAL ID CARD
   ══════════════════════════════════════════ */
function loadIdCard() {
  if (!currentUser) return;
  const fmtAadhar = currentUser.aadhar.replace(/(\d{4})/g, "$1 ").trim();

  document.getElementById("id-name").textContent         = currentUser.name;
  document.getElementById("id-role-display").textContent = "Role: " + currentUser.role.replace("_", " ");
  document.getElementById("id-mobile").textContent       = "Mobile: " + (currentUser.mobile || "—");
  document.getElementById("id-email").textContent        = "Email: "  + (currentUser.email  || "—");
  document.getElementById("id-aadhar").textContent       = fmtAadhar;
  document.getElementById("id-avatar").textContent       = currentUser.name[0].toUpperCase();

  const badgeClass = currentUser.role === "citizen" ? "citizen" : currentUser.role === "admin" ? "admin" : "dept";
  document.getElementById("profile-details").innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);">FULL NAME</div>
      <div style="font-size:14px;font-weight:500;">${currentUser.name}</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);">USERNAME</div>
      <div style="font-size:14px;font-family:'JetBrains Mono',monospace;">${currentUser.username}</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);">AADHAR NUMBER</div>
      <div style="font-size:14px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">${fmtAadhar}</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);">ROLE</div>
      <span class="badge badge-${badgeClass}">${currentUser.role.replace("_", " ").toUpperCase()}</span>
    </div>
    ${currentUser.dept ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);">DEPARTMENT</div>
      <div style="font-size:14px;">${currentUser.dept}</div>
    </div>` : ""}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <div style="font-size:11px;color:var(--green2);">🔒 Identity verified via Aadhar</div>
    </div>`;
}

/* ══════════════════════════════════════════
   ALL APPLICATIONS (admin)
   ══════════════════════════════════════════ */
async function loadAllApps(filter) {
  const apps = filter ? await Applications.getByStatus(filter) : await Applications.getAll();
  document.getElementById("all-apps-tbody").innerHTML = apps.map(a => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${a.id}</td>
      <td style="font-weight:500;">${a.userName}</td>
      <td>${a.service}</td>
      <td>${a.dept}</td>
      <td>${a.date}</td>
      <td><span class="badge badge-${a.status}">${a.status.toUpperCase()}</span></td>
      <td>
        <button style="background:none;border:none;color:var(--accent2);cursor:pointer;font-size:12px;"
                onclick="openStatus('${a.id}')">Update →</button>
      </td>
    </tr>`
  ).join("");
}

function filterAllApps(value) {
  loadAllApps(value || null);
}

/* ══════════════════════════════════════════
   USER MANAGEMENT (admin)
   ══════════════════════════════════════════ */
async function loadAllUsers() {
  const users = await Users.getAll();
  document.getElementById("all-users-tbody").innerHTML = users.map(u => {
    const badgeClass = u.role === "citizen" ? "citizen" : u.role === "admin" ? "admin" : "dept";
    return `
      <tr>
        <td style="font-weight:500;">${u.name}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;">${u.username}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${u.aadhar.replace(/(\d{4})/g, "$1 ").trim()}</td>
        <td><span class="badge badge-${badgeClass}">${u.role.replace("_", " ")}</span></td>
        <td>${u.dept || "—"}</td>
        <td><span class="badge badge-approved">Active</span></td>
      </tr>`;
  }).join("");
}

/* ══════════════════════════════════════════
   ANALYTICS (admin)
   ══════════════════════════════════════════ */
async function loadAnalytics() {
  const apps   = await Applications.getAll();
  const total  = apps.length || 1;
  const depts  = ["Revenue", "Health", "Education", "Transport", "Municipal"];
  const dColors = ["var(--accent)", "var(--green)", "var(--purple)", "var(--gold)", "var(--teal)"];
  const statuses = ["pending", "approved", "rejected", "processing"];
  const sColors  = ["var(--gold)", "var(--green)", "var(--red)", "var(--accent)"];

  document.getElementById("analytics-depts").innerHTML = depts.map((d, i) => {
    const n = apps.filter(a => a.dept === d).length;
    return `
      <div class="analytics-bar-row">
        <div class="bar-label">${d}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / total * 100)}%;background:${dColors[i]};"></div></div>
        <div class="bar-value" style="color:${dColors[i]};">${n}</div>
      </div>`;
  }).join("");

  document.getElementById("analytics-status").innerHTML = statuses.map((s, i) => {
    const n = apps.filter(a => a.status === s).length;
    return `
      <div class="analytics-bar-row">
        <div class="bar-label" style="text-transform:capitalize;">${s}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / total * 100)}%;background:${sColors[i]};"></div></div>
        <div class="bar-value" style="color:${sColors[i]};">${n}</div>
      </div>`;
  }).join("");

  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  const vals   = [3, 7, 5, 12, 8, 15, apps.length];
  const maxV   = Math.max(...vals) || 1;
  document.getElementById("analytics-chart").innerHTML = vals.map((v, i) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:11px;color:var(--text-muted);">${v}</div>
      <div style="flex:1;width:100%;background:${i === vals.length - 1 ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.15)"};border-radius:4px 4px 0 0;height:${Math.round(v / maxV * 100)}%"></div>
    </div>`
  ).join("");
  document.getElementById("analytics-labels").innerHTML = months.map(m =>
    `<div style="flex:1;text-align:center;">${m}</div>`
  ).join("");
}

/* ══════════════════════════════════════════
   DEPARTMENT APPLICATIONS (dept head)
   ══════════════════════════════════════════ */
async function loadDeptApps() {
  const apps = await Applications.getByDept(currentUser.dept);
  document.getElementById("dept-apps-title").textContent = (currentUser.dept || "") + " — Applications";
  document.getElementById("dept-apps-tbody").innerHTML = apps.length
    ? apps.map(a => `
        <tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${a.id}</td>
          <td style="font-weight:500;">${a.userName}</td>
          <td>${a.service}</td>
          <td>${a.date}</td>
          <td><span class="badge badge-${a.status}">${a.status.toUpperCase()}</span></td>
          <td>
            <button style="background:none;border:none;color:var(--accent2);cursor:pointer;font-size:12px;"
                    onclick="openStatus('${a.id}')">Update →</button>
          </td>
        </tr>`
    ).join("")
    : "<tr><td colspan=\"6\" style=\"text-align:center;color:var(--text-muted);padding:24px;\">No applications in your department.</td></tr>";
}

/* ── Status Update Modal ── */
function openStatus(id) {
  selectedAppId = id;
  document.getElementById("status-app-info").textContent = "Application: " + id;
  document.getElementById("status-modal").classList.add("show");
}

async function updateStatus() {
  const newStatus = document.getElementById("new-status").value;
  const remark    = document.getElementById("status-remark").value;
  const updated   = await Applications.updateStatus(selectedAppId, newStatus, remark);
  if (!updated) return;

  closeModal("status-modal");
  showToast("Status updated to " + updated.status, "success");
  updateStats();

  if (currentUser.role === "admin") loadAllApps();
  else loadDeptApps();
}

/* ══════════════════════════════════════════
   DEPARTMENT COMPLAINTS (dept head / admin)
   ══════════════════════════════════════════ */
async function loadDeptComplaints() {
  const comps = currentUser.role === "admin"
    ? await Complaints.getAll()
    : await Complaints.getByDept(currentUser.dept);

  document.getElementById("dept-complaints-list").innerHTML = comps.length
    ? comps.map(c => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:500;font-size:13px;">${c.subject}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${c.dept} · ${c.category}</div>
            <div style="font-size:12px;color:var(--text-muted);">${c.desc}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            <span class="badge badge-${c.status === "open" ? "pending" : "approved"}">${c.status.toUpperCase()}</span>
            <button style="font-size:11px;background:var(--bg-card2);border:1px solid var(--border);color:var(--green2);border-radius:6px;padding:4px 10px;cursor:pointer;"
                    onclick="resolveComplaint('${c.id}')">Mark Resolved</button>
          </div>
        </div>`
    ).join("")
    : "<div style=\"text-align:center;color:var(--text-muted);padding:24px;\">No complaints for this department.</div>";
}

async function resolveComplaint(id) {
  const resolved = await Complaints.resolve(id);
  if (resolved) {
    loadDeptComplaints();
    showToast("Complaint resolved", "success");
  }
}

/* ══════════════════════════════════════════
   WORK ASSIGNMENTS (admin)
   ══════════════════════════════════════════ */
async function loadAssignments() {
  const [pending, allUsers] = await Promise.all([
    Applications.getByStatus("pending"),
    Users.getAll()
  ]);
  const deptHeads = allUsers.filter(u => u.role === "department_head");

  document.getElementById("assignment-list").innerHTML = pending.length
    ? `<table class="data-table">
         <thead><tr>
           <th>App ID</th><th>Service</th><th>Department</th><th>Assign To</th><th>Action</th>
         </tr></thead>
         <tbody>
           ${pending.map(a => {
             const heads = deptHeads.filter(h => h.dept === a.dept);
             return `
               <tr>
                 <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${a.id}</td>
                 <td>${a.service}</td>
                 <td>${a.dept}</td>
                 <td>${heads.length
                   ? `<select class="form-select" style="width:auto;" id="assign-${a.id}">${heads.map(h => `<option>${h.name}</option>`).join("")}</select>`
                   : "<span style=\"color:var(--text-muted);\">No dept head</span>"
                 }</td>
                 <td>${heads.length
                   ? `<button style="background:var(--accent);color:white;border:none;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;"
                             onclick="showToast('Assigned successfully','success')">Assign</button>`
                   : ""
                 }</td>
               </tr>`;
           }).join("")}
         </tbody>
       </table>`
    : "<div style=\"text-align:center;color:var(--text-muted);padding:32px;\">No pending applications to assign.</div>";
}

/* ══════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════ */
(function init() {
  const session = Session.get();
  if (session) {
    document.getElementById("auth-page").style.display = "none";
    loadApp(session);
  } else {
    document.getElementById("auth-page").style.display = "flex";
  }
})();
