"""Exercise real local YAML parsing, worker comparison and downloads at a subpath."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, re, shutil, tempfile, threading
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main():
    screenshots=ROOT/'browser-checks';screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT/'dist',Path(temporary)/'composediff')
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1280,'height':1000});errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/composediff/')
                expect(page.locator('#compare')).to_be_enabled()
                page.locator('#example').select_option('0');page.locator('#load-example').click()
                expect(page.locator('#status')).to_contain_text('6 structural changes')
                assert page.locator('.change-card').count()==6
                page.locator('#filter-category').select_option('ports');assert page.locator('.change-card').count()==1
                assert '[hidden]' in page.locator('#changes').inner_text()
                with page.expect_download() as event: page.locator('#save-json').click()
                data=json.loads(Path(event.value.path()).read_text());assert data['valuesIncluded'] is False;assert all(c['after'] in (None,'[hidden]') for c in data['changes'])
                page.locator('#reveal').check();expect(page.locator('#changes')).to_contain_text('127.0.0.1:8080:80')
                page.locator('#after').fill('services: [bad]');expect(page.locator('#save-json')).to_be_disabled();page.locator('#compare').click()
                expect(page.locator('#status')).to_contain_text('previous result is unchanged')
                page.locator('#example').select_option('1');page.locator('#load-example').click();expect(page.locator('#status')).to_contain_text('0 structural changes')
                page.locator('#tab-convert').click();page.locator('#command').fill('docker run -p 8080:80 --name local-web nginx:1.28');page.locator('#service-name').fill('frontend');page.locator('#convert').click()
                expect(page.locator('#convert-status')).to_contain_text('Draft created');expect(page.locator('#converted')).to_have_value(re.compile(r'frontend:'))
                with page.expect_download() as event:page.locator('#save-yaml').click()
                assert 'nginx:1.28' in Path(event.value.path()).read_text()
                page.locator('#command').fill('docker run --not-supported nginx');page.locator('#convert').click();expect(page.locator('#convert-status')).to_contain_text('Unsupported option');expect(page.locator('#save-yaml')).to_be_disabled()
                page.locator('#tab-compare').click();page.locator('#example').select_option('0');page.locator('#load-example').click();expect(page.locator('#status')).to_contain_text('6 structural changes')
                page.locator('#filter-category').select_option('');page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                assert not errors,errors;browser.close()
            print('Browser checks passed: worker YAML comparison, redacted export, filters, stale result, converter and mobile layout')
        finally: server.shutdown()
if __name__=='__main__': main()
