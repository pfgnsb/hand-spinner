import { Hono } from "hono";
import { Pinwheel } from "../durable-object/pinwheel.js";

export { Pinwheel };

var app = new Hono();

function store(c) {
  var id = c.env.PINWHEEL.idFromName("kazaguruma");
  return c.env.PINWHEEL.get(id);
}

app.all("/api/*", function (c) {
  return store(c).fetch(c.req.raw);
});

export default app;
