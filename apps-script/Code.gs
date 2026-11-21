// ================================================================
//  IZVEŠANAS PIETEIKUMI — servera kods (Code.gs)
//  © VAITKEVIX, SIA. Visas tiesības aizsargātas.
// ================================================================

// IZVEDĒJU PAROLES — lapā "SIA", kolonnā "Parole" (katram SIA sava).

// BĀZES ADRESE — ja izvedēja telefons nedod atrašanās vietu, attālumu rēķina no šīs adreses
// (piem., 'Dzelzavas iela 120, Rīga'). Tukšs = nav.
const BASE_ADDRESS = '';

const SHEET_NAME = 'Pieteikumi';
const COLS = 23;            // A–W
// Lietotnes kolonnas (1 = A). M–P (Izmaksas, Starpsumma, bez PVN, Ar PVN) ir lietotāja formulas — lietotne tās neaiztiek.
const C_DONE = 17, C_URG = 18, C_DUE = 19, C_PROB = 20, C_HIST = 21, C_BAGS = 22, C_COEF = 23;
const DUE_DAYS = 7;         // termiņš: ne vēlāk kā 7 kalendārās dienas pēc pieteikuma
const MAX_PHOTOS = 5;       // cik bildes drīkst pievienot vienam pieteikumam
const ST_PENDING = 'Neizpildīts', ST_DONE = 'Izpildīts', ST_CANCELLED = 'Atcelts';
const HEADERS = [
  'ID', 'Datums', 'Adrese', 'Pasūtītājs', 'Aptuvenais maisu skaits',
  'Komentārs', 'Bilde (Pirms)', 'Statuss', 'Izvedējs (SIA)',
  'Bilde (Uz vietas)', 'Izvestie m³', 'Izvedēja komentārs', 'Izmaksas', 'Starpsumma',
  'bez PVN', 'Ar PVN', 'Izpildīts (laiks)', 'Steidzami', 'Izvest līdz', 'Nevarēja izvest', 'Vēsture',
  'Izvesti maisi (150 l)', 'Koeficients'
];
const BAG_M3 = 0.15;        // viena maisa tilpums: 150 l
const COEF_HEAVY = 0.10;    // smagi maisi
const COEF_MIXED = 0.05;    // sadzīves atkritumi lapu maisos
const PROBLEM_REASONS = ['Nav piekļuves', 'Maisi / atkritumi nav atrasti', 'Par daudz vienai reizei', 'Laikapstākļi', 'Cits iemesls'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Izvešanas pieteikumi')
    .setFaviconUrl('https://vaitkevix.github.io/aizvietosana/icons/apps/izvesana-32.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')     // pievienojot sākuma ekrānam, atveras kā lietotne bez adreses joslas
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const getList = (sheetName) => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 1)
             .getValues()
             .map(r => String(r[0]).trim())
             .filter(Boolean);
  };

  return {
    addresses: getList('Adreses'),
    people: getList('Cilveki'),
    siaList: getList('SIA'),
    ai: !!aiKey_()
  };
}

// Viss lapas atvēršanai vienā pieprasījumā (saraksti + pieteikumi) — ātrāka ielāde
function getBoot() {
  return { lists: getInitialData(), tasks: getTasks() };
}

// Veiksmīgai darbībai pieliek klāt svaigu pieteikumu sarakstu, lai lapai nav jāprasa otrreiz
function withTasks_(res) {
  if (res && res.status === 'success') res.tasks = getTasks();
  return res;
}

// ---------------------------------------------------------------- palīgfunkcijas

// Lapa "Pieteikumi"; ja tās nav un create = true, izveido ar virsrakstiem
function getSheet_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

// Pārliecinās, ka lapā ir visas kolonnas (vecām tabulām nav "Steidzami" un "Izvest līdz")
function ensureColumns_(sheet) {
  const max = sheet.getMaxColumns();
  if (max < COLS) sheet.insertColumnsAfter(max, COLS - max);
  const head = sheet.getRange(1, 1, 1, COLS).getValues()[0];
  head.forEach((h, i) => { if (i >= 16 && !String(h).trim()) sheet.getRange(1, i + 1).setValue(HEADERS[i]); });
  migrateCols_(sheet);
}

