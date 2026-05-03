/**
 * backend.js — SEVA Portal
 * Data-access layer — now backed by the Express REST API instead of localStorage.
 * All functions return Promises. app.js awaits them.
 *
 * Base URL auto-detects: same origin when served via Express,
 * or override with window.SEVA_API if needed.
 */

const API = window.SEVA_API || "";   // e.g. "" → same origin (http://localhost:5000)

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

/* ══════════════════════════════════════════
   SESSION  (still in sessionStorage — lightweight client state)
   ══════════════════════════════════════════ */
const Session = {
  get() {
    try { return JSON.parse(sessionStorage.getItem("seva_session")); }
    catch { return null; }
  },
  set(user) { sessionStorage.setItem("seva_session", JSON.stringify(user)); },
  clear()   { sessionStorage.removeItem("seva_session"); }
};

/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */
const Auth = {
  async login(loginId, password, role) {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: { loginId, password, role }
    });
    if (data.ok) Session.set(data.user);
    return data;
  },
  logout() { Session.clear(); }
};

/* ══════════════════════════════════════════
   USERS
   ══════════════════════════════════════════ */
const Users = {
  async getAll()             { return apiFetch("/api/users"); },
  async usernameExists(u)    { const r = await apiFetch("/api/users/check-username?username=" + encodeURIComponent(u)); return r.exists; },
  async aadharExists(a)      { const r = await apiFetch("/api/users/check-aadhar?aadhar=" + encodeURIComponent(a)); return r.exists; },
  async create(data)         { return apiFetch("/api/register", { method: "POST", body: data }); }
};

/* ══════════════════════════════════════════
   APPLICATIONS
   ══════════════════════════════════════════ */
const Applications = {
  async getAll()             { return apiFetch("/api/applications"); },
  async getByUser(userId)    { return apiFetch("/api/applications?userId=" + encodeURIComponent(userId)); },
  async getByDept(dept)      { return apiFetch("/api/applications?dept=" + encodeURIComponent(dept)); },
  async getByStatus(status)  { return apiFetch("/api/applications?status=" + encodeURIComponent(status)); },
  async findById(id)         { const all = await this.getAll(); return all.find(a => a.id === id) || null; },

  async create({ userId, userName, service, dept, remark = "" }) {
    return apiFetch("/api/applications", {
      method: "POST",
      body: { userId, userName, service, dept, remark }
    });
  },

  async updateStatus(id, status, remark = "") {
    return apiFetch("/api/applications/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status, remark }
    });
  },

  // Synchronous-style helpers used only in analytics — fetch first, then call
  async countByDept() {
    const apps = await this.getAll();
    const result = {};
    apps.forEach(a => { result[a.dept] = (result[a.dept] || 0) + 1; });
    return result;
  },

  async countByStatus() {
    const apps = await this.getAll();
    const result = {};
    apps.forEach(a => { result[a.status] = (result[a.status] || 0) + 1; });
    return result;
  }
};

/* ══════════════════════════════════════════
   COMPLAINTS
   ══════════════════════════════════════════ */
const Complaints = {
  async getAll()          { return apiFetch("/api/complaints"); },
  async getByUser(userId) { return apiFetch("/api/complaints?userId=" + encodeURIComponent(userId)); },
  async getByDept(dept)   { return apiFetch("/api/complaints?dept=" + encodeURIComponent(dept)); },

  async create({ userId, dept, category, subject, desc }) {
    return apiFetch("/api/complaints", {
      method: "POST",
      body: { userId, dept, category, subject, desc }
    });
  },

  async resolve(id) {
    return apiFetch("/api/complaints/" + encodeURIComponent(id) + "/resolve", {
      method: "PATCH",
      body: {}
    });
  }
};

/* ══════════════════════════════════════════
   OTP HELPERS (client-side only — no DOM)
   ══════════════════════════════════════════ */
const OTP = {
  _current: null,
  generate() {
    this._current = String(Math.floor(100000 + Math.random() * 900000));
    return this._current;
  },
  verify(input) { return input === this._current; },
  clear()       { this._current = null; }
};

/* ══════════════════════════════════════════
   STATIC SERVICE CATALOGUE
   ══════════════════════════════════════════ */
const SERVICES = [
  { name: "Birth Certificate",       dept: "Revenue",   time: "7-10 days",  tag: "Revenue",   desc: "Official record of birth for citizens." },
  { name: "Death Certificate",       dept: "Revenue",   time: "5-7 days",   tag: "Revenue",   desc: "Legal proof of death for deceased persons." },
  { name: "Income Certificate",      dept: "Revenue",   time: "10-14 days", tag: "Revenue",   desc: "Proof of annual family income." },
  { name: "Domicile Certificate",    dept: "Revenue",   time: "15 days",    tag: "Revenue",   desc: "Proof of residence in the state." },
  { name: "Caste Certificate",       dept: "Revenue",   time: "15-20 days", tag: "Revenue",   desc: "Proof of social category for reservations." },
  { name: "Land Record",             dept: "Revenue",   time: "3-5 days",   tag: "Revenue",   desc: "Certified copy of land ownership records." },
  { name: "Health Card",             dept: "Health",    time: "3 days",     tag: "Health",    desc: "Ayushman Bharat health coverage card." },
  { name: "Medical Certificate",     dept: "Health",    time: "5 days",     tag: "Health",    desc: "Fitness certificate for various purposes." },
  { name: "Scholarship Application", dept: "Education", time: "20 days",    tag: "Education", desc: "Apply for state government scholarships." },
  { name: "School Transfer Certificate", dept: "Education", time: "7 days", tag: "Education", desc: "TC for school change or migration." },
  { name: "Driving License",         dept: "Transport", time: "30 days",    tag: "Transport", desc: "Apply for new or renewal of DL." },
  { name: "Vehicle Registration",    dept: "Transport", time: "15 days",    tag: "Transport", desc: "Register new vehicle or transfer RC." },
  { name: "Trade License",           dept: "Municipal", time: "21 days",    tag: "Municipal", desc: "License for operating a business." },
  { name: "Building Permit",         dept: "Municipal", time: "45 days",    tag: "Municipal", desc: "Approval for construction activity." },
  { name: "Property Tax",            dept: "Municipal", time: "1 day",      tag: "Municipal", desc: "Pay and get receipt for property tax." }
];
