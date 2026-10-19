// persist.js -- where the party is kept.
//
// Always in this browser (localStorage). On the published page, when the
// viewer is signed in, also in a private document in the artifact's store
// (data/users/<id>/party), so the same party opens on every device. The
// newer copy wins when the page opens or comes back into view.
// A file saved from the party sheet is the copy nobody can clear.

const KEY = "dice-and-damage:web:v1";

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o.state === "string" ? o : null;
  } catch {
    return null;
  }
}

export function saveLocal(state, savedAt) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt, state }));
    return true;
  } catch {
    return false;
  }
}

export class AccountSync {
  constructor() {
    this.ref = null;
    this.status = "local";          // "local" | "connecting" | "account" | "error"
    this.pending = null;
    this.writing = false;
    this.lastRemote = 0;
    this.onStatus = null;
  }

  async connect() {
    const c = window.claude;
    if (!c || typeof c.use !== "function") return false;
    this.setStatus("connecting");
    try {
      const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
      if (!db || !user) { this.setStatus("local"); return false; }
      const id = await user.id();
      if (!id) { this.setStatus("local"); return false; }
      this.ref = db.doc(`data/users/${id}/party`);
      this.setStatus("account");
      return true;
    } catch {
      this.setStatus("local");
      return false;
    }
  }

  setStatus(s) {
    this.status = s;
    if (this.onStatus) this.onStatus(s);
  }

  /** The account copy, or null. */
  async fetch() {
    if (!this.ref) return null;
    try {
      const snap = await this.ref.get();
      if (!snap.exists) return null;
      const d = snap.data();
      if (!d || typeof d.state !== "string" || typeof d.savedAt !== "number") return null;
      this.lastRemote = Math.max(this.lastRemote, d.savedAt);
      return d;
    } catch {
      return null;
    }
  }

  /** Queues a write; only the newest waiting state is sent, one at a time. */
  save(state, savedAt) {
    if (!this.ref) return;
    this.pending = { state, savedAt };
    if (!this.writing) this.flush();
  }

  async flush() {
    while (this.pending) {
      const job = this.pending;
      this.pending = null;
      this.writing = true;
      try {
        await this.ref.set(job);
        this.lastRemote = job.savedAt;
        if (this.status !== "account") this.setStatus("account");
      } catch (e) {
        const code = e && e.code;
        if (code === "unavailable") {
          await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
          if (!this.pending) this.pending = job;
        } else {
          // Read-only, over quota or revoked: keep the browser copy only.
          this.ref = null;
          this.setStatus("error");
        }
      }
      this.writing = false;
    }
  }
}