// Vienreizējs labojums: līdz v66 Steidzami / Izvest līdz / Nevarēja izvest / Vēsture tika rakstīti M–P,
// pāri izmaksu formulām. Pārnes tos uz R–U un atjauno formulas no iepriekšējās rindas.
function migrateCols_(sheet) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('colsV67')) return;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const n = last - 1;
    const vals = sheet.getRange(2, 13, n, 4).getValues();
    const fml = sheet.getRange(2, 13, n, 4).getFormulas();
    const tail = sheet.getRange(2, C_URG, n, 4).getValues();
    let ref = 0;
    for (let i = 0; i < n; i++) {
      const r = i + 2, v = vals[i];
      if (fml[i][0]) { ref = r; continue; }
      const app = v[0] === 'Jā' || isDate_(v[1]) || /\d{4}/.test(String(v[1])) || /·/.test(String(v[3])) || /·/.test(String(v[2]));
      if (!app) continue;
      if (!tail[i].some(x => String(x).trim())) {
        const txt = (x, j) => fml[i][j] || typeof x === 'number' ? '' : x;
        sheet.getRange(r, C_URG, 1, 4).setValues([[v[0] === 'Jā' ? 'Jā' : '', fml[i][1] ? '' : v[1], txt(v[2], 2), txt(v[3], 3)]]);
      }
      sheet.getRange(r, 13, 1, 4).clearContent();
      if (ref) sheet.getRange(ref, 13, 1, 4).copyTo(sheet.getRange(r, 13, 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
  }
  props.setProperty('colsV67', '1');
}

// Jaunai rindai ieliek izmaksu formulas (M–P) no iepriekšējās rindas, ja tās tur ir
function fillFormulas_(sheet, row) {
  if (row < 3) return;
  const f = sheet.getRange(row - 1, 13, 1, 4).getFormulas()[0];
  if (!f.some(Boolean)) return;
  const cur = sheet.getRange(row, 13, 1, 4).getFormulas()[0];
  if (cur.some(Boolean)) return;
  sheet.getRange(row - 1, 13, 1, 4).copyTo(sheet.getRange(row, 13, 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
}

// Termiņš: 'yyyy-mm-dd' no lapas → Date; ne agrāk par pieteikuma dienu un ne vēlāk kā DUE_DAYS dienas pēc tās
function dueDate_(value, created) {
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const base = day(created || new Date());
  const max = new Date(base.getFullYear(), base.getMonth(), base.getDate() + DUE_DAYS);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  let d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : max;
  if (d < base) d = base;
  if (d > max) d = max;
  return d;
}

// Atrod pieteikuma rindu pēc ID (A kolonna). Atgriež 0, ja nav.
function findRow_(sheet, id) {
  id = String(id || '').trim();
  const last = sheet.getLastRow();
  if (!id || last < 2) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return 0;
}

// Izpilda darbību ar slēdzeni, lai divi cilvēki vienlaikus nepārraksta viens otra datus
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function pinOk_(pin) {
  return !!login_(pin);
}

// Pieslēgšanās: katram SIA sava parole lapā "SIA", kolonnā "Parole".
// pin = "SIA nosaukums" + "\n" + "parole". SIA bez paroles pieslēgties nevar.
// Lielie/mazie burti parolē nav svarīgi.
function login_(pin) {
  const s = String(pin == null ? '' : pin);
  const i = s.indexOf('\n');
  const user = (i >= 0 ? s.slice(0, i) : '').replace(/\s+/g, ' ').trim();
  const pass = (i >= 0 ? s.slice(i + 1) : s).trim().toUpperCase();
  if (!pass || !user) return null;
  const row = siaLogins_().find(x => x.name.toLowerCase() === user.toLowerCase());
  return row && row.pass && pass === row.pass ? { sia: row.name } : null;
}

/** Pieslēgšanās tikai ar paroli: atgriež SIA nosaukumu, ja parole ir unikāla */
function carrierByPassword(pw) {
  const p = String(pw == null ? '' : pw).trim().toUpperCase(); if (!p) return '';
  const m = siaLogins_().filter(x => x.pass && x.pass === p);
  if (m.length === 1) return m[0].name;
  Utilities.sleep(800); return '';
}
function siaLogins_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SIA');
  if (!sh || sh.getLastRow() < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = head.findIndex(h => /^parole/i.test(String(h).trim()));
  return sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(1, col + 1)).getValues()
    .map(r => ({ name: String(r[0] || '').replace(/\s+/g, ' ').trim(), pass: col >= 1 ? String(r[col] || '').trim().toUpperCase() : '' }))
    .filter(x => x.name);
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function isYes_(v) {
  return /^(jā|ja|yes|true|1|x)$/i.test(String(v == null ? '' : v).trim());
}

// Laika zīmogs vēsturei un "Nevarēja izvest" ierakstiem
function stamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
}

// Pieraksta notikumu pieteikuma vēsturē (U kolonna)
function log_(sheet, row, text) {
  const cell = sheet.getRange(row, C_HIST);
  const prev = String(cell.getValue() || '');
  cell.setValue((prev ? prev + '\n' : '') + stamp_() + ' · ' + text);
}

function fail_(message, code) {
  return { status: 'error', message: message, code: code || '' };
}

function saveFileToDrive(base64Data, filename) {
  if (!base64Data || !base64Data.includes('base64,')) return base64Data || '';
  try {
    const splitData = base64Data.split('base64,');
    const contentType = splitData[0].split(':')[1].split(';')[0];
    const bytes = Utilities.base64Decode(splitData[1]);
    const blob = Utilities.newBlob(bytes, contentType, filename);

    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('Drive kļūda: ' + err.toString());
    return '';
  }
}

// Saglabā vairākas bildes; atgriež saites, katru savā rindā
function savePhotos_(list, id, suffix) {
  const arr = (Array.isArray(list) ? list : [list]).filter(Boolean).slice(0, MAX_PHOTOS);
  return arr.map((p, i) => saveFileToDrive(p, id + '_' + suffix + (arr.length > 1 ? '_' + (i + 1) : '') + '.jpg'))
            .filter(Boolean)
            .join('\n');
}

// ---------------------------------------------------------------- pieteikumi

function saveTask(taskData) {
  try {
    taskData = taskData || {};
    if (!String(taskData.address || '').trim()) return fail_('Nav norādīta adrese');
    const ph = taskData.photos || taskData.photo;
    if (!ph || (Array.isArray(ph) && !ph.length)) return fail_('Pievienojiet bildi pirms izvešanas');

    // ID var atnākt no ātrās versijas (Cloudflare), lai atkārtota sūtīšana neveidotu dublikātu
    const newId = /^TASK-\d{10,}$/.test(String(taskData.id || '')) ? String(taskData.id) : 'TASK-' + new Date().getTime();
    if (taskData.id) { const sh0 = getSheet_(false); if (sh0 && findRow_(sh0, newId)) return withTasks_({ status: 'success', id: newId }); }
    // Bildes saglabā pirms slēdzenes — tas ir lēnākais solis
    const photoUrl = savePhotos_(taskData.photos || taskData.photo, newId, 'Pirms');

    withLock_(() => {
      const sheet = getSheet_(true);
      ensureColumns_(sheet);
      sheet.appendRow([
        newId,
        new Date(),
        taskData.address || '',
        taskData.requester || '',
        taskData.bagsEst || '',
        taskData.comment || '',
        photoUrl,
        ST_PENDING,
        '', '', '', ''
      ]);
      const row = sheet.getLastRow();
      fillFormulas_(sheet, row);
      sheet.getRange(row, C_URG, 1, 4).setValues([[
        taskData.urgent ? 'Jā' : '',
        dueDate_(taskData.deadline, new Date()),
        '',
        stamp_() + ' · Izveidots' + (taskData.requester ? ' (' + taskData.requester + ')' : '')
      ]]);
      SpreadsheetApp.flush();
    });

    return withTasks_({ status: 'success', id: newId });
  } catch (e) {
    return fail_(e.toString());
  }
}

function getTasks() {
  try {
    const sheet = getSheet_(false);
    if (!sheet || sheet.getLastRow() < 2) return [];

    const cols = Math.min(COLS, sheet.getMaxColumns());
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
    const tz = Session.getScriptTimeZone();

    return data.map((row, index) => {
      let dateFormatted = '';
      if (isDate_(row[1])) {
        dateFormatted = Utilities.formatDate(row[1], tz, 'dd.MM.yyyy HH:mm');
      } else if (row[1]) {
        dateFormatted = String(row[1]);
      }

      return {
        rowIndex: index + 2,
        id: String(row[0] || ''),
        date: dateFormatted,
        address: String(row[2] || ''),
        requester: String(row[3] || ''),
        bagsEst: String(row[4] || ''),
        comment: String(row[5] || ''),
        photoBefore: String(row[6] || ''),
        status: String(row[7] || ST_PENDING),
        sia: String(row[8] || ''),
        photoAfter: String(row[9] || ''),
        m3Hauled: String(row[10] === 0 ? '0' : (row[10] || '')),
        carrierComment: String(row[11] || ''),
        urgent: isYes_(row[C_URG - 1]),
        deadline: isDate_(row[C_DUE - 1]) ? Utilities.formatDate(row[C_DUE - 1], tz, 'dd.MM.yyyy') : String(row[C_DUE - 1] || ''),
        problem: String(row[C_PROB - 1] || ''),
        history: String(row[C_HIST - 1] || ''),
        doneAt: isDate_(row[C_DONE - 1]) ? Utilities.formatDate(row[C_DONE - 1], tz, 'dd.MM.yyyy HH:mm') : String(row[C_DONE - 1] || ''),
        bagsHauled: String(row[C_BAGS - 1] === 0 ? '' : (row[C_BAGS - 1] || '')),
        coefNote: String(row[C_COEF - 1] || '')
      };
    });
  } catch (e) {
    Logger.log('Kļūda ielādējot pieteikumus: ' + e.toString());
    return [];
  }
}

// Pieteicējs izlabo vēl neizpildītu pieteikumu
function updateTask(data) {
  try {
    data = data || {};
    if (!String(data.address || '').trim()) return fail_('Nav norādīta adrese');
    return withTasks_(withLock_(() => {
      const sheet = getSheet_(false);
      if (!sheet) return fail_('Lapa netika atrasta');
      ensureColumns_(sheet);
      const row = findRow_(sheet, data.id);
      if (!row) return fail_('Pieteikums nav atrasts — iespējams, tas ir izdzēsts');
      const status = String(sheet.getRange(row, 8).getValue() || ST_PENDING);
      if (status !== ST_PENDING) return fail_('Labot var tikai neizpildītu pieteikumu (statuss: ' + status + ')');

      const old = sheet.getRange(row, 3, 1, 4).getValues()[0];
      const oldUrgent = isYes_(sheet.getRange(row, C_URG).getValue());
      const neu = [data.address || '', data.requester || '', data.bagsEst || '', data.comment || ''];
      const names = ['adrese', 'pasūtītājs', 'daudzums', 'komentārs'];
      const changed = names.filter((n, i) => String(old[i] || '').trim() !== String(neu[i]).trim());
      if (oldUrgent !== !!data.urgent) changed.push(data.urgent ? 'steidzams' : 'nav steidzams');
      sheet.getRange(row, 3, 1, 4).setValues([neu]);
      sheet.getRange(row, C_URG).setValue(data.urgent ? 'Jā' : '');
      if (changed.length) log_(sheet, row, 'Labots: ' + changed.join(', ') + (data.requester ? ' (' + data.requester + ')' : ''));
      if (data.deadline) {
        const created = sheet.getRange(row, 2).getValue();
        sheet.getRange(row, C_DUE).setValue(dueDate_(data.deadline, isDate_(created) ? created : new Date()));
      }
      SpreadsheetApp.flush();
      return { status: 'success' };
    }));
  } catch (e) {
    return fail_(e.toString());
  }
}

// Pieteicējs atceļ (cancel = true) vai atjauno (cancel = false) pieteikumu
function setTaskCancelled(id, cancel) {
  try {
    return withTasks_(withLock_(() => {
      const sheet = getSheet_(false);
      if (!sheet) return fail_('Lapa netika atrasta');
      const row = findRow_(sheet, id);
      if (!row) return fail_('Pieteikums nav atrasts — iespējams, tas ir izdzēsts');
      const cell = sheet.getRange(row, 8);
      const status = String(cell.getValue() || ST_PENDING);
      if (status === ST_DONE) return fail_('Pieteikums jau ir izpildīts');
      if (cancel && status === ST_CANCELLED) return { status: 'success' };
      if (!cancel && status !== ST_CANCELLED) return { status: 'success' };
      ensureColumns_(sheet);
      cell.setValue(cancel ? ST_CANCELLED : ST_PENDING);
      log_(sheet, row, cancel ? 'Atcelts' : 'Atjaunots');
      SpreadsheetApp.flush();
      return { status: 'success' };
    }));
  } catch (e) {
    return fail_(e.toString());
  }
}

// ---------------------------------------------------------------- izvedējs

// Paroles pārbaude notiek serverī
// Adreses atslēga piekļuvēm: bez priekšvārdiem "KK ", "IR ", "EE ", "J | ", "VNĪ | "
function accKey_(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^(kk|ir|ee) /, '').replace(/^(j|vnī) ?\| ?/, '');
}

// Piekļuves (vārti, barjeras, vārtiņi) — lapā "Adreses", kolonnā "Piekļuve". Tikai izvedējam ar paroli.
function getAccess(pin) {
  if (!pinOk_(pin)) { Utilities.sleep(800); return {}; }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Adreses');
  if (!sh || sh.getLastRow() < 2) return {};
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = head.findIndex(h => /^piekļuve/i.test(String(h).trim()));
  if (col < 1) return {};
  const out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, col + 1).getValues().forEach(r => {
    const a = accKey_(r[0]);
    const t = String(r[col] || '').trim();
    if (a && t) out[a] = t;
  });
  return out;
}

