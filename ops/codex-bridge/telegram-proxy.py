"""Loopback-only Telegram Bot API relay, reached through the SSH tunnel.

No retries: sendMessage/sendPhoto must not be duplicated after ambiguous failures.
Never log request paths, bodies or upstream exceptions (they contain bot tokens).
"""
import http.client
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 20 * 1024 * 1024
BOT_PATH = re.compile(r"/bot[0-9]+:[A-Za-z0-9_-]+/[A-Za-z][A-Za-z0-9]*\Z")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def relay(self):
        self.connection.settimeout(30)
        if not BOT_PATH.fullmatch(self.path):
            return self.reply(404, b'{"ok":false,"description":"Invalid bot path"}')
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400, b'{"ok":false}')
        if self.headers.get("Transfer-Encoding") or not 0 <= length <= MAX_BODY:
            return self.reply(413, b'{"ok":false}')
        upstream = http.client.HTTPSConnection("api.telegram.org", timeout=18)
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                return self.reply(400, b'{"ok":false}')
            upstream.request(self.command, self.path, body=body, headers={
                "Content-Type": self.headers.get("Content-Type", "application/json")
            })
            response = upstream.getresponse()
            payload = response.read()
            self.reply(response.status, payload, response.getheader("Content-Type", "application/json"))
        except (OSError, http.client.HTTPException):
            self.reply(502, b'{"ok":false,"description":"Telegram upstream connection failed"}')
        finally:
            upstream.close()

    do_GET = relay
    do_POST = relay


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8788), Handler).serve_forever()
