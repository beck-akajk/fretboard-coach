#!/usr/bin/env python3
"""로컬 프렛 코치를 390x844 폰 화면으로 열어 스크린샷을 찍는 검사 스크립트.

사용: python3 tools/shot.py <출력폴더> [--gp3 파일] [--bars 1,7,8]
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8771


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "screenshots")
    gp3 = None
    if "--gp3" in sys.argv:
        gp3 = sys.argv[sys.argv.index("--gp3") + 1]
    os.makedirs(outdir, exist_ok=True)
    httpd = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append("console." + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.goto("http://127.0.0.1:%d/index.html" % PORT, wait_until="networkidle")
        if gp3:
            page.set_input_files("#fileInput", gp3)
            page.wait_for_timeout(1200)
        dbg = page.evaluate("FretCoach.debug()")
        print(json.dumps({k: dbg[k] for k in ("title", "bars", "events", "cur", "barChords", "curEvent")}, ensure_ascii=False, indent=1))
        page.screenshot(path=os.path.join(outdir, "00-full.png"), full_page=True)
        page.screenshot(path=os.path.join(outdir, "01-top.png"))
        print("errors:", errors, "jsErrors:", dbg.get("errors"))
        browser.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