function checkCarrierPin(pin) {
  if (pinOk_(pin)) return true;
  Utilities.sleep(800);   // bremzē paroles minēšanu
  return false;
}

function completeTask(data) {
  try {
    data = data || {};
    const lg = login_(data.pin);
    if (!lg) return fail_('Nepareiza parole', 'pin');
    if (lg.sia) data.sia = lg.sia;

    const sheet = getSheet_(false);
    if (!sheet) return fail_('Lapa netika atrasta');

    // Ātra pārbaude pirms bilžu augšupielādes
    const pre = findRow_(sheet, data.id);
    if (!pre) return fail_('Pieteikums nav atrasts — iespējams, tas ir izdzēsts');

    // Maisi: m³ rēķina serverī — maisi × 150 l × (1 + koeficienti)
    let bags = null, coefNote = '';
    if (data.bagsHauled !== undefined && data.bagsHauled !== null && data.bagsHauled !== '') {
      bags = parseInt(data.bagsHauled, 10);
      if (!(bags >= 1 && bags <= 1000)) return fail_('Nepareizs maisu skaits (1–1000)');
      const coef = (data.heavy ? COEF_HEAVY : 0) + (data.mixed ? COEF_MIXED : 0);
      data.m3Hauled = Math.round(bags * BAG_M3 * (1 + coef) * 100) / 100;
      coefNote = [data.heavy ? '+10% smagi maisi' : '', data.mixed ? '+5% sadzīves atkritumi' : ''].filter(Boolean).join('; ');
    }
    const ph = data.photosAfter || data.photoAfter;
    if (!ph || (Array.isArray(ph) && !ph.length)) return fail_('Pievienojiet bildi pēc izvešanas');
    const photoUrl = savePhotos_(ph, String(data.id), 'Izvests');

    return withTasks_(withLock_(() => {
      // Rindu meklē vēlreiz pēc ID — tabula pa šo laiku varēja mainīties
      const row = findRow_(sheet, data.id);
      if (!row) return fail_('Pieteikums nav atrasts — iespējams, tas ir izdzēsts');

      const range = sheet.getRange(row, 8, 1, 5);          // H–L
      const cur = range.getValues()[0];
      const status = String(cur[0] || ST_PENDING);
      if (status === ST_DONE) return fail_('Šis pieteikums jau ir atzīmēts kā izpildīts');
      if (status === ST_CANCELLED) return fail_('Šis pieteikums ir atcelts');

      range.setValues([[
        ST_DONE,
        data.sia || cur[1] || '',
        photoUrl || cur[2] || '',
        data.m3Hauled === 0 ? 0 : (data.m3Hauled || ''),
        data.carrierComment || ''
      ]]);
      ensureColumns_(sheet);
      sheet.getRange(row, C_DONE).setValue(new Date());
      if (bags) sheet.getRange(row, C_BAGS, 1, 2).setValues([[bags, coefNote]]);
      log_(sheet, row, 'Izpildīts · ' + (bags ? bags + ' maisi × 150 l' + (coefNote ? ' (' + coefNote + ')' : '') + ' = ' : '') + fmt_(num_(data.m3Hauled)) + ' m³ (izvedējs)');
      if (data.aiNote) log_(sheet, row, 'AI pārbaude: ' + String(data.aiNote).slice(0, 200));
      SpreadsheetApp.flush();
      return { status: 'success' };
    }));
  } catch (e) {
    return fail_(e.toString());
  }
}

// Izvedējs atzīmē, ka nevarēja izvest. Pieteikums paliek neizpildīts, iemesls redzams visiem.
function reportProblem(data) {
  try {
    data = data || {};
    if (!pinOk_(data.pin)) return fail_('Nepareiza parole', 'pin');
    const reason = String(data.reason || '').trim();
    if (!reason) return fail_('Izvēlieties iemeslu');
    const comment = String(data.comment || '').trim();
    return withTasks_(withLock_(() => {
      const sheet = getSheet_(false);
      if (!sheet) return fail_('Lapa netika atrasta');
      ensureColumns_(sheet);
      const row = findRow_(sheet, data.id);
      if (!row) return fail_('Pieteikums nav atrasts — iespējams, tas ir izdzēsts');
      const status = String(sheet.getRange(row, 8).getValue() || ST_PENDING);
      if (status !== ST_PENDING) return fail_('Pieteikums vairs nav neizpildīts (statuss: ' + status + ')');
      const text = reason + (comment ? ' — ' + comment : '');
      sheet.getRange(row, C_PROB).setValue(stamp_() + ' · ' + text);
      log_(sheet, row, 'Nevarēja izvest: ' + text);
      SpreadsheetApp.flush();
      return { status: 'success' };
    }));
  } catch (e) {
    return fail_(e.toString());
  }
}

// ---------------------------------------------------------------- PDF atskaite

function kindOf_(bagsEst) {
  const v = String(bagsEst || '').trim().toLowerCase();
  return v === 'zari' ? 'branches' : v.indexOf('bio') === 0 ? 'bio' : v.indexOf('lielgab') === 0 ? 'bulky' : 'bags';
}

function isVni_(address) {
  return /^\s*VN[ĪI](?![A-Za-zĀ-ž0-9])/i.test(String(address || ''));
}

function num_(v) {
  if (typeof v === 'number') return v;
  return parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')) || 0;
}

// Skaitlis latviešu pierakstā: 12,5
function fmt_(n) {
  const r = Math.round(n * 100) / 100;
  return r ? String(r).replace('.', ',') : '–';
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Pieteikuma gads un mēnesis (0–11) pēc datuma kolonnas
function ym_(value, tz) {
  if (isDate_(value)) {
    const p = Utilities.formatDate(value, tz, 'yyyy-M').split('-');
    return { y: +p[0], m: +p[1] - 1 };
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(value || '').trim());
  return m ? { y: +m[3], m: +m[2] - 1 } : null;
}

const MONTH_NAMES_ = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];

// Savāc atskaites datus: izpildītie pieteikumi periodā, m³ pa adresēm, veidiem un mēnešiem
function reportData_(year, month) {
  const sheet = getSheet_(false);
  const out = { year: year, month: month, groups: { sh: {}, vni: {} }, count: 0, months: [], items: [], speedH: 0, speedN: 0 };
  for (let i = 0; i < 12; i++) out.months.push({ n: 0, bags: 0, branches: 0, bio: 0, bulky: 0, total: 0 });
  if (!sheet || sheet.getLastRow() < 2) return out;
  const tz = Session.getScriptTimeZone();
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(COLS, sheet.getMaxColumns())).getValues();

  data.forEach(row => {
    if (String(row[7]) !== ST_DONE) return;
    const d = ym_(row[1], tz);
    if (!d || d.y !== year || (month >= 0 && d.m !== month)) return;
    const address = String(row[2] || '—').trim() || '—';
    const g = out.groups[isVni_(address) ? 'vni' : 'sh'];
    const o = g[address] || (g[address] = { n: 0, bags: 0, branches: 0, bio: 0, bulky: 0, total: 0 });
    const v = num_(row[10]);
    const k = kindOf_(row[4]);
    const mo = out.months[d.m];
    o.n++; o[k] += v; o.total += v;
    mo.n++; mo[k] += v; mo.total += v;
    out.count++;
    if (isDate_(row[1]) && isDate_(row[16]) && row[16] >= row[1]) { out.speedH += (row[16] - row[1]) / 36e5; out.speedN++; }
    out.items.push({
      date: isDate_(row[1]) ? Utilities.formatDate(row[1], tz, 'dd.MM.yyyy') : String(row[1] || ''),
      done: isDate_(row[16]) ? Utilities.formatDate(row[16], tz, 'dd.MM.yyyy') : '',
      address: address, kind: k, m3: v,
      before: String(row[6] || '').split(/\s+/).filter(u => /^https?:/.test(u)),
      after: String(row[9] || '').split(/\s+/).filter(u => /^https?:/.test(u))
    });
  });
  return out;
}

