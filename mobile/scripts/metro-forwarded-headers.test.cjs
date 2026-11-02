const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { withForwardedProtocol } = require("./metro-forwarded-headers.cjs");

function invoke(header) {
  const request = {
    url: "/entry.bundle?platform=ios&dev=false",
    headers: { host: "preview.example.test", authorization: "synthetic-only" },
  };
  if (header !== undefined) request.headers["x-forwarded-proto"] = header;
  let called = false;
  const response = { statusCode: 200, setHeader() {}, end() {} };
  withForwardedProtocol((req, res, next) => {
    called = true;
    assert.equal(req.url, "/entry.bundle?platform=ios&dev=false");
    assert.equal(req.headers.host, "preview.example.test");
    assert.equal(req.headers.authorization, "synthetic-only");
    assert.equal(next, "original-next");
  })(request, response, "original-next");
  return { request, response, called };
}

test("sin cabecera reenviada conserva la petición", () => {
  const result = invoke();
  assert.equal(result.called, true);
  assert.equal(result.request.headers["x-forwarded-proto"], undefined);
});
for (const [header, expected] of [
  ["http", "http"],
  ["https", "https"],
  ["https, https", "https"],
  [" HTTPS , https ", "https"],
  [["https", "https"], "https"],
])
  test(`protocolo coincidente ${JSON.stringify(header)}`, () => {
    const result = invoke(header);
    assert.equal(result.called, true);
    assert.equal(result.request.headers["x-forwarded-proto"], expected);
  });
for (const header of ["", "https,", "http, https", "javascript", "https://host", ["https", "http"]])
  test(`rechaza protocolo inválido ${JSON.stringify(header)} sin llegar a Metro`, () => {
    const result = invoke(header);
    assert.equal(result.called, false);
    assert.equal(result.response.statusCode, 400);
  });

test("HTTP real: cabecera duplicada del teléfono produce una URL válida", async () => {
  const server = http.createServer(
    withForwardedProtocol((req, res) => {
      const url = new URL(req.url, req.headers["x-forwarded-proto"] + "://" + req.headers.host);
      res.end(JSON.stringify({ protocol: url.protocol, path: url.pathname, query: url.search }));
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.get(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path: "/node_modules/expo-router/entry.bundle?platform=ios&dev=false",
          headers: { "x-forwarded-proto": ["https", "https"] },
        },
        (res) => {
          let body = "";
          res.on("data", (part) => (body += part));
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        },
      );
      req.on("error", reject);
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      protocol: "https:",
      path: "/node_modules/expo-router/entry.bundle",
      query: "?platform=ios&dev=false",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
