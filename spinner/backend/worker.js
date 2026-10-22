import { Pinwheel } from "../durable-object/pinwheel.js";

export { Pinwheel };

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    if (url.pathname !== "/api/state") {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    var id = env.PINWHEEL.idFromName("nsb");
    var stub = env.PINWHEEL.get(id);
    return stub.fetch(request);
  }
};