function reportHtml_(rep) {
  const period = rep.month >= 0 ? MONTH_NAMES_[rep.month].charAt(0).toUpperCase() + MONTH_NAMES_[rep.month].slice(1) + ' ' + rep.year : rep.year + '. gads';
  const KEYS = ['bags', 'branches', 'bio', 'bulky'];
  const KIND = {
    bags: { t: 'Lapas', c: '#d97706', s: '#f6e9d6' },
    branches: { t: 'Zari', c: '#8b5a2b', s: '#eee5dc' },
    bio: { t: 'Bio', c: '#16a34a', s: '#dff0e4' },
    bulky: { t: 'Lielgabarīts', c: '#64748b', s: '#e6e9ed' }
  };
  // SH vienotais stils — tās pašas krāsas kā lietotnē
  const G = '#0f6b5c', INK = '#161a19', INK2 = '#4a524f', MUTED = '#6b7471', LINE = '#e3e6e5', BG = '#f3f4f3', TRACK = '#eef0ef';
  const sum = () => ({ n: 0, bags: 0, branches: 0, bio: 0, bulky: 0, total: 0 });
  const add = (a, o) => { a.n += o.n; KEYS.forEach(k => a[k] += o[k]); a.total += o.total; };
  const pct = (v, max) => max > 0 ? Math.max(v > 0 ? 1.5 : 0, Math.round(v / max * 1000) / 10) : 0;
  const cell_ = (w, color) => '<td width="' + w + '%" style="width:' + w + '%;border-top:6pt solid ' + color + ';font-size:1pt;line-height:1pt;padding:0">&nbsp;</td>';
  const bar = (v, max, color) => {
    const p = pct(v, max);
    return '<table class="bar"><tr>' +
      (p > 0 ? cell_(p, color) : '') +
      (p < 100 ? cell_(100 - p, TRACK) : '') +
      '</tr></table>';
  };
  const dot = c => '<span class="dot" style="color:' + c + '">●</span>';
  const card = (title, hint, body) =>
    '<table class="card"><tr><td class="ci">' +
      (title ? '<div class="ct">' + title + (hint ? ' <span class="ch">' + hint + '</span>' : '') + '</div>' : '') +
      body + '</td></tr></table>';

  const sh = sum(), vni = sum(), grand = sum();
  Object.keys(rep.groups.sh).forEach(a => add(sh, rep.groups.sh[a]));
  Object.keys(rep.groups.vni).forEach(a => add(vni, rep.groups.vni[a]));
  add(grand, sh); add(grand, vni);
  const nAddr = Object.keys(rep.groups.sh).length + Object.keys(rep.groups.vni).length;
  const tz = Session.getScriptTimeZone();
  const now = new Date();

  // --- augšējā josla kā lietotnē: zaļā flīze + nosaukums
  const head =
    '<table class="top"><tr>' +
      '<td class="logo"><img src="https://vaitkevix.github.io/izvesana/icon-192.png" width="30" height="30"></td>' +
      '<td class="brand"><div class="bn">Izvešanas pieteikumi</div><div class="bs">Lapas · zari · bio</div></td>' +
      '<td class="tr"><div class="bs">Atskaite · sagatavots ' + Utilities.formatDate(now, tz, 'dd.MM.yyyy') + '</div></td>' +
    '</tr></table>' +
    // statusa josla kā lietotnē
    '<table class="strip"><tr>' +
      '<td class="sl"><div class="st">Izvešanas atskaite · ' + period + '</div><div class="ss">Izpildītie pieteikumi, pēc pieteikuma datuma</div></td>' +
      '<td class="sr"><span class="big">' + fmt_(grand.total) + '</span> <span class="u">m³ izvests</span></td>' +
    '</tr></table>';

  if (!rep.count) {
    return wrap_(head + card('', '', '<div class="empty">Šajā periodā nav izpildītu pieteikumu</div>'));
  }

  // --- galvenie skaitļi: baltas kartītes, akcents tikai kopsummai
  const kpi = (label, value, unit, accent) =>
    '<td class="kpi"><div class="kl">' + label + '</div>' +
    '<div class="kv"' + (accent ? ' style="color:' + G + '"' : '') + '>' + value + '<span class="ku">' + (unit ? ' ' + unit : '') + '</span></div></td>';
  const sp = rep.speedN ? rep.speedH / rep.speedN : null;
  const speedTxt = sp == null ? '–' : sp < 24 ? Math.max(1, Math.round(sp)) + ' h' : fmt_(Math.round(sp / 24 * 10) / 10) + ' d.';
  const kpis = '<table class="kpis"><tr>' +
    kpi('Izvests kopā', fmt_(grand.total), 'm³', true) + '<td class="gap"></td>' +
    kpi('Izpildīti pieteikumi', grand.n, '') + '<td class="gap"></td>' +
    kpi('Adreses', nAddr, '') + '<td class="gap"></td>' +
    kpi('Vidēji uz izvešanu', fmt_(grand.n ? grand.total / grand.n : 0), 'm³') + '<td class="gap"></td>' +
    kpi('Vidēji izved', speedTxt, '') +
    '</tr></table>';

  // --- pa veidiem un pa objektiem
  const kindsUsed = KEYS.filter(k => grand[k] > 0 || k !== 'bulky');
  const kindRows = kindsUsed.map(k => {
    const share = grand.total ? Math.round(grand[k] / grand.total * 100) : 0;
    return '<tr><td class="kn">' + dot(KIND[k].c) + KIND[k].t + '</td>' +
      '<td class="kb">' + bar(grand[k], grand.total, KIND[k].c) + '</td>' +
      '<td class="kvv">' + fmt_(grand[k]) + ' m³</td><td class="kp">' + share + '%</td></tr>';
  }).join('');
  const split = (title, o) =>
    '<tr><td class="split"><div class="kl">' + title + '</div><div class="sv">' + fmt_(o.total) + ' <span class="ku">m³</span></div>' +
    '<div class="sm">' + o.n + ' izvešanas · ' + (grand.total ? Math.round(o.total / grand.total * 100) : 0) + '%</div></td></tr>';
  const kindsBlock =
    '<table class="two"><tr>' +
      '<td class="col7">' + card('Pa veidiem', '', '<table class="kinds">' + kindRows + '</table>') + '</td>' +
      '<td class="gap2"></td>' +
      '<td class="col5">' + card('Pa objektiem', '', '<table class="splits">' + split('SH objekti', sh) + split('VNĪ objekti', vni) + '</table>') + '</td>' +
    '</tr></table>';

  // --- pa mēnešiem (visam gadam)
  let monthsBlock = '';
  if (rep.month < 0) {
    const maxM = Math.max.apply(null, rep.months.map(m => m.total));
    const rows = rep.months.map((m, i) => {
      if (!m.total && !m.n) return '';
      const segs = KEYS.filter(k => m[k] > 0).map(k => cell_(pct(m[k], maxM), KIND[k].c)).join('');
      const used = KEYS.reduce((s, k) => s + (m[k] > 0 ? pct(m[k], maxM) : 0), 0);
      return '<tr><td class="mn">' + MONTH_NAMES_[i].charAt(0).toUpperCase() + MONTH_NAMES_[i].slice(1) + '</td>' +
        '<td class="kb"><table class="bar"><tr>' + segs + (used < 100 ? cell_(Math.max(0, 100 - used), TRACK) : '') + '</tr></table></td>' +
        '<td class="kvv">' + fmt_(m.total) + ' m³</td><td class="kp">' + m.n + '×</td></tr>';
    }).join('');
    const legend = KEYS.filter(k => grand[k] > 0).map(k => '<span class="lg">' + dot(KIND[k].c) + KIND[k].t + '</span>').join('');
    monthsBlock = card('Pa mēnešiem', legend, '<table class="kinds">' + rows + '</table>');
  }

  // --- visvairāk izvests
  const all = [];
  ['sh', 'vni'].forEach(gk => Object.keys(rep.groups[gk]).forEach(a => all.push({ a: a, o: rep.groups[gk][a] })));
  all.sort((x, y) => y.o.total - x.o.total);
  const top = all.slice(0, 5);
  const topMax = top.length ? top[0].o.total : 0;
  const topBlock = card('Visvairāk izvests', 'pēc izvestajiem m³', '<table class="kinds">' + top.map((t, i) =>
    '<tr><td class="tn"><span class="rank">' + (i + 1) + '</span>' + escHtml_(t.a) + '</td>' +
    '<td class="kb2">' + bar(t.o.total, topMax, G) + '</td>' +
    '<td class="kvv">' + fmt_(t.o.total) + ' m³</td></tr>').join('') + '</table>');

  // --- tabula pa adresēm
  const COLK = KEYS.filter(k => k !== 'bulky' || grand.bulky > 0);
  const cells = o => '<td class="r">' + o.n + '</td>' +
    COLK.map(k => '<td class="r' + (o[k] ? '' : ' z') + '">' + fmt_(o[k]) + '</td>').join('') +
    '<td class="r b">' + fmt_(o.total) + '</td>';
  const section = (title, g, s) => {
    const names = Object.keys(g).sort((a, b) => a.localeCompare(b, 'lv'));
    if (!names.length) return '';
    const rows = names.map((name, i) =>
      '<tr><td class="n">' + (i + 1) + '</td><td>' + escHtml_(name) + '</td>' + cells(g[name]) + '</tr>').join('');
    return '<tr class="grp"><td colspan="' + (COLK.length + 4) + '">' + title +
      ' <span class="gc">' + names.length + (names.length === 1 ? ' adrese' : ' adreses') + '</span></td></tr>' + rows +
      '<tr class="sub"><td></td><td>Kopā ' + title + '</td>' + cells(s) + '</tr>';
  };
  const th = k => '<th class="r">' + dot(KIND[k].c) + KIND[k].t + '</th>';
  const table = '<div class="pb"></div>' + card('Pa adresēm', '', '<table class="dt"><thead><tr><th></th><th>Adrese</th><th class="r">Reizes</th>' +
    COLK.map(th).join('') + '<th class="r">Kopā m³</th></tr></thead><tbody>' +
    section('SH objekti', rep.groups.sh, sh) + section('VNĪ objekti', rep.groups.vni, vni) +
    '<tr class="tot"><td></td><td>Pavisam kopā</td>' + cells(grand) + '</tr></tbody></table>');

  // --- pielikums: katrs izpildītais pieteikums ar saitēm uz bildēm
  const KN = { bags: 'Lapas', branches: 'Zari', bio: 'Bio', bulky: 'Lielgab.' };
  const links = (arr, label) => arr.map((u, i) => '<a href="' + escHtml_(u) + '">' + label + (arr.length > 1 ? ' ' + (i + 1) : '') + '</a>').join(' ');
  const items = rep.items.slice().sort((a, b) => {
    const p = d => { const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(d); return m ? m[3] + m[2] + m[1] : d; };
    return p(a.date) < p(b.date) ? -1 : p(a.date) > p(b.date) ? 1 : 0;
  });
  const appendix = '<div class="newpage"></div>' + card('Izpildītie pieteikumi ar bildēm', items.length + ' pieteikumi · saites atver bildes Google Drive',
    '<table class="dt ap"><thead><tr><th></th><th>Pieteikts</th><th>Izpildīts</th><th>Adrese</th><th>Veids</th><th class="r">m³</th><th>Bildes</th></tr></thead><tbody>' +
    items.map((it, i) => '<tr><td class="n">' + (i + 1) + '</td><td>' + escHtml_(it.date) + '</td><td>' + (escHtml_(it.done) || '<span class="z">–</span>') + '</td><td>' + escHtml_(it.address) + '</td>' +
      '<td>' + dot(KIND[it.kind].c) + KN[it.kind] + '</td><td class="r b">' + fmt_(it.m3) + '</td>' +
      '<td class="ph">' + (links(it.before, 'Pirms') || '<span class="z">nav pirms</span>') + ' &nbsp; ' + (links(it.after, 'Pēc') || '<span class="z">nav pēc</span>') + '</td></tr>').join('') +
    '</tbody></table>');

  return wrap_(head + kpis + kindsBlock + monthsBlock + topBlock + table + appendix);

  function wrap_(inner) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      '@page{size:A4;margin:10mm 10mm 12mm}' +
      'body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:' + INK + ';margin:0;background:' + BG + '}' +
      'table{border-collapse:collapse;width:100%}td,th{vertical-align:middle}' +
      // augšējā josla
      '.top td{padding:0 0 10pt}.logo{width:38pt}.logo img{border-radius:8pt;display:block}' +
      '.bn{font-size:12pt;font-weight:bold;color:' + INK + '}.bs{font-size:8pt;color:' + MUTED + ';margin-top:1pt}.tr{text-align:right}' +
      // statusa josla
      '.strip{background:#ffffff;border:.75pt solid ' + LINE + ';border-radius:8pt}' +
      '.strip td{padding:10pt 12pt}.sl{width:65%}.sr{width:35%;text-align:right;white-space:nowrap}' +
      '.st{font-size:12pt;font-weight:bold}.ss{font-size:8pt;color:' + MUTED + ';margin-top:2pt}' +
      '.big{font-size:18pt;font-weight:bold;color:' + G + '}.u{font-size:9pt;color:' + MUTED + '}' +
      // kartītes
      '.card{background:#ffffff;border:.75pt solid ' + LINE + ';border-radius:8pt;margin-top:8pt}' +
      '.ci{padding:10pt 12pt 12pt}.ct{font-size:10.5pt;font-weight:bold;color:' + INK + ';margin-bottom:8pt}' +
      '.ch{font-size:8pt;font-weight:normal;color:' + MUTED + ';margin-left:6pt}' +
      '.kpis{margin-top:8pt}.kpi{background:#ffffff;border:.75pt solid ' + LINE + ';padding:8pt 10pt 10pt;width:18.4%}.gap{width:2%}' +
      '.kl{font-size:8pt;color:' + MUTED + '}' +
      '.kv{font-size:15pt;font-weight:bold;margin-top:3pt;color:' + INK + '}.ku{font-size:8.5pt;font-weight:normal;color:' + MUTED + '}' +
      '.two td{vertical-align:top}.col7{width:62%}.col5{width:36%}.gap2{width:2%}' +
      '.kinds td{padding:4pt 0;border:0}.kn{width:26%;font-weight:bold}.mn{width:18%}.tn{width:44%}' +
      '.kb{padding-right:8pt}.kb2{padding-right:8pt}' +
      '.bar{table-layout:fixed}.bar td{height:6pt;padding:0;border:0}' +
      '.kvv{width:17%;text-align:right;font-weight:bold;white-space:nowrap}.kp{width:9%;text-align:right;color:' + MUTED + '}' +
      '.dot{font-size:9pt;margin-right:4pt}' +
      '.lg{margin-left:8pt}' +
      '.rank{display:inline-block;width:12pt;color:' + MUTED + '}' +
      '.splits td{border:0}.split{padding:6pt 0 8pt;border-bottom:.5pt solid ' + LINE + ' !important}' +
      '.sv{font-size:14pt;font-weight:bold;margin-top:2pt}.sm{font-size:8pt;color:' + MUTED + ';margin-top:2pt}' +
      '.dt th{color:' + MUTED + ';font-size:8pt;font-weight:normal;padding:5pt 5pt;text-align:left;border-bottom:.75pt solid ' + LINE + '}' +
      '.dt td{font-size:9pt;padding:4.5pt 5pt;border-bottom:.5pt solid ' + LINE + '}' +
      '.dt tr{page-break-inside:avoid}' +
      '.r{text-align:right !important;white-space:nowrap}.b{font-weight:bold}.z{color:#c3c8c6}.n{color:#9aa19e;width:16pt;font-size:8pt}' +
      'tr.grp td{font-weight:bold;font-size:9.5pt;padding:10pt 5pt 5pt;background:' + BG + '}.gc{font-weight:normal;color:' + MUTED + ';font-size:8pt;margin-left:4pt}' +
      'tr.sub td{font-weight:bold;border-bottom:.75pt solid ' + INK2 + '}' +
      'tr.tot td{font-weight:bold;font-size:10pt;color:' + G + ';border-bottom:0;padding:8pt 5pt}' +
      'tr.tot td.z{color:#c3c8c6}' +
      '.empty{padding:24pt;text-align:center;color:' + MUTED + ';font-size:11pt}' +
      '.foot{margin-top:12pt;font-size:7.5pt;color:' + MUTED + '}' +
      '.foot b{color:' + INK2 + '}' +
      '.newpage{page-break-before:always}.pb{height:0}.ap td{font-size:8pt;padding:3.5pt 4pt}.ap th{font-size:7.5pt}.ph a{color:' + G + ';font-weight:bold;text-decoration:none}' +
      '</style></head><body>' + inner +
      '<div class="foot"><b>© ' + now.getFullYear() + ' VAITKEVIX, SIA.</b> Visas tiesības aizsargātas. &nbsp;·&nbsp; ' +
      'Izvešanas pieteikumi · dati pēc pieteikuma datuma · sagatavots ' + Utilities.formatDate(now, tz, 'dd.MM.yyyy HH:mm') + '</div>' +
      '</body></html>';
  }
}

