import { DurableObject } from "cloudflare:workers";

var SPIN = 0.36;

export class Pinwheel extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS pinwheel (" +
        "id INTEGER PRIMARY KEY CHECK (id = 1), " +
        "angle REAL NOT NULL, " +
        "omega REAL NOT NULL, " +
        "speed REAL NOT NULL" +
      ")"
    );
    var rows = this.sql.exec("SELECT id FROM pinwheel WHERE id = 1").toArray();
    if (rows.length === 0) {
      this.sql.exec(
        "INSERT INTO pinwheel (id, angle, omega, speed) VALUES (1, -15, 0, 1)"
      );
    }
  }

  read() {
    var rows = this.sql.exec(
      "SELECT angle, omega, speed FROM pinwheel WHERE id = 1"
    ).toArray();
    return rows[0];
  }

  async fetch(request) {
    if (request.method === "GET") {
      return Response.json(this.read());
    }
    if (request.method !== "PUT") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    var body;
    try {
      body = await request.json();
    } catch (err) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }

    var next = normalize(body);
    if (!next) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }

    this.sql.exec(
      "UPDATE pinwheel SET angle = ?, omega = ?, speed = ? WHERE id = 1",
      next.angle,
      next.omega,
      next.speed
    );
    return Response.json(this.read());
  }
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
