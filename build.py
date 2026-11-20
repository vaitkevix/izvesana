# Saliek index.html no Apps Script Index.html (lietotne) + ātrā savienojuma (Cloudflare) + sākuma ekrāna piedāvājuma.
# Palaid: python3 build.py   © VAITKEVIX, SIA
import re
app = open('apps-script/Index.html', encoding='utf-8').read()
old = open('apps-script/wrapper-old.html', encoding='utf-8').read()
API = 'https://aizvietosana-api.vaitkevix.workers.dev/izv'

head = '''
  <title>SH | Izvešanas pieteikumi</title>
  <meta name="theme-color" content="#0f6b5c">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Izvešana">
  <meta name="author" content="VAITKEVIX, SIA">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
  <link rel="apple-touch-icon" href="icon.png">
  <link rel="manifest" href="manifest.json">
  <link rel="preconnect" href="https://aizvietosana-api.vaitkevix.workers.dev">
  <script>
  /* Ātrā versija: google.script.run → Cloudflare (Google tabula paliek galvenā). © VAITKEVIX, SIA */
  (function () {
    var API = '%s';
    function call(fn, args, ok, fail, uo) {
      fetch(API + '?fn=' + encodeURIComponent(fn), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(args) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || 'Kļūda'); if (ok) ok(j.result, uo); })
        .catch(function (e) { if (fail) fail(e, uo); else console.error(e); });
    }
    function runner(ok, fail, uo) {
      return new Proxy({}, { get: function (_, name) {
        if (name === 'withSuccessHandler') return function (h) { return runner(h, fail, uo); };
        if (name === 'withFailureHandler') return function (h) { return runner(ok, h, uo); };
        if (name === 'withUserObject') return function (o) { return runner(ok, fail, o); };
        if (typeof name !== 'string' || name === 'then') return undefined;
        return function () { call(name, Array.prototype.slice.call(arguments), ok, fail, uo); };
      } });
    }
    var q = {}; new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; });
    window.google = window.google || {};
    google.script = { run: runner(), url: { getLocation: function (cb) { cb({ parameter: q, parameters: {}, hash: location.hash.slice(1) }); } }, host: { close: function () {}, setHeight: function () {} } };
  })();
  </script>''' % API

app = app.replace("'https:\\/\\/drive.google.com/thumbnail?id='", "'https://aizvietosana-api.vaitkevix.workers.dev/img?id='")
app = re.sub(r'\s*<title>[^<]*</title>', '', app, count=1)
app = app.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + head, 1)

# sākuma ekrāna piedāvājums no vecās ietvara lapas (bez iframe)
style = re.search(r'<style>([\s\S]*?)</style>', old).group(1)
style = style[style.index('/* ===== Pievienot'):]
script = re.search(r'<script>([\s\S]*?)</script>', old).group(1)
script = script[script.index('// ===== Pievienot'):]
app = app.replace('</body>', '<style>' + style + '</style>\n<script>' + script + '</script>\n</body>', 1)
open('index.html', 'w', encoding='utf-8').write(app)
print('index.html', len(app))