// Izveido PDF atskaiti. month: 0–11 vai -1 visam gadam. Atgriež failu base64 formā.
function reportPdf(year, month) {
  try {
    year = parseInt(year, 10);
    month = (month === '' || month == null) ? -1 : parseInt(month, 10);
    if (!year) return fail_('Nav norādīts gads');
    if (isNaN(month) || month < -1 || month > 11) month = -1;

    const rep = reportData_(year, month);
    const html = reportHtml_(rep);
    const name = 'Izvesanas_atskaite_' + year + (month >= 0 ? '-' + ('0' + (month + 1)).slice(-2) : '') + '.pdf';
    const pdf = Utilities.newBlob(html, 'text/html', 'atskaite.html').getAs('application/pdf');
    return { status: 'success', name: name, b64: Utilities.base64Encode(pdf.getBytes()), count: rep.count };
  } catch (e) {
    return fail_(e.toString());
  }
}

// ---------------------------------------------------------------- attālums līdz adresēm

// Atrod adrešu koordinātas ar Google Maps (Apps Script iebūvēto) un saglabā tās, lai nav jāmeklē atkal.
// addrs: ['Latgales iela 188, Rīga', ...] → { adrese: [lat, lng] vai null }
// Atgriež arī bāzes adreses (BASE_ADDRESS) koordinātas, ja tā ir norādīta.
function geocodeAddresses(addrs) {
  try {
    // Koordinātas glabā dokumenta īpašībās (Script Properties sarakstā tās neaizņem vietu)
    const props = PropertiesService.getDocumentProperties();
    const old = PropertiesService.getScriptProperties();
    const geocoder = Maps.newGeocoder().setRegion('lv').setLanguage('lv');
    const out = {};
    let left = 40;                       // vienā reizē meklē ne vairāk kā 40 jaunas adreses
    const list = (Array.isArray(addrs) ? addrs : []).map(a => String(a || '').trim()).filter(Boolean);
    if (String(BASE_ADDRESS).trim()) list.push(String(BASE_ADDRESS).trim());
    list.forEach(addr => {
      if (addr in out) return;
      const key = 'geo:' + addr.toLowerCase().slice(0, 200);
      let v = props.getProperty(key);
      if (!v) { v = old.getProperty(key); if (v) { props.setProperty(key, v); old.deleteProperty(key); } }
      if (!v && left > 0) {
        left--;
        try {
          const r = geocoder.geocode(addr);
          v = (r && r.status === 'OK' && r.results && r.results.length)
            ? r.results[0].geometry.location.lat + ',' + r.results[0].geometry.location.lng
            : 'x';                         // 'x' = neatrasta (nemeklē katru reizi no jauna)
          props.setProperty(key, v);
        } catch (e) {
          Logger.log('Ģeokodēšanas kļūda (' + addr + '): ' + e);
        }
      }
      out[addr] = (v && v !== 'x') ? v.split(',').map(Number) : null;
    });
    return { status: 'success', coords: out, base: String(BASE_ADDRESS).trim() || '' };
  } catch (e) {
    return fail_(e.toString());
  }
}

