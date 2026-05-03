/**
 * server.js — SEVA Portal Backend
 * Express REST API with file-based JSON persistence.
 * Run: npm install express cors && node server.js
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from the same directory
app.use(express.static(path.join(__dirname)));

/* ══════════════════════════════════════════
   DATABASE (flat JSON file)
   ══════════════════════════════════════════ */
const DB_FILE = path.join(__dirname, "db.json");

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return null; }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Seed initial data if db.json doesn't exist
if (!fs.existsSync(DB_FILE)) {
  writeDB({
    users: [
      {
        id: "u1", name: "Rajesh Kumar", username: "citizen1",
        password: "pass123", role: "citizen",
        aadhar: "123456789012", mobile: "9876543210",
        email: "rajesh@email.com", dept: null
      },
      {
        id: "u2", name: "Priya Sharma", username: "depthead1",
        password: "dept123", role: "department_head",
        aadhar: "234567890123", mobile: "9876543211",
        email: "priya@gov.in", dept: "Revenue"
      },
      {
        id: "u3", name: "Admin Singh", username: "admin1",
        password: "admin123", role: "admin",
        aadhar: "345678901234", mobile: "9000000001",
        email: "admin@seva.gov.in", dept: null
      }
    ],
    applications: [
      {
        id: "APP-2024-001", userId: "u1", userName: "Rajesh Kumar",
        service: "Birth Certificate", dept: "Revenue",
        date: "2024-11-01", status: "approved", remark: "Verified and approved."
      },
      {
        id: "APP-2024-002", userId: "u1", userName: "Rajesh Kumar",
        service: "Income Certificate", dept: "Revenue",
        date: "2024-11-05", status: "pending", remark: ""
      },
      {
        id: "APP-2024-003", userId: "u1", userName: "Rajesh Kumar",
        service: "Domicile Certificate", dept: "Revenue",
        date: "2024-11-10", status: "processing", remark: "Under verification."
      }
    ],
    complaints: [
      {
        id: "CMP-001", userId: "u1", dept: "Municipal Corporation",
        category: "Infrastructure issue",
        subject: "Road pothole near main market",
        desc: "Large pothole causing accidents.",
        status: "open", date: "2024-11-08"
      }
    ],
    attempts: {}
  });
  console.log("✅ db.json seeded with demo data.");
}

/* ══════════════════════════════════════════
   AUTH ROUTES
   ══════════════════════════════════════════ */

// Register
app.post("/api/register", (req, res) => {
  const db = readDB();
  const { username, aadhar, password, name, mobile, email, role, dept } = req.body;

  if (!username || !password || !name || !aadhar || !role)
    return res.json({ ok: false, error: "Missing required fields." });

  if (db.users.find(u => u.username === username))
    return res.json({ ok: false, error: "username_taken" });

  if (db.users.find(u => u.aadhar === aadhar))
    return res.json({ ok: false, error: "aadhar_exists" });

  const newUser = {
    id: "u" + Date.now(),
    name, username, password, role,
    aadhar, mobile: mobile || "", email: email || "",
    dept: role === "department_head" ? (dept || null) : null
  };

  db.users.push(newUser);
  writeDB(db);
  res.json({ ok: true });
});

// Login
app.post("/api/login", (req, res) => {
  const db = readDB();
  const { loginId, password, role } = req.body;
  const key = (loginId || "").toLowerCase();
  const attempts = db.attempts || {};

  if ((attempts[key] || 0) >= 5)
    return res.json({ ok: false, error: "locked" });

  const user = db.users.find(
    u => (u.username === loginId || u.aadhar === loginId) &&
      u.password === password &&
      u.role === role
  );

  if (!user) {
    attempts[key] = (attempts[key] || 0) + 1;
    db.attempts = attempts;
    writeDB(db);
    const left = 5 - attempts[key];
    return res.json({ ok: false, error: "invalid", attemptsLeft: left });
  }

  attempts[key] = 0;
  db.attempts = attempts;
  writeDB(db);

  const { password: _pw, ...safeUser } = user;
  res.json({ ok: true, user: safeUser });
});

/* ══════════════════════════════════════════
   USER ROUTES
   ══════════════════════════════════════════ */

app.get("/api/users", (req, res) => {
  const db = readDB();
  const safe = db.users.map(({ password, ...u }) => u);
  res.json(safe);
});

app.get("/api/users/check-username", (req, res) => {
  const db = readDB();
  res.json({ exists: db.users.some(u => u.username === req.query.username) });
});

app.get("/api/users/check-aadhar", (req, res) => {
  const db = readDB();
  res.json({ exists: db.users.some(u => u.aadhar === req.query.aadhar) });
});

/* ══════════════════════════════════════════
   APPLICATION ROUTES
   ══════════════════════════════════════════ */

app.get("/api/applications", (req, res) => {
  const db = readDB();
  let apps = db.applications;
  if (req.query.userId) apps = apps.filter(a => a.userId === req.query.userId);
  if (req.query.dept)   apps = apps.filter(a => a.dept === req.query.dept);
  if (req.query.status) apps = apps.filter(a => a.status === req.query.status);
  res.json(apps);
});

app.post("/api/applications", (req, res) => {
  const db = readDB();
  const { userId, userName, service, dept, remark } = req.body;
  const newApp = {
    id: "APP-" + String(Date.now()).slice(-7),
    userId, userName, service, dept,
    date: new Date().toISOString().slice(0, 10),
    status: "pending",
    remark: remark || ""
  };
  db.applications.push(newApp);
  writeDB(db);
  res.json(newApp);
});

app.patch("/api/applications/:id", (req, res) => {
  const db = readDB();
  const idx = db.applications.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (req.body.status !== undefined)  db.applications[idx].status = req.body.status;
  if (req.body.remark !== undefined)  db.applications[idx].remark = req.body.remark;
  writeDB(db);
  res.json(db.applications[idx]);
});

/* ══════════════════════════════════════════
   COMPLAINT ROUTES
   ══════════════════════════════════════════ */

app.get("/api/complaints", (req, res) => {
  const db = readDB();
  let comps = db.complaints;
  if (req.query.userId) comps = comps.filter(c => c.userId === req.query.userId);
  if (req.query.dept)   comps = comps.filter(c => c.dept === req.query.dept);
  res.json(comps);
});

app.post("/api/complaints", (req, res) => {
  const db = readDB();
  const { userId, dept, category, subject, desc } = req.body;
  const newComp = {
    id: "CMP-" + String(Date.now()).slice(-4),
    userId, dept, category, subject, desc,
    status: "open",
    date: new Date().toISOString().slice(0, 10)
  };
  db.complaints.push(newComp);
  writeDB(db);
  res.json(newComp);
});

app.patch("/api/complaints/:id/resolve", (req, res) => {
  const db = readDB();
  const comp = db.complaints.find(c => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: "Not found" });
  comp.status = "resolved";
  writeDB(db);
  res.json(comp);
});

/* ══════════════════════════════════════════
   START
   ══════════════════════════════════════════ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🏛️  SEVA Portal running at http://localhost:${PORT}`);
  console.log(`   Demo logins:`);
  console.log(`     Citizen  → citizen1 / pass123`);
  console.log(`     Dept Head→ depthead1 / dept123`);
  console.log(`     Admin    → admin1 / admin123\n`);
});
