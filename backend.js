/**
 * backend.js — SEVA Portal
 * Lightweight localStorage "database" + all data-access functions.
 * No DOM touches here — purely data layer.
 */

/* ══════════════════════════════════════════
   STORAGE ADAPTER
   ══════════════════════════════════════════ */
const DB = {
  get(key) {
    try { return JSON.parse(localStorage.getItem('seva_' + key)); }
    catch (e) { return null; }
  },
  set(key, value) {
    localStorage.setItem('seva_' + key, JSON.stringify(value));
  },
  del(key) {
    localStorage.removeItem('seva_' + key);
  }
};

/* ══════════════════════════════════════════
   SEED DATA
   ══════════════════════════════════════════ */
function initDB() {
  if (!DB.get('users')) {
    DB.set('users', [
      {
        id: 'u1', name: 'Rajesh Kumar', username: 'citizen1',
        password: 'pass123', role: 'citizen',
        aadhar: '123456789012', mobile: '9876543210',
        email: 'rajesh@email.com', dept: null
      },
      {
        id: 'u2', name: 'Priya Sharma', username: 'depthead1',
        password: 'dept123', role: 'department_head',
        aadhar: '234567890123', mobile: '9876543211',
        email: 'priya@gov.in', dept: 'Revenue'
      },
      {
        id: 'u3', name: 'Admin Singh', username: 'admin1',
        password: 'admin123', role: 'admin',
        aadhar: '345678901234', mobile: '9000000001',
        email: 'admin@seva.gov.in', dept: null
      }
    ]);
  }

  if (!DB.get('applications')) {
    DB.set('applications', [
      {
        id: 'APP-2024-001', userId: 'u1', userName: 'Rajesh Kumar',
        service: 'Birth Certificate', dept: 'Revenue',
        date: '2024-11-01', status: 'approved', remark: 'Verified and approved.'
      },
      {
        id: 'APP-2024-002', userId: 'u1', userName: 'Rajesh Kumar',
        service: 'Income Certificate', dept: 'Revenue',
        date: '2024-11-05', status: 'pending', remark: ''
      },
      {
        id: 'APP-2024-003', userId: 'u1', userName: 'Rajesh Kumar',
        service: 'Domicile Certificate', dept: 'Revenue',
        date: '2024-11-10', status: 'processing', remark: 'Under verification.'
      }
    ]);
  }

  if (!DB.get('complaints')) {
    DB.set('complaints', [
      {
        id: 'CMP-001', userId: 'u1', dept: 'Municipal Corporation',
        category: 'Infrastructure issue',
        subject: 'Road pothole near main market',
        desc: 'Large pothole causing accidents.',
        status: 'open', date: '2024-11-08'
      }
    ]);
  }

  if (!DB.get('attempts')) DB.set('attempts', {});
}

/* ══════════════════════════════════════════
   SESSION
   ══════════════════════════════════════════ */
const Session = {
  get()        { return DB.get('session'); },
  set(user)    { DB.set('session', user); },
  clear()      { DB.del('session'); }
};

/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */
const Auth = {
  /** Returns { ok: true, user } or { ok: false, error, attemptsLeft } */
  login(loginId, password, role) {
    const attempts = DB.get('attempts') || {};
    const key = loginId.toLowerCase();

    if ((attempts[key] || 0) >= 5) {
      return { ok: false, error: 'locked' };
    }

    const users = DB.get('users') || [];
    const user = users.find(
      u => (u.username === loginId || u.aadhar === loginId) &&
           u.password === password &&
           u.role === role
    );

    if (!user) {
      attempts[key] = (attempts[key] || 0) + 1;
      DB.set('attempts', attempts);
      const left = 5 - attempts[key];
      return { ok: false, error: 'invalid', attemptsLeft: left };
    }

    // Success — reset counter
    attempts[key] = 0;
    DB.set('attempts', attempts);
    Session.set(user);
    return { ok: true, user };
  },

  logout() {
    Session.clear();
  }
};

/* ══════════════════════════════════════════
   USERS
   ══════════════════════════════════════════ */
const Users = {
  getAll()   { return DB.get('users') || []; },

  findById(id) {
    return this.getAll().find(u => u.id === id) || null;
  },

  create(data) {
    const users = this.getAll();
    const newUser = { id: 'u' + Date.now(), ...data };
    users.push(newUser);
    DB.set('users', users);
    return newUser;
  },

  usernameExists(username) {
    return this.getAll().some(u => u.username === username);
  },

  aadharExists(aadhar) {
    return this.getAll().some(u => u.aadhar === aadhar);
  }
};

/* ══════════════════════════════════════════
   APPLICATIONS
   ══════════════════════════════════════════ */