// ---------------------------------------------------------------- Rezerves kopijas
// Reizi nedēļā tabulas kopija tiek saglabāta Google Drive mapē. Glabā pēdējās 12 kopijas.
const BACKUP_FOLDER = 'Izvešanas pieteikumi — rezerves kopijas';
const BACKUP_KEEP = 12;

function backupWeekly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const name = ss.getName() + ' — ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  const files = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(BACKUP_KEEP).forEach(f => f.setTrashed(true));
}

// Palaist VIENREIZ no redaktora (Run → setupBackup): ieslēdz iknedēļas kopiju (pirmdienās ap 6:00) un uzreiz izveido pirmo.
function setupBackup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupWeekly')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  backupWeekly();
}

// Palaid vienreiz no redaktora (Run), lai uzreiz pārnestu vecos datus no M–P uz R–U
function fixColumns() {
  withLock_(() => { const sh = getSheet_(false); if (sh) ensureColumns_(sh); SpreadsheetApp.flush(); });
}


// ---------------------------------------------------------------- AI (Claude Haiku 5.5)
// API atslēga: Project Settings → Script properties → ANTHROPIC_API_KEY.
// Kamēr atslēgas nav, AI pogas lietotnē nav redzamas.
const AI_MODEL = 'claude-haiku-5-5';
const AI_DAILY_LIMIT = 400;   // drošībai: ne vairāk kā tik AI pieprasījumu dienā

function aiKey_() {
  return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '';
}

