// A tunnel may append the same scheme already supplied by Expo Go. Metro uses
// this header as a URL scheme and cannot accept the resulting comma-separated list.
function withForwardedProtocol(middleware) {
  return (request, response, next) => {
    const raw = request.headers["x-forwarded-proto"];
    if (raw !== undefined) {
      const values = (Array.isArray(raw) ? raw : [raw])
        .flatMap((value) => (typeof value === "string" ? value.split(",") : [""]))
        .map((value) => value.trim().toLowerCase());
      if (
        values.length === 0 ||
        values.some((value) => value !== "http" && value !== "https") ||
        values.some((value) => value !== values[0])
      ) {
        response.statusCode = 400;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Invalid forwarded protocol");
        return;
      }
      request.headers["x-forwarded-proto"] = values[0];
    }
    return middleware(request, response, next);
  };
}
module.exports = { withForwardedProtocol };