const Applications = {
  getAll()   { return DB.get('applications') || []; },

  getByUser(userId) {
    return this.getAll().filter(a => a.userId === userId);
  },

  getByDept(dept) {
    return this.getAll().filter(a => a.dept === dept);
  },

  getByStatus(status) {
    return this.getAll().filter(a => a.status === status);
  },

  findById(id) {
    return this.getAll().find(a => a.id === id) || null;
  },

  create({ userId, userName, service, dept, remark = '' }) {
    const apps = this.getAll();
    const newApp = {
      id: 'APP-' + String(Date.now()).slice(-7),
      userId, userName, service, dept,
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      remark
    };
    apps.push(newApp);
    DB.set('applications', apps);
    return newApp;
  },

  updateStatus(id, status, remark = '') {
    const apps = this.getAll();
    const idx = apps.findIndex(a => a.id === id);
    if (idx === -1) return null;
    apps[idx].status = status;
    apps[idx].remark = remark;
    DB.set('applications', apps);
    return apps[idx];
  },

  countByDept() {
    const apps = this.getAll();
    const result = {};
    apps.forEach(a => { result[a.dept] = (result[a.dept] || 0) + 1; });
    return result;
  },

  countByStatus() {
    const apps = this.getAll();
    const result = {};
    apps.forEach(a => { result[a.status] = (result[a.status] || 0) + 1; });
    return result;
  }
};

/* ══════════════════════════════════════════
   COMPLAINTS
   ══════════════════════════════════════════ */
const Complaints = {
  getAll()   { return DB.get('complaints') || []; },

  getByUser(userId) {
    return this.getAll().filter(c => c.userId === userId);
  },

  getByDept(dept) {
    return this.getAll().filter(c => c.dept === dept);
  },

  create({ userId, dept, category, subject, desc }) {
    const comps = this.getAll();
    const newComp = {
      id: 'CMP-' + String(Date.now()).slice(-4),
      userId, dept, category, subject, desc,
      status: 'open',
      date: new Date().toISOString().slice(0, 10)
    };
    comps.push(newComp);
    DB.set('complaints', comps);
    return newComp;
  },

  resolve(id) {
    const comps = this.getAll();
    const comp = comps.find(c => c.id === id);
    if (!comp) return null;
    comp.status = 'resolved';
    DB.set('complaints', comps);
    return comp;
  }
};

/* ══════════════════════════════════════════
   OTP HELPERS (stateless, no DOM)
   ══════════════════════════════════════════ */
const OTP = {
  _current: null,

  generate() {
    this._current = String(Math.floor(100000 + Math.random() * 900000));
    return this._current;
  },

  verify(input) {
    return input === this._current;
  },

  clear() {
    this._current = null;
  }
};

/* ══════════════════════════════════════════
   STATIC SERVICE CATALOGUE
   ══════════════════════════════════════════ */
const SERVICES = [
  { name: 'Birth Certificate',       dept: 'Revenue',   time: '7-10 days',  tag: 'Revenue',   desc: 'Official record of birth for citizens.' },
  { name: 'Death Certificate',       dept: 'Revenue',   time: '5-7 days',   tag: 'Revenue',   desc: 'Legal proof of death for deceased persons.' },
  { name: 'Income Certificate',      dept: 'Revenue',   time: '10-14 days', tag: 'Revenue',   desc: 'Proof of annual family income.' },
  { name: 'Domicile Certificate',    dept: 'Revenue',   time: '15 days',    tag: 'Revenue',   desc: 'Proof of residence in the state.' },
  { name: 'Caste Certificate',       dept: 'Revenue',   time: '15-20 days', tag: 'Revenue',   desc: 'Proof of social category for reservations.' },
  { name: 'Land Record',             dept: 'Revenue',   time: '3-5 days',   tag: 'Revenue',   desc: 'Certified copy of land ownership records.' },
  { name: 'Health Card',             dept: 'Health',    time: '3 days',     tag: 'Health',    desc: 'Ayushman Bharat health coverage card.' },
  { name: 'Medical Certificate',     dept: 'Health',    time: '5 days',     tag: 'Health',    desc: 'Fitness certificate for various purposes.' },
  { name: 'Scholarship Application', dept: 'Education', time: '20 days',    tag: 'Education', desc: 'Apply for state government scholarships.' },
  { name: 'School Transfer Certificate', dept: 'Education', time: '7 days', tag: 'Education', desc: 'TC for school change or migration.' },
  { name: 'Driving License',         dept: 'Transport', time: '30 days',    tag: 'Transport', desc: 'Apply for new or renewal of DL.' },
  { name: 'Vehicle Registration',    dept: 'Transport', time: '15 days',    tag: 'Transport', desc: 'Register new vehicle or transfer RC.' },
  { name: 'Trade License',           dept: 'Municipal', time: '21 days',    tag: 'Municipal', desc: 'License for operating a business.' },
  { name: 'Building Permit',         dept: 'Municipal', time: '45 days',    tag: 'Municipal', desc: 'Approval for construction activity.' },
  { name: 'Property Tax',            dept: 'Municipal', time: '1 day',      tag: 'Municipal', desc: 'Pay and get receipt for property tax.' }
];