function aiCall_(content, maxTokens, system) {
  const key = aiKey_();
  if (!key) throw new Error('AI nav ieslēgts');
  const cache = CacheService.getScriptCache();
  const ck = 'ai_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const used = Number(cache.get(ck) || 0);
  if (used >= AI_DAILY_LIMIT) throw new Error('Šodienas AI limits ir sasniegts');
  cache.put(ck, String(used + 1), 21600 * 4);
  const body = { model: AI_MODEL, max_tokens: maxTokens || 1500, messages: [{ role: 'user', content: content }],
    thinking: { type: 'disabled' }, output_config: { effort: 'low' } };
  if (system) body.system = system;
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  const code = res.getResponseCode();
  let out = {};
  try { out = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (code !== 200) throw new Error('AI kļūda ' + code + (out.error && out.error.message ? ': ' + out.error.message : ''));
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  if (!text) throw new Error(out.stop_reason === 'max_tokens' ? 'AI atbilde bija par garu — mēģiniet vēlreiz' : 'AI neatbildēja');
  return text;
}

function aiJson_(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

function imgPart_(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Nav bildes');
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

function aiErr_(e) { return { status: 'error', message: String(e && e.message || e) }; }

// 1. Pieteikums no ziņas → aizpildīti formas lauki
function aiParseMessage(text) {
  try {
    text = String(text || '').trim().slice(0, 2000);
    if (!text) return aiErr_('Nav teksta');
    const L = getInitialData();
    const prompt = 'No šīs ziņas izveido izvešanas pieteikumu.\n\n' +
      'ZIŅA:\n' + text + '\n\n' +
      'ADREŠU SARAKSTS (izvēlies tieši vienu no šiem vai ""):\n' + L.addresses.join('\n') + '\n\n' +
      'PASŪTĪTĀJI (izvēlies vienu no šiem vai ""):\n' + L.people.join('\n') + '\n\n' +
      'Atbildi TIKAI ar JSON: {"address":"", "requester":"", "kind":"bags|branches|bio", "bags":"skaitlis vai \\"\\"", "urgent":true/false, "comment":"īss komentārs latviski ar pārējo informāciju (vieta, piekļuve), bez adreses un daudzuma"}. ' +
      'kind: bags = lapas maisos, branches = zari, bio = dārzniecības bioatkritumi (zāle, ziedi). Ja adrese ziņā rakstīta saīsināti, atrodi atbilstošo no saraksta.';
    const j = aiJson_(aiCall_(prompt, 3000));
    if (!j) return aiErr_('AI nesaprata ziņu');
    j.address = matchAddr_(j.address, L.addresses);
    if (L.people.indexOf(j.requester) < 0) j.requester = '';
    if (['bags', 'branches', 'bio'].indexOf(j.kind) < 0) j.kind = 'bags';
    return { status: 'success', data: j };
  } catch (e) { return aiErr_(e); }
}

// AI adresi var uzrakstīt nedaudz citādi — atrod atbilstošo ierakstu sarakstā
function matchAddr_(a, list) {
  const n = x => String(x || '').toLowerCase().replace(/^(j|vnī) ?\| ?|^(kk|ir|ee) /, '').replace(/\s+/g, ' ').trim();
  const q = n(a);
  if (!q) return '';
  const ex = list.find(x => n(x) === q); if (ex) return ex;
  const m = /^(.*?\D)\s(\d+[a-z]?(?:\s?k-\d+)?)$/.exec(q);
  const hits = list.filter(x => {
    const e = n(x);
    if (e.indexOf(q) === 0) return true;
    if (!m || e.indexOf(m[1]) < 0) return false;
    return e.split(/[,/]/).some(part => part.trim().replace(m[1], '').trim() === m[2]);
  });
  return hits.length === 1 ? hits[0] : '';
}

// 2. Bilde pirms: kāds veids un vai bilde ir lietojama
function aiCheckPhoto(dataUrl) {
  try {
    const prompt = 'Šī ir bilde izvešanas pieteikumam (kas jāizved). Atbildi TIKAI ar JSON: ' +
      '{"kind":"bags|branches|bio|bulky|other", "ok":true/false, "note":"ja ok=false, īsi latviski kāpēc (piem., izplūdusi, tumša, nav redzami atkritumi)"}. ' +
      'bags = lapas maisos, branches = koku zari, bio = zāle/ziedi/dārza atkritumi, bulky = mēbeles, tehnika.';
    const j = aiJson_(aiCall_([imgPart_(dataUrl), { type: 'text', text: prompt }], 3000));
    if (!j) return aiErr_('AI neatbildēja');
    return { status: 'success', data: { kind: String(j.kind || ''), ok: j.ok !== false, note: String(j.note || '') } };
  } catch (e) { return aiErr_(e); }
}

// 3. Bilde pirms un pēc: vai vieta iztīrīta (tikai izvedējam)
function aiCompare(data) {
  try {
    data = data || {};
    if (!pinOk_(data.pin)) return { status: 'error', code: 'pin', message: 'Nepareiza parole' };
    const sheet = getSheet_(false);
    const row = sheet && findRow_(sheet, data.id);
    if (!row) return aiErr_('Pieteikums nav atrasts');
    const before = String(sheet.getRange(row, 7).getValue() || '');
    const m = /\/d\/([\w-]{20,})/.exec(before) || /[?&]id=([\w-]{20,})/.exec(before);
    if (!m) return { status: 'success', data: { clean: null, note: 'Nav bildes "pirms", ar ko salīdzināt' } };
    const blob = DriveApp.getFileById(m[1]).getBlob();
    if (blob.getBytes().length > 4e6) return { status: 'success', data: { clean: null, note: 'Bilde "pirms" par lielu salīdzināšanai' } };
    const beforeUrl = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    const prompt = 'Pirmā bilde: atkritumi PIRMS izvešanas. Otrā bilde: tā pati vieta PĒC izvešanas. ' +
      'Vai atkritumi ir izvesti? Atbildi TIKAI ar JSON: {"clean":true/false, "note":"ļoti īsi latviski, ko redzi"}. ' +
      'Ja bildes nav no vienas vietas, clean=false un note to pasaka.';
    const j = aiJson_(aiCall_([imgPart_(beforeUrl), imgPart_(data.after), { type: 'text', text: prompt }], 3000));
    if (!j) return aiErr_('AI neatbildēja');
    return { status: 'success', data: { clean: j.clean !== false, note: String(j.note || '') } };
  } catch (e) { return aiErr_(e); }
}

// 4. Jautājumi par datiem
function aiAsk(question) {
  try {
    question = String(question || '').trim().slice(0, 400);
    if (!question) return aiErr_('Nav jautājuma');
    const tz = Session.getScriptTimeZone();
    // Dati jau saskaitīti pa mēnešiem un adresēm, lai AI nav jāskaita pašam
    const KN = { bags: 'lapas', branches: 'zari', bio: 'bio', bulky: 'lielgabarīts' };
    const agg = {}, mon = {};
    getTasks().forEach(t => {
      const m = /(\d\d)\.(\d\d)\.(\d{4})/.exec(String(t.date)); if (!m) return;
      const ym = m[3] + '-' + m[2], k = KN[kindOf_(t.bagsEst)], key = ym + '|' + t.address + '|' + k;
      const o = agg[key] || (agg[key] = { n: 0, done: 0, m3: 0, open: 0, prob: 0 });
      const M = mon[ym] || (mon[ym] = { n: 0, done: 0, m3: 0, open: 0 });
      o.n++; M.n++;
      if (t.status === ST_DONE) { o.done++; M.done++; o.m3 += num_(t.m3Hauled); M.m3 += num_(t.m3Hauled); }
      else if (t.status === ST_PENDING) { o.open++; M.open++; }
      if (t.problem) o.prob++;
    });
    const r1 = x => Math.round(x * 10) / 10;
    const monLines = Object.keys(mon).sort().map(ym => ym + ': ' + mon[ym].n + ' pieteikumi, ' + mon[ym].done + ' izpildīti, ' + r1(mon[ym].m3) + ' m3, ' + mon[ym].open + ' neizpildīti');
    const rows = Object.keys(agg).sort().map(key => { const o = agg[key]; return key.split('|').join(';') + ';' + o.n + ';' + o.done + ';' + r1(o.m3) + ';' + o.open + (o.prob ? ';nevarēja izvest ' + o.prob : ''); });
    const system = 'Tu atbildi uz jautājumiem par izvešanas pieteikumu datiem. Atbildi latviski, īsi (līdz 6 teikumiem), ar konkrētiem skaitļiem. ' +
      'Šodien ir ' + Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy') + '. Ja datos atbildes nav, pasaki to.';
    const prompt = 'KOPĀ PA MĒNEŠIEM:\n' + monLines.join('\n') +
      '\n\nPA MĒNEŠIEM UN ADRESĒM (mēnesis;adrese;veids;pieteikumi;izpildīti;izvestie m3;neizpildīti):\n' + rows.join('\n') +
      '\n\nJAUTĀJUMS: ' + question;
    return { status: 'success', text: aiCall_(prompt, 6000, system) };
  } catch (e) { return aiErr_(e); }
}

// 5. Mēneša (vai gada, month = -1) kopsavilkums tekstā
function aiMonthSummary(year, month) {
  try {
    const d = reportData_(Number(year), Number(month));
    const lines = [];
    ['sh', 'vni'].forEach(g => Object.keys(d.groups[g]).forEach(a => {
      const o = d.groups[g][a];
      lines.push(a + ': ' + o.n + ' izvešanas, ' + Math.round(o.total * 10) / 10 + ' m3 (lapas ' + o.bags + ', zari ' + o.branches + ', bio ' + o.bio + ')');
    }));
    const prompt = 'Periods: ' + (Number(month) >= 0 ? (Number(month) + 1) + '. mēnesis ' : '') + year + '. gads. ' +
      'Izpildīti ' + d.count + ' pieteikumi. Vidējais laiks līdz izvešanai: ' + (d.speedN ? Math.round(d.speedH / d.speedN) + ' h' : 'nav datu') + '.\n' +
      'Pa adresēm:\n' + lines.join('\n') + '\n\n' +
      'Uzraksti īsu kopsavilkumu latviski (4–6 teikumi) vadībai: kopējais apjoms, kuras adreses lielākās, veidu sadalījums, ātrums, kas būtu jāpievērš uzmanība. Bez virsrakstiem un saraksta zīmēm.';
    return { status: 'success', text: aiCall_(prompt, 6000) };
  } catch (e) { return aiErr_(e); }
}

// Vienreiz: pārceļ saglabātās koordinātas (geo:...) no Script Properties uz dokumenta īpašībām,
// lai Script Properties sarakstā būtu vieta API atslēgai
function moveGeoProps() {
  const sp = PropertiesService.getScriptProperties(), dp = PropertiesService.getDocumentProperties();
  const all = sp.getProperties(), geo = {};
  Object.keys(all).forEach(k => { if (k.indexOf('geo:') === 0) geo[k] = all[k]; });
  if (Object.keys(geo).length) dp.setProperties(geo, false);
  Object.keys(geo).forEach(k => sp.deleteProperty(k));
  Logger.log('Pārceltas koordinātas: ' + Object.keys(geo).length + '. Script Properties palikušas: ' + Object.keys(sp.getProperties()).join(', '));
}

// Pārbaudei no redaktora: Run → aiTest
function aiTest() {
  Logger.log(aiCall_('Atbildi ar vienu vārdu: strādā?', 300));
}

// ================================================================
//  ĀTRĀ VERSIJA (Cloudflare) — tilts. © VAITKEVIX, SIA
//  Lietotne (GitHub) → Cloudflare Worker → šeit. Google tabula paliek galvenā.
//  Script properties: BRIDGE_KEY (tā pati atslēga, kas Cloudflare).
// ================================================================
const BRIDGE_FNS_ = ['getBoot', 'getTasks', 'getInitialData', 'saveTask', 'updateTask', 'setTaskCancelled', 'getAccess', 'checkCarrierPin', 'completeTask',
  'reportProblem', 'reportPdf', 'geocodeAddresses', 'aiParseMessage', 'aiCheckPhoto', 'aiCompare', 'aiAsk', 'aiMonthSummary', 'saveFileToDrive', 'carrierByPassword', 'whoByPassword', 'getLists', 'setLists'];
const BRIDGE_MAP_ = { getBoot: getBoot, getTasks: getTasks, getInitialData: getInitialData, saveTask: saveTask, updateTask: updateTask, setTaskCancelled: setTaskCancelled,
  getAccess: getAccess, checkCarrierPin: checkCarrierPin, completeTask: completeTask, reportProblem: reportProblem, reportPdf: reportPdf,
  geocodeAddresses: geocodeAddresses, aiParseMessage: aiParseMessage, aiCheckPhoto: aiCheckPhoto, aiCompare: aiCompare, aiAsk: aiAsk,
  aiMonthSummary: aiMonthSummary, saveFileToDrive: saveFileToDrive, carrierByPassword: carrierByPassword, whoByPassword: whoByPassword, getLists: getLists, setLists: setLists };

function doPost(e) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const p = (e && e.parameter) || {};
    const key = PropertiesService.getScriptProperties().getProperty('BRIDGE_KEY');
    if (!key || p.key !== key) return out({ ok: false, error: 'Nav atļauts' });
    const fn = BRIDGE_MAP_[p.fn];
    if (!fn || BRIDGE_FNS_.indexOf(p.fn) === -1) return out({ ok: false, error: 'Nezināma darbība' });
    const args = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : [];
    return out({ ok: true, result: fn.apply(null, Array.isArray(args) ? args : []) });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

// ================================================================
//  PIESLĒGŠANĀS AR PAROLI (pasūtītāji un izvedēji/kurjeri). © VAITKEVIX, SIA
//  Paroles glabājas kolonnā "Parole" attiecīgajā lapā.
// ================================================================
function pwCol_(sh, create) {
  const lc = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim());
  const c = head.findIndex(h => /^parole/i.test(h));
  if (c >= 0 || !create) return c;
  sh.getRange(1, lc + 1).setValue('Parole').setFontWeight('bold');
  return lc;
}
function pwRows_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const c = pwCol_(sh, false); if (c < 0) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, c + 1).getValues()
    .map(r => ({ name: String(r[0] || '').replace(/\s+/g, ' ').trim(), pass: String(r[c] || '').trim().toUpperCase() }))
    .filter(x => x.name && x.pass);
}
/** Kas ir šīs paroles īpašnieks: { kind: 'pieteicejs' | 'izvedejs', name } vai null */
function whoByPassword(pw) {
  const p = String(pw == null ? '' : pw).trim().toUpperCase(); if (!p) return null;
  const req = pwRows_('Cilveki').filter(x => x.pass === p);
  const car = pwRows_('SIA').filter(x => x.pass === p);
  if (req.length + car.length === 1) return req.length ? { kind: 'pieteicejs', name: req[0].name } : { kind: 'izvedejs', name: car[0].name };
  Utilities.sleep(800); return null;
}
function fillPw_(sheetName, digits) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) throw new Error('Lapā "' + sheetName + '" nav neviena ieraksta');
  const c = pwCol_(sh, true);
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, c + 1).getValues();
  const used = new Set(['Cilveki', 'SIA'].map(pwRows_).flat().map(x => x.pass));
  const abc = digits ? '0123456789' : 'ABCDEFGHJKLMNPRSTUVZ23456789', len = digits || 8; let n = 0;
  const gen = () => { let x; do { x = ''; for (let i = 0; i < len; i++) x += abc[Math.floor(Math.random() * abc.length)]; } while (used.has(x) || x[0] === '0'); used.add(x); return x; };
  v.forEach(r => { if (String(r[0]).trim() && !String(r[c]).trim()) { r[c] = gen(); n++; } });
  sh.getRange(2, c + 1, v.length, 1).setNumberFormat('@').setValues(v.map(r => [r[c]]));
  ss.toast('Paroles ieliktas: ' + n, sheetName);
  return n;
}
/** Palaid no redaktora: pasūtītājiem bez paroles ieliek unikālu paroli */
function aizpilditPasutitajuParoles() { return fillPw_('Cilveki', 6); }

