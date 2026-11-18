"""Serve the competition entry on a loopback address and open the browser.

Uses its own port (8890) and sends no-cache headers, so a browser that opened an older
version of 向阳而行 on another port never shows that version's cached map or scripts.

/api/weather returns the hourly forecast for 长安区太乙宫街道 read from 中国天气网
(see weather_feed.py).  The page cannot read that site directly from the browser, so the
local server reads it and hands the result over as JSON.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import json
import sys
import webbrowser

import weather_feed

VERSION = '校园导览展示版'


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/weather':
            return self.weather()
        return super().do_GET()

    def weather(self):
        try:
            data, fresh = weather_feed.get()
            status, body = 200, data
            if fresh:
                try:
                    weather_feed.write_snapshot(data)
                except OSError:
                    pass
        except Exception as error:  # offline, timeout, page layout changed
            status, body = 502, {'error': '没有取到天气预报：' + str(error)[:120]}
        payload = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    directory = Path(__file__).resolve().parent / "dist"
    handler = partial(NoCacheHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8890), handler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    with server:
        address = f"http://127.0.0.1:{server.server_port}/"
        print(f"向阳而行 {VERSION}  {address}\n天气预报：联网时自动读取中国天气网（太乙宫街道）。\n关闭此窗口即停止服务。", flush=True)
        if '--no-browser' not in sys.argv:
            Timer(0.4, webbrowser.open, args=(address,)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
