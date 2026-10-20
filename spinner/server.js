var http = require("node:http");
var fs = require("node:fs");
var path = require("node:path");

var host = "127.0.0.1";
var port = 3000;
var file = path.join(__dirname, "index.html");

var server = http.createServer(function (req, res) {
  var pathname = "/";
  try {
    pathname = new URL(req.url, "http://127.0.0.1").pathname;
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  if (req.method !== "GET" || (pathname !== "/" && pathname !== "/index.html")) {
    var status = req.method === "GET" ? 404 : 405;
    var message = status === 404 ? "Not Found" : "Method Not Allowed";
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
    return;
  }

  fs.readFile(file, function (err, body) {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length
    });
    res.end(body);
  });
});

server.on("error", function (err) {
  console.error(err.message);
  process.exit(1);
});

server.listen(port, host, function () {
  console.log("http://" + host + ":" + port);
});