// ================================================================
//  PAMATDATI no SH portāla (adreses, cilvēki, uzņēmumi, saraksti). © VAITKEVIX, SIA
//  Portāls ir galvenais; šīs lapas tiek atjaunotas automātiski, lai lietotne strādā kā līdz šim.
// ================================================================
function sheetRaw_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh ? sh.getDataRange().getDisplayValues() : null;
}
/** Pirmajam importam: visas sarakstu lapas, kā tās ir */
function getLists() { const o = {}; ['Adreses', 'Cilveki', 'SIA'].forEach(n => o[n] = sheetRaw_(n)); return o; }
/** p = { lapa: { cols: ['Adrese', 'Piekļuve'], rows: [[...]] } } — 1. kolonna ir atslēga (kolonna A), pārējās pēc virsraksta; citas kolonnas paliek */
function setLists(p) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { const out = {}; Object.keys(p || {}).forEach(n => out[n] = setList_(n, p[n])); SpreadsheetApp.flush(); return out; }
  finally { lock.releaseLock(); }
}
function setList_(name, spec) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const cols = spec.cols || [], rows = spec.rows || [];
  let lc = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lc).getDisplayValues()[0].map(h => String(h).trim());
  if (!head[0]) { head[0] = cols[0]; sh.getRange(1, 1).setValue(cols[0]).setFontWeight('bold'); }
  const idx = [0];
  for (let j = 1; j < cols.length; j++) {
    let c = head.findIndex(h => h.toLowerCase() === String(cols[j]).toLowerCase());
    if (c < 0) { c = head.length; head.push(cols[j]); sh.getRange(1, c + 1).setValue(cols[j]).setFontWeight('bold'); }
    idx.push(c);
  }
  lc = head.length;
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const last = sh.getLastRow();
  const cur = last > 1 ? sh.getRange(2, 1, last - 1, lc).getValues() : [];
  const map = {}; cur.forEach(r => { const k = norm(r[0]); if (k && !map[k]) map[k] = r; });
  const outRows = rows.map(r => { const b = (map[norm(r[0])] || new Array(lc).fill('')).slice(); while (b.length < lc) b.push(''); idx.forEach((c, j) => { b[c] = r[j] == null ? '' : r[j]; }); return b; });
  if (last > 1) sh.getRange(2, 1, last - 1, lc).clearContent();
  if (outRows.length) { sh.getRange(2, 1, outRows.length, lc).setNumberFormat('@').setValues(outRows); }
  return outRows.length;
}

/** Inventārs: lapas, izmēri, formulas ar atsaucēm uz citām lapām (pārcelšanai uz vienu tabulu). © VAITKEVIX, SIA */
function lapuInventars() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = ss.getSheets().map(sh => {
    const r = sh.getLastRow(), c = sh.getLastColumn();
    let f = 0, x = 0, ext = 0;
    if (r && c) sh.getRange(1, 1, Math.min(r, 3000), c).getFormulas().forEach(row => row.forEach(v => { if (v) { f++; if (/!/.test(v)) x++; if (/IMPORTRANGE/i.test(v)) ext++; } }));
    return [sh.getName(), r, c, f, x, ext, sh.isSheetHidden() ? 'slēpta' : ''].join(' | ');
  });
  console.log(ss.getName() + ' (' + ss.getId() + ')\n' + out.join('\n'));
  return out;
}
