import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

var SPIN = 0.36;
var SESSION_MS = 7 * 24 * 60 * 60 * 1000;
var PBKDF2_ITERATIONS = 100000;

export class Pinwheel extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
    this.app = this.routes();
  }

  migrate() {
    var info = this.sql.exec("PRAGMA table_info(pinwheel)").toArray();
    var names = info.map(function (col) {
      return col.name;
    });
    if (names.indexOf("id") !== -1 && names.indexOf("user_id") === -1) {
      this.sql.exec("DROP TABLE pinwheel");
    }
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS users (" +
        "id INTEGER PRIMARY KEY, " +
        "name TEXT NOT NULL UNIQUE, " +
        "salt TEXT NOT NULL, " +
        "password_hash TEXT NOT NULL" +
      ")"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (" +
        "token TEXT PRIMARY KEY, " +
        "user_id INTEGER NOT NULL, " +
        "expires_at INTEGER NOT NULL, " +
        "FOREIGN KEY (user_id) REFERENCES users(id)" +
      ")"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS pinwheel (" +
        "user_id INTEGER PRIMARY KEY, " +
        "angle REAL NOT NULL, " +
        "omega REAL NOT NULL, " +
        "speed REAL NOT NULL, " +
        "FOREIGN KEY (user_id) REFERENCES users(id)" +
      ")"
    );
  }

  routes() {
    var self = this;
    var app = new Hono();

    app.post("/api/register", function (c) {
      return self.register(c);
    });
    app.all("/api/register", function (c) {
      return c.json({ error: "method" }, 405);
    });

    app.post("/api/login", function (c) {
      return self.login(c);
    });
    app.all("/api/login", function (c) {
      return c.json({ error: "method" }, 405);
    });

    app.post("/api/logout", function (c) {
      return self.logout(c);
    });
    app.all("/api/logout", function (c) {
      return c.json({ error: "method" }, 405);
    });

    app.get("/api/me", function (c) {
      return self.me(c);
    });
    app.all("/api/me", function (c) {
      return c.json({ error: "method" }, 405);
    });

    app.get("/api/state", function (c) {
      return self.getState(c);
    });
    app.put("/api/state", function (c) {
      return self.putState(c);
    });
    app.all("/api/state", function (c) {
      return c.json({ error: "method" }, 405);
    });

    app.all("/api/*", function (c) {
      return c.json({ error: "not_found" }, 404);
    });
    return app;
  }

  fetch(request) {
    return this.app.fetch(request);
  }

  async register(c) {
    var body = await readJson(c);
    var name = body && body.name;
    var password = body && body.password;
    if (!validName(name) || !validPassword(password)) {
      return c.json({ error: "invalid" }, 400);
    }
    var existing = this.sql.exec("SELECT id FROM users WHERE name = ?", name).toArray();
    if (existing.length > 0) {
      return c.json({ error: "taken" }, 409);
    }
    var salt = randomHex(16);
    var passwordHash = await hashPassword(password, salt);
    this.sql.exec(
      "INSERT INTO users (name, salt, password_hash) VALUES (?, ?, ?)",
      name,
      salt,
      passwordHash
    );
    var created = this.sql.exec("SELECT id FROM users WHERE name = ?", name).toArray()[0];
    this.sql.exec(
      "INSERT INTO pinwheel (user_id, angle, omega, speed) VALUES (?, -15, 0, 1)",
      created.id
    );
    this.startSession(c, created.id);
    return c.json({ name: name }, 201);
  }

  async login(c) {
    var body = await readJson(c);
    var name = body && body.name;
    var password = body && body.password;
    if (!validName(name) || !validPassword(password)) {
      return c.json({ error: "invalid" }, 400);
    }
    var rows = this.sql.exec(
      "SELECT id, salt, password_hash FROM users WHERE name = ?",
      name
    ).toArray();
    if (rows.length === 0) {
      return c.json({ error: "unauthorized" }, 401);
    }
    var passwordHash = await hashPassword(password, rows[0].salt);
    if (!safeEqual(passwordHash, rows[0].password_hash)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    this.startSession(c, rows[0].id);
    return c.json({ name: name }, 200);
  }

  logout(c) {
    var token = getCookie(c, "session");
    if (token) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
    }
    deleteCookie(c, "session", { path: "/" });
    return c.body(null, 204);
  }

  me(c) {
    var user = this.currentUser(c);
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.json({ name: user.name }, 200);
  }

  getState(c) {
    var user = this.currentUser(c);
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.json(this.read(user.id), 200);
  }

  async putState(c) {
    var user = this.currentUser(c);
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    var body;
    try {
      body = await c.req.json();
    } catch (err) {
      return c.json({ error: "invalid" }, 400);
    }
    var next = normalize(body);
    if (!next) {
      return c.json({ error: "invalid" }, 400);
    }
    this.sql.exec(
      "UPDATE pinwheel SET angle = ?, omega = ?, speed = ? WHERE user_id = ?",
      next.angle,
      next.omega,
      next.speed,
      user.id
    );
    return c.json(this.read(user.id), 200);
  }

  read(userId) {
    var rows = this.sql.exec(
      "SELECT angle, omega, speed FROM pinwheel WHERE user_id = ?",
      userId
    ).toArray();
    return rows[0];
  }

  currentUser(c) {
    var token = getCookie(c, "session");
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return null;
    }
    this.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", Date.now());
    var rows = this.sql.exec(
      "SELECT users.id AS id, users.name AS name FROM sessions INNER JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?",
      token
    ).toArray();
    return rows[0] || null;
  }

  startSession(c, userId) {
    var token = randomHex(32);
    this.sql.exec(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
      token,
      userId,
      Date.now() + SESSION_MS
    );
    setCookie(c, "session", token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MS / 1000
    });
  }
}

function validName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(name);
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 64;
}

async function readJson(c) {
  try {
    return await c.req.json();
  } catch (err) {
    return null;
  }
}

function randomHex(byteLength) {
  var bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  var hex = "";
  var i;
  for (i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex) {
  var out = new Uint8Array(hex.length / 2);
  var i;
  for (i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function hashPassword(password, saltHex) {
  var key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  var bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  var diff = 0;
  var i;
  for (i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function normalize(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  var angle = Number(body.angle);
  var omega = Number(body.omega);
  var speed = Number(body.speed);
  if (!Number.isFinite(angle) || Math.abs(angle) > 10000000) {
    return null;
  }
  var canonical = null;
  if (omega === 0) {
    canonical = 0;
  } else if (Math.abs(omega - SPIN) < 0.000001) {
    canonical = SPIN;
  } else if (Math.abs(omega + SPIN) < 0.000001) {
    canonical = -SPIN;
  }
  if (canonical === null || (speed !== 1 && speed !== 2)) {
    return null;
  }
  return { angle: angle, omega: canonical, speed: speed };
}
