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
        .then(function (j) { if (j.notices) notices(j.notices); if (!j.ok) throw new Error(j.error || 'Kļūda'); if (ok) ok(j.result, uo); })
        .catch(function (e) { if (fail) fail(e, uo); else console.error(e); });
    }
    // Ja Google noraidīja fonā saglabātu darbību — parāda vienreiz
    function notices(list) {
      var seen = {}; try { seen = JSON.parse(localStorage.getItem('izv_seen') || '{}'); } catch (e) {}
      list.forEach(function (n) { if (seen[n.id]) return; seen[n.id] = 1; setTimeout(function () { if (window.toast) toast(n.text, 'err'); else alert(n.text); }, 800); });
      try { localStorage.setItem('izv_seen', JSON.stringify(seen)); } catch (e) {}
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

# ===== Kopējās funkcijas (kā Aizvietošanā): ieeja ar PIN, izvēlne, pamācība soli pa solim =====
import hashlib
addon = open('sh-addon.js', encoding='utf-8').read()
ver = hashlib.sha1(addon.encode()).hexdigest()[:8]
shx = '''<script>
window.SHX = {
  app: 'izv', title: 'SH | Izvešanas pieteikumi', api: 'https://aizvietosana-api.vaitkevix.workers.dev',
  sub: 'Ievadiet savu PIN kodu vai SIA paroli',
  hint: 'Pieteicēji — tas pats PIN, kas Aizvietošanā. Izvedēji — savas SIA parole.',
  tabSel: '#tabs .tab',
  tabsFor: function (u) { return u.kind === 'admin' ? ['new-task', 'task-list', 'carrier', 'analytics'] : u.kind === 'izvedejs' ? ['carrier', 'task-list'] : ['new-task', 'task-list', 'analytics']; },
  homeTab: function (u) { return u.kind === 'izvedejs' ? 'carrier' : 'new-task'; },
  switchTab: function (t) { switchTab(t); },
  closeMenu: function () { closeHelp(); },
  a2hs: function () { a2hsAsk(); },
  onUser: function (u, fresh) {
    if (u.kind === 'izvedejs' && u.carrierPin) {
      try { localStorage.setItem('carrierPin', u.carrierPin); localStorage.setItem('carrierUser', u.name); } catch (e) {}
      if (state.pin !== u.carrierPin) { state.pin = u.carrierPin; state.unlocked = true; state.access = null; try { renderCarrierList(); } catch (e) {} }
      if (state.tab !== 'carrier') switchTab('carrier');
    }
    if (u.kind === 'pieteicejs' || u.kind === 'admin') shxReq(u);
    if (typeof moveTabInd === 'function') setTimeout(moveTabInd, 50);
  },
  onOut: function (u) { if (u && u.kind === 'izvedejs') try { lockCarrier(); } catch (e) {} },
  tours: {
    pieteicejs: [
      { title: 'Sveiki!', text: 'Īsa pamācība, kā pieteikt izvešanu. Aizņems pusminūti.' },
      { sel: '#tabs', title: 'Cilnes', text: 'Jauns — pieteikt izvešanu. Saraksts — visi pieteikumi un to statuss. Statistika — kopsavilkums.' },
      { sel: '#aiMsgBtn', tab: 'new-task', title: 'Pieteikt ar AI', text: 'Ielīmējiet vai nodiktējiet ziņu — forma aizpildīsies pati.' },
      { sel: '#dz-new', tab: 'new-task', title: 'Bilde pirms', text: 'Nofotografējiet, kas jāizved. Bilde ir obligāta, datums un adrese uzliksies pati.' },
      { sel: '#addrCombo', tab: 'new-task', title: 'Adrese', text: 'Sāciet rakstīt adresi vai izvēlieties tuvāko. Nesen lietotās ir zem lauka.' },
      { sel: '#requester', tab: 'new-task', title: 'Pasūtītājs', text: 'Jūsu vārds ir aizpildīts automātiski.' },
      { sel: '#kindSeg', tab: 'new-task', title: 'Ko izvest', text: 'Lapas, zari vai bio. Lapām norādiet aptuveno maisu skaitu.' },
      { sel: 'label:has(#urgent), #urgent', tab: 'new-task', title: 'Steidzami', text: 'Ieslēdziet, ja vajag ātri — izvedējs to redzēs saraksta augšā.' },
      { sel: '#submitBtn', tab: 'new-task', title: 'Nosūtīt', text: 'Pieteikums saglabājas uzreiz, arī ar vāju internetu.' },
      { sel: '#searchInput', tab: 'task-list', title: 'Saraksts', text: 'Meklējiet pēc adreses, pasūtītāja vai ID un sekojiet statusam.' },
      { sel: '.help-btn', tab: 'new-task', title: 'Izvēlne', text: 'Šeit ir pamācība, pievienošana sākuma ekrānam un iziešana.' },
      { title: 'Viss gatavs!', text: 'Veiksmīgu darbu!' }
    ],
    izvedejs: [
      { title: 'Sveiki!', text: 'Īsa pamācība izvedējam. Aizņems pusminūti.' },
      { sel: '#carrierContainer', tab: 'carrier', title: 'Jūsu darbi', text: 'Šeit ir visi neizpildītie pieteikumi. Steidzamie — augšā.' },
      { sel: '#carrierContainer .card, #carrierContainer', tab: 'carrier', title: 'Atzīmēt izpildītu', text: 'Atveriet pieteikumu, pievienojiet bildi pēc un norādiet apjomu, tad spiediet Izpildīts.' },
      { sel: '[data-tab="task-list"]', title: 'Saraksts', text: 'Visi pieteikumi un to vēsture.' },
      { sel: '.help-btn', tab: 'carrier', title: 'Izvēlne', text: 'Pamācība, pievienošana sākuma ekrānam un iziešana.' },
      { title: 'Viss gatavs!', text: 'Veiksmīgu darbu!' }
    ]
  }
};
window.SHX.tours.admin = window.SHX.tours.pieteicejs.slice(0, -2).concat([
  { sel: '[data-tab="carrier"]', title: 'Izvedējs', text: 'Izvedēju skats — atzīmē izpildītos pieteikumus.' },
  { sel: '[data-tab="analytics"]', title: 'Statistika', text: 'Kopsavilkums pa mēnešiem un izvedējiem.' }
]).concat(window.SHX.tours.pieteicejs.slice(-2));
/* Pasūtītāja vārds no PIN: atrod sarakstā (arī ar uzvārdu), vadītājam nomaināms nav */
function shxReq(u) {
  var sel = document.getElementById('requester'); if (!sel) return;
  var n = String(u.name || '').toLowerCase(), opts = [].slice.call(sel.options);
  var o = opts.find(function (x) { return x.value.toLowerCase() === n; }) || opts.find(function (x) { return x.value && x.value.toLowerCase().indexOf(n) === 0; });
  if (!o && sel.options.length > 1) { o = new Option(u.name, u.name); sel.add(o); }
  if (o) sel.value = o.value;
  sel.disabled = u.kind !== 'admin' && !!o;
}
(function () {
  var sd = window.setupDropdowns; if (sd) window.setupDropdowns = function () { var r = sd.apply(this, arguments); var u = window.SHXR && SHXR.user(); if (u && u.kind !== 'izvedejs') shxReq(u); return r; };
  var f = document.getElementById('taskForm'); if (f) f.addEventListener('reset', function () { setTimeout(function () { var u = window.SHXR && SHXR.user(); if (u && u.kind !== 'izvedejs') shxReq(u); }, 0); });
  var oh = window.openHelp; if (oh) window.openHelp = function () { oh.apply(this, arguments); SHXR.showMenu(document.querySelector('#help .help-body')); };
})();
</script>
<script src="sh-addon.js?v=%s"></script>
''' % ver
app = open('index.html', encoding='utf-8').read().replace('</body>', shx + '</body>', 1)
open('index.html', 'w', encoding='utf-8').write(app)
print('SHX', ver)
