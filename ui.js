/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · interfaccia. I file caricati restano nel browser: non vengono salvati né inviati in rete. */
(function () {
  "use strict";
  var L = window.KoinlyLettura, D = window.KoinlyDetenzione, I = window.KoinlyIvaca, Z = window.KoinlySanzioni, MOD = window.KoinlyModelli, C = window.KoinlyCosti, QZ = window.KoinlyQuestionario, BK = window.KoinlyBanca, ET = window.KoinlyEtoro, KR = window.KoinlyReport;
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "comune/vendor/pdf.worker.min.js";
  var app = document.getElementById("app");

  // ordine delle schede scelto dallo studio, numerate da 0
  var TABS = ["Guida", "Caricamento file", "Costi di carico (LIFO)", "Giorni di detenzione, IVACA e IVAFE", "Quadri RW, RT e F24", "Sanzioni RW, RT e RM", "Questionario AdE"];
  var VISTE = ["guida", "caricamento", "costi", "ivaca", "modelli", "sanzioni", "questionario"];
  var S = { tab: 1, tx: null, inizio: null, fine: null, anno: null, fuso: "UTC", quota: 100, inclusi: {}, valori: {}, aperti: {}, spamAperti: false, errore: {}, saldiFile: [], report: [] };
  var calcolo = null, ivaca = null;

  /* ---------- formattazione ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function E(x, dec) { if (x == null || !isFinite(x)) return "–"; return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }).format(x); }
  function Q(s) { // quantità esatta in formato italiano, fino a 8 decimali
    if (s == null || s === "") return "–";
    var t = String(s), neg = t[0] === "-"; if (neg) t = t.slice(1);
    var p = t.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."), f = (p[1] || "").slice(0, 8).replace(/0+$/, "");
    return (neg ? "-" : "") + i + (f ? "," + f : "");
  }
  function it(g) { return D.it(g); }
  function QU(s, r) { var q = Q(s); return q === "–" ? q : q + ' <span class="u">' + esc(String(r.nome).split(";")[0]) + "</span>"; }
  var LEGENDA = '<p class="metodi"><b>Come leggere le quantità.</b> Sono unità della cripto (per esempio 37.532,88 XRP), non euro, sommate su tutti i wallet e gli exchange. ' +
    '<b>Quantità 1/1</b>: unità detenute all\'inizio del 1° gennaio, dal report Koinly di inizio anno. <b>Quantità 31/12</b>: unità detenute alla fine del 31 dicembre, ricostruite dalle transazioni e riscontrate con il report di fine anno. ' +
    '<b>Quantità del periodo</b>: unità detenute in modo costante dalla data di inizio a quella di fine detenzione del periodo; per un periodo che si chiude con una vendita è la quantità posseduta prima della vendita. ' +
    '<b>Quantità media</b>: media delle quantità dei periodi ponderata per i giorni. I valori in euro sono quantità × prezzo del giorno di inizio o di fine detenzione.</p>';

  /* ---------- lettura dei file ---------- */
  async function testoPdf(f) { return await window.LumesPdf.pdfToPages(window.pdfjsLib, new Uint8Array(await f.arrayBuffer())); }
  async function carica(slot, files) {
    S.errore[slot] = null;
    var errori = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var pdf = /\.pdf$/i.test(f.name);
        if (slot === "tx") {
          if (pdf) throw new Error("Per le transazioni serve il CSV esportato da Koinly.");
          var dati = D.leggiTransazioni(await f.text());
          if (dati.errore) throw new Error(dati.errore);
          S.tx = { nome: f.name, dati: dati };
        } else {
          var r = pdf ? L.leggiPdf(await testoPdf(f)) : L.leggiCsv(await f.text());
          if (r.errore) throw new Error(r.errore);
          if (!r.saldi.length) throw new Error("Nel file non ci sono saldi leggibili.");
          if (slot === "fine" && r.tipoSaldi === "inizio") throw new Error("è il report dei saldi di inizio anno: va nello spazio accanto.");
          // un file per data: un nuovo report della stessa data sostituisce il precedente
          var data = r.tipoSaldi === "inizio" ? r.anno + "-01-01" : r.anno + "-12-31";
          S.saldiFile = S.saldiFile.filter(function (x) { return x.data !== data; });
          S.saldiFile.push({ nome: f.name, r: r, data: data, slot: slot });
          S.saldiFile.sort(function (x, y) { return x.data < y.data ? -1 : 1; });
        }
      } catch (e) { errori.push(f.name + ": " + (e.message || String(e))); }
    }
    if (errori.length) S.errore[slot] = errori.join(" · ");
    scegliAnno(); ricalcola(); render();
  }
  /* saldi Koinly dell'anno: inizio = report al 1/1 dell'anno o di fine dell'anno precedente; fine = report al 31/12
     (o, in mancanza, quello al 1/1 dell'anno dopo). Restituiscono { nome, r } con r.annoInizio come prima. */
  function saldiInizioAnno(a) {
    var x = S.saldiFile.filter(function (z) { return z.data === a + "-01-01"; })[0], nota = "";
    if (!x) { x = S.saldiFile.filter(function (z) { return z.data === (a - 1) + "-12-31"; })[0]; nota = "Saldi al 31/12/" + (a - 1) + " usati come saldi al 1° gennaio " + a + "."; }
    if (!x) return null;
    return { nome: x.nome, r: Object.assign({}, x.r, { annoInizio: a, nota: nota || x.r.nota }) };
  }
  function saldiFineAnno(a) {
    var x = S.saldiFile.filter(function (z) { return z.data === a + "-12-31"; })[0], nota = "";
    if (!x) { x = S.saldiFile.filter(function (z) { return z.data === (a + 1) + "-01-01"; })[0]; nota = "Saldi al 1° gennaio " + (a + 1) + " usati come saldi al 31/12/" + a + "."; }
    if (!x) return null;
    return { nome: x.nome, r: Object.assign({}, x.r, { anno: a, nota: nota || x.r.nota }) };
  }
  /* anni calcolabili: l'ultimo importato (ultimo anno dei saldi o, senza saldi, l'ultimo anno chiuso delle transazioni) e fino a 5 anni prima */
  function ultimoAnno() {
    // un report al 1/1 indica l'anno che si apre (saldi di inizio dell'anno in esame), uno al 31/12 l'anno che si chiude
    var fin = S.saldiFile.map(function (z) { return +z.data.slice(0, 4); });
    if (fin.length) return Math.max.apply(null, fin);
    var a = anniTx(); return a.filter(function (x) { return x < new Date().getFullYear(); }).pop() || a.pop();
  }
  function anniIvaca() {
    var u = ultimoAnno(), tx = anniTx(); if (!u) return [];
    var out = []; for (var a = u - 5; a <= u; a++) if (!tx.length || tx[0] <= a) out.push(a);
    return out;
  }
  /* anno aperto: resta quello scelto se ha i saldi completi; altrimenti l'ultimo anno con saldi di inizio e fine, o l'ultimo anno */
  function scegliAnno() {
    var anni = anniIvaca(), completo = function (a) { return !!(saldiInizioAnno(a) && saldiFineAnno(a)); };
    if (S.anno && anni.indexOf(S.anno) >= 0 && completo(S.anno)) return;
    var ok = anni.filter(completo);
    S.anno = ok.length ? ok[ok.length - 1] : anni[anni.length - 1] || null;
  }
  function anniTx() {
    if (!S.tx) return [];
    var m = S.tx.dati.movimenti, set = {};
    m.forEach(function (t) { set[new Date(t.ts).getUTCFullYear()] = true; });
    return Object.keys(set).map(Number).sort();
  }

  /* ---------- calcolo ---------- */
  function calcolaAnno(a, opz) {
    var o = opz || {}, ini = saldiInizioAnno(a), fin = saldiFineAnno(a);
    if (!S.tx || !ini || !fin) return null;
    var iniz = {}; ini.r.saldi.forEach(function (s) { if (s.tipo !== "fiat" && s.quantitaTesto != null) iniz[s.simbolo] = s.quantitaTesto; });
    var c = D.calcola(S.tx.dati, a, { fuso: S.fuso, iniziali: iniz });
    c.differenzeFine = D.confronta(c, fin.r.saldi);
    var iv = I.calcola(c, { quota: Math.min(100, Math.max(0, +S.quota || 0)) / 100, saldiInizio: ini.r.saldi, saldiFine: fin.r.saldi, inclusi: o.inclusi || {}, valori: o.valori || {} });
    return { calcolo: c, ivaca: iv };
  }
  function ricalcola() {
    calcolo = ivaca = null; S.riepilogoAnni = null;
    S.inizio = S.anno ? saldiInizioAnno(S.anno) : null; S.fine = S.anno ? saldiFineAnno(S.anno) : null;
    if (!S.tx || !S.inizio || !S.fine || !S.anno) return;
    var x = calcolaAnno(S.anno, { inclusi: S.inclusi, valori: S.valori });
    calcolo = x.calcolo; ivaca = x.ivaca;
  }
  /* riepilogo di tutti gli anni calcolabili (scelte di inclusione e valori a mano valgono solo per l'anno aperto) */
  function riepilogoAnni() {
    if (S.riepilogoAnni) return S.riepilogoAnni;
    S.riepilogoAnni = anniIvaca().map(function (a) {
      var x = a === S.anno && ivaca ? { calcolo: calcolo, ivaca: ivaca } : calcolaAnno(a);
      var fin = saldiFineAnno(a), ini = saldiInizioAnno(a);
      if (!x) return { anno: a, ini: ini, fin: fin };
      var r = x.ivaca.righe.filter(function (z) { return z.incluso; });
      return { anno: a, ini: ini, fin: fin, cripto: r.length, periodi: x.ivaca.totali.righiRw, valoreFinale: r.reduce(function (s, z) { return s + (z.valoreFinale || 0); }, 0), ivaca: x.ivaca.totali.ivaca, dovuta: x.ivaca.dovuta, differenze: (x.calcolo.differenzeFine || []).length };
    });
    return S.riepilogoAnni;
  }

  /* ---------- viste ---------- */
  function nav() {
    document.getElementById("steps").innerHTML = TABS.map(function (t, i) {
      return '<button type="button" data-tab="' + i + '"' + (S.tab === i ? ' aria-current="step"' : "") + '><span class="n">' + i + "</span>" + esc(t) + "</button>";
    }).join("");
  }
  function slot(id, titolo, obbl, testo, accetta) {
    var x = S[id], err = S.errore[id], stato = "";
    if (err) stato = '<p class="stato" style="color:var(--hi)">' + esc(err) + "</p>";
    else if (x && id === "tx") stato = '<p class="stato"><b>' + esc(x.nome) + "</b><br>" + x.dati.movimenti.length.toLocaleString("it-IT") + " transazioni lette" +
      (x.dati.cancellate ? ", " + x.dati.cancellate + " cancellate escluse" : "") + "; date in " + (x.dati.fuso || "fuso non indicato") + "; numeri in formato " + (x.dati.numeri === "it" ? "italiano" : "inglese") + ".</p>";
    else if (id !== "tx") {
      var el = S.saldiFile.filter(function (z) { return id === "inizio" ? z.r.tipoSaldi === "inizio" || z.slot === "inizio" : z.r.tipoSaldi !== "inizio" && z.slot !== "inizio"; });
      x = el.length ? el : null;
      if (x) stato = '<p class="stato">' + el.map(function (z) { return "<b>" + esc(z.nome) + "</b> · saldi al " + it(z.data) + " · " + z.r.saldi.length + " cripto, " + E(z.r.valoreCripto) + (z.r.avvisi.length ? '<br><span style="color:var(--mid)">' + z.r.avvisi.map(esc).join("<br>") + "</span>" : "") + ' <button type="button" class="btnlink small" data-toglisaldi="' + z.data + '">togli</button>'; }).join("<br>") + "</p>";
    }
    return '<div class="slot' + (err ? " err" : x ? " ok" : "") + '"><span class="req">' + (obbl ? "Obbligatorio" : "Facoltativo") + "</span><h3>" + titolo + '</h3><p class="small muted" style="margin:0">' + testo + "</p>" +
      '<input type="file" accept="' + accetta + '" data-slot="' + id + '"' + (id === "tx" ? "" : " multiple") + ">" + stato + (x && id === "tx" ? '<button type="button" class="btnlink small" data-togli="' + id + '">Togli il file</button>' : "") + "</div>";
  }
  /* Complete tax report Koinly: facoltativo, serve al confronto cessione per cessione (Costi di carico, Sanzioni, Quadri, memoria) */
  function slotKoinlyCes() {
    var x = S.koinlyCes, err = S.koinlyCesErrore;
    return '<div class="slot' + (err ? " err" : x ? " ok" : "") + '"><span class="req">Facoltativo</span><h3>Complete tax report Koinly</h3><p class="small muted" style="margin:0">PDF del «Complete tax report» (anche di più anni): le sue cessioni si confrontano una per una con quelle ricostruite, nella scheda Costi di carico.</p>' +
      '<input type="file" accept=".pdf" data-koinlyces>' + (err ? '<p class="stato" style="color:var(--hi)">' + esc(err) + "</p>" : x ? '<p class="stato"><b>' + esc(x.nome) + "</b><br>periodo " + esc(x.periodo || "") + " · " + x.cessioni.length + " cessioni · date in " + (x.fuso === "UTC" ? "UTC" : "ora italiana") + '</p><button type="button" class="btnlink small" id="togliKoinlyCes">Togli il file</button>' : "") + "</div>";
  }
  /* riquadro di caricamento generico: titolo, obbligatorio o no, che cosa caricare, campo file e stato */
  function riquadro(titolo, obbl, testo, campo, stato, err, ok) {
    return '<div class="slot' + (err ? " err" : ok ? " ok" : "") + '"><span class="req">' + obbl + "</span><h3>" + titolo + '</h3><p class="small muted" style="margin:0">' + testo + "</p>" + campo + (stato || "") + "</div>";
  }
  function viewCaricamento() {
    var B = S.banca;
    var h = '<h2>Caricamento file</h2><p class="lead">Qui si caricano tutti i file della pratica. Per ciascuno è indicato che cosa contiene, dove si scarica e in quale scheda si usa. Le transazioni e i saldi di Koinly sono indispensabili; gli altri file aggiungono riscontri e quadri.</p>' +
      '<div class="banner beta-avviso"><strong>Versione beta</strong><p>Koinly Tools è in fase di test: i risultati vanno verificati con lo studio prima di usarli per la dichiarazione o per qualsiasi versamento. Segnalazioni e suggerimenti sono benvenuti.</p></div>' +
      '<div class="banner"><strong>Riservatezza</strong><p>I file restano in questo browser: non vengono salvati né inviati in rete. Non sapete quali file caricare? <button type="button" class="btnlink" data-tab="0">Leggete la guida</button>.</p></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Koinly</h3><div class="slots">' +
      slot("tx", "Transazioni", true, "CSV con tutte le transazioni di tutti gli anni, dal primo acquisto: «backup_transactions_koinly.csv» (Koinly › Transactions › esporta) oppure «transaction history». Serve a tutte le schede: periodi di detenzione, costi di carico, questionario.", ".csv,text/csv") +
      slot("inizio", "Saldi a inizio anno", true, "«Beginning of year holdings» in CSV (Koinly › Tax reports), uno per ogni anno da esaminare, anche più file insieme. Quantità e valori al 1° gennaio; il report di fine dell'anno precedente vale come saldo iniziale. Serve ai giorni di detenzione e all'IVACA (fino a 5 anni prima dell'ultimo) e dà i prezzi Koinly al questionario dell'Agenzia, per tutti gli anni richiesti.", ".csv,.pdf") +
      slot("fine", "Saldi a fine anno", true, "«End of year holdings» in CSV o «Complete tax report» in PDF, uno per ogni anno da esaminare (anche più file insieme): quantità e valori al 31/12, per il riscontro e il valore finale del quadro RW e per i prezzi del questionario dell'Agenzia.", ".csv,.pdf") +
      slotKoinlyCes() +
      riquadro("Altri report Koinly", "Facoltativo", "CSV di «Income report», «Expenses report», «Gifts, donations &amp; lost assets» e «Other gains report» (Koinly › Tax reports), anche più file e più anni insieme. Danno informazioni in più (redditi, commissioni, perdite, derivati) e non cambiano i calcoli: i riepiloghi sono nella scheda «Quadri RW, RT e F24».",
        '<input type="file" multiple accept=".csv,text/csv" data-kreport>', (S.reportErrore ? '<p class="stato" style="color:var(--hi)">' + esc(S.reportErrore) + "</p>" : "") + (S.report.length ? '<p class="stato">' + S.report.map(function (z) { return "<b>" + esc(z.nome) + "</b> · " + esc(z.r.titolo) + " " + (z.r.anno || "") + " · " + z.r.righe.length.toLocaleString("it-IT") + " righe, " + E(z.r.totale) + ' <button type="button" class="btnlink small" data-toglireport="' + esc(z.chiave) + '">togli</button>'; }).join("<br>") + "</p>" : ""), S.reportErrore, S.report.length) +
      "</div></div>";
    var et = S.etoro;
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Broker esteri e banche</h3><div class="slots">' +
      riquadro("Rendiconto eToro", "Facoltativo", "PDF del rendiconto del conto («Account statement»: eToro › Portafoglio › Rendiconto del conto), dal primo deposito alla fine dell'ultimo anno. Se ne leggono posizioni chiuse, movimenti, dividendi e portafoglio; i quadri RT, RM e RW calcolati sono nella scheda «Quadri RW, RT e F24». Nome, indirizzo e nome utente non vengono conservati.",
        '<input type="file" accept=".pdf" data-etoro>', S.etoroErrore ? '<p class="stato" style="color:var(--hi)">' + esc(S.etoroErrore) + "</p>" : et ? '<p class="stato"><b>' + esc(et.nome) + "</b><br>" + esc(et.d.periodo) + " · " + et.d.chiuse.length + " posizioni chiuse · " + et.d.attivita.length + " movimenti · " + et.d.dividendi.length + " dividendi · " + et.d.holdings.length + ' fotografie del portafoglio</p><button type="button" class="btnlink small" id="togliEtoro">Togli il file</button>' : "", S.etoroErrore, et) +
      riquadro("Estratti conto bancari", "Facoltativo", "PDF con testo degli estratti conto (anche più file). Si tengono <b>solo</b> data, importo ed exchange dei movimenti verso o da piattaforme di cripto-attività; tutte le altre righe sono scartate e non vengono mostrate né salvate. Il riscontro con Koinly è nella scheda «Costi di carico».",
        '<input type="file" multiple accept=".pdf" data-banca>', B.errore ? '<p class="stato" style="color:var(--hi)">' + esc(B.errore) + "</p>" : B.file ? '<p class="stato">' + B.file + " file letti: " + B.movimenti.length + " movimenti con exchange tenuti, " + B.scartate + ' righe scartate</p><button type="button" class="btnlink small" id="svuotaBanca">Togli gli estratti conto</button>' : "", B.errore, B.file) +
      "</div></div>";
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Lavoro dello studio</h3><div class="slots">' +
      riquadro("File di lavoro", "Facoltativo", "Il file JSON salvato da Koinly Tools con le correzioni dei costi, le attribuzioni dei wallet con i loro indirizzi e chiavi pubbliche, i dati del cliente e gli altri redditi inseriti nei quadri. Salvatelo prima di chiudere la pagina e ricaricatelo qui per riprendere il lavoro.",
        '<input type="file" accept=".json" data-lavoro><div class="toolbar" style="margin-top:8px"><button type="button" class="btn ghost" id="salvaLavoro">Salva il lavoro in un file</button></div>', '<p class="stato">' + (S.lavoroCaricato ? "Caricato: " + esc(S.lavoroCaricato) : Object.keys(S.correzioni).length + " correzioni in questa sessione") + "</p>", false, S.lavoroCaricato) +
      "</div></div>";
    return h;
  }
  function viewIvaca() {
    var h = '<h2>Giorni di detenzione e IVACA</h2><p class="lead">Dalle transazioni Koinly si ricostruiscono, cripto per cripto e sul totale di tutti i wallet, i giorni di detenzione dell\'anno e i periodi a quantità costante; con il valore di fine anno si calcola l\'imposta sul valore delle cripto-attività (quadro RW, col. 33).</p>';
    if (!S.tx || !S.saldiFile.length) return h + '<p class="muted" style="margin-top:14px">Per calcolare servono le transazioni e i saldi di inizio e fine anno di almeno un anno: ' + (!S.tx ? "mancano le transazioni" : "mancano i saldi") + '. Caricateli nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>.</p>';
    var anni = anniIvaca();
    h += '<div class="panel" style="margin-top:14px"><div class="grid2">' +
      '<label class="f"><span class="t">Anno</span><select data-k="anno">' + anni.map(function (a) { var ok = saldiInizioAnno(a) && saldiFineAnno(a); return '<option value="' + a + '"' + (a === S.anno ? " selected" : "") + ">" + a + (ok ? "" : " · mancano i saldi") + (a <= 2022 ? " · solo monitoraggio" : "") + "</option>"; }).join("") + '</select><span class="small">Fino a 5 anni prima dell\'ultimo anno importato (' + anni[anni.length - 1] + ").</span></label>" +
      '<label class="f"><span class="t">Fuso orario delle date</span><select data-k="fuso"><option value="UTC"' + (S.fuso === "UTC" ? " selected" : "") + '>UTC (come nel file Koinly)</option><option value="Europe/Rome"' + (S.fuso === "Europe/Rome" ? " selected" : "") + ">Ora italiana</option></select><span class=\"small\">Il giorno di un movimento fatto di notte può cambiare.</span></label>" +
      '<label class="f"><span class="t">Quota di possesso <span class="muted small">(%)</span></span><input class="num" type="number" min="0" max="100" step="any" data-k="quota" value="' + esc(S.quota) + '"></label>' +
      "</div></div>";
    h += riepilogoPluriennale();
    if (!calcolo) {
      var mi = [!S.inizio && "i saldi al 1° gennaio " + S.anno + " (o al 31/12/" + (S.anno - 1) + ")", !S.fine && "i saldi al 31/12/" + S.anno].filter(Boolean);
      return h + '<p class="muted" style="margin-top:14px">Per il ' + S.anno + " mancano " + mi.join(" e ") + '. Caricateli nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>.</p>';
    }
    if (ivaca.nonDovuta) h += '<div class="banner" style="margin-top:14px"><strong>Anno ' + S.anno + '</strong><p>' + esc(ivaca.nonDovuta) + "</p></div>";
    return h + risultati();
  }
  function riepilogoPluriennale() {
    var R = riepilogoAnni(); if (R.length < 2) return "";
    return '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Riepilogo degli anni</h3>' +
      tab(["Anno", "Quadro RW", "Saldi 1/1", "Saldi 31/12", "n:Cripto", "n:Righi RW", "n:Valore finale", "n:IVACA", "Riscontro 31/12"], R.map(function (x) {
        return ['<button type="button" class="btnlink" data-annoivaca="' + x.anno + '">' + x.anno + "</button>", x.anno >= 2023 ? "codice 21 · IVACA" : "codice 14 · solo monitoraggio", x.ini ? "✓" : '<span style="color:var(--hi)">manca</span>', x.fin ? "✓" : '<span style="color:var(--hi)">manca</span>',
          x.cripto == null ? "–" : x.cripto, x.periodi == null ? "–" : x.periodi, x.valoreFinale == null ? "–" : E(x.valoreFinale, 0), x.ivaca == null ? "–" : x.dovuta ? E(x.ivaca) + (x.ivaca > 12 ? "" : ' <span class="small muted">(sotto 12 €)</span>') : '<span class="small muted">non dovuta</span>',
          x.differenze == null ? "–" : x.differenze ? '<span style="color:var(--hi)">' + x.differenze + " differenze</span>" : "✓"];
      }), 10) + '<p class="small">Fino al 31/12/2022 non era dovuta l\'IVACA né l\'IVAFE sulle cripto: il quadro RW (codice 14) serve solo al monitoraggio. Dal 2023 codice 21 e imposta dello 0,20%. Valore finale: somma dei valori finali di fine detenzione. Cliccate un anno per aprirlo.</p></div>';
  }
  function avvisi() {
    var a = [], c = calcolo;
    if (S.inizio && S.inizio.r.annoInizio !== S.anno) a.push(["hi", "Il report dei saldi di inizio anno riguarda il " + S.inizio.r.annoInizio + ", non il " + S.anno + ": non è stato usato."]);
    if (S.fine && S.fine.r.anno !== S.anno) a.push(["hi", "Il report di fine anno riguarda il " + S.fine.r.anno + ", non il " + S.anno + ": non è stato usato."]);
    if (c.saldiInizialiDaReport) a.push(c.differenzeIniziali.length ? ["hi", "Saldi al 1° gennaio presi dal report Koinly. Differenze con quelli ricostruiti dalle transazioni: " + c.differenzeIniziali.map(function (d) { return d.simbolo + " report " + Q(String(d.report)) + " / transazioni " + Q(String(d.ricostruito)); }).join("; ") + "."]
      : ["ok", "Saldi al 1° gennaio presi dal report Koinly: coincidono con quelli ricostruiti dalle transazioni."]);
    if (c.differenzeFine) a.push(c.differenzeFine.length ? ["hi", "Quantità al 31/12 diverse dal report Koinly: " + c.differenzeFine.map(function (d) { return d.simbolo + " calcolato " + Q(String(d.calcolato)) + " / report " + Q(String(d.report)); }).join("; ") + ". Verificare transazioni mancanti o token che Koinly nasconde."]
      : ["ok", "Quantità al 31/12 coincidenti con il report Koinly di fine anno."]);
    if (c.anomalie) a.push(["hi", c.anomalie + " cripto con saldo negativo: storico incompleto, da verificare (non corretto d'ufficio)."]);
    if (c.spam) a.push(["", c.spam + " token sospetti (spam, phishing, imitazioni di USDT/USDC) esclusi dai totali: sono elencati in fondo e si possono includere."]);
    a.push(["", "Transazioni nell'anno: " + c.transazioniAnno.toLocaleString("it-IT") + " (da confrontare con il Summary del Tax Report Koinly). Date in " + (c.fuso === "UTC" ? "UTC" : "ora italiana") + "."]);
    a.push(["", "Il calcolo somma tutti i wallet per cripto. La circolare 30/E chiede un rigo RW per ogni portafoglio: per la dichiarazione i valori vanno ripartiti per wallet."]);
    return '<ul class="avvisi">' + a.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + "</li>"; }).join("") + "</ul>";
  }
  function fonte(f) { return f === "report" ? "" : f === "manuale" ? " ✎" : f === "stima" ? " *" : ""; }
  function righeTabella(righe) {
    return righe.map(function (r) {
      var aperto = S.aperti[r.chiave];
      var tr = '<tr class="' + (r.incluso ? "" : "escl") + '"><td><input type="checkbox" data-incl="' + esc(r.chiave) + '"' + (r.incluso ? " checked" : "") + ' aria-label="Includi ' + esc(r.nome) + '"></td>' +
        "<td><b>" + esc(r.nome) + "</b></td>" +
        "<td>" + it(r.primo) + "</td><td>" + it(r.ultimo) + '</td><td class="n">' + QU(r.iniziale, r) + '</td><td class="n">' + QU(r.finale, r) + '</td><td class="n">' + r.giorni + "</td>" +
        '<td class="n"><button type="button" class="btnlink" data-apri="' + esc(r.chiave) + '">' + r.periodi.length + (aperto ? " ▴" : " ▾") + "</button></td>" +
        '<td class="n">' + E(r.valoreIniziale) + "</td>" +
        '<td class="n"><input class="num" type="number" step="any" data-val="' + esc(r.chiave) + '" value="' + (S.valori[r.chiave] != null ? esc(S.valori[r.chiave]) : r.valoreFinale != null ? (Math.round(r.valoreFinale * 100) / 100) : "") + '" title="Valore finale dell\'ultimo periodo (fonte: ' + esc(r.fonteFinale || "mancante") + ')"></td>' +
        '<td class="n"><b>' + E(r.ivaca) + '</b></td><td class="n">' + E(r.valoreMedio) + "</td>" +
        '<td class="note">' + (r.note.length ? "<ul>" + r.note.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") + "</td></tr>";
      if (aperto) tr += '<tr><td></td><td colspan="12"><table class="det periodi"><thead><tr><th>Inizio detenzione</th><th>Fine detenzione</th><th class="n">Giorni</th><th class="n">Quantità</th><th class="n">Valore iniziale</th><th class="n">Valore finale</th><th class="n">IVACA</th></tr></thead><tbody>' +
        r.periodi.map(function (p) {
          return "<tr><td>" + it(p.dal) + "</td><td>" + it(p.al) + '</td><td class="n">' + p.giorni + '</td><td class="n">' + QU(p.quantita, r) +
            '</td><td class="n">' + E(p.valoreIniziale) + fonte(p.fonteIniziale) + '</td><td class="n">' + E(p.valore) + fonte(p.fonteFinale) + '</td><td class="n">' + E(p.ivaca, 4) + "</td></tr>";
        }).join("") + '<tr class="tot"><td>Totale</td><td></td><td class="n">' + r.periodi.reduce(function (a, p) { return a + p.giorni; }, 0) + '</td><td colspan="3"></td><td class="n">' + E(r.ivaca) + "</td></tr>" + '</tbody></table><p class="small muted" style="margin:0">Valore finale al prezzo del giorno di fine detenzione, dal controvalore in euro delle transazioni Koinly; il valore iniziale di un periodo è il valore finale del periodo precedente (il primo parte dal report di inizio anno o dal giorno di inizio detenzione); dai report Koinly per i periodi che iniziano il 1/1 o finiscono il 31/12, se caricati. * prezzo stimato (ultimo noto) · ✎ inserito a mano.</p></td></tr>';
      return tr;
    }).join("");
  }
  function risultati() {
    var iv = ivaca, vere = iv.righe.filter(function (r) { return !r.spam; }), spam = iv.righe.filter(function (r) { return r.spam; });
    var t = iv.totali;
    var testa = '<thead><tr><th></th><th>Cripto</th><th>Inizio detenzione</th><th>Fine detenzione</th><th class="n">Quantità 1/1</th><th class="n">Quantità 31/12</th><th class="n">Giorni</th><th class="n">Periodi (righi RW)</th><th class="n">Valore iniziale</th><th class="n">Valore finale €</th><th class="n">IVACA</th><th class="n">Valore medio detenuto</th><th>Note</th></tr></thead>';
    return '<div class="stack" style="margin-top:14px">' +
      '<div class="cards"><div class="card"><div class="k">Cripto detenute nel ' + S.anno + '</div><div class="v">' + vere.length + '</div></div>' +
      '<div class="card"><div class="k">Periodi di detenzione (righi RW)</div><div class="v">' + t.righiRw.toLocaleString("it-IT") + "</div></div>" +
      '<div class="card hl"><div class="k">IVACA dovuta</div><div class="v">' + E(t.ivaca) + "</div></div>" +
      "</div>" +
      '<p class="metodi">Ogni cambio di quantità apre un nuovo periodo di detenzione: un acquisto dal giorno stesso, una vendita dal giorno successivo (il giorno della vendita chiude il periodo precedente, valutato al prezzo di quel giorno). Per ogni periodo: <b>IVACA = valore finale × 0,20% × quota × giorni / 365</b> (Redditi PF, quadro RW col. 33). Valore iniziale e finale sono quelli di inizio e fine detenzione. ' +
      (iv.mancanti ? "<b>" + iv.mancanti + " cripto senza valore: il totale è incompleto.</b> " : "") + (t.ivaca <= I.PARAMETRI.sogliaVersamento ? "L'imposta non supera 12 €: non si versa." : "") + "</p>" +
      LEGENDA + '<div class="panel"><h3 style="margin-top:0">Riscontri</h3>' + avvisi() + "</div>" +
      '<div class="panel"><div class="toolbar noprint" style="margin-bottom:10px"><button type="button" class="btn" id="excel">Scarica Excel</button><button type="button" class="btn gold" id="stampa">Stampa / PDF</button></div>' +
      '<div class="scroll"><table class="det">' + testa + "<tbody>" + righeTabella(vere) +
      '<tr class="tot"><td></td><td>Totale incluse</td><td colspan="8"></td><td class="n">' + E(t.ivaca) + '</td><td></td><td></td></tr>' +
      "</tbody></table></div></div>" +
      (spam.length ? '<div class="panel"><details' + (S.spamAperti ? " open" : "") + ' id="spam"><summary>Token sospetti esclusi (' + spam.length + ")</summary><div class=\"scroll\"><table class=\"det\">" + testa + "<tbody>" + righeTabella(spam) + "</tbody></table></div></details></div>" : "") +
      "</div>";
  }
  /* ---------- sanzioni RW e RT ---------- */
  var oggiIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  S.sanz = { pagamento: oggiIso, anni: [], errore: {} };
  var idAnno = 0;
  function nuovoAnno() {
    var usati = S.sanz.anni.map(function (a) { return a.anno; }), anno = 2025;
    while (usati.indexOf(anno) >= 0 && anno > 2019) anno--;
    S.sanz.anni.push({ id: ++idAnno, anno: anno, stato: "presentata", nome: null, valoreRw: "", ivaca: "", corrispettivi: "", costi: "", redditi: null, fonte: {} });
    S.sanz.anni.sort(function (a, b) { return a.anno - b.anno; });
  }
  async function caricaReportAnno(id, f) {
    var a = S.sanz.anni.filter(function (x) { return x.id === id; })[0]; S.sanz.errore[id] = null;
    try {
      var r = /\.pdf$/i.test(f.name) ? L.leggiPdf(await testoPdf(f)) : L.leggiCsv(await f.text());
      if (r.errore) throw new Error(r.errore);
      if (r.tipoSaldi === "inizio") throw new Error("Serve il report dei saldi di fine anno (o il Complete tax report), non quello di inizio anno.");
      a.nome = f.name; if (r.anno) a.anno = r.anno;
      a.valoreRw = Math.round(r.valoreCripto * 100) / 100; a.fonte.valoreRw = "report";
      // RT: corrispettivi delle vendite e costi di acquisto dal riepilogo plusvalenze Koinly
      if (r.plusvalenze && r.plusvalenze.ricavato != null) { a.corrispettivi = r.plusvalenze.ricavato; a.fonte.corrispettivi = "report"; }
      if (r.plusvalenze && r.plusvalenze.costi != null) { a.costi = r.plusvalenze.costi; a.fonte.costi = "report"; }
      a.redditi = r.redditi ? r.redditi.totale : null;
      a.avvisi = r.avvisi;
    } catch (e) { S.sanz.errore[id] = e.message || String(e); }
    render();
  }
  function ivacaDisponibile(anno) { return ivaca && S.anno === anno ? ivaca.totali.ivaca : null; }
  /* costi di carico ricostruiti (LIFO globale dall'origine, con le correzioni dello studio), per anno */
  var cacheCosti = {};
  function costiAnno(anno) {
    if (!S.tx) return null;
    var k = anno + "|" + S.fuso + "|" + swapDal() + "|" + JSON.stringify(S.correzioni);
    if (!cacheCosti[k]) { cacheCosti = {}; cacheCosti[k] = C.calcola(S.tx.dati, { anno: anno, fuso: S.fuso, correzioni: S.correzioni, swapNeutriDal: swapDal() }); }
    return cacheCosti[k];
  }
  /* corrispettivi e costi RT dell'anno secondo la fonte scelta: costi ricostruiti (predefinita se ci sono le transazioni), report Koinly o a mano.
     Dai costi ricostruiti, dal 2023 si considerano le cessioni contro valuta e contro stablecoin (criterio dello studio). */
  function fonteRT(a) { return a.fonteRT || (S.tx ? "ricostruito" : "koinly"); }
  function rtAnno(a) {
    if (fonteRT(a) === "ricostruito" && S.tx) {
      var r = costiAnno(a.anno), t = a.anno >= 2023 ? r.totali.controValutaStable : r.totali.tutte;
      return { corrispettivi: t.corrispettivi, costi: t.costi, fonte: "costi ricostruiti (LIFO globale)" };
    }
    return { corrispettivi: +a.corrispettivi || 0, costi: +a.costi || 0, fonte: fonteRT(a) === "koinly" ? "report Koinly" : "inseriti a mano" };
  }
  /* plusvalenze nette RT = corrispettivi delle vendite − costi di acquisto */
  function plusvalenzeAnno(a) { var x = rtAnno(a); return Math.round(x.corrispettivi) - Math.round(x.costi); } // in euro, come nei righi del quadro RT
  function calcoliSanzioni() {
    return S.sanz.anni.map(function (a) {
      var r = Z.calcolaAnno({ anno: a.anno, stato: a.stato, valoreRw: +a.valoreRw || 0, ivaca: +a.ivaca || 0, plusvalenze: plusvalenzeAnno(a), pagamento: S.sanz.pagamento });
      r.dati = a; return r;
    });
  }
  function tabellaAnno(r) {
    if (!r.ravvedibile && r.ravvedimentoValido) return tabellaVoci(r) +
      '<h4 style="margin:14px 0 6px">Confronto: sanzioni da ravvedimento valido</h4><p class="small" style="margin:0 0 6px">Importi se il ravvedimento fosse ammesso, come per una dichiarazione presentata da integrare.</p>' + tabellaVoci(r.ravvedimentoValido) +
      '<table class="det" style="margin-top:10px"><thead><tr><th>Sintesi delle sanzioni</th><th class="n">Importo</th></tr></thead><tbody>' +
      "<tr><td>Sanzioni minime per omessa dichiarazione (senza riduzioni)</td><td class=\"n\">" + E(r.sanzionePiena) + "</td></tr>" +
      "<tr><td>Sanzioni ridotte a 1/3 dopo la contestazione</td><td class=\"n\">" + E(r.sanzioneUnTerzo) + "</td></tr>" +
      "<tr><td>Sanzioni da ravvedimento valido</td><td class=\"n\">" + E(r.ravvedimentoValido.sanzioni) + "</td></tr></tbody></table>" + noteAnno(r);
    return tabellaVoci(r) + noteAnno(r);
  }
  function noteAnno(r) {
    return r.note.length ? '<ul class="avvisi" style="margin-top:6px">' + r.note.map(function (n) { return '<li class="' + (/non è tecnicamente possibile|contestata/.test(n) ? "hi" : "") + '">' + esc(n) + "</li>"; }).join("") + "</ul>" : "";
  }
  function tabellaVoci(r) {
    var righe = r.voci.filter(function (v) { return v.imposta || v.sanzione || v.interessi; }).map(function (v) {
      return "<tr><td>" + esc(v.voce) + '</td><td class="n">' + (v.imposta ? E(v.imposta) : "–") + '</td><td class="n">' + (v.sanzione != null ? E(v.sanzione) : "–") + '</td><td class="n">' + (v.interessi ? E(v.interessi) : "–") + "</td></tr>";
    }).join("");
    var tot = r.ravvedibile
      ? '<tr class="tot"><td>Totale da versare con il ravvedimento</td><td class="n">' + E(r.imposte) + '</td><td class="n">' + E(r.sanzioni) + '</td><td class="n">' + E(r.interessi) + '</td></tr><tr class="tot"><td colspan="3">Totale</td><td class="n">' + E(r.totale) + "</td></tr>"
      : '<tr class="tot"><td>Sanzioni minime per omessa dichiarazione</td><td></td><td class="n">' + E(r.sanzionePiena) + '</td><td></td></tr><tr class="tot"><td>Sanzioni ridotte a 1/3 (definizione dopo la contestazione)</td><td></td><td class="n">' + E(r.sanzioneUnTerzo) + '</td><td></td></tr><tr class="tot"><td colspan="3">Totale indicativo con imposte e interessi</td><td class="n">' + E(r.totale) + "</td></tr>";
    return '<table class="det"><thead><tr><th>Voce</th><th class="n">Imposta</th><th class="n">Sanzione</th><th class="n">Interessi</th></tr></thead><tbody>' + righe + tot + "</tbody></table>" +
      '<p class="small" style="margin:6px 0 0">Scadenze ' + r.anno + ": dichiarazione " + D.it(r.termini.dichiarazione) + ", saldo " + D.it(r.termini.saldo) + " · " + (r.regime === "nuovo" ? "violazione dal 1/9/2024: art. 13 D.Lgs. 472/1997 e art. 1 D.Lgs. 471/1997 nel testo del D.Lgs. 87/2024" : "violazione fino al 31/8/2024: testo previgente") +
      ". RT: plusvalenze " + E(r.rt.plusvalenze) + (r.rt.franchigia ? " − franchigia " + E(r.rt.franchigia, 0) : "") + " × " + Math.round(r.rt.aliquota * 100) + "%. " + esc(r.rt.nota) + "</p>";
  }
  function viewSanzioni() {
    var Sz = S.sanz, calc = calcoliSanzioni();
    var h = '<h2>Sanzioni RW e RT</h2><p class="lead">Ravvedimento per cripto-attività non indicate nei quadri RW e RT: per ogni anno si applica la norma vigente quando la violazione è stata commessa (testo previgente o D.Lgs. 87/2024) e la riduzione che spetta alla data in cui si ravvede.</p>' +
      '<div class="panel"><div class="grid2"><label class="f"><span class="t">Data del ravvedimento (pagamento)</span><input type="date" data-sz="pagamento" value="' + esc(Sz.pagamento) + '"><span class="small">Determina la riduzione delle sanzioni e i giorni di interessi.</span></label>' +
      '<div class="f"><span class="t">Anni da ravvedere</span><div class="toolbar"><button type="button" class="btn" id="aggiungiAnno">Aggiungi un anno</button>' + (calc.length ? '<button type="button" class="btn gold" id="stampaSanz">Stampa / PDF</button>' : "") + "</div></div></div></div>";
    if (!calc.length) return h + '<p class="muted" style="margin-top:14px">Aggiungete un anno e caricate il «Complete tax report» Koinly di quell\'anno (o il report dei saldi di fine anno): valore finale e plusvalenze si compilano da lì.</p>';
    h += calc.map(function (r) {
      var a = r.dati, err = Sz.errore[a.id], ivDisp = ivacaDisponibile(a.anno);
      return '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Anno ' + a.anno + '</h3><button type="button" class="btnlink small" data-toglianno="' + a.id + '">Togli l\'anno</button></div>' +
        '<div class="grid2" style="margin-top:10px">' +
        '<label class="f"><span class="t">Anno d\'imposta</span><select data-za="' + a.id + '" data-k="anno">' + [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(function (y) { return "<option" + (y === a.anno ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select></label>" +
        '<label class="f"><span class="t">Dichiarazione dei redditi</span><select data-za="' + a.id + '" data-k="stato"><option value="presentata"' + (a.stato === "presentata" ? " selected" : "") + '>Presentata senza RW/RT (si integra)</option><option value="omessa"' + (a.stato === "omessa" ? " selected" : "") + ">Omessa: non presentata, neanche per altri redditi</option></select></label>" +
        '<label class="f"><span class="t">Report Koinly dell\'anno</span><input type="file" accept=".pdf,.csv" data-zfile="' + a.id + '"><span class="small">' + (err ? '<span style="color:var(--hi)">' + esc(err) + "</span>" : a.nome ? esc(a.nome) : "Complete tax report (PDF) o End of year holdings (CSV)") + "</span></label>" +
        '<label class="f"><span class="t">Valore finale non dichiarato in RW <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="valoreRw" value="' + esc(a.valoreRw) + '"><span class="small">' + (a.fonte.valoreRw === "report" ? "Valore delle cripto al 31/12 dal report Koinly; modificabile (per esempio aggiungendo le cripto vendute nell'anno, al valore di fine detenzione)." : "Base della sanzione RW: valore finale delle cripto non dichiarate.") + "</span></label>" +
        '<label class="f"><span class="t">IVACA dovuta <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="ivaca" value="' + esc(a.anno < 2023 ? "" : a.ivaca) + '"' + (a.anno < 2023 ? " disabled" : "") + '><span class="small">' + (a.anno < 2023 ? "Non dovuta prima del 2023." : ivDisp != null ? '<button type="button" class="btnlink" data-usaivaca="' + a.id + '">Usa l\'IVACA calcolata nella prima pagina: ' + E(ivDisp) + "</button>" : "Dalla prima pagina (giorni di detenzione) per lo stesso anno, o a mano.") + "</span></label>" +
        '<label class="f"><span class="t">RT · fonte di corrispettivi e costi</span><select data-za="' + a.id + '" data-k="fonteRT">' +
          (S.tx ? '<option value="ricostruito"' + (fonteRT(a) === "ricostruito" ? " selected" : "") + ">Costi ricostruiti (LIFO globale, correzioni dello studio)</option>" : "") +
          '<option value="koinly"' + (fonteRT(a) === "koinly" ? " selected" : "") + '>Report Koinly</option><option value="mano"' + (fonteRT(a) === "mano" ? " selected" : "") + ">A mano</option></select>" +
          '<span class="small">' + (S.tx ? "I costi ricostruiti vengono dalle transazioni caricate nella prima scheda e dalle correzioni della scheda «Costi di carico»." : "Caricate le transazioni nella prima scheda per usare i costi ricostruiti.") + "</span></label>" +
        (fonteRT(a) === "ricostruito" && S.tx ? (function () { var x = rtAnno(a); return '<div class="f"><span class="t">RT · corrispettivi e costi ricostruiti</span><div class="small">Corrispettivi ' + E(x.corrispettivi) + " · costi " + E(x.costi) + (a.fonte.corrispettivi === "report" ? '<br><span class="muted">Koinly: corrispettivi ' + E(+a.corrispettivi || 0) + " · costi " + E(+a.costi || 0) + "</span>" : "") + "</div></div>"; })() :
          '<label class="f"><span class="t">RT · corrispettivi delle vendite <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="corrispettivi" value="' + esc(a.corrispettivi) + '"><span class="small">' + (a.fonte.corrispettivi === "report" ? "«Il ricavato delle vendite» del riepilogo plusvalenze Koinly." : "Corrispettivi delle cessioni dell'anno.") + "</span></label>" +
          '<label class="f"><span class="t">RT · costi di acquisto <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="costi" value="' + esc(a.costi) + '"><span class="small">' + (a.fonte.costi === "report" ? "«Costi di acquisizione» del riepilogo plusvalenze Koinly (commissioni comprese)." : "Costi delle cripto cedute.") + "</span></label>") +
        '<div class="f"><span class="t">Plusvalenze nette RT <span class="muted small">(€)</span></span><div class="v" style="font:600 1.1rem var(--f-mono)">' + E(plusvalenzeAnno(a)) + '</div><span class="small">Corrispettivi delle vendite − costi di acquisto · fonte: ' + esc(rtAnno(a).fonte) + "." + (a.redditi ? " Il report indica anche " + E(a.redditi) + " di altri redditi (interessi, reward, airdrop) non compresi: valutarne la qualificazione." : "") + "</span></div>" +
        "</div>" + (a.avvisi && a.avvisi.length ? '<p class="small" style="color:var(--mid)">' + a.avvisi.map(esc).join("<br>") + "</p>" : "") +
        '<div class="scroll" style="margin-top:10px">' + tabellaAnno(r) + "</div></div>";
    }).join("");
    var tot = calc.reduce(function (s, r) { return s + (r.totale || 0); }, 0), omesse = calc.filter(function (r) { return !r.ravvedibile; });
    var ravv = calc.filter(function (r) { return r.ravvedibile; });
    h += '<div class="cards" style="margin-top:14px">' + (ravv.length ? '<div class="card hl"><div class="k">Totale ravvedimento (imposte, sanzioni, interessi)</div><div class="v">' + E(ravv.reduce(function (s, r) { return s + r.totale; }, 0)) + "</div></div>" : "") +
      (omesse.length ? '<div class="card"><div class="k">Anni con dichiarazione omessa: totale indicativo con sanzioni a 1/3</div><div class="v">' + E(omesse.reduce(function (s, r) { return s + r.totale; }, 0)) + "</div></div>" +
        '<div class="card"><div class="k">Stessi anni con ravvedimento valido</div><div class="v">' + E(omesse.reduce(function (s, r) { return s + r.ravvedimentoValido.totale; }, 0)) + "</div></div>" : "") + "</div>" +
      '<p class="metodi">Sanzione RW: 3% (minimo) del valore non dichiarato, art. 5 c. 2 DL 167/1990, ridotta con il ravvedimento. Imposte (IVACA e RT): sanzione per infedele dichiarazione ridotta, che assorbe quella per omesso versamento (circ. 42/E/2016), più interessi legali giorno per giorno dalla scadenza del saldo. Il ravvedimento è precluso dalla notifica di atti di liquidazione o accertamento (art. 13 c. 1-ter D.Lgs. 472/1997). Dal 1/1/2027 entra in vigore il Testo unico sanzioni (D.Lgs. 173/2024).</p>';
    return h;
  }
  function stampaSanzioni() {
    var calc = calcoliSanzioni();
    var h = intestazione("Ravvedimento cripto-attività · quadri RW e RT") +
      '<table class="dati"><tr><td>Data del ravvedimento</td><td>' + D.it(S.sanz.pagamento) + "</td></tr><tr><td>Anni</td><td>" + calc.map(function (r) { return r.anno + (r.ravvedibile ? "" : " (dichiarazione omessa)"); }).join(", ") + "</td></tr></table>" +
      calc.map(function (r) {
        var a = r.dati;
        return "<h2>Anno " + r.anno + "</h2><p>Dichiarazione: " + (a.stato === "omessa" ? "omessa" : "presentata senza quadri RW e RT") + (a.nome ? " · Report Koinly: " + esc(a.nome) : "") + " · Valore finale RW: " + E(+a.valoreRw || 0) + " · IVACA: " + E(r.anno < 2023 ? 0 : +a.ivaca || 0) + " · RT: corrispettivi " + E(+a.corrispettivi || 0) + " − costi " + E(+a.costi || 0) + " = plusvalenze " + E(plusvalenzeAnno(a)) + "</p>" + tabellaAnno(r);
      }).join("") +
      "<h2>Riepilogo</h2><table class=\"det\"><thead><tr><th>Anno</th><th class=\"n\">Imposte</th><th class=\"n\">Sanzioni</th><th class=\"n\">Interessi</th><th class=\"n\">Totale</th></tr></thead><tbody>" +
      calc.map(function (r) { return "<tr><td>" + r.anno + (r.ravvedibile ? "" : " (omessa: sanzioni a 1/3, indicativo)") + '</td><td class="n">' + E(r.imposte) + '</td><td class="n">' + E(r.sanzioni) + '</td><td class="n">' + E(r.interessi) + '</td><td class="n">' + E(r.totale) + "</td></tr>" +
        (r.ravvedimentoValido ? "<tr><td>" + r.anno + " con ravvedimento valido (confronto)</td><td class=\"n\">" + E(r.ravvedimentoValido.imposte) + '</td><td class="n">' + E(r.ravvedimentoValido.sanzioni) + '</td><td class="n">' + E(r.ravvedimentoValido.interessi) + '</td><td class="n">' + E(r.ravvedimentoValido.totale) + "</td></tr>" : ""); }).join("") +
      '<tr class="tot"><td>Totale</td><td class="n">' + E(calc.reduce(function (s, r) { return s + r.imposte; }, 0)) + '</td><td class="n">' + E(calc.reduce(function (s, r) { return s + r.sanzioni; }, 0)) + '</td><td class="n">' + E(calc.reduce(function (s, r) { return s + r.interessi; }, 0)) + '</td><td class="n">' + E(calc.reduce(function (s, r) { return s + r.totale; }, 0)) + "</td></tr></tbody></table>" +
      '<p class="nota">Norme applicate (testi letti su Normattiva): art. 13 D.Lgs. 472/1997 (ravvedimento), art. 1 e art. 13 D.Lgs. 471/1997, art. 5 c. 2 DL 167/1990, art. 19 cc. 18-21 DL 201/2011, art. 67 c. 1 lett. c-sexies TUIR. Per le violazioni dal 1/9/2024 il testo modificato dal D.Lgs. 87/2024. Interessi al tasso legale di ciascun anno. Valori e plusvalenze ai dati Koinly, non rettificati. Stima da verificare: non sostituisce il parere del professionista.</p>' + firma();
    apriStampa(h);
  }
  /* ---------- costi di carico (LIFO globale) e correzioni dello studio ---------- */
  S.correzioni = {};
  S.costi = { anno: null, filtro: { tipo: "", cripto: "", wallet: "", soloAperte: true }, mostraCessioni: "rilevanti", swapNeutri: true };
  // criterio dello studio: dal 2023 gli swap tra cripto non realizzano e trasferiscono il costo
  function swapDal() { return S.costi.swapNeutri ? "2023-01-01" : null; }
  var AZIONI = {
    deposito: [["", "Valore del giorno (come Koinly)"], ["costo", "Costo d'acquisto documentato (€)"], ["interno", "Rientro da wallet proprio (recupera i costi)"], ["zero", "Costo zero (prudenziale)"]],
    prelievo: [["", "Uscita senza corrispettivo"], ["interno", "Trasferimento a wallet proprio (i costi restano)"], ["cessione", "Cessione a terzi con corrispettivo (€)"]],
    "senza valore": [["", "Lascia zero"], ["valore", "Controvalore in euro (€)"]]
  };
  function scaricaFile(nome, blob) { var l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = nome; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(l.href); l.remove(); }, 1000); }
  function salvaLavoro() {
    var dati = { programma: "Koinly Tools", versione: 1, salvato: new Date().toISOString(), transazioni: S.tx ? S.tx.nome : "", correzioni: S.correzioni, attribuzioni: S.quest.flag, chiaviWallet: S.quest.chiavi, memoria: S.memoria, cliente: S.quest.cliente, altriRedditi: S.altri };
    scaricaFile("koinly-tools-lavoro.json", new Blob([JSON.stringify(dati, null, 1)], { type: "application/json" }));
  }
  async function caricaLavoro(f) {
    try { var j = JSON.parse(await f.text()); S.correzioni = j.correzioni || {}; S.quest.flag = j.attribuzioni || {}; S.quest.chiavi = j.chiaviWallet || {}; if (j.memoria) S.memoria = Object.assign(S.memoria, j.memoria); S.quest.cliente = Object.assign(S.quest.cliente, j.cliente || {}); if (j.altriRedditi) { S.altri = j.altriRedditi; altroId = S.altri.reduce(function (m, x) { return Math.max(m, x.id + 1); }, 1); } S.lavoroCaricato = f.name + (j.transazioni ? " (transazioni: " + j.transazioni + ")" : ""); }
    catch (e) { S.lavoroCaricato = "File non valido: " + e.message; }
    render();
  }
  function anniCosti() { var a = {}; if (S.tx) S.tx.dati.movimenti.forEach(function (t) { a[new Date(t.ts).getUTCFullYear()] = true; }); return Object.keys(a).map(Number).sort(); }
  function confrontoCosti(r, anno) {
    // saldi Koinly per il confronto, dalla scheda Caricamento file (fine dell'anno precedente = inizio)
    var ini = saldiInizioAnno(anno) ? saldiInizioAnno(anno).r.saldi : null;
    var fin = saldiFineAnno(anno) ? saldiFineAnno(anno).r.saldi : null;
    if (ini || fin) C.confronta(r, ini, fin);
    return r;
  }
  function selectAzione(v) {
    var c = S.correzioni[v.riga] || {}, opz = AZIONI[v.tipo] || [];
    var conImporto = c.azione === "costo" || c.azione === "cessione" || c.azione === "valore";
    return '<select data-corr="' + v.riga + '">' + opz.map(function (o) { return '<option value="' + o[0] + '"' + ((c.azione || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
      (conImporto ? '<input class="num" type="number" step="any" data-corrimp="' + v.riga + '" value="' + esc(c.importo == null ? "" : c.importo) + '" placeholder="€" style="width:110px;margin-left:6px">' : "") +
      (c.azione ? '<input type="text" data-corrnota="' + v.riga + '" value="' + esc(c.motivo || "") + '" placeholder="Motivo e documento (per la memoria)" style="margin-top:4px">' : "");
  }
  function viewCosti() {
    var h = '<h2>Costi di carico</h2><p class="lead">Ricostruzione dei costi d\'acquisto dall\'origine, con strati LIFO globali: una pila per cripto, unica per tutti i wallet e per tutti gli anni. Acquisto al costo pagato, commissioni comprese; permuta al valore del momento; interessi, reward e airdrop al valore del giorno. Dove i dati di Koinly sono incompleti, lo studio corregge le operazioni qui sotto: i calcoli possono quindi differire da Koinly.</p>';
    if (!S.tx) return h + '<p class="muted">Caricate il file delle transazioni nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>. I report di inizio e fine anno, se caricati, servono al riscontro con i costi di Koinly.</p>';
    var anni = anniCosti(); if (!S.costi.anno) S.costi.anno = S.anno && anni.indexOf(S.anno) >= 0 ? S.anno : anni.filter(function (a) { return a < new Date().getFullYear(); }).pop() || anni[anni.length - 1];
    var anno = S.costi.anno, r = confrontoCosti(costiAnno(anno), anno), cf = r.confronto;
    var vere = r.righe.filter(function (x) { return !x.spam; });
    var tv = r.totali.controValutaStable, tt = r.totali.tutte;
    h += '<div class="panel"><div class="grid2"><label class="f"><span class="t">Anno</span><select data-cs="anno">' + anni.map(function (a) { return "<option" + (a === anno ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span class="t">Permute tra cripto dal 2023</span><select data-cs="swapNeutri"><option value="si"' + (S.costi.swapNeutri ? " selected" : "") + '>Swap neutri: costo trasferito (criterio dello studio)</option><option value="no"' + (S.costi.swapNeutri ? "" : " selected") + '>Al valore del momento (come Koinly)</option></select><span class="small">Dal 2023 permute tra cripto, acquisti con stablecoin e scambi tra stablecoin non realizzano; restano cessioni le vendite contro valuta e contro stablecoin. Prima del 2023 le permute sono sempre al valore del momento.</span></label>' +
      '<div class="f"><span class="t">Lavoro dello studio</span><span class="small">' + Object.keys(S.correzioni).length + ' correzioni in questa sessione. <button type="button" class="btn ghost" id="salvaLavoro">Salva in un file</button> Il file si ricarica nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>.</span></div></div></div>';
    var da = r.daVerificare, aperte = da.filter(function (v) { return !S.correzioni[v.riga]; });
    h += '<div class="cards" style="margin-top:14px">' +
      '<div class="card"><div class="k">Costo al 1/1/' + anno + "</div><div class=\"v\">" + E(vere.reduce(function (s, x) { return s + x.costoInizio; }, 0), 0) + "</div>" + (cf && cf.koinlyInizio ? '<div class="k">Koinly ' + E(cf.koinlyInizio, 0) + "</div>" : "") + "</div>" +
      '<div class="card"><div class="k">Costo al 31/12/' + anno + "</div><div class=\"v\">" + E(vere.reduce(function (s, x) { return s + x.costoFine; }, 0), 0) + "</div>" + (cf && cf.koinlyFine ? '<div class="k">Koinly ' + E(cf.koinlyFine, 0) + "</div>" : "") + "</div>" +
      '<div class="card hl"><div class="k">Plusvalenza ' + (anno >= 2023 ? "cessioni contro valuta e stablecoin" : "tutte le cessioni") + "</div><div class=\"v\">" + E((anno >= 2023 ? tv : tt).corrispettivi - (anno >= 2023 ? tv : tt).costi, 0) + '</div><div class="k">corrispettivi ' + E((anno >= 2023 ? tv : tt).corrispettivi, 0) + " · costi " + E((anno >= 2023 ? tv : tt).costi, 0) + "</div></div>" +
      '<div class="card"><div class="k">Operazioni da verificare (tutto lo storico)</div><div class="v">' + aperte.length + " / " + da.length + '</div><div class="k">' + r.trasferimentiAbbinati + " trasferimenti tra wallet abbinati in automatico</div></div></div>";
    if (r.avvisi.length) h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Avvisi</h3><ul class="avvisi">' + r.avvisi.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></div>";
    h += sezioneConfrontoKoinly(anno);
    // operazioni da correggere
    var F = S.costi.filtro, cripto = {}, wallet = {};
    da.forEach(function (v) { cripto[v.cripto] = true; if (v.wallet) wallet[v.wallet] = true; });
    var filtrate = da.filter(function (v) { return (!F.tipo || v.tipo === F.tipo) && (!F.cripto || v.cripto === F.cripto) && (!F.wallet || v.wallet === F.wallet) && (!F.soloAperte || !S.correzioni[v.riga]); });
    var opt = function (k, valori, etichetta) { return '<label class="f"><span class="t">' + etichetta + '</span><select data-cf="' + k + '"><option value="">Tutti</option>' + valori.map(function (x) { return '<option' + (F[k] === x ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>"; };
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Operazioni da correggere</h3><p class="small">Depositi e prelievi verso wallet non collegati a Koinly e operazioni senza controvalore, in tutto lo storico: incidono sui costi di tutti gli anni successivi. «Trasferimento a wallet proprio» mette da parte gli strati di costo; un «rientro da wallet proprio» della stessa cripto li recupera.</p>' +
      '<div class="grid2">' + opt("tipo", ["deposito", "prelievo", "senza valore"], "Tipo") + opt("cripto", Object.keys(cripto).sort(), "Cripto") + opt("wallet", Object.keys(wallet).sort(), "Wallet") +
      '<label class="toggle" style="align-self:end"><input type="checkbox" data-cf="soloAperte"' + (F.soloAperte ? " checked" : "") + "><span>Solo quelle non ancora corrette</span></label></div>" +
      (filtrate.length && F.tipo ? '<div class="toolbar" style="margin:10px 0"><span class="small" style="align-self:center">Applica a tutte le ' + filtrate.length + " filtrate:</span>" + (AZIONI[F.tipo] || []).filter(function (o) { return o[0] && o[0] !== "costo" && o[0] !== "cessione" && o[0] !== "valore"; }).map(function (o) { return '<button type="button" class="btn ghost" data-blocco="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + '<button type="button" class="btn ghost" data-blocco="">Annulla le correzioni</button><input type="text" data-cs="motivoBlocco" value="' + esc(S.costi.motivoBlocco || "") + '" placeholder="Motivo comune (per la memoria)" style="max-width:320px"></div>' : '<p class="small muted">Scegliete un tipo per applicare una correzione in blocco.</p>') +
      '<div class="scroll"><table class="det"><thead><tr><th>Data</th><th>Tipo</th><th>Cripto</th><th class="n">Quantità</th><th>Wallet</th><th class="n">Valore Koinly</th><th>Indirizzo / TxHash</th><th>Correzione</th></tr></thead><tbody>' +
      filtrate.slice(0, 150).map(function (v) { return "<tr><td>" + it(v.data) + "</td><td>" + esc(v.tipo) + ((v.indizi || []).length ? '<div class="small" style="color:var(--mid)">' + v.indizi.map(esc).join("<br>") + "</div>" : "") + "</td><td>" + esc(v.cripto) + '</td><td class="n">' + Q(v.q) + "</td><td>" + esc(v.wallet || "") + '</td><td class="n">' + E(v.valore) + '</td><td class="small" style="word-break:break-all;max-width:220px">' + esc(v.indirizzo || "") + (v.txHash ? "<br>" + esc(v.txHash) : "") + "</td><td>" + selectAzione(v) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (filtrate.length > 150 ? '<p class="small">Mostrate 150 operazioni su ' + filtrate.length + ": restringete i filtri o usate la correzione in blocco.</p>" : "") +
      '<div class="toolbar" style="margin-top:10px"><button type="button" class="btn gold" id="richiestaCliente">Richiesta di chiarimenti al cliente</button><span class="small" style="align-self:center">Stampa le operazioni filtrate non ancora corrette, con le domande da porre al cliente.</span></div></div>';
    h += sezioneBanca();
    // riepilogo per cripto
    h += '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Costi per cripto · ' + anno + '</h3><div class="toolbar noprint"><button type="button" class="btn" id="excelCosti">Scarica Excel</button><button type="button" class="btn gold" id="stampaCosti">Stampa / PDF</button><button type="button" class="btn gold" id="stampaMemoria">Memoria finale</button><button type="button" class="btn gold" id="memoriaWord">Memoria in Word</button></div></div>' +
      '<div class="scroll"><table class="det"><thead><tr><th>Cripto</th><th class="n">Quantità 1/1</th><th class="n">Costo 1/1</th><th class="n">Koinly 1/1</th><th class="n">Costo caricato</th><th class="n">Costo scaricato</th><th class="n">Corrispettivi</th><th class="n">Quantità 31/12</th><th class="n">Costo 31/12</th><th class="n">Koinly 31/12</th><th class="n">Strati</th></tr></thead><tbody>' +
      vere.map(function (x) {
        var ap = S.aperti["c:" + x.chiave];
        return "<tr><td><b>" + esc(x.nome) + '</b></td><td class="n">' + QU(x.qInizio, x) + '</td><td class="n">' + E(x.costoInizio) + '</td><td class="n">' + (x.koinlyCostoInizio != null ? E(x.koinlyCostoInizio) : "–") + '</td><td class="n">' + E(x.costoCaricato) + '</td><td class="n">' + E(x.costoScaricato) + '</td><td class="n">' + E(x.corrispettivi) + '</td><td class="n">' + QU(x.qFine, x) + '</td><td class="n">' + E(x.costoFine) + '</td><td class="n">' + (x.koinlyCostoFine != null ? E(x.koinlyCostoFine) : "–") +
          '</td><td class="n"><button type="button" class="btnlink" data-apri="c:' + esc(x.chiave) + '">' + x.stratiFine.length + (ap ? " ▴" : " ▾") + "</button></td></tr>" +
          (ap ? '<tr><td></td><td colspan="10"><table class="det periodi"><thead><tr><th>Data di carico</th><th>Origine</th><th class="n">Quantità</th><th class="n">Costo</th><th class="n">Costo unitario</th></tr></thead><tbody>' +
            x.stratiFine.slice().reverse().map(function (st) { return "<tr><td>" + it(st.data) + "</td><td>" + esc(st.origine) + '</td><td class="n">' + QU(st.q, x) + '</td><td class="n">' + E(st.costo) + '</td><td class="n">' + E(st.unitario, st.unitario < 1 ? 6 : 2) + "</td></tr>"; }).join("") +
            '</tbody></table><p class="small muted" style="margin:0">Strati rimasti al 31/12/' + anno + ", dal più recente: sono i primi a essere scaricati alla prossima cessione (LIFO).</p></td></tr>" : "");
      }).join("") + "</tbody></table></div></div>";
    // cessioni dell'anno
    var ces = r.cessioni.filter(function (c) { return S.costi.mostraCessioni === "tutte" ? true : S.costi.mostraCessioni === "rilevanti" ? (anno >= 2023 ? /^contro (valuta|stablecoin)$/.test(c.tipo) : !/^commissione|^prelievo|^uscita|^trasferimento/.test(c.tipo)) : true; });
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Cessioni e uscite · ' + anno + '</h3><div class="grid2" style="margin-bottom:8px"><label class="f"><span class="t">Mostra</span><select data-cs="mostraCessioni"><option value="rilevanti"' + (S.costi.mostraCessioni === "rilevanti" ? " selected" : "") + '>Rilevanti per il quadro RT</option><option value="tutte"' + (S.costi.mostraCessioni === "tutte" ? " selected" : "") + ">Tutte, comprese commissioni, prelievi e permute</option></select></label></div>" +
      '<table class="det" style="width:auto"><thead><tr><th>Tipo</th><th class="n">Numero</th><th class="n">Corrispettivi</th><th class="n">Costi</th><th class="n">Risultato</th></tr></thead><tbody>' +
      Object.keys(r.perTipo).map(function (k) { var t = r.perTipo[k]; return "<tr><td>" + esc(k) + '</td><td class="n">' + t.n + '</td><td class="n">' + E(t.corrispettivi) + '</td><td class="n">' + E(t.costi) + '</td><td class="n">' + E(t.corrispettivi - t.costi) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="scroll" style="margin-top:10px"><table class="det"><thead><tr><th>Data</th><th>Cripto</th><th class="n">Quantità</th><th>Tipo</th><th class="n">Corrispettivo</th><th class="n">Costo LIFO</th><th class="n">Risultato</th><th>Note</th></tr></thead><tbody>' +
      ces.slice(0, 300).map(function (c) { return "<tr><td>" + it(c.data) + "</td><td>" + esc(c.cripto) + '</td><td class="n">' + Q(c.q) + "</td><td>" + esc(c.tipo) + (c.controparte ? " → " + esc(c.controparte) : "") + '</td><td class="n">' + E(c.corrispettivo) + '</td><td class="n">' + E(c.costo) + '</td><td class="n">' + E(c.risultato) + '</td><td class="small">' + (c.scoperto ? "Quantità senza strati: " + Q(c.scoperto) : "") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (ces.length > 300 ? '<p class="small">Mostrate 300 cessioni su ' + ces.length + ": l'elenco completo è nell'Excel.</p>" : "") + "</div>";
    return h;
  }
  function excelCosti() {
    var X = window.LumesXlsx, anno = S.costi.anno, r = confrontoCosti(costiAnno(anno), anno), vere = r.righe.filter(function (x) { return !x.spam; });
    var int = function (a) { return a.map(function (v) { return { v: v, s: "intestazione" }; }); };
    var f1 = [[{ v: "Costi di carico LIFO globale · " + anno, s: "titolo" }], ["Transazioni: " + S.tx.nome + " · correzioni dello studio: " + Object.keys(S.correzioni).length], [],
      int(["Cripto", "Quantità 1/1", "Costo 1/1", "Koinly 1/1", "Costo caricato", "Costo scaricato", "Corrispettivi", "Quantità 31/12", "Costo 31/12", "Koinly 31/12"])];
    vere.forEach(function (x) { f1.push([x.nome, +x.qInizio, { v: x.costoInizio, s: "euro" }, x.koinlyCostoInizio != null ? { v: x.koinlyCostoInizio, s: "euro" } : null, { v: x.costoCaricato, s: "euro" }, { v: x.costoScaricato, s: "euro" }, { v: x.corrispettivi, s: "euro" }, +x.qFine, { v: x.costoFine, s: "euro" }, x.koinlyCostoFine != null ? { v: x.koinlyCostoFine, s: "euro" } : null]); });
    var f2 = [[{ v: "Strati LIFO al 31/12/" + anno, s: "titolo" }], [], int(["Cripto", "Data di carico", "Origine", "Quantità", "Costo", "Costo unitario"])];
    vere.forEach(function (x) { x.stratiFine.forEach(function (st) { f2.push([x.nome, it(st.data), st.origine, +st.q, { v: st.costo, s: "euro" }, st.unitario]); }); });
    var f3 = [[{ v: "Cessioni e uscite " + anno, s: "titolo" }], [], int(["Data", "Cripto", "Quantità", "Tipo", "Controparte", "Corrispettivo", "Costo LIFO", "Risultato", "Quantità senza strati"])];
    r.cessioni.forEach(function (c) { var n = f3.length + 1; f3.push([it(c.data), c.cripto, +c.q, c.tipo, c.controparte, { v: c.corrispettivo, s: "euro" }, { v: c.costo, s: "euro" }, { f: "F" + n + "-G" + n, s: "euro" }, c.scoperto ? +c.scoperto : null]); });
    var f4 = [[{ v: "Operazioni corrette dallo studio", s: "titolo" }], [], int(["Riga del file", "Data", "Tipo", "Cripto", "Quantità", "Wallet", "Valore Koinly", "Correzione", "Importo", "TxHash"])];
    r.daVerificare.forEach(function (v) { var c = S.correzioni[v.riga]; f4.push([v.riga, it(v.data), v.tipo, v.cripto, +v.q, v.wallet || "", { v: v.valore || 0, s: "euro" }, c ? ((AZIONI[v.tipo] || []).filter(function (o) { return o[0] === c.azione; })[0] || ["", c.azione])[1] : "nessuna (da verificare)", c && c.importo != null ? { v: +c.importo, s: "euro" } : null, v.txHash || ""]); });
    var fogliExtra = [], xk = confrontoKoinly(anno);
    if (xk && xk.koinly.n) {
      var fk = [[{ v: "Confronto con Koinly · " + anno, s: "titolo" }], ["Report: " + S.koinlyCes.nome + " · periodo " + (S.koinlyCes.periodo || "")], [], int(["Voce", "Operazioni", "Importo"])];
      xk.voci.forEach(function (v) { fk.push([v.voce, v.n == null ? xk.koinly.n : v.n, { v: v.importo, s: "euro" }]); });
      fk.push(["= Plusvalenza ricostruita", xk.nostra.n, { v: xk.nostra.risultato, s: "totale" }], [], int(["Data", "Cripto", "Quantità", "Tipo", "Ricavo Koinly", "Corrispettivo", "Costo Koinly", "Costo LIFO", "Differenza"]));
      xk.differenze.forEach(function (z) { fk.push([it(z.data), z.cripto, z.quantita, z.tipo, { v: z.ricavoKoinly, s: "euro" }, { v: z.ricavo, s: "euro" }, { v: z.costoKoinly, s: "euro" }, { v: z.costo, s: "euro" }, { v: z.scarto, s: "euro" }]); });
      xk.nonRilevanti.forEach(function (z) { fk.push([it(z.data), z.cripto, z.quantita, "non rilevante: " + z.tipo, null, null, null, null, { v: -z.risultatoKoinly, s: "euro" }]); });
      xk.soloKoinly.forEach(function (z) { fk.push([it(z.data), z.cripto, z.quantita, "solo in Koinly", { v: z.ricavo, s: "euro" }, null, { v: z.costo, s: "euro" }, null, { v: -z.risultato, s: "euro" }]); });
      fogliExtra.push({ nome: "Confronto Koinly", colonne: [70, 10, 18, 30, 14, 14, 14, 14, 14], righe: fk, orizzontale: true });
    }
    scaricaFile("costi-lifo-" + anno + ".xlsx", new Blob([X.crea(fogliExtra.concat([{ nome: "Costi per cripto", colonne: [16, 18, 14, 14, 14, 14, 14, 18, 14, 14], righe: f1, orizzontale: true }, { nome: "Strati al 31-12", colonne: [16, 12, 40, 18, 14, 14], righe: f2, orizzontale: true }, { nome: "Cessioni", colonne: [12, 10, 18, 26, 12, 14, 14, 14, 14], righe: f3, orizzontale: true }, { nome: "Correzioni", colonne: [10, 12, 14, 10, 18, 30, 14, 40, 14, 40], righe: f4, orizzontale: true }]))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }
  function stampaCosti() {
    var anno = S.costi.anno, r = confrontoCosti(costiAnno(anno), anno), vere = r.righe.filter(function (x) { return !x.spam; }), tv = anno >= 2023 ? r.totali.controValutaStable : r.totali.tutte;
    var corrette = r.daVerificare.filter(function (v) { return S.correzioni[v.riga]; });
    apriStampa(intestazione("Costi di carico LIFO globale · anno " + anno) +
      '<table class="dati"><tr><td>Transazioni</td><td>' + esc(S.tx.nome) + "</td></tr><tr><td>Metodo</td><td>LIFO globale dall'origine: una pila per cripto, unica per tutti i wallet e gli anni</td></tr><tr><td>Correzioni dello studio</td><td>" + corrette.length + " su " + r.daVerificare.length + " operazioni da verificare</td></tr></table>" +
      "<h2>Criterio</h2><p>Acquisto con valuta: costo pagato con le commissioni. Permuta: la cripto ceduta esce al valore del momento, quella ricevuta entra con quel valore. Interessi, reward, airdrop e cashback: valore del giorno di ricezione. Trasferimenti tra wallet propri: nessun effetto, salvo la commissione. Ogni cessione scarica gli strati più recenti. I depositi e i prelievi verso wallet non collegati a Koinly sono stati verificati e corretti dallo studio dove indicato.</p>" +
      "<h2>Riepilogo per cripto</h2><table class=\"det\"><thead><tr><th>Cripto</th><th class=\"n\">Q. 1/1</th><th class=\"n\">Costo 1/1</th><th class=\"n\">Caricato</th><th class=\"n\">Scaricato</th><th class=\"n\">Corrispettivi</th><th class=\"n\">Q. 31/12</th><th class=\"n\">Costo 31/12</th></tr></thead><tbody>" +
      vere.map(function (x) { return "<tr><td>" + esc(x.nome) + '</td><td class="n">' + Q(x.qInizio) + '</td><td class="n">' + E(x.costoInizio) + '</td><td class="n">' + E(x.costoCaricato) + '</td><td class="n">' + E(x.costoScaricato) + '</td><td class="n">' + E(x.corrispettivi) + '</td><td class="n">' + Q(x.qFine) + '</td><td class="n">' + E(x.costoFine) + "</td></tr>"; }).join("") + "</tbody></table>" +
      "<h2>Cessioni per tipo</h2><table class=\"det\"><thead><tr><th>Tipo</th><th class=\"n\">Numero</th><th class=\"n\">Corrispettivi</th><th class=\"n\">Costi</th><th class=\"n\">Risultato</th></tr></thead><tbody>" +
      Object.keys(r.perTipo).map(function (k) { var t = r.perTipo[k]; return "<tr><td>" + esc(k) + '</td><td class="n">' + t.n + '</td><td class="n">' + E(t.corrispettivi) + '</td><td class="n">' + E(t.costi) + '</td><td class="n">' + E(t.corrispettivi - t.costi) + "</td></tr>"; }).join("") + "</tbody></table>" +
      "<p><b>Per il quadro RT " + anno + "</b> (" + (anno >= 2023 ? "cessioni contro valuta e contro stablecoin" : "tutte le cessioni") + "): corrispettivi " + E(tv.corrispettivi) + ", costi " + E(tv.costi) + ", plusvalenza " + E(tv.corrispettivi - tv.costi) + ".</p>" +
      (r.avvisi.length ? "<h2>Avvisi</h2><ul class=\"avvisi\">" + r.avvisi.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="nota">Il dettaglio di strati, cessioni e correzioni è nel file Excel allegato. I calcoli possono differire da Koinly per le correzioni dello studio e per il metodo LIFO globale.</p>' + firma());
  }

  /* ---------- confronto con il Complete tax report Koinly, cessione per cessione ---------- */
  S.koinlyCes = null;
  async function caricaKoinlyCes(f) {
    try {
      var r = L.leggiCessioniPdf(await testoPdf(f));
      if (!r.cessioni.length) throw new Error("Nel PDF non c'è l'elenco «Transazioni di plusvalenze»: serve il Complete tax report di Koinly.");
      S.koinlyCes = { nome: f.name, periodo: r.periodo, fuso: r.fuso, righe: r.righe, cessioni: r.cessioni }; S.koinlyCesErrore = null;
    } catch (e) { S.koinlyCesErrore = e.message || String(e); }
    render();
  }
  function confrontoKoinly(anno) { return S.koinlyCes ? C.confrontaCessioniKoinly(costiAnno(anno), S.koinlyCes.cessioni, anno) : null; }
  function sezioneConfrontoKoinly(anno) {
    var h = '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Confronto con Koinly, cessione per cessione</h3>' +
      '<p class="small">Caricate il «Complete tax report» di Koinly in PDF (anche di più anni): se ne legge l\'elenco delle cessioni, si tengono quelle dell\'anno e si abbinano alle cessioni ricostruite per cripto, data e quantità. La differenza di plusvalenza viene scomposta nelle sue cause.</p>' +
      '<label class="f"><span class="t">Complete tax report Koinly (PDF)</span><input type="file" accept=".pdf" data-koinlyces><span class="small">' + (S.koinlyCesErrore ? '<span style="color:var(--hi)">' + esc(S.koinlyCesErrore) + "</span>" : S.koinlyCes ? esc(S.koinlyCes.nome) + " · periodo " + esc(S.koinlyCes.periodo || "") + " · " + S.koinlyCes.cessioni.length + " cessioni (" + S.koinlyCes.righe + " strati) · date in " + (S.koinlyCes.fuso === "UTC" ? "UTC" : "ora italiana") : "") + "</span></label>";
    var x = confrontoKoinly(anno);
    if (!x) return h + "</div>";
    if (!x.koinly.n) return h + '<p>Il report non contiene cessioni dell\'anno ' + anno + ".</p></div>";
    h += '<table class="det" style="margin-top:10px"><thead><tr><th>Dalla plusvalenza Koinly alla plusvalenza ricostruita · ' + anno + '</th><th class="n">Operazioni</th><th class="n">Importo</th></tr></thead><tbody>' +
      x.voci.map(function (v, i) { return "<tr" + (i === 0 ? ' class="tot"' : "") + "><td>" + esc(v.voce) + '</td><td class="n">' + (v.n == null ? x.koinly.n : v.n) + '</td><td class="n">' + E(v.importo) + "</td></tr>"; }).join("") +
      '<tr class="tot"><td>= Plusvalenza ricostruita (cessioni rilevanti)</td><td class="n">' + x.nostra.n + '</td><td class="n">' + E(x.nostra.risultato) + "</td></tr>" +
      (Math.abs(x.quadratura) >= 1 ? '<tr><td colspan="2">Scarto non spiegato (arrotondamenti o abbinamenti dubbi)</td><td class="n">' + E(x.quadratura) + "</td></tr>" : "") + "</tbody></table>" +
      '<p class="small">Koinly ' + anno + ": " + x.koinly.n + " cessioni, corrispettivi " + E(x.koinly.ricavo) + ", costi " + E(x.koinly.costo) + ". Il totale del riepilogo del report, se il periodo è di più anni, li comprende tutti: qui conta solo l'anno.</p>";
    if (x.nonRilevanti.length) h += "<h4>Operazioni che Koinly tassa ma che non rilevano (" + x.nonRilevanti.length + ")</h4>" + tab(["Data", "Cripto", "n:Quantità", "Tipo nella ricostruzione", "n:Risultato Koinly"], x.nonRilevanti.map(function (z) { return [it(z.data), esc(z.cripto), Q(String(z.quantita)), esc(z.tipo), E(z.risultatoKoinly)]; }), 100);
    var conScarto = x.differenze.filter(function (z) { return Math.abs(z.scarto) >= 1; });
    h += "<h4>Cessioni comuni con risultato diverso (" + conScarto.length + " su " + x.differenze.length + ")</h4>" + (conScarto.length ? tab(["Data", "Cripto", "n:Quantità", "n:Corrispettivo Koinly", "n:Corrispettivo", "n:Costo Koinly", "n:Costo LIFO", "n:Differenza"], conScarto.map(function (z) { return [it(z.data), esc(z.cripto), Q(String(z.quantita)), E(z.ricavoKoinly), E(z.ricavo), E(z.costoKoinly), E(z.costo), E(z.scarto)]; }), 100) : "<p>Sulle cessioni comuni corrispettivi e costi coincidono con Koinly (scarti sotto 1 €).</p>");
    if (x.soloKoinly.length) h += "<h4>Cessioni presenti solo in Koinly (" + x.soloKoinly.length + ")</h4>" + tab(["Data", "Cripto", "n:Quantità", "n:Ricavo", "n:Costo", "n:Risultato"], x.soloKoinly.map(function (z) { return [it(z.data) + " " + z.ora, esc(z.cripto), Q(String(z.quantita)), E(z.ricavo), E(z.costo), E(z.risultato)]; }), 100);
    if (x.soloNostre.length) h += "<h4>Cessioni rilevanti presenti solo nella ricostruzione (" + x.soloNostre.length + ")</h4>" + tab(["Data", "Cripto", "n:Quantità", "Tipo", "n:Corrispettivo", "n:Costo", "n:Risultato"], x.soloNostre.map(function (z) { return [it(z.data), esc(z.cripto), Q(z.q), esc(z.tipo), E(z.corrispettivo), E(z.costo), E(z.risultato)]; }), 100);
    return h + "</div>";
  }

  /* ---------- estratti conto bancari, anonimizzati alla lettura ---------- */
  S.banca = { movimenti: [], lette: 0, scartate: 0, file: 0 };
  async function caricaBanca(files) {
    for (var i = 0; i < files.length; i++) {
      try {
        var r = BK.leggi(await testoPdf(files[i]), files[i].name);
        S.banca.movimenti = S.banca.movimenti.concat(r.movimenti); S.banca.lette += r.righeLette; S.banca.scartate += r.righeScartate; S.banca.file++;
      } catch (e) { S.banca.errore = "Un file non è leggibile come PDF con testo."; }
    }
    S.banca.movimenti.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    render();
  }
  // versamenti e prelievi in euro sugli exchange registrati in Koinly
  function movKoinlyValuta() {
    if (!S.tx) return [];
    var fiat = function (v) { return D.FIAT.indexOf(v.simbolo) >= 0; };
    return S.tx.dati.movimenti.map(function (t) {
      var da = t.voci.filter(function (x) { return x.lato === "da"; })[0], a = t.voci.filter(function (x) { return x.lato === "a"; })[0], g = D.giorno(t.ts, S.fuso);
      if (t.voci.every(fiat)) { var v = da || a; return v ? { data: g, intermediario: (v.lato === "a" ? t.walletA : t.walletDa) || "", verso: v.lato === "a" ? "versamento" : "prelievo", importo: Math.abs(D.decNum(v.q)) } : null; }
      // acquisti e vendite regolati direttamente in euro (piattaforme che addebitano o accreditano il conto senza versamento separato)
      if (da && a && fiat(da) && !fiat(a)) return { data: g, intermediario: t.walletDa || t.walletA || "", verso: "acquisto", importo: Math.abs(D.decNum(da.q)) };
      if (da && a && !fiat(da) && fiat(a)) return { data: g, intermediario: t.walletA || t.walletDa || "", verso: "vendita", importo: Math.abs(D.decNum(a.q)) };
      return null;
    }).filter(Boolean);
  }
  function bancaRiscontrata() {
    var b = S.banca.movimenti.map(function (x) { return Object.assign({}, x); });
    BK.riscontra(b, movKoinlyValuta());
    return b;
  }
  function bancaPerAnni(anni) {
    if (!S.banca.movimenti.length) return '<p class="small">Estratti conto non ancora caricati (scheda «Caricamento file»): se ne leggono solo i movimenti con gli exchange, anonimizzati.</p>';
    var b = bancaRiscontrata().filter(function (x) { return !anni || anni.indexOf(+x.data.slice(0, 4)) >= 0; }), g = {};
    b.forEach(function (x) { var k = x.data.slice(0, 4) + "|" + x.controparte; var y = g[k] || (g[k] = { anno: x.data.slice(0, 4), cp: x.controparte, uscite: 0, entrate: 0, n: 0, ok: 0 }); y.n++; if (x.riscontro) y.ok++; if (x.segno < 0) y.uscite += x.importo; else y.entrate += x.importo; });
    return "<p>Dagli estratti conto (anonimizzati: solo date, importi ed exchange) risultano:</p>" + tab(["Anno", "Exchange", "n:Movimenti", "n:Bonifici verso l'exchange", "n:Accrediti dall'exchange", "n:Riscontrati in Koinly"], Object.keys(g).map(function (k) { var y = g[k]; return [y.anno, esc(y.cp), y.n, E(y.uscite), E(y.entrate), y.ok + " / " + y.n]; }));
  }
  function sezioneBanca() {
    var B = S.banca, b = bancaRiscontrata(), kSenza = BK.riscontra(S.banca.movimenti.map(function (x) { return Object.assign({}, x); }), movKoinlyValuta()).koinlySenzaBanca;
    return '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Estratti conto bancari (anonimizzati)</h3>' +
      '<p class="small">Caricate gli estratti conto in PDF. Alla lettura si tengono <b>solo</b> data, importo e exchange dei movimenti verso o da piattaforme di cripto-attività; tutte le altre righe (spese, stipendi, utenze) sono scartate e non vengono mostrate né salvate. Anche per i movimenti tenuti non si conservano nomi, IBAN, indirizzi o causali. I file restano in questo browser.</p>' +
      (B.file ? "" : '<p class="small muted">Gli estratti conto si caricano nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>.</p>') +
      (B.errore ? '<p class="small" style="color:var(--hi)">' + esc(B.errore) + "</p>" : "") +
      (B.file ? '<p class="small">' + B.file + " file letti: " + B.lette + " movimenti, di cui " + B.scartate + " scartati perché non riguardano cripto-attività; " + B.movimenti.length + " tenuti. " + '<button type="button" class="btnlink" id="svuotaBanca">Togli gli estratti conto</button></p>' +
        tab(["Data", "Movimento", "n:Importo", "Riscontro con Koinly"], b.map(function (x) { return [it(x.data), esc(x.descrizione), E(x.segno * x.importo), x.riscontro ? "✓ " + esc(x.riscontro.verso) + " del " + it(x.riscontro.data) + " su " + esc(x.riscontro.intermediario) : '<span style="color:var(--mid)">non trovato in Koinly</span>']; }), 150) +
        (kSenza.length ? '<p class="small">' + kSenza.length + " versamenti o prelievi in euro registrati in Koinly non trovano corrispondenza negli estratti caricati: possono riguardare altri conti o periodi non caricati.</p>" : "") : "") + "</div>";
  }

  /* ---------- questionario dell'Agenzia delle Entrate e dichiarazione sui wallet ---------- */
  S.quest = { anni: [], flag: {}, chiavi: {}, cliente: { nome: "", cf: "", nascita: "", residenza: "" } };
  var DOMANDE = [
    "Modalità di acquisto delle cripto-attività, con dettaglio degli intermediari utilizzati",
    "Copia della movimentazione bancaria dei conti utilizzati",
    "Elenco dei wallet alle date richieste, con tipologia (custodial o non custodial), chiavi pubbliche e wallet address",
    "Elenco delle transazioni effettuate, con tipologia e transaction ID",
    "Per ogni wallet, composizione e valore del saldo",
    "Rimborsi, cessioni a titolo oneroso, permute o altri proventi derivanti dalla detenzione di cripto-attività",
    "Operazioni di trasferimento di cripto-attività verso terzi",
    "Rilevanza o irrilevanza reddituale in Italia, con le ragioni"
  ];
  /* saldi Koinly per data ("2024-12-31": saldi), dai report caricati negli spazi dei saldi di inizio e fine anno;
     il report di fine dell'anno precedente vale come saldo al 1° gennaio */
  function saldiReport() {
    var m = {}; S.saldiFile.forEach(function (z) { m[z.data] = z.r.saldi; });
    S.saldiFile.forEach(function (z) { var a = +z.data.slice(0, 4) + 1; if (z.data.slice(5) === "12-31" && !m[a + "-01-01"]) m[a + "-01-01"] = z.r.saldi; });
    return m;
  }
  function reportFine(anno) { var z = S.saldiFile.filter(function (x) { return x.data === anno + "-12-31"; })[0]; return z ? z.r : null; }
  var cacheQ = null;
  function calcolaQuest() {
    if (!S.tx || !S.quest.anni.length) return null;
    var k = JSON.stringify([S.quest.anni, S.fuso, S.correzioni, S.saldiFile.map(function (z) { return z.data + z.nome; }), swapDal()]);
    if (cacheQ && cacheQ.k === k) return cacheQ.q;
    var iv = {}; if (ivaca) iv[S.anno] = ivaca.totali.ivaca;
    var q = QZ.calcola(S.tx.dati, { anni: S.quest.anni, fuso: S.fuso, correzioni: S.correzioni, swapNeutriDal: swapDal(), saldiReport: saldiReport(), ivaca: iv });
    cacheQ = { k: k, q: q }; return q;
  }
  /* saldi disponibili per gli anni scelti: per ogni anno servono i prezzi al 1° gennaio (o al 31/12 precedente) e al 31/12 */
  function saldiQuest() {
    var m = saldiReport(), date = S.saldiFile.map(function (z) { return z.data; });
    var manca = []; S.quest.anni.forEach(function (a) { if (!m[a + "-01-01"]) manca.push("1/1/" + a); if (!m[a + "-12-31"]) manca.push("31/12/" + a); });
    return (date.length ? "Saldi al " + date.map(D.it).join(", ") + "." : "Nessun report dei saldi caricato.") + (manca.length ? ' <span style="color:var(--hi)">Mancano i saldi al ' + manca.join(", ") + ": senza, i prezzi a quelle date non sono quelli di Koinly.</span>" : "");
  }
  function attribuzione(c) { return S.quest.flag[c.id] || c.proposta; }
  /* indirizzi e chiavi pubbliche di un wallet: quelli inseriti dallo studio, poi quelli completi letti dal file Koinly */
  function riferimenti(c) {
    var mano = String(S.quest.chiavi[c.id] || "").split(/[\s,;]+/).filter(Boolean);
    return mano.concat([c.chiavePubblica].concat(c.indirizzi).filter(function (x) { return x && mano.indexOf(x) < 0; }));
  }
  function daCompletare(c) { return c.daCompletare && !String(S.quest.chiavi[c.id] || "").trim(); }
  // testo per stampe, Excel e dichiarazione sostitutiva
  function testoRiferimenti(c) {
    var r = riferimenti(c);
    if (daCompletare(c)) return (r.length ? r.join(" · ") + " · " : "") + "DA COMPLETARE" + (c.abbreviato ? " (Koinly riporta solo l'abbreviazione " + c.abbreviato + ")" : " (indirizzo o chiave pubblica non presenti nel file Koinly)");
    return r.join(" · ");
  }
  function tab(intest, righe, max) {
    var rr = max ? righe.slice(0, max) : righe;
    return '<div class="scroll"><table class="det"><thead><tr>' + intest.map(function (x) { return "<th" + (/^n:/.test(x) ? ' class="n"' : "") + ">" + esc(x.replace(/^n:/, "")) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rr.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (/^n:/.test(intest[i]) ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
      (max && righe.length > max ? '<p class="small">Mostrate ' + max + " righe su " + righe.length + ": l'elenco completo è nell'Excel.</p>" : "");
  }
  function sezioniQuest(q, perStampa) {
    var M = perStampa ? 0 : 100, h = "";
    var dom = function (i, corpo) { h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">' + (i + 1) + ". " + esc(DOMANDE[i]) + "</h3>" + corpo + "</div>"; };
    // 1
    var acq = q.d1.acquisti;
    dom(0, (acq.length ? "<p>Acquisti con valuta tradizionale per intermediario:</p>" + tab(["Anno", "Intermediario", "Tipologia", "n:Operazioni", "n:Importo", "Valute", "Cripto acquistate"], acq.map(function (x) { return [x.anno, esc(x.intermediario), esc(x.tipo), x.n, E(x.importo), esc(x.valute), esc(x.cripto)]; })) : "<p>Nel periodo non risultano acquisti con valuta tradizionale.</p>") +
      "<p>Provenienza delle cripto entrate nel periodo:</p>" + tab(["Anno", "Provenienza", "n:Operazioni", "n:Valore"], [].concat.apply([], q.anni.map(function (a) { var p = q.d1.provenienze[a] || {}; return Object.keys(p).map(function (k) { return [a, esc(k), p[k].n, E(p[k].valore)]; }); }))) +
      '<p class="small">I «depositi da wallet non collegati» vanno documentati: sono le cripto di cui Koinly non conosce l\'origine (vedi le correzioni nella scheda «Costi di carico»).</p>');
    // 2
    dom(1, '<p class="small hi">Gli estratti conto vanno richiesti al cliente e allegati: Koinly registra solo i movimenti in valuta sugli exchange collegati.</p>' +
      (q.d2.sintesi.length ? tab(["Anno", "Intermediario", "Valuta", "n:Movimenti", "n:Versamenti", "n:Prelievi"], q.d2.sintesi.map(function (x) { return [x.anno, esc(x.intermediario), x.valuta, x.n, E(x.versamenti), E(x.prelievi)]; })) : "<p>Nessun movimento in valuta sugli exchange nel periodo.</p>") +
      (q.d2.movimenti.length ? tab(["Data", "Intermediario", "Movimento", "n:Importo", "Valuta"], q.d2.movimenti.map(function (b) { return [it(b.data), esc(b.intermediario || ""), b.verso, E(b.importo), b.valuta]; }), M) : "") +
      bancaPerAnni(q.anni));
    // 3: wallet, chiavi, attribuzione
    var ch = q.d3.chiavi;
    dom(2, "<p>Wallet registrati in Koinly e indirizzi esterni dei movimenti non abbinati. Per ciascuno il cliente indica se è suo: la dichiarazione sostitutiva elenca solo quelli marcati «mio».</p>" +
      (ch.some(daCompletare) ? '<p class="small" style="color:var(--hi)">' + ch.filter(daCompletare).length + " wallet senza indirizzo o chiave pubblica completi: Koinly li riporta solo abbreviati nel nome (tipico dei wallet Bitcoin con xpub o zpub) o non li riporta. Copiateli dalle impostazioni del wallet in Koinly o chiedeteli al cliente, e inseriteli qui (più indirizzi separati da spazio o virgola).</p>" : "") +
      (perStampa ? tab(["Wallet / indirizzo", "Tipologia", "Chiave pubblica / indirizzi", "Periodo di utilizzo", "Attribuzione"], ch.map(function (c) { return [esc(c.etichetta), esc(c.tipo) + (c.cripto ? "<br>" + esc(c.cripto) : ""), '<span style="word-break:break-all">' + esc(testoRiferimenti(c)) + "</span>", it(c.primo) + " – " + it(c.ultimo), esc(attribuzione(c))]; }))
        : '<div class="scroll"><table class="det"><thead><tr><th>Wallet / indirizzo</th><th>Tipologia</th><th>Chiave pubblica / indirizzi</th><th>Periodo</th><th class="n">Mov.</th><th>Attribuzione</th></tr></thead><tbody>' +
          ch.map(function (c) { var at = attribuzione(c), auto = [c.chiavePubblica].concat(c.indirizzi).filter(Boolean); return "<tr><td>" + esc(c.etichetta) + "</td><td>" + esc(c.tipo) + (c.cripto ? '<br><span class="u">' + esc(c.cripto) + " · " + E(c.valore) + "</span>" : "") + '</td><td class="small" style="word-break:break-all;max-width:300px">' + (auto.length ? esc(auto.join(" · ")) + "<br>" : "") +
            (c.genere === "wallet Koinly" && c.tipo !== "custodial (exchange)" ? '<input type="text" data-chiave="' + esc(c.id) + '" value="' + esc(S.quest.chiavi[c.id] || "") + '" placeholder="' + (c.abbreviato ? "completo di " + esc(c.abbreviato) : "indirizzo o chiave pubblica completa") + '" style="width:100%;min-width:220px">' +
              (daCompletare(c) ? '<br><span style="color:var(--hi)">Da completare' + (c.abbreviato ? ": Koinly riporta solo l'abbreviazione " + esc(c.abbreviato) : ": nel file Koinly non c'è l'indirizzo") + "</span>" : "") : "") + "</td><td>" + it(c.primo) + " – " + it(c.ultimo) + '</td><td class="n">' + c.n + '</td><td><select data-flag="' + esc(c.id) + '">' + ["mio", "non mio", "piattaforma", "da chiarire"].map(function (o) { return "<option" + (at === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></td></tr>"; }).join("") + "</tbody></table></div>") +
      q.d3.alleDate.map(function (x) { return "<h4>Saldi per wallet al " + x.data + " · totale " + E(x.totale, 0) + "</h4>" + tab(["Wallet", "Tipologia", "Cripto", "n:Quantità", "n:Valore", "Fonte del prezzo"], x.righe.map(function (r) { return [esc(r.wallet), esc(r.tipo), esc(r.cripto), Q(r.quantita), r.valore == null ? "n.d." : E(r.valore), esc(r.fontePrezzo)]; }), M); }).join(""));
    // 4
    dom(3, "<p>" + q.d4.transazioni.length + " transazioni nel periodo (esclusi i token sospetti), con tipologia Koinly e transaction ID.</p>" +
      tab(["Data", "Tipo", "Etichetta", "Da", "n:Quantità", "A", "n:Quantità", "n:Valore", "TxHash"], q.d4.transazioni.map(function (t) { return [it(t.data) + " " + t.ora, esc(t.tipo), esc(t.tag), esc(t.walletDa || ""), t.qDa ? Q(t.qDa) + " " + esc(t.valDa) : "", esc(t.walletA || ""), t.qA ? Q(t.qA) + " " + esc(t.valA) : "", E(t.valore), '<span class="small" style="word-break:break-all">' + esc(t.txHash) + "</span>"]; }), perStampa ? 60 : M) +
      (perStampa && q.d4.transazioni.length > 60 ? '<p class="small">Elenco completo nell\'allegato Excel.</p>' : ""));
    // 5
    dom(4, '<p class="small">Valori ai prezzi Koinly (report caricati) o, in mancanza, all\'ultimo prezzo delle transazioni. L\'Agenzia chiede il cambio della piattaforma di acquisto: dove serve, va verificato sul sito dell\'exchange.</p>' +
      q.d5.alleDate.map(function (x) { var w = {}; x.righe.forEach(function (r) { var y = w[r.wallet] || (w[r.wallet] = { tipo: r.tipo, n: 0, valore: 0 }); y.n++; y.valore += r.valore || 0; }); return "<h4>" + x.data + "</h4>" + tab(["Wallet", "Tipologia", "n:Cripto", "n:Valore"], Object.keys(w).map(function (k) { return [esc(k), esc(w[k].tipo), w[k].n, E(w[k].valore)]; })); }).join(""));
    // 6
    dom(5, q.anni.map(function (a) { return "<h4>" + a + "</h4>" + tab(["Tipo di operazione", "n:Numero", "n:Corrispettivi", "n:Costi (LIFO)", "n:Risultato"], (q.d6.cessioni[a] || []).map(function (c) { return [esc(c.tipo), c.n, E(c.corrispettivi), E(c.costi), E(c.risultato)]; })) +
      ((q.d6.proventi[a] || []).length ? tab(["Provento", "n:Operazioni", "n:Valore"], q.d6.proventi[a].map(function (p) { return [esc(p.voce), p.n, E(p.valore)]; })) : "<p>Nessun provento (interessi, reward, airdrop) registrato.</p>"); }).join(""));
    // 7
    dom(6, '<p class="small">Prelievi verso indirizzi non collegati a Koinly e uscite senza corrispettivo, esclusi quelli che lo studio ha già classificato come trasferimenti a wallet propri. Vanno confermati con il cliente.</p>' +
      tab(["Data", "Cripto", "n:Quantità", "Tipo", "Da wallet", "Destinazione", "n:Valore", "TxHash"], q.d7.trasferimenti.map(function (x) { return [it(x.data), esc(x.cripto), Q(x.quantita), esc(x.tipo), esc(x.walletDa), '<span class="small" style="word-break:break-all">' + esc(x.destinazione) + "</span>", E(x.valore), '<span class="small" style="word-break:break-all">' + esc(x.txHash) + "</span>"]; }), perStampa ? 80 : M));
    // 8
    dom(7, q.d8.anni.map(function (x) { return "<h4>" + x.anno + "</h4><p>" + esc(x.regime) + "</p>" + tab(["Voce", "n:Importo"], [["Corrispettivi delle cessioni rilevanti (contro valuta e stablecoin)", E(x.corrispettiviRilevanti)], ["Costi di acquisto (LIFO globale)", E(x.costiRilevanti)], ["<b>Plusvalenza / minusvalenza rilevante</b>", "<b>" + E(x.plusvalenzaRilevante) + "</b>"], ["Per confronto, tutte le cessioni comprese le permute: risultato", E(x.corrispettiviTutti - x.costiTutti)], ["Proventi (interessi, reward, airdrop)", E(x.proventi)], ["Imposta sul valore delle cripto-attività (IVACA)", x.ivaca == null ? "da calcolare nella prima scheda" : E(x.ivaca)]]); }).join("") +
      '<p class="small">Sintesi da completare con la valutazione dello studio: la rilevanza dipende anche dalla qualificazione dei proventi e dalla verifica delle operazioni non abbinate.</p>');
    return h;
  }
  function viewQuestionario() {
    var h = '<h2>Questionario dell\'Agenzia delle Entrate</h2><p class="lead">Elementi di risposta alle domande tipo sulle cripto-attività (inviti ex art. 32 DPR 600/1973), ricavati dai file Koinly e dai costi di carico ricostruiti. Le parti che Koinly non contiene sono indicate come da integrare.</p>';
    if (!S.tx) return h + '<p class="muted">Caricate il file delle transazioni nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>.</p>';
    var anni = anniCosti().filter(function (a) { return a >= 2017; });
    h += '<div class="panel"><div class="grid2"><div class="f"><span class="t">Anni richiesti dall\'Agenzia</span><div class="row">' + anni.map(function (a) { return '<label class="toggle"><input type="checkbox" data-qanno="' + a + '"' + (S.quest.anni.indexOf(a) >= 0 ? " checked" : "") + "><span>" + a + "</span></label>"; }).join("") + "</div></div>" +
      '<div class="f"><span class="t">Report Koinly dei saldi</span><span class="small">' + saldiQuest() + ' Si caricano negli spazi dei saldi di inizio e fine anno (scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>).</span></div></div></div>';
    var q = calcolaQuest();
    if (!q) return h + '<p class="muted" style="margin-top:14px">Scegliete gli anni richiesti dall\'Agenzia.</p>';
    var miei = q.d3.chiavi.filter(function (c) { return attribuzione(c) === "mio"; }).length, chiarire = q.d3.chiavi.filter(function (c) { return attribuzione(c) === "da chiarire"; }).length;
    h += '<div class="panel" style="margin-top:14px"><div class="toolbar"><button type="button" class="btn" id="excelQuest">Scarica Excel (tutte le risposte)</button><button type="button" class="btn gold" id="stampaQuest">Stampa / PDF del fascicolo</button><button type="button" class="btn gold" id="stampaDsan"' + (miei ? "" : " disabled") + '>Dichiarazione sostitutiva sui wallet (' + miei + ')</button><button type="button" class="btn gold" id="stampaMemoria">Memoria finale</button><button type="button" class="btn gold" id="memoriaWord">Memoria in Word</button><button type="button" class="btn ghost" id="salvaLavoro">Salva il lavoro</button></div>' +
      '<p class="small" style="margin:8px 0 0">' + miei + " wallet o indirizzi dichiarati del cliente, " + chiarire + " da chiarire. Il lavoro (correzioni e attribuzioni) si salva in un file e si ricarica nella scheda «Caricamento file».</p></div>";
    h += sezioniQuest(q, false);
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Dati del dichiarante per la dichiarazione sostitutiva</h3><div class="grid2">' +
      [["nome", "Cognome e nome"], ["cf", "Codice fiscale"], ["nascita", "Luogo e data di nascita"], ["residenza", "Residenza (indirizzo, comune)"]].map(function (x) { return '<label class="f"><span class="t">' + x[1] + '</span><input type="text" data-cliente="' + x[0] + '" value="' + esc(S.quest.cliente[x[0]] || "") + '" autocomplete="off"></label>'; }).join("") +
      '</div><p class="small">I dati restano in questo browser e nel file del lavoro salvato: non vengono inviati in rete.</p></div>';
    h += '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Dati della memoria in Word</h3><button type="button" class="btn gold" id="memoriaWord">Scarica la memoria in Word</button></div><div class="grid2" style="margin-top:10px">' +
      [["atto", "Atto di riferimento (es. Invito ex art. 32 D.P.R. 600/1973 n. …)"], ["ufficio", "Ufficio destinatario (es. Direzione Provinciale di … – Ufficio Controlli)"], ["indirizzo", "Indirizzo dell'ufficio"], ["pec", "PEC dell'ufficio"], ["attenzione", "Alla cortese attenzione di"], ["citta", "Luogo"], ["data", "Data (vuota = oggi)"]].map(function (x) { return '<label class="f"><span class="t">' + x[1] + '</span><input type="' + (x[0] === "data" ? "date" : "text") + '" data-mem="' + x[0] + '" value="' + esc(S.memoria[x[0]] || "") + '" autocomplete="off"></label>'; }).join("") +
      '</div><p class="small">La memoria in Word segue lo schema delle memorie di deposito dello studio (premesse, rappresenta, deposita, chiede, firma) con il contenuto tecnico della ricostruzione. Usa il nome e il codice fiscale indicati sopra; i campi lasciati vuoti restano da completare nel documento.</p></div>';
    return h;
  }
  function stampaQuest() {
    var q = calcolaQuest();
    apriStampa(intestazione("Questionario Agenzia delle Entrate · cripto-attività · anni " + q.anni.join(", ")) +
      '<table class="dati"><tr><td>Contribuente</td><td>' + esc(S.quest.cliente.nome || "________________") + "</td></tr><tr><td>Codice fiscale</td><td>" + esc(S.quest.cliente.cf || "________________") + "</td></tr><tr><td>Fonte dei dati</td><td>" + esc(S.tx.nome) + " (Koinly), costi LIFO globali ricostruiti con " + Object.keys(S.correzioni).length + " correzioni dello studio</td></tr></table>" +
      sezioniQuest(q, true) + '<p class="nota">Elaborato predisposto sui dati Koinly: le parti indicate vanno integrate con la documentazione del contribuente (estratti conto, contratti, dichiarazioni). Allegato: file Excel con gli elenchi completi.</p>' + firma());
  }
  /* Richiesta di chiarimenti al cliente sulle operazioni da verificare (filtri della scheda Costi, solo quelle non corrette).
     Solo dati delle operazioni: data, cripto, quantità, piattaforma, controvalore, indirizzo e hash. */
  function filtrateCosti() {
    var F = S.costi.filtro;
    return costiAnno(S.costi.anno).daVerificare.filter(function (v) { return (!F.tipo || v.tipo === F.tipo) && (!F.cripto || v.cripto === F.cripto) && (!F.wallet || v.wallet === F.wallet) && !S.correzioni[v.riga]; });
  }
  function stampaRichiesta() {
    // i residui di valore trascurabile (meno di 1 €) non si chiedono al cliente: se ne indica solo il numero
    var tutte = filtrateCosti(), el = tutte.filter(function (v) { return v.tipo === "senza valore" || Math.abs(v.valore || 0) >= 1; }), residui = tutte.length - el.length;
    var DOM = {
      prelievo: ["Prelievi di cripto-attività", "Per ciascun prelievo indicate: a quale wallet o piattaforma sono state inviate le cripto e se il wallet di destinazione è vostro; se sono state inviate a terzi, il motivo (pagamento di beni o servizi, prestito, dono, vendita privata) e l'eventuale corrispettivo ricevuto. Allegate l'estratto del wallet o della piattaforma di destinazione con l'accredito."],
      deposito: ["Depositi di cripto-attività", "Per ciascun deposito indicate: da quale wallet o piattaforma provengono le cripto e se il wallet di provenienza è vostro; come e quando le avete acquistate o ricevute e a quale costo. Allegate l'estratto del wallet o della piattaforma di provenienza o la documentazione dell'acquisto."],
      "senza valore": ["Operazioni senza controvalore in euro", "Per ciascuna operazione indicate, se lo conoscete, il controvalore in euro alla data o la documentazione da cui ricavarlo."]
    };
    var h = intestazione("Richiesta di chiarimenti sulle operazioni in cripto-attività") +
      "<p>Gentile Cliente,</p><p>dalla ricostruzione delle vostre operazioni in cripto-attività risultano i movimenti elencati di seguito, per i quali i dati disponibili non bastano a stabilire il corretto trattamento fiscale. Vi chiediamo di fornirci i chiarimenti e i documenti indicati per ciascun gruppo.</p>";
    if (!el.length) h += "<p><b>Non ci sono operazioni da chiarire con i filtri scelti.</b></p>";
    ["prelievo", "deposito", "senza valore"].forEach(function (tipo) {
      var g = el.filter(function (v) { return v.tipo === tipo; }); if (!g.length) return;
      h += "<h2>" + DOM[tipo][0] + " (" + g.length + ")</h2><p>" + DOM[tipo][1] + "</p>" +
        '<table class="det"><thead><tr><th>n.</th><th>Data</th><th>Cripto</th><th class="n">Quantità</th><th>Wallet / piattaforma</th><th class="n">Controvalore</th><th>Indirizzo / hash</th><th>Osservazioni</th><th>Risposta del cliente</th></tr></thead><tbody>' +
        g.map(function (v, i) { return "<tr><td>" + (i + 1) + "</td><td>" + it(v.data) + "</td><td>" + esc(v.cripto) + '</td><td class="n">' + Q(v.q) + "</td><td>" + esc(v.wallet || "") + '</td><td class="n">' + E(v.valore) + '</td><td class="small" style="word-break:break-all;max-width:160px">' + esc([v.indirizzo, v.txHash].filter(Boolean).join(" · ") || "non indicati") + '</td><td class="small">' + (v.indizi || []).map(esc).join("<br>") + '</td><td style="min-width:140px"></td></tr>'; }).join("") + "</tbody></table>";
    });
    if (residui) h += '<p class="small">Non sono elencati ' + residui + " movimenti residuali di valore inferiore a 1 €.</p>";
    h += "<p>Restiamo a disposizione per ogni chiarimento.</p>" + firma();
    apriStampa(h);
  }
  function stampaDsan() {
    var q = calcolaQuest(), c = S.quest.cliente, miei = q.d3.chiavi.filter(function (x) { return attribuzione(x) === "mio"; });
    var vuoto = function (v) { return esc(v || "__________________________"); };
    var oggi = new Date().toLocaleDateString("it-IT");
    var h = '<div class="dsan"><h1 style="text-align:center;font-size:14pt">DICHIARAZIONE SOSTITUTIVA DELL\'ATTO DI NOTORIETÀ</h1><p style="text-align:center">(art. 47 del D.P.R. 28 dicembre 2000, n. 445)</p>' +
      "<p>Il/La sottoscritto/a " + vuoto(c.nome) + ", nato/a a " + vuoto(c.nascita) + ", residente in " + vuoto(c.residenza) + ", codice fiscale " + vuoto(c.cf) + ",</p>" +
      "<p>consapevole delle sanzioni penali previste dall'art. 76 del D.P.R. 445/2000 per le ipotesi di falsità in atti e dichiarazioni mendaci, e della decadenza dai benefici eventualmente conseguiti ai sensi dell'art. 75 del medesimo decreto,</p>" +
      '<p style="text-align:center"><b>DICHIARA</b></p>' +
      "<p>che i wallet, le chiavi pubbliche e gli indirizzi di seguito elencati, non appartenenti a piattaforme di scambio o di custodia, sono di sua proprietà e nella sua esclusiva disponibilità e che le relative chiavi private sono custodite esclusivamente dal/dalla sottoscritto/a:</p>" +
      '<table class="det"><thead><tr><th>n.</th><th>Wallet</th><th>Chiave pubblica / indirizzi</th><th>Periodo di utilizzo</th></tr></thead><tbody>' +
      miei.map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(x.etichetta) + '</td><td style="word-break:break-all">' + esc(testoRiferimenti(x) || "—") + "</td><td>" + it(x.primo) + " – " + it(x.ultimo) + "</td></tr>"; }).join("") + "</tbody></table>" +
      "<p>Dichiara inoltre di essere informato/a, ai sensi del Regolamento (UE) 2016/679, che i dati personali raccolti saranno trattati anche con strumenti informatici esclusivamente nell'ambito del procedimento per il quale la presente dichiarazione viene resa.</p>" +
      '<p style="margin-top:28px">Luogo e data ______________________, ' + esc(oggi) + '</p><p style="margin-top:28px;text-align:right">Il/La dichiarante<br><br>______________________________</p>' +
      '<p class="nota" style="margin-top:28px">Allegare copia fotostatica di un documento di identità in corso di validità del dichiarante (art. 38 D.P.R. 445/2000).</p></div>';
    apriStampa(h);
  }
  function excelQuest() {
    var X = window.LumesXlsx, q = calcolaQuest(), int = function (a) { return a.map(function (v) { return { v: v, s: "intestazione" }; }); }, eu = function (v) { return { v: v || 0, s: "euro" }; };
    var foglio = function (nome, titolo, intest, righe, larg) { return { nome: nome, colonne: larg, righe: [[{ v: titolo, s: "titolo" }], []].concat([int(intest)]).concat(righe), orizzontale: true }; };
    var fogli = [
      foglio("1 Acquisti", "1. " + DOMANDE[0], ["Anno", "Intermediario", "Tipologia", "Operazioni", "Importo", "Valute", "Cripto"], q.d1.acquisti.map(function (x) { return [x.anno, x.intermediario, x.tipo, x.n, eu(x.importo), x.valute, x.cripto]; }), [8, 30, 20, 10, 14, 10, 30]),
      foglio("2 Exchange in euro", "2. " + DOMANDE[1] + " · movimenti in valuta sugli exchange (Koinly)", ["Data", "Intermediario", "Movimento", "Importo", "Valuta"], q.d2.movimenti.map(function (b) { return [it(b.data), b.intermediario || "", b.verso, eu(b.importo), b.valuta]; }), [12, 26, 12, 14, 8]),
      foglio("2 Banca anonimizzata", "2. Estratti conto: solo movimenti con exchange, anonimizzati", ["Data", "Movimento", "Importo", "Riscontro Koinly"], bancaRiscontrata().filter(function (b) { return q.anni.indexOf(+b.data.slice(0, 4)) >= 0; }).map(function (b) { return [it(b.data), b.descrizione, eu(b.segno * b.importo), b.riscontro ? b.riscontro.verso + " " + it(b.riscontro.data) + " su " + b.riscontro.intermediario : "non trovato in Koinly"]; }), [12, 36, 14, 50]),
      foglio("3 Wallet e chiavi", "3. " + DOMANDE[2], ["Wallet / indirizzo", "Genere", "Tipologia", "Indirizzi e chiavi pubbliche", "Da completare", "Primo utilizzo", "Ultimo utilizzo", "Movimenti", "Attribuzione"], q.d3.chiavi.map(function (c) { return [c.etichetta, c.genere, c.tipo, riferimenti(c).join(" "), daCompletare(c) ? "sì" + (c.abbreviato ? " (abbreviato " + c.abbreviato + ")" : "") : "", it(c.primo), it(c.ultimo), c.n, attribuzione(c)]; }), [40, 16, 22, 30, 50, 12, 12, 10, 14]),
      foglio("3-5 Saldi wallet", "3 e 5. Saldi per wallet alle date", ["Data", "Wallet", "Tipologia", "Cripto", "Quantità", "Valore", "Fonte del prezzo"], [].concat.apply([], q.d3.alleDate.map(function (x) { return x.righe.map(function (r) { return [x.data, r.wallet, r.tipo, r.cripto, +r.quantita, r.valore == null ? "n.d." : eu(r.valore), r.fontePrezzo]; }); })), [12, 40, 20, 10, 20, 14, 16]),
      foglio("4 Transazioni", "4. " + DOMANDE[3], ["Data", "Ora UTC", "Tipo", "Etichetta", "Wallet di uscita", "Quantità", "Cripto", "Wallet di entrata", "Quantità", "Cripto", "Commissione", "Valore €", "TxHash", "Indirizzo origine", "Indirizzo destinazione"], q.d4.transazioni.map(function (t) { return [it(t.data), t.ora, t.tipo, t.tag, t.walletDa || "", t.qDa ? +t.qDa : null, t.valDa, t.walletA || "", t.qA ? +t.qA : null, t.valA, t.fee, eu(t.valore), t.txHash, t.txSrc, t.txDest]; }), [12, 10, 12, 14, 30, 16, 8, 30, 16, 8, 16, 12, 40, 40, 40]),
      foglio("6 Cessioni e proventi", "6. " + DOMANDE[5], ["Anno", "Tipo", "Numero", "Corrispettivi", "Costi LIFO", "Risultato"], [].concat.apply([], q.anni.map(function (a) { return (q.d6.cessioni[a] || []).map(function (c) { return [a, c.tipo, c.n, eu(c.corrispettivi), eu(c.costi), eu(c.risultato)]; }).concat((q.d6.proventi[a] || []).map(function (p) { return [a, "provento: " + p.voce, p.n, eu(p.valore), null, null]; })); })), [8, 36, 10, 16, 16, 16]),
      foglio("7 Verso terzi", "7. " + DOMANDE[6], ["Data", "Cripto", "Quantità", "Tipo", "Da wallet", "Destinazione", "Valore €", "Costo LIFO", "TxHash"], q.d7.trasferimenti.map(function (x) { return [it(x.data), x.cripto, +x.quantita, x.tipo, x.walletDa, x.destinazione, eu(x.valore), eu(x.costo), x.txHash]; }), [12, 8, 16, 24, 30, 44, 14, 14, 44]),
      foglio("8 Rilevanza", "8. " + DOMANDE[7], ["Anno", "Corrispettivi rilevanti", "Costi LIFO", "Plusvalenza", "Tutte le cessioni: risultato", "Proventi", "IVACA", "Regime"], q.d8.anni.map(function (x) { return [x.anno, eu(x.corrispettiviRilevanti), eu(x.costiRilevanti), eu(x.plusvalenzaRilevante), eu(x.corrispettiviTutti - x.costiTutti), eu(x.proventi), x.ivaca == null ? "" : eu(x.ivaca), x.regime]; }), [8, 18, 16, 16, 18, 14, 12, 80])
    ];
    scaricaFile("questionario-ade-" + q.anni.join("-") + ".xlsx", new Blob([X.crea(fogli)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  /* ---------- memoria finale: come sono stati ricostruiti valori e costi, correzioni e differenze rispetto a Koinly ---------- */
  function koinlyRT(anno) {
    var x = confrontoKoinly(anno);
    if (x && x.koinly.n) return { corrispettivi: x.koinly.ricavo, costi: x.koinly.costo, nome: S.koinlyCes.nome, cessioni: true };
    var a = S.sanz.anni.filter(function (x) { return x.anno === anno && x.fonte.corrispettivi === "report"; })[0];
    if (a) return { corrispettivi: +a.corrispettivi || 0, costi: +a.costi || 0, nome: a.nome };
    var r = reportFine(anno);
    return r && r.plusvalenze && r.plusvalenze.ricavato != null ? { corrispettivi: r.plusvalenze.ricavato, costi: r.plusvalenze.costi || 0, nome: "" } : null;
  }
  /* Memoria tecnica: un solo contenuto a blocchi (vedi docx-mini.js), stampato in HTML o scaricato in Word */
  function memoriaContenuto() {
    var anni = S.quest.anni.length ? S.quest.anni.slice() : [S.costi.anno || S.anno];
    var mov = S.tx.dati.movimenti, primo = mov.length ? D.giorno(mov[0].ts, S.fuso) : "", ultimo = mov.length ? D.giorno(mov[mov.length - 1].ts, S.fuso) : "";
    var conCorr = {}, senzaCorr = {};
    anni.forEach(function (a) { conCorr[a] = confrontoCosti(C.calcola(S.tx.dati, { anno: a, fuso: S.fuso, correzioni: S.correzioni, swapNeutriDal: swapDal() }), a); senzaCorr[a] = C.calcola(S.tx.dati, { anno: a, fuso: S.fuso, swapNeutriDal: swapDal() }); });
    var r0 = conCorr[anni[anni.length - 1]];
    var dv = r0.daVerificare, corr = dv.filter(function (v) { return S.correzioni[v.riga]; });
    var etichettaAz = function (v, cz) { var o = (AZIONI[v.tipo] || []).filter(function (x) { return x[0] === cz.azione; })[0]; return o ? o[1] : cz.azione; };
    var gruppi = {};
    corr.forEach(function (v) { var cz = S.correzioni[v.riga], k = v.tipo + " → " + etichettaAz(v, cz); var g = gruppi[k] || (gruppi[k] = { n: 0, valore: 0, motivi: {} }); g.n++; g.valore += v.valore || 0; if (cz.motivo) g.motivi[cz.motivo] = true; });
    var sommaCosto = function (r, k) { return r.righe.filter(function (x) { return !x.spam; }).reduce(function (s, x) { return s + x[k]; }, 0); };
    var rtDi = function (r, a) { var t = a >= 2023 ? r.totali.controValutaStable : r.totali.tutte; return { c: t.corrispettivi, k: t.costi }; };
    var B = [], P = function (t) { B.push({ t: "p", testo: t }); }, T = function (t) { B.push({ t: "sottotitolo", testo: t }); };
    var fonti = "l'esportazione completa delle transazioni dal software Koinly (" + mov.length.toLocaleString("it-IT") + " operazioni dal " + it(primo) + " al " + it(ultimo) + ", date in " + (S.fuso === "UTC" ? "UTC" : "ora italiana") + ")" +
      (S.saldiFile.length ? "; i report Koinly dei saldi di inizio e fine anno" : "") + (S.koinlyCes ? "; il «Complete tax report» Koinly" : "") + (S.etoro ? "; il rendiconto del conto eToro" : "") + (S.banca.movimenti.length ? "; gli estratti conto bancari, letti in forma anonimizzata" : "");

    T("1. Oggetto e fonti");
    P("La presente memoria illustra come sono stati determinati i costi di acquisto, i corrispettivi e i valori delle cripto-attività del contribuente per gli anni " + anni.join(", ") + ", ai fini dei quadri RW e RT e delle risposte all'Agenzia delle Entrate.");
    P("Fonti: " + fonti + ". I report di Koinly sono stati usati come riscontro, non come dato definitivo.");
    T("2. Punto di partenza e metodo");
    P("I costi non sono stati presi dai saldi di Koinly a inizio anno, ma ricostruiti **dall'origine**, cioè dalla prima operazione registrata (" + it(primo) + "), seguendo ogni movimento fino alla fine del periodo. Per ogni cripto-attività è stata formata una pila di strati di costo, unica per tutti i wallet e per tutti gli anni (**LIFO globale**, non per singolo wallet né per singolo anno): ogni cessione scarica per prima la quantità acquistata più di recente. Criteri adottati:");
    B.push({ t: "elenco", voci: [
      "**Acquisto con valuta tradizionale**: costo pari all'importo pagato, comprese le commissioni.",
      S.costi.swapNeutri ? "**Permute fino al 2022**: la cripto ceduta si considera ceduta al valore del momento e quella ricevuta entra con quel valore. **Dal 2023** permute tra cripto, acquisti di cripto con stablecoin e scambi tra stablecoin sono «swap» non realizzativi (art. 67 c. 1 lett. c-sexies TUIR): la cripto ricevuta prende il costo LIFO di quella ceduta."
        : "**Permute**: la cripto ceduta si considera ceduta al valore del momento e quella ricevuta entra con quel valore.",
      "**Interessi, reward, airdrop, cashback**: caricati al valore del giorno di ricezione.",
      "**Trasferimenti tra wallet propri**: nessun effetto sui costi, salvo la commissione; " + r0.trasferimentiAbbinati + " coppie di prelievo e deposito non abbinate da Koinly sono state riconosciute come trasferimenti interni (stessa cripto, quantità uguale al netto della commissione, date entro 3 giorni).",
      "**Commissioni pagate in cripto**: scaricano strati di costo e il loro valore si aggiunge al costo dell'acquisto o riduce il corrispettivo.",
      "**Rilevanza fiscale**: dal 2023 sono cessioni rilevanti per il quadro RT quelle contro valuta tradizionale e contro stablecoin (art. 67 c. 1 lett. c-sexies TUIR); fino al 2022 le cripto-attività seguono il regime delle valute estere.",
      "**Token sospetti** (pubblicità, phishing, imitazioni di stablecoin ricevute senza richiesta): " + r0.spam + " token esclusi dai calcoli."] });
    T("3. Correzioni apportate ai dati di Koinly e motivi");
    P("Koinly non conosce l'origine delle cripto arrivate da wallet non collegati né la destinazione di quelle inviate a indirizzi non collegati: in questi casi attribuisce valori di mercato del giorno o tratta l'uscita come perdita del costo. Sono state individuate " + dv.length + " operazioni di questo tipo nell'intero storico; " + corr.length + " sono state corrette sulla base della documentazione e delle dichiarazioni del contribuente.");
    if (corr.length) B.push({ t: "tabella", intest: ["Operazione → correzione", "Numero", "Valore Koinly", "Motivi indicati"], numeri: [1, 2], righe: Object.keys(gruppi).map(function (k) { var g = gruppi[k]; return [k, String(g.n), E(g.valore), Object.keys(g.motivi).join("; ") || "—"]; }) });
    if (dv.length - corr.length) P("Restano " + (dv.length - corr.length) + " operazioni non corrette: sono state trattate con il criterio predefinito (depositi al valore del giorno, prelievi come uscite senza corrispettivo) e andrebbero documentate.");
    if (S.banca.movimenti.length) { var bb = bancaRiscontrata(); P("**Riscontro bancario.** Dagli estratti conto, letti in forma anonimizzata (solo date, importi ed exchange; nessun altro movimento né dato personale), risultano " + bb.length + " movimenti con piattaforme di cripto-attività, di cui " + bb.filter(function (x) { return x.riscontro; }).length + " trovano corrispondenza nei versamenti e prelievi in euro registrati in Koinly."); }
    T("4. Differenze rispetto ai report Koinly senza modifiche");
    anni.forEach(function (a) {
      var rc = conCorr[a], rs = senzaCorr[a], k = koinlyRT(a), cf = rc.confronto || {}, tc = rtDi(rc, a), ts = rtDi(rs, a);
      var riga = function (lab, kv, rr, rcv) { return [lab, kv == null ? "–" : E(kv), E(rr), E(rcv), kv == null ? "–" : E(rcv - kv)]; };
      B.push({ t: "p", testo: "**Anno " + a + "**", spazioDopo: 60 });
      B.push({ t: "tabella", intest: ["Voce", "Koinly (report)", "Senza correzioni", "Ricostruzione finale", "Differenza con Koinly"], numeri: [1, 2, 3, 4], righe: [
        riga("Costo al 1/1", cf.koinlyInizio || null, sommaCosto(rs, "costoInizio"), sommaCosto(rc, "costoInizio")),
        riga("Costo al 31/12", cf.koinlyFine || null, sommaCosto(rs, "costoFine"), sommaCosto(rc, "costoFine")),
        riga("Corrispettivi RT", k ? k.corrispettivi : null, ts.c, tc.c),
        riga("Costi RT", k ? k.costi : null, ts.k, tc.k),
        riga("**Plusvalenza RT**", k ? k.corrispettivi - k.costi : null, ts.c - ts.k, tc.c - tc.k)] });
      P("Effetto delle correzioni sulla plusvalenza: " + E((tc.c - tc.k) - (ts.c - ts.k)) + (k ? "; effetto del metodo e dei criteri rispetto a Koinly: " + E((ts.c - ts.k) - (k.corrispettivi - k.costi)) : "") + "." + (a >= 2023 ? " Dal 2023 Koinly considera tassabili anche le permute tra cripto, che la ricostruzione tratta come non realizzative." : ""));
      var x = confrontoKoinly(a);
      if (x && x.koinly.n) B.push({ t: "tabella", intest: ["Riconciliazione con le cessioni Koinly " + a, "Importo"], numeri: [1], righe: x.voci.map(function (v) { return [v.voce + (v.n != null ? " (" + v.n + ")" : ""), E(v.importo)]; }).concat([["**= Plusvalenza ricostruita**", E(x.nostra.risultato)]]) });
    });
    T("5. Conclusioni");
    P("Per i quadri della dichiarazione si propongono i valori della ricostruzione finale:");
    B.push({ t: "elenco", voci: anni.map(function (a) { var t = rtDi(conCorr[a], a); return "**" + a + "**: corrispettivi " + E(t.c) + ", costi " + E(t.k) + ", plusvalenza " + E(t.c - t.k) + (a >= 2023 && a <= 2024 ? " (prima della franchigia di 2.000 €)" : "") + "."; }) });
    // quadro RW: valori e imposta degli anni con i saldi Koinly di inizio e fine anno
    var rw = anni.map(function (a) { var x = a === S.anno && ivaca ? { ivaca: ivaca } : calcolaAnno(a); return x ? { a: a, iv: x.ivaca } : null; }).filter(Boolean);
    if (rw.length) {
      P("**Quadro RW.** Valori delle cripto-attività per periodo di detenzione (un rigo per ogni periodo a quantità costante, valore iniziale e finale di inizio e fine detenzione):");
      B.push({ t: "tabella", intest: ["Anno", "Codice RW", "Cripto", "Periodi di detenzione", "Valore finale", "IVACA"], numeri: [2, 3, 4, 5], righe: rw.map(function (x) {
        var r = x.iv.righe.filter(function (z) { return z.incluso; });
        return [String(x.a), x.iv.dovuta ? "21" : "14 (solo monitoraggio)", String(r.length), String(x.iv.totali.righiRw), E(r.reduce(function (s, z) { return s + (z.valoreFinale || 0); }, 0)), x.iv.dovuta ? E(x.iv.totali.ivaca) : "non dovuta"];
      }) });
    } else P("**Quadro RW.** Per compilarlo servono i report Koinly dei saldi di inizio e fine anno degli anni esaminati.");
    P("I valori differiscono da quelli di Koinly perché ricostruiti dall'origine con il metodo LIFO globale, applicando i criteri sopra descritti e correggendo le operazioni di cui Koinly non conosceva origine o destinazione. Ogni correzione è riportata, con il riferimento alla riga del file Koinly, nel prospetto Excel allegato.");
    T("6. Limiti e documentazione da acquisire");
    B.push({ t: "elenco", voci: ["Estratti conto bancari dei conti utilizzati per gli acquisti e per l'incasso delle vendite.", "Documentazione dei wallet non collegati a Koinly e dichiarazione sostitutiva del contribuente sulla titolarità dei wallet e delle chiavi pubbliche.",
      "Verifica delle operazioni non corrette e dei prezzi stimati in assenza di controvalore.", "I valori di mercato sono quelli di Koinly; dove l'Agenzia chiede il cambio della piattaforma di acquisto vanno riscontrati sul sito dell'exchange."] });
    return { anni: anni, blocchi: B, corrette: corr.length };
  }
  function blocchiHtml(bl) {
    var md = function (t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); };
    return bl.map(function (b) {
      if (b.t === "titolo") return '<h2 style="text-align:center">' + md(String(b.testo).toUpperCase()) + "</h2>";
      if (b.t === "sottotitolo") return "<h2>" + md(b.testo) + "</h2>";
      if (b.t === "elenco") return (b.numerato ? '<ol type="a">' : "<ul>") + b.voci.map(function (v) { return "<li>" + md(v) + "</li>"; }).join("") + (b.numerato ? "</ol>" : "</ul>");
      if (b.t === "tabella") return '<table class="det"><thead><tr>' + b.intest.map(function (t, i) { return "<th" + ((b.numeri || []).indexOf(i) >= 0 ? ' class="n"' : "") + ">" + md(t) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        b.righe.map(function (r) { return "<tr>" + r.map(function (t, i) { return "<td" + ((b.numeri || []).indexOf(i) >= 0 ? ' class="n"' : "") + ">" + md(t) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
      if (b.t === "pagina") return "";
      return "<p" + (b.allinea === "center" ? ' style="text-align:center"' : b.allinea === "right" ? ' style="text-align:right"' : "") + ">" + md(b.testo) + "</p>";
    }).join("");
  }
  function stampaMemoria() {
    var m = memoriaContenuto(), st = window.KoinlyStudio || {}, c = S.quest.cliente;
    apriStampa(intestazione("Memoria tecnica · ricostruzione di costi e valori delle cripto-attività") +
      '<table class="dati"><tr><td>Contribuente</td><td>' + esc(c.nome || "________________") + (c.cf ? " · C.F. " + esc(c.cf) : "") + "</td></tr><tr><td>Anni esaminati</td><td>" + m.anni.join(", ") + "</td></tr><tr><td>Redatta da</td><td>" + esc(st.professionista) + "</td></tr></table>" +
      blocchiHtml(m.blocchi) + firma());
  }
  /* Memoria in Word, nella forma delle memorie di deposito dello studio: luogo e data, destinatario, oggetto, PREMESSO CHE,
     RAPPRESENTA (contenuto tecnico), DEPOSITA, CHIEDE, allegati e firma. Testo generale: i dati mancanti restano da completare. */
  function memoriaWord() {
    var m = memoriaContenuto(), st = window.KoinlyStudio || {}, c = S.quest.cliente, M = S.memoria, v = function (x) { return x || "____________________"; };
    var oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    var allegati = ["prospetto Excel della ricostruzione dei costi di carico con le correzioni (Koinly Tools)", "fascicolo di risposta al questionario e prospetto Excel delle risposte"]
      .concat(S.quest.flag && Object.keys(S.quest.flag).length ? ["dichiarazione sostitutiva di atto di notorietà sulla titolarità dei wallet e delle chiavi pubbliche"] : [])
      .concat(S.banca.movimenti.length ? ["estratti conto bancari relativi ai movimenti con le piattaforme di cripto-attività"] : [])
      .concat(["report Koinly delle transazioni e dei saldi utilizzati"]).concat(S.etoro ? ["rendiconto del conto eToro"] : []);
    var B = [
      { t: "p", testo: v(M.citta) + " lì " + (M.data ? it(M.data) : oggi), allinea: "right" },
      { t: "p", testo: "**Spett.le**\n**Agenzia delle Entrate**\n" + v(M.ufficio) + (M.indirizzo ? "\n" + M.indirizzo : "") + (M.pec ? "\n**PEC: " + M.pec + "**" : "") + (M.attenzione ? "\nAlla c.a. " + M.attenzione : ""), allinea: "left" },
      { t: "p", testo: "**OGGETTO: " + (M.atto ? M.atto + " – " : "") + "Contribuente " + v(c.nome) + (c.cf ? " (C.F. " + c.cf + ")" : "") + " – Memoria tecnica sulla ricostruzione dei costi e dei valori delle cripto-attività, anni " + m.anni.join(", ") + ".**" },
      { t: "titolo", testo: "Premesso che" },
      { t: "elenco", numerato: true, voci: [
        "il sottoscritto " + v(st.professionista) + ", " + v(st.qualifica) + ", con studio in " + v(st.indirizzo) + ", agisce in qualità di procuratore speciale del contribuente in epigrafe;",
        "con l'atto indicato in oggetto codesto Spett.le Ufficio ha richiesto dati, notizie e documenti relativi alle cripto-attività detenute e alle operazioni compiute dal contribuente;",
        "il contribuente, per il tramite del sottoscritto, intende prestare la più ampia e leale collaborazione;",
        "i valori esposti sono stati ricostruiti dai dati delle piattaforme e dei wallet del contribuente con il metodo descritto di seguito, che in alcuni punti si discosta, motivatamente, dai report standard del software Koinly;"] },
      { t: "titolo", testo: "Tutto ciò premesso" },
      { t: "p", testo: "il sottoscritto, in nome e per conto del contribuente,", allinea: "center" },
      { t: "titolo", testo: "Rappresenta" }
    ].concat(m.blocchi).concat([
      { t: "titolo", testo: "Deposita" },
      { t: "p", testo: "la seguente documentazione:" },
      { t: "elenco", numerato: true, voci: allegati.map(function (x, i) { return x + (i < allegati.length - 1 ? ";" : "."); }) },
      { t: "titolo", testo: "Chiede" },
      { t: "p", testo: "a codesto Spett.le Ufficio di voler tenere conto della ricostruzione e dei criteri esposti nella presente memoria e nei prospetti allegati, riservandosi il sottoscritto di integrare la documentazione e di fornire ogni ulteriore chiarimento, anche in sede di contraddittorio." },
      { t: "p", testo: "Il sottoscritto conferma sin d'ora la piena disponibilità al contraddittorio, anche in modalità da remoto." },
      { t: "p", testo: "Con osservanza." },
      { t: "p", testo: "Il procuratore speciale\n" + v(st.professionista) + "\nF.to Digitale", allinea: "right" }
    ]);
    var bin = window.LumesDocx.crea(B, { titolo: "Memoria tecnica cripto-attività", autore: st.professionista,
      intestazione: [st.professionista, st.qualifica].filter(Boolean), piede: [[st.indirizzo, st.email].filter(Boolean).join(" · ") + (st.partitaIva ? " · P.IVA " + st.partitaIva : "")] });
    scaricaFile("memoria-cripto-" + m.anni.join("-") + ".docx", new Blob([bin], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  }

  /* ---------- quadri del modello Redditi PF e F24 ---------- */
  var TITOLI = { 1: "proprietà", 2: "usufrutto", 3: "nuda proprietà", 4: "altro" };
  S.modelli = { titolo: 1, sogliaPeriodi: 20 };
  // altri redditi inseriti a mano (broker esteri come eToro): quadro RT al 26% e quadro RM
  S.altri = [];
  // dati della memoria in Word (destinatario e atto): restano vuoti se non indicati
  S.memoria = { citta: "Firenze", data: "", ufficio: "", indirizzo: "", pec: "", attenzione: "", atto: "" };
  var altroId = 1;
  function nuovoAltro() { var a = new Date().getFullYear() - 1; S.altri.push({ id: altroId++, anno: a, fonte: "eToro", corr: "", costi: "", minus: "", lettera: "H", stato: "", lordo: "" }); }
  function tabellaRW(q) {
    var testa = '<thead><tr><th>Modulo / rigo</th><th>Cripto · periodo</th><th class="n">Col. 1<br>titolo</th><th class="n">Col. 3<br>codice</th><th class="n">Col. 4<br>Stato</th><th class="n">Col. 5<br>quota %</th><th class="n">Col. 6<br>criterio</th><th class="n">Col. 7<br>valore iniziale</th><th class="n">Col. 8<br>valore finale</th><th class="n">Col. 10<br>giorni</th><th class="n">Col. 12<br>credito</th><th class="n">Col. 16<br>solo monit.</th><th class="n">Col. 33<br>imposta</th><th class="n">Col. 34<br>dovuta</th></tr></thead>';
    var righe = q.righi.map(function (x) {
      return "<tr><td>" + x.modulo + " / " + x.rigo + "</td><td>" + esc(x.cripto) + ' <span class="u">' + it(x.dal) + "–" + it(x.al) + " · " + (x.aggregato ? "rigo unico di " + x.aggregato + " periodi: col. 8 valore medio (finale " + E(x.valoreFinale, 0) + ")" : Q(x.quantita)) + '</span></td><td class="n">' + x.c1 + '</td><td class="n">' + x.c3 + '</td><td class="n">' + (x.c4 || "–") + '</td><td class="n">' + String(x.c5).replace(".", ",") +
        '</td><td class="n">' + x.c6 + '</td><td class="n">' + E(x.c7, 0) + '</td><td class="n">' + E(x.c8, 0) + '</td><td class="n">' + x.c10 + '</td><td class="n">' + (x.c12 ? E(x.c12, 0) : "–") + '</td><td class="n">' + (x.c16 ? "X" : "") + '</td><td class="n">' + E(x.c33, x.c33 < 0.01 && x.c33 > 0 ? 4 : 2) + '</td><td class="n">' + E(x.c34, x.c34 < 0.01 && x.c34 > 0 ? 4 : 2) + "</td></tr>";
    }).join("");
    var w = q.rw8;
    if (!w) return '<table class="det rw">' + testa + "<tbody>" + righe + "</tbody></table>" +
      '<p class="small">Anno ' + q.anno + ": codice 14, cripto-attività indicate solo per il monitoraggio. Fino al 31/12/2022 l'imposta sulle cripto-attività non esisteva e sulle cripto non era dovuta l'IVAFE: niente colonne d'imposta e niente rigo RW8. Importi del modello in unità di euro.</p>";
    return '<table class="det rw">' + testa + "<tbody>" + righe + "</tbody></table>" +
      '<table class="det" style="margin-top:10px;width:auto"><thead><tr><th colspan="2">Rigo RW8 · imposta sulle cripto-attività (IC)</th></tr></thead><tbody>' +
      "<tr><td>Col. 1 · imposta dovuta (somma col. 34: " + E(w.esatta) + ", arrotondata all'euro)</td><td class=\"n\">" + E(w.imposta, 0) + "</td></tr><tr><td>Col. 2 · eccedenza dalla dichiarazione precedente</td><td class=\"n\">" + E(w.eccedenzaPrecedente) + "</td></tr>" +
      "<tr><td>Col. 3 · eccedenza compensata in F24</td><td class=\"n\">" + E(w.eccedenzaCompensata) + "</td></tr><tr><td>Col. 4 · acconti versati</td><td class=\"n\">" + E(w.acconti) + "</td></tr>" +
      '<tr class="tot"><td>Imposta a debito</td><td class="n">' + E(w.debito, 0) + "</td></tr></tbody></table>" +
      '<p class="small">Importi del modello in unità di euro. L\'imposta dei singoli righi è mostrata con i decimali, perché per i periodi di pochi giorni vale meno di un euro: il totale del rigo RW8 è la somma esatta, arrotondata all\'euro.</p>' +
      (w.imposta <= 12 ? '<p class="small">L\'imposta non supera 12 €: non si versa.</p>' : "");
  }
  function viewModelli() {
    var h = '<h2>Quadri RW, RT e F24</h2><p class="lead">Compilazione secondo i modelli ministeriali (Redditi PF, fascicolo 2, e modello F24), dai calcoli delle pagine precedenti. Ogni prospetto si stampa o si salva in PDF.</p>';
    h += '<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Quadro RW · cripto-attività</h3>' + (ivaca ? '<button type="button" class="btn gold" id="stampaRW">Stampa / PDF quadro RW</button>' : "") + "</div>";
    if (!ivaca) h += '<p class="muted">Per compilare il quadro RW servono i calcoli della prima pagina (transazioni e saldi di inizio e fine anno).</p></div>';
    else {
      var q = MOD.quadroRW(ivaca, { titolo: S.modelli.titolo, sogliaPeriodi: S.modelli.sogliaPeriodi });
      h += '<div class="grid2" style="margin:10px 0">' +
        '<label class="f"><span class="t">Rigo unico per le cripto con più di … periodi</span><input class="num" type="number" min="0" step="1" data-mod="sogliaPeriodi" value="' + esc(S.modelli.sogliaPeriodi) + '"><span class="small">Valore iniziale del primo periodo, valore medio ponderato per i giorni, giorni complessivi: l\'imposta resta uguale alla somma dei periodi. 0 = mai.</span></label><label class="f"><span class="t">Col. 1 · titolo di possesso</span><select data-mod="titolo">' + [1, 2, 3, 4].map(function (k) { return '<option value="' + k + '"' + (S.modelli.titolo === k ? " selected" : "") + ">" + k + " · " + TITOLI[k] + "</option>"; }).join("") + "</select></label>" +
        '<div class="f"><span class="t">Anno ' + q.anno + '</span><span class="small">' + q.righi.length + " righi in " + q.moduli + " moduli: un rigo per periodo di detenzione. Codice " + q.codice + (q.codice === 14 ? " (cripto-attività, fino al 2022: solo monitoraggio, senza imposta)" : " (cripto-attività)") + ", criterio 1 (valore di mercato), quota " + String(ivaca.quota * 100).replace(".", ",") + "%.</span></div></div>" +
        '<p class="small">La circolare 30/E chiede un rigo per ogni portafoglio: qui i periodi sono calcolati sul totale dei wallet di ciascuna cripto.</p>' +
        '<div class="scroll">' + tabellaRW(q) + "</div></div>";
    }
    // quadro RT: dagli anni della pagina Sanzioni (corrispettivi e costi)
    h += '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Quadro RT · cripto-attività</h3>' + (S.sanz.anni.length ? '<button type="button" class="btn gold" id="stampaRT">Stampa / PDF quadro RT</button>' : "") + "</div>";
    h += S.sanz.anni.length ? S.sanz.anni.map(function (a) { return tabellaRT(a); }).join("") : '<p class="muted">Il quadro RT si compila dagli anni inseriti nella pagina Sanzioni (corrispettivi delle vendite e costi di acquisto).</p>';
    h += "</div>";
    h += pannelloReport();
    h += pannelloAltri();
    h += sezioneEtoro();
    // F24
    var f = MOD.f24(calcoliSanzioni());
    h += '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Modello F24 · ravvedimento</h3>' + (f.righe.length ? '<button type="button" class="btn gold" id="stampaF24">Stampa / PDF modello F24</button>' : "") + "</div>" +
      '<div class="grid2" style="margin:10px 0"><label class="f"><span class="t">Codice fiscale del contribuente</span><input type="text" data-modt="cf" value="' + esc(S.modelli.cf || "") + '" maxlength="16" autocomplete="off"></label><label class="f"><span class="t">Cognome e nome</span><input type="text" data-modt="nome" value="' + esc(S.modelli.nome || "") + '" autocomplete="off"></label></div>' +
      (f.righe.length ? tabellaF24(f) : '<p class="muted">L\'F24 si compila dai ravvedimenti della pagina Sanzioni.</p>') + "</div>";
    return h;
  }
  /* ---------- altri report Koinly (Income, Expenses, Gifts/Lost, Other gains): solo informazioni, non entrano nei calcoli ---------- */
  async function caricaReportKoinly(files) {
    var errori = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        if (/\.pdf$/i.test(f.name)) throw new Error("serve il CSV.");
        var r = KR.leggi(await f.text());
        if (r.errore) throw new Error(r.errore);
        // un file per tipo e anno: un nuovo report dello stesso tipo e anno sostituisce il precedente
        var chiave = r.tipo + "-" + (r.anno || f.name);
        S.report = S.report.filter(function (z) { return z.chiave !== chiave; });
        S.report.push({ nome: f.name, chiave: chiave, r: r });
      } catch (e) { errori.push(f.name + ": " + (e.message || String(e))); }
    }
    var ORD = ["redditi", "altri", "perdite", "commissioni"];
    S.report.sort(function (a, b) { return (a.r.anno || 0) - (b.r.anno || 0) || ORD.indexOf(a.r.tipo) - ORD.indexOf(b.r.tipo); });
    S.reportErrore = errori.join(" · ") || null;
    render();
  }
  var NOTE_REPORT = {
    redditi: "Ricompense di staking, airdrop, interessi, cashback e simili, al valore del giorno in cui sono state ricevute.",
    altri: "Profitti e perdite che Koinly tiene fuori dalle plusvalenze ordinarie: di solito derivati, futures e margin. La qualificazione fiscale va valutata dallo studio.",
    perdite: "Cripto regalate, donate, perse o rubate: per le perdite servono documenti (denunce, comunicazioni dell'exchange).",
    commissioni: "Commissioni e costi pagati in cripto (commissioni di rete, transazioni fallite)."
  };
  function pannelloReport() {
    if (!S.report.length) return "";
    var h = '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Altri report Koinly · informazioni</h3><p class="small">Riepiloghi dei report caricati nella scheda «Caricamento file». Sono informazioni in più e riscontri: <b>non cambiano</b> il quadro RW, il quadro RT né le sanzioni.</p>';
    S.report.forEach(function (z) {
      var r = z.r, altri = r.tipo === "altri";
      h += '<h4 style="margin:18px 0 4px">' + esc(r.titolo) + (r.anno ? " · " + r.anno : "") + "</h4>" + '<p class="small muted" style="margin:0 0 6px;overflow-wrap:anywhere">' + esc(NOTE_REPORT[r.tipo]) + " File: " + esc(z.nome) + ".</p>";
      if (!r.righe.length) { h += "<p>Nessuna riga nel report: per l'anno Koinly non registra operazioni di questo tipo.</p>"; return; }
      h += "<p><b>" + r.righe.length.toLocaleString("it-IT") + " righe</b> · " + (altri ? "profitti " + E(r.profitti) + " · perdite " + E(r.perdite) + " · <b>netto " + E(r.totale) + "</b>" : "totale <b>" + E(r.totale) + "</b>") + "</p>";
      if (r.avvisi.length) h += '<p class="small" style="color:var(--mid)">' + r.avvisi.map(esc).join("<br>") + "</p>";
      var righe = function (l) { return l.slice(0, 10).map(function (x) { return altri ? [esc(x.chiave), x.n.toLocaleString("it-IT"), E(x.profitti), E(x.perdite), E(x.valore)] : [esc(x.chiave), x.n.toLocaleString("it-IT"), E(x.valore)]; }); };
      var resto = function (l) { return l.length > 10 ? '<p class="small">Le prime 10 voci su ' + l.length + ", per valore.</p>" : ""; };
      var intest = function (t) { return altri ? [t, "n:Righe", "n:Profitti", "n:Perdite", "n:Netto"] : [t, "n:Righe", "n:Valore"]; };
      h += '<div class="' + (altri ? "" : "grid2") + '">' + (altri ? "" : "<div>" + tab(intest("Tipo"), righe(r.perTipo)) + resto(r.perTipo) + "</div>") + "<div>" + tab(intest("Cripto"), righe(r.perAttivo)) + resto(r.perAttivo) + "</div>" + "<div>" + tab(intest("Wallet o exchange"), righe(r.perWallet)) + resto(r.perWallet) + "</div>" + (altri ? "<div>" + tab(intest("Mese"), r.perMese.map(function (x) { return [x.chiave.slice(5) + "/" + x.chiave.slice(0, 4), x.n.toLocaleString("it-IT"), E(x.profitti), E(x.perdite), E(x.valore)]; })) + "</div>" : "") + "</div>";
    });
    return h + "</div>";
  }
  /* quadri RT (sezione al 26%) e RM degli altri redditi, raggruppati per anno */
  function quadriAltri() {
    var anni = S.altri.map(function (x) { return x.anno; }).filter(function (x, i, l) { return x && l.indexOf(x) === i; }).sort();
    return anni.map(function (a) {
      var el = S.altri.filter(function (x) { return x.anno === a; }), som = function (k) { return el.reduce(function (s, x) { return s + (+x[k] || 0); }, 0); };
      var rt = som("corr") || som("costi") ? MOD.quadroRT26(a, som("corr"), som("costi"), { minusPrecedenti: som("minus") }) : null;
      var rm = MOD.quadroRM(a, el.map(function (x) { return { lettera: x.lettera, stato: x.stato, lordo: +x.lordo || 0 }; }));
      return { anno: a, fonti: el.map(function (x) { return x.fonte; }).filter(Boolean).join(", "), rt: rt, rm: rm.righi.length ? rm : null };
    });
  }
  function tabellaAltri(q) {
    var h = "";
    if (q.rt) h += "<h4>Anno " + q.anno + " · " + esc(q.rt.modello) + (q.fonti ? ' · <span class="u">' + esc(q.fonti) + "</span>" : "") + "</h4>" + '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Rigo</th><th>Col.</th><th>Descrizione</th><th class="n">Importo</th></tr></thead><tbody>' +
      q.rt.righi.map(function (x) { return "<tr><td>" + x.rigo + "</td><td>" + (x.col || "") + "</td><td>" + esc(x.descrizione) + '</td><td class="n">' + E(x.valore, 0) + "</td></tr>"; }).join("") + "</tbody></table>" +
      (q.rt.minusvalenzaDaRiportare ? '<p class="small">Minusvalenza da riportare negli anni successivi (fino al quarto): ' + E(q.rt.minusvalenzaDaRiportare, 0) + ", rigo " + q.rt.rigoMinus + ".</p>" : "") + (q.rt.imposta ? '<p class="small">Codice tributo F24 ' + q.rt.codiceTributo + ".</p>" : "");
    if (q.rm) h += "<h4>Anno " + q.anno + " · " + esc(q.rm.modello) + "</h4>" + '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Rigo</th><th>Col. 1 · tipo</th><th>Col. 2 · Stato</th><th class="n">Col. 3 · reddito lordo</th><th class="n">Col. 4 · aliquota</th><th class="n">Col. ' + q.rm.righi[0].colImposta + " · imposta</th></tr></thead><tbody>" +
      q.rm.righi.map(function (x) { return "<tr><td>" + q.rm.rigo + "</td><td>" + esc(x.lettera) + "</td><td>" + esc(x.stato || "—") + '</td><td class="n">' + E(x.lordo, 0) + '</td><td class="n">26</td><td class="n">' + E(x.imposta, 0) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<p class="small">Reddito al lordo delle ritenute subite all\'estero, senza credito d\'imposta. Codice tributo F24 ' + q.rm.codiceTributo + ".</p>";
    return h;
  }
  function pannelloAltri() {
    var LET = { H: "H · dividendi esteri", G: "G · interessi su conti bancari esteri", B: "B · proventi di OICR armonizzati (ETF UCITS)", I: "I · altri redditi di capitale esteri" };
    var h = '<div class="panel" id="pannelloAltri" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Quadri RT e RM · altri redditi (broker esteri)</h3><div class="toolbar">' + (S.altri.length ? '<button type="button" class="btn gold" id="stampaAltri">Stampa / PDF</button>' : "") + '<button type="button" class="btn ghost" id="aggiungiAltro">Aggiungi un anno o una fonte</button></div></div>' +
      '<p class="small">Per i redditi di intermediari esteri, riportati dalla scheda eToro (pulsante «Riporta nella scheda dei quadri») o inseriti a mano: plusvalenze e differenziali di azioni e CFD (quadro RT, sezione al 26%) e dividendi o interessi esteri senza ritenuta italiana (quadro RM). Le cripto-attività restano nel quadro RT delle cripto. I quadri calcolati dal rendiconto eToro, compreso il quadro RW, sono più sotto in questa scheda.</p>';
    if (!S.altri.length) return h + "</div>";
    var inp = function (x, k, ph) { return '<input class="num" type="number" step="0.01" data-alt="' + x.id + '" data-k="' + k + '" value="' + esc(x[k]) + '" placeholder="' + (ph || "0") + '">'; };
    h += '<div class="scroll"><table class="det"><thead><tr><th>Anno</th><th>Fonte</th><th class="n">RT · corrispettivi</th><th class="n">RT · costi</th><th class="n">Minusvalenze anni precedenti</th><th>RM · tipo</th><th>RM · codice Stato</th><th class="n">RM · reddito lordo</th><th></th></tr></thead><tbody>' +
      S.altri.map(function (x) { return '<tr><td><input class="num" type="number" min="2015" max="2100" step="1" data-alt="' + x.id + '" data-k="anno" value="' + x.anno + '" style="width:80px"></td><td><input type="text" data-alt="' + x.id + '" data-k="fonte" value="' + esc(x.fonte) + '" style="width:110px"></td><td>' + inp(x, "corr") + "</td><td>" + inp(x, "costi") + "</td><td>" + inp(x, "minus") + '</td><td><select data-alt="' + x.id + '" data-k="lettera">' + Object.keys(LET).map(function (k) { return '<option value="' + k + '"' + (x.lettera === k ? " selected" : "") + ">" + LET[k] + "</option>"; }).join("") + '</select></td><td><input type="text" data-alt="' + x.id + '" data-k="stato" value="' + esc(x.stato) + '" placeholder="es. 069" style="width:80px"></td><td>' + inp(x, "lordo") + '</td><td><button type="button" class="btnlink small" data-toglialtro="' + x.id + '">Togli</button></td></tr>'; }).join("") +
      "</tbody></table></div>" + '<p class="small">Corrispettivi e costi in euro, ciascuno al cambio del giorno dell\'operazione (art. 9 c. 2 TUIR); per i CFD gli oneri (commissioni overnight) vanno nei costi. Più righe dello stesso anno si sommano nel quadro RT; nel quadro RM si fa un rigo per tipo e Stato. Codici Stato: elenco del fascicolo 1 (es. 069 Stati Uniti, 013 Canada, 040 Irlanda, 031 Regno Unito).</p>' +
      quadriAltri().map(tabellaAltri).join("") + "</div>";
    return h;
  }
  function stampaAltri() {
    apriStampa(intestazione("Modello Redditi PF · Quadri RT e RM · altri redditi") + datiContribuente() + quadriAltri().map(tabellaAltri).join("") + firma());
  }
  function tabellaRT(a) {
    var x = rtAnno(a), q = MOD.quadroRT(a.anno, x.corrispettivi, x.costi, {});
    if (q.nonGestito) return '<h4>Anno ' + a.anno + '</h4><p class="small">' + esc(q.nonGestito) + "</p>";
    return "<h4>Anno " + a.anno + " · " + esc(q.modello) + ' · <span class="u">fonte: ' + esc(x.fonte) + "</span></h4>" + '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Rigo</th><th>Col.</th><th>Descrizione</th><th class="n">Importo</th></tr></thead><tbody>' +
      q.righi.map(function (x) { return "<tr><td>" + x.rigo + "</td><td>" + (x.col || "") + "</td><td>" + esc(x.descrizione) + '</td><td class="n">' + E(x.valore, 0) + "</td></tr>"; }).join("") +
      "</tbody></table>" + (q.minusvalenzaDaRiportare ? '<p class="small">Minusvalenza da riportare negli anni successivi (fino al quarto): ' + E(q.minusvalenzaDaRiportare, 0) + ", rigo " + q.rigoMinus + ".</p>" : "") +
      '<p class="small">Importi in unità di euro. Minusvalenze di anni precedenti ed eccedenze d\'imposta non indicate: aggiungerle se esistono. Dati Koinly non rettificati.</p>';
  }
  function tabellaF24(f) {
    return '<table class="det f24"><thead><tr><th>Sezione</th><th>Codice tributo</th><th>Rateazione / mese rif.</th><th>Anno di riferimento</th><th class="n">Importi a debito versati</th><th>Voce</th></tr></thead><tbody>' +
      f.righe.map(function (x) { return "<tr><td>Erario</td><td><b>" + x.codice + "</b></td><td>" + (x.rateazione || "") + "</td><td>" + x.anno + '</td><td class="n">' + E(x.importo) + "</td><td class=\"small\">" + esc(x.descrizione) + "</td></tr>"; }).join("") +
      '<tr class="tot"><td colspan="4">Totale (saldo) · data di versamento ' + D.it(S.sanz.pagamento) + '</td><td class="n">' + E(f.totale) + "</td><td></td></tr></tbody></table>" +
      (f.esclusi.length ? '<p class="small" style="color:var(--hi)">Anni con dichiarazione omessa non inseriti (' + f.esclusi.join(", ") + "): il ravvedimento non è possibile; è opportuno attendere la contestazione dell'Agenzia.</p>" : "") +
      '<p class="small">Codici: 1727 imposta sulle cripto-attività, saldo (Ris. 36/E/2023 e 10/E/2024); 1715 imposta sostitutiva su plusvalenze da cripto-attività, quadro RT (Ris. 36/E/2023); 8945 sanzione e 1945 interessi da ravvedimento su imposte sui redditi e sostitutive (Ris. 12/E/2023: per l\'imposta sulle cripto-attività in assenza di codici specifici); 8911 sanzioni per altre violazioni (quadro RW, dichiarazione tardiva). Anno di riferimento: anno d\'imposta. Codici da ricontrollare prima del versamento.</p>';
  }
  function datiContribuente() { return '<table class="dati"><tr><td>Contribuente</td><td>' + esc(S.modelli.nome || "________________") + "</td></tr><tr><td>Codice fiscale</td><td>" + esc(S.modelli.cf || "________________") + "</td></tr></table>"; }
  function stampaRT() {
    apriStampa(intestazione("Modello Redditi PF · Quadro RT cripto-attività") + datiContribuente() + S.sanz.anni.map(function (a) { return tabellaRT(a); }).join("") + firma());
  }
  function stampaF24() {
    var f = MOD.f24(calcoliSanzioni());
    apriStampa(intestazione("Modello F24 · ravvedimento cripto-attività") + datiContribuente() + "<h2>Sezione Erario</h2>" + tabellaF24(f) + firma());
  }
  function stampaRW() {
    var q = MOD.quadroRW(ivaca, { titolo: S.modelli.titolo, sogliaPeriodi: S.modelli.sogliaPeriodi });
    apriStampa(intestazione("Modello Redditi PF · Quadro RW cripto-attività · anno " + q.anno) +
      '<table class="dati"><tr><td>Titolo di possesso (col. 1)</td><td>' + S.modelli.titolo + " · " + TITOLI[S.modelli.titolo] + "</td></tr><tr><td>Righi</td><td>" + q.righi.length + " (" + q.moduli + " moduli)</td></tr><tr><td>Transazioni</td><td>" + esc(S.tx.nome) + "</td></tr></table>" +
      tabellaRW(q) + '<p class="nota">' + (S.modelli.sogliaPeriodi > 0 ? "Le cripto con più di " + S.modelli.sogliaPeriodi + " periodi sono in un rigo unico: col. 7 valore iniziale del primo periodo, col. 8 valore medio ponderato per i giorni, col. 10 giorni complessivi; l'imposta è uguale alla somma dei periodi. " : "") + 'Per le altre, un rigo per ogni periodo di detenzione a quantità costante: valore iniziale e finale di inizio e fine detenzione, giorni del periodo, imposta = valore finale × 0,20% × quota × giorni / 365. Codice bene 21; codice Stato non obbligatorio per le cripto-attività. La circolare 30/E chiede un rigo per portafoglio: i periodi sono calcolati sul totale dei wallet di ciascuna cripto.</p>' + firma());
  }
  /* ---------- guida per il cliente ---------- */
  function contattiStudio() {
    var st = window.KoinlyStudio || {};
    return '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Per domande</h3><p>' + esc(st.professionista) + " · " + esc(st.qualifica) + "<br>" + esc(st.indirizzo) + (st.email ? " · mail: " + esc(st.email) : "") + (st.telefono ? " · Tel. " + esc(st.telefono) : "") + "</p></div>";
  }
  /* codice aperto e donazioni: mostrati in fondo alla guida e a ogni pagina */
  function progetto() {
    var st = window.KoinlyStudio || {};
    return "Koinly Tools è un programma a codice aperto (open source)" + (st.codiceSorgente ? ': il codice è pubblicato su <a href="' + esc(st.codiceSorgente) + '" target="_blank" rel="noopener">' + esc(st.codiceSorgente.replace(/^https?:\/\//, "")) + "</a>" : "") +
      ", con licenza AGPL-3.0. Si mantiene con le donazioni in bitcoin su Lightning Network" + (st.donazioniLightning ? ": <b>" + esc(st.donazioniLightning) + "</b>" : "") + ". Grazie a chi contribuisce.";
  }
  /* frase sulle donazioni con il QR code Lightning (verificato: punta a moderncelery862@walletofsatoshi.com) */
  function donazioni() {
    var st = window.KoinlyStudio || {};
    return '<div class="donazioni-box"><p class="donazioni">' + progetto() + "</p>" + (st.donazioniLightning ? '<img src="img/qr-lightning.png" width="160" height="160" alt="QR code per donazioni in bitcoin su Lightning Network a ' + esc(st.donazioniLightning) + '">' : "") + "</div>";
  }
  function diritti() {
    var st = window.KoinlyStudio || {};
    return '<p class="small diritti">© ' + new Date().getFullYear() + " " + esc(st.professionista) + ". Il codice del programma è rilasciato con licenza AGPL-3.0; nome, dati, testi e contenuti dello studio: tutti i diritti riservati al " + esc(st.professionista) + ".</p>";
  }
  /* ---------- eToro e broker esteri ---------- */
  async function caricaEtoro(f) {
    try { var d = ET.leggi(await testoPdf(f)); S.etoro = { nome: f.name, d: d }; S.etoroErrore = null; var aa = ET.anni(d); if (!S.etoroAnno || aa.indexOf(S.etoroAnno) < 0) S.etoroAnno = aa.filter(function (a) { return a < new Date().getFullYear(); }).pop() || aa[aa.length - 1]; }
    catch (e) { S.etoroErrore = e.message || String(e); }
    render();
  }
  function sezioneEtoro() {
    var h = '<div class="panel" id="quadriEtoro" style="margin-top:14px"><h3 style="margin-top:0">Quadri dal rendiconto eToro</h3>';
    if (!S.etoro) return h + '<p class="muted">Caricate il rendiconto eToro in PDF nella scheda <button type="button" class="btnlink" data-tab="1">Caricamento file</button>: qui compaiono i quadri RT, RM e RW calcolati per ogni anno.</p></div>';
    if (!S.etoro) return h;
    var d = S.etoro.d, anni = ET.anni(d), a = S.etoroAnno, r = ET.riepilogo(d, a);
    h += '<p class="small">' + esc(S.etoro.nome) + " · " + esc(d.periodo) + '</p><div class="grid2"><label class="f"><span class="t">Anno</span><select data-et="anno">' + anni.map(function (x) { return "<option" + (x === a ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label></div></div>";
    // posizioni chiuse per categoria
    h += sezioneEtoroQuadri(d, a);
    var cat = Object.keys(r.rt);
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Posizioni chiuse nel ' + a + "</h3>" + (cat.length ? tab(["Categoria", "n:Posizioni", "n:Profitti", "n:Perdite", "n:Overnight", "n:Dividendi CFD", "n:Risultato"], cat.map(function (k) { var c = r.rt[k]; return [esc(k), c.n, E(c.profitti), E(c.perdite), E(c.overnight), E(c.dividendiCfd), E(c.risultato + c.overnight + c.dividendiCfd)]; }), 20) +
      '<p class="small">Profitti e perdite in euro come calcolati da eToro per ogni posizione. Sono CFD le posizioni con leva o allo scoperto (anche su cripto e azioni); le commissioni overnight e i dividendi dei CFD sono componenti del differenziale. Overnight convertiti dal dollaro al cambio medio implicito dei profitti dell\'anno' + (r.cambioMedio ? " (" + r.cambioMedio.toFixed(4) + " € per dollaro)" : "") + ".</p>" : '<p class="muted">Nessuna posizione chiusa nell\'anno.</p>') + "</div>";
    // trasferimenti al wallet cripto
    var tw = r.trasferimentiWallet;
    if (tw.n) h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Cripto trasferite al wallet eToro (' + tw.n + ")</h3><p class=\"small\">Non sono cessioni: le cripto passano al wallet eToro dello stesso titolare (eToro le toglie dalla piattaforma al valore del momento). Il costo d'acquisto è l'importo investito all'apertura della posizione: va riportato sul wallet di arrivo (in Koinly o nella scheda Costi di carico, con la correzione «costo documentato» del deposito corrispondente).</p>" +
      tab(["Cripto", "n:Trasferimenti", "n:Quantità", "n:Valore al trasferimento (USD)", "n:Costo d'acquisto (USD)"], Object.keys(tw.perCripto).map(function (k) { var z = tw.perCripto[k]; return [esc(k), z.n, Q(String(Math.round(z.unita * 1e6) / 1e6)), USD(z.valoreUsd), USD(z.costoUsd)]; }), 20) +
      '<details><summary class="small">Dettaglio dei trasferimenti</summary>' + tab(["Data", "Cripto", "n:Quantità", "n:Valore (USD)", "n:Costo (USD)", "Aperta il"], tw.righe.map(function (x) { return [it(x.data), esc(x.cripto), Q(String(x.unita)), USD(x.valoreUsd), USD(x.costoUsd), it(x.apertura)]; }), 400) + "</details></div>";
    // dividendi
    if (r.rm.n || r.rm.cfdNettoEur) h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Dividendi nel ' + a + "</h3>" + tab(["Data", "Strumento", "Tipologia", "n:Netto (€)", "n:Ritenuta estera (€)", "n:Aliquota"], r.rm.righe.map(function (x) { return [it(x.data), esc(x.nome), esc(x.tipo), E(x.nettoEur, 4), E(x.ritenutaEur, 4), x.aliquota + "%"]; }), 200) +
      '<p class="small">Dividendi di azioni ed ETF: netto ' + E(r.rm.nettoEur) + ", ritenuta estera " + E(r.rm.ritenutaEur) + ", lordo " + E(r.rm.lordoEur) + ". Dividendi su CFD (nel differenziale, quadro RT): " + E(r.rm.cfdNettoEur) + ".</p></div>";
    // portafoglio
    var foto = function (o) { return Object.keys(o).map(function (k) { return [esc(k), o[k].n, E(o[k].eur)]; }); };
    // dettaglio per strumento a inizio e fine anno (quantità e valore in euro di eToro), per il quadro RW
    var perAsset = function (data) { var h = data && d.holdings.filter(function (x) { return x.data === data; })[0], o = {}; (h ? h.righe : []).forEach(function (x) { var z = o[x.asset] || (o[x.asset] = { cat: x.categoria, isin: x.isin, unita: 0, eur: 0, n: 0 }); z.n++; z.unita += x.unita || 0; z.eur += x.eur || 0; }); return o; };
    var ai = perAsset(r.rw.dataInizio), af = perAsset(r.rw.dataFine), nomi = Object.keys(ai).concat(Object.keys(af)).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort();
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Portafoglio eToro a inizio e fine anno</h3>' +
      '<div class="grid2"><div><h4>' + (r.rw.dataInizio ? "Al " + it(r.rw.dataInizio) : "Inizio anno: fotografia assente") + "</h4>" + tab(["Categoria", "n:Posizioni", "n:Valore"], foto(r.rw.inizio), 20) + '</div><div><h4>' + (r.rw.dataFine ? "Al " + it(r.rw.dataFine) : "Fine anno: fotografia assente") + "</h4>" + tab(["Categoria", "n:Posizioni", "n:Valore"], foto(r.rw.fine), 20) + "</div></div>" +
      (nomi.length ? "<h4>Per strumento (valori per il quadro RW)</h4>" + tab(["Strumento", "Categoria", "ISIN", "n:Quantità iniziale", "n:Valore iniziale", "n:Quantità finale", "n:Valore finale"], nomi.map(function (k) { var x = ai[k], y = af[k], z = x || y; return [esc(k), esc(z.cat), esc(z.isin || ""), x ? Q(String(Math.round(x.unita * 1e8) / 1e8)) : "–", x ? E(x.eur) : "–", y ? Q(String(Math.round(y.unita * 1e8) / 1e8)) : "–", y ? E(y.eur) : "–"]; }).concat([["<b>Totale</b>", "", "", "", "<b>" + E(nomi.reduce(function (s, k) { return s + (ai[k] ? ai[k].eur : 0); }, 0)) + "</b>", "", "<b>" + E(nomi.reduce(function (s, k) { return s + (af[k] ? af[k].eur : 0); }, 0)) + "</b>"]]), 200) +
        '<p class="small">Valori di mercato in euro calcolati da eToro alla data della fotografia. Le posizioni aperte o chiuse durante l\'anno vanno nel quadro RW con il valore all\'apertura o alla chiusura.</p>' : "") +
      '<p class="small">Saldo liquido del conto: ' + USD(r.rw.saldoInizioUsd) + " a inizio anno, " + USD(r.rw.saldoFineUsd) + " a fine anno." + (!r.rw.dataFine || !r.rw.dataInizio ? " <b>Il rendiconto non contiene la fotografia del portafoglio a una delle due date: chiedere a eToro il rendiconto a quella data o ricostruire il valore delle posizioni aperte.</b>" : "") + "</p></div>";
    return h;
  }
  function quadriEtoro() { return ET.quadriTutti(S.etoro.d, { sogliaValute: S.etoroSoglia || {} }); }
  function sezioneEtoroQuadri(d, a) {
    var q = quadriEtoro()[a];
    var h = '<div class="panel" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Quadri ' + esc(q.modello) + " · anno " + a + '</h3><div class="toolbar"><button type="button" class="btn ghost" id="etoroNeiQuadri">Riporta nella scheda dei quadri</button><button type="button" class="btn gold" id="stampaEtoro">Stampa / PDF</button></div></div>' + tabelleEtoro(q);
    if (a <= 2022 && q.cripto.n) h += '<label class="toggle" style="margin-top:8px"><input type="checkbox" data-etsoglia="' + a + '"' + ((S.etoroSoglia || {})[a] ? " checked" : "") + "><span>Nel " + a + " la giacenza complessiva in valuta ha superato 51.645,69 € per almeno 7 giorni lavorativi: le cripto vendute sono imponibili</span></label>";
    return h + "</div>";
  }
  function tabelleEtoro(q) {
    var h = "", riga = function (x) { return "<tr><td>" + x.rigo + "</td><td>" + (x.col || "") + "</td><td>" + esc(x.descrizione) + '</td><td class="n">' + E(x.valore, 0) + "</td></tr>"; };
    h += "<h4>" + esc(q.sezione26 || "Quadro RT, sezione al 26%") + "</h4>" + (q.rt.length ? '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Rigo</th><th>Col.</th><th>Descrizione</th><th class="n">Importo</th></tr></thead><tbody>' + q.rt.map(riga).join("") + "</tbody></table>" : '<p class="muted">Nessuna posizione chiusa su azioni o CFD nell\'anno: nessun dato da indicare.</p>');
    h += "<h4>Quadro RM · rigo " + q.rmRigo + "</h4>" + (q.rm.length ? '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Rigo</th><th>Col. 1 · tipo</th><th>Col. 2 · Stato</th><th class="n">Col. 3 · reddito lordo</th><th class="n">Col. 4 · aliquota</th><th class="n">Col. ' + q.rmColImposta + ' · imposta</th><th class="n">Lordo esatto</th><th class="n">Ritenuta estera</th></tr></thead><tbody>' +
      q.rm.map(function (x) { return "<tr><td>" + x.rigo + "</td><td>" + x.lettera + "</td><td>" + esc(x.stato || "") + ' <span class="small muted">' + esc(x.statoNome) + '</span></td><td class="n">' + E(x.lordo, 0) + '</td><td class="n">26</td><td class="n">' + E(x.imposta, 0) + '</td><td class="n">' + E(x.lordoEsatto) + '</td><td class="n">' + E(x.ritenutaEstera) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Nessun dividendo su azioni o ETF nell\'anno: nessun dato da indicare.</p>');
    h += "<h4>Quadro RW · valori sul conto eToro</h4>" + (q.rw.length ? '<table class="det" style="width:auto;min-width:60%"><thead><tr><th>Col. 3 · codice</th><th>Bene</th><th>Col. 4 · Stato</th><th class="n">Posizioni</th><th class="n">Valore iniziale</th><th class="n">Valore finale</th><th class="n">Giorni</th><th class="n">IVAFE</th><th class="n">IVACA</th></tr></thead><tbody>' +
      q.rw.map(function (x) { return "<tr><td>" + x.codice + "</td><td>" + esc(x.descrizione) + (x.stimati ? ' <span class="small" style="color:var(--hi)">(' + x.stimati + " valori stimati)</span>" : "") + "</td><td>" + esc(x.stato || "—") + '</td><td class="n">' + x.n + '</td><td class="n">' + E(x.valoreIniziale, 0) + '</td><td class="n">' + E(x.valoreFinale, 0) + '</td><td class="n">' + x.giorni + '</td><td class="n">' + E(x.ivafe) + '</td><td class="n">' + E(x.ivaca) + "</td></tr>"; }).join("") + "</tbody></table>" + '<p class="small">' + esc(q.colonne) + ". Quota 100%, criterio di valore 1 (mercato). Un rigo per tipo di bene con i valori sommati delle posizioni e i giorni medi ponderati.</p>" : '<p class="muted">Nessuna attività detenuta su eToro nell\'anno: nessun dato da indicare.</p>');
    h += "<h4>Modello F24</h4>" + (q.f24.length ? tab(["Codice tributo", "Voce", "n:Importo"], q.f24.map(function (x) { return ["<b>" + x.codice + "</b>", esc(x.descrizione), E(x.importo, 0)]; }), 20) : '<p class="muted">Nessuna imposta da versare dai dati eToro dell\'anno.</p>');
    if (q.note.length) h += '<ul class="avvisi">' + q.note.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
    return h;
  }
  function stampaEtoro() {
    var tutti = quadriEtoro(), anni = Object.keys(tutti).map(Number).filter(function (a) { var q = tutti[a]; return q.rt.length || q.rm.length || q.rw.length; });
    apriStampa(intestazione("Quadri da rendiconto eToro") + datiContribuente() + '<p class="small">Rendiconto: ' + esc(S.etoro.d.periodo) + ".</p>" + anni.map(function (a) { return "<h2>Anno " + a + " · " + esc(tutti[a].modello) + "</h2>" + tabelleEtoro(tutti[a]); }).join("") + firma());
  }
  // riporta RT al 26% e RM di ogni anno nella scheda dei quadri (righe con fonte «eToro», sostituite a ogni riporto)
  function etoroNeiQuadri() {
    var tutti = quadriEtoro();
    S.altri = S.altri.filter(function (x) { return x.fonte !== "eToro"; });
    Object.keys(tutti).map(Number).forEach(function (a) {
      var q = tutti[a];
      if (q.rt.length) S.altri.push({ id: altroId++, anno: a, fonte: "eToro", corr: q.corrispettivi, costi: q.costi, minus: q.minusUsate || "", lettera: "H", stato: "", lordo: "" });
      q.rm.forEach(function (x) { if (x.lordo) S.altri.push({ id: altroId++, anno: a, fonte: "eToro", corr: "", costi: "", minus: "", lettera: "H", stato: x.stato, lordo: x.lordoEsatto }); });
    });
    render(); var el = document.getElementById("pannelloAltri"); if (el) el.scrollIntoView();
  }
  function USD(x) { return x == null || !isFinite(x) ? "–" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD" }).format(x); }
  function viewGuida() {
    return '<div class="toolbar noprint" style="justify-content:flex-end;margin-bottom:10px"><button type="button" class="btn gold" id="stampaGuida">Stampa / PDF della guida</button></div>' + (window.KoinlyGuida || "") + contattiStudio() +
      '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Codice aperto e donazioni</h3>' + donazioni() + "</div>";
  }
  function render() {
    nav();
    var aperto = document.getElementById("spam"); if (aperto) S.spamAperti = aperto.open;
    var v = VISTE[S.tab];
    app.innerHTML = (v === "caricamento" ? viewCaricamento() : v === "ivaca" ? viewIvaca() : v === "costi" ? viewCosti() : v === "questionario" ? viewQuestionario() : v === "sanzioni" ? viewSanzioni() : v === "modelli" ? viewModelli() : viewGuida()) +
      '<footer class="piede noprint">' + donazioni() + '<p class="small muted marchio">Koinly Tools non è affiliato né approvato da Koinly. «Koinly» è un marchio dei rispettivi titolari, citato solo per indicare i report compatibili.</p>' + diritti() + "</footer>";
  }

  /* ---------- Excel ---------- */
  function excel() {
    var X = window.LumesXlsx, a = S.anno, iv = ivaca, righe = iv.righe.filter(function (r) { return r.incluso; });
    var fonteTxt = function (f) { return f === "report" ? "report Koinly" : f === "manuale" ? "a mano" : f === "stima" ? "stimato" : "transazione"; };
    // foglio 1: un rigo per periodo di detenzione (righi RW), con l'imposta a formula
    var rw = [[{ v: "Quadro RW " + a + " · periodi di detenzione e IVACA", s: "titolo" }],
      ["Transazioni: " + S.tx.nome + (S.inizio ? " · Saldi iniziali: " + S.inizio.nome : "") + (S.fine ? " · Saldi finali: " + S.fine.nome : "") + " · date in " + calcolo.fuso],
      ["Aliquota", { v: iv.parametri.aliquota }, "Quota", { v: iv.quota, s: "inputPct" }, "Divisore", { v: I.PARAMETRI.divisore }], [],
      ["Cripto", "Inizio detenzione", "Fine detenzione", "Giorni", "Quantità", "Valore iniziale €", "Valore finale €", "IVACA", "Fonte valore iniziale", "Fonte valore finale"].map(function (v) { return { v: v, s: "intestazione" }; })];
    var r0 = rw.length + 1;
    righe.forEach(function (r) { r.periodi.forEach(function (p) {
      var n = rw.length + 1;
      rw.push([r.nome, it(p.dal), it(p.al), p.giorni, p.quantitaN, { v: p.valoreIniziale == null ? 0 : Math.round(p.valoreIniziale * 100) / 100, s: "euro" }, { v: p.valore == null ? 0 : Math.round(p.valore * 100) / 100, s: "inputEuro" },
        { f: "G" + n + "*$B$3*$D$3*D" + n + "/$F$3", s: "euro" }, fonteTxt(p.fonteIniziale), fonteTxt(p.fonteFinale)]);
    }); });
    var rn = rw.length;
    rw.push(["Totale", null, null, null, null, null, null, { f: "SUM(H" + r0 + ":H" + rn + ")", s: "totale" }]);
    rw.push([], [{ v: "Valore iniziale e finale di inizio e fine detenzione. Un acquisto apre un periodo dal giorno stesso; una vendita chiude il periodo nel giorno della vendita e il residuo riparte dal giorno dopo. IVACA = valore finale × aliquota × quota × giorni / 365. Somma di tutti i wallet per cripto: la circ. 30/E chiede un rigo per portafoglio.", s: "nota" }]);
    // foglio 2: riepilogo per cripto, con il totale collegato al foglio dei periodi
    var rie = [[{ v: "Riepilogo per cripto " + a, s: "titolo" }], [],
      ["Cripto", "Quantità 1/1", "Quantità 31/12", "Inizio detenzione", "Fine detenzione", "Giorni", "Periodi", "Quantità media", "IVACA", "Valore medio detenuto €", "Note"].map(function (v) { return { v: v, s: "intestazione" }; })];
    righe.forEach(function (r) {
      var n = rie.length + 1;
      rie.push([r.nome, +r.iniziale, +r.finale, it(r.primo), it(r.ultimo), r.giorni, r.periodi.length, r.quantitaMedia, { f: "SUMIF('Righi RW'!A:A,A" + n + ",'Righi RW'!H:H)", s: "euro" },
        { v: r.valoreMedio == null ? 0 : Math.round(r.valoreMedio * 100) / 100, s: "euro" }, r.note.join(" · ")]);
    });
    rie.push(["Totale", null, null, null, null, null, null, null, { f: "SUM(I4:I" + rie.length + ")", s: "totale" }]);
    var fogli = [{ nome: "Righi RW", colonne: [22, 14, 14, 8, 20, 16, 16, 12, 16, 16], righe: rw, orizzontale: true },
      { nome: "Riepilogo per cripto", colonne: [22, 18, 18, 14, 14, 8, 8, 18, 12, 14, 70], righe: rie, orizzontale: true }];
    var blob = new Blob([X.crea(fogli)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "rw-ivaca-" + a + ".xlsx";
    document.body.appendChild(link); link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  /* intestazione dello studio e titolo, per tutti i resoconti stampati */
  function intestazione(titolo) {
    var st = window.KoinlyStudio || {}, oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    var unisci = function (v) { return v.filter(Boolean).map(esc).join(" · "); };
    return '<div class="studio"><div><b>' + esc(st.professionista) + "</b><br><span>" + esc(st.qualifica) + "</span></div>" +
      '<div class="contatti">' + [esc(st.indirizzo || ""), unisci([st.telefono && "Tel. " + st.telefono, st.email && "mail: " + st.email]), unisci([st.sito, st.partitaIva && "P.IVA " + st.partitaIva])].filter(Boolean).join("<br>") + "</div></div>" +
      '<div class="testata"><h1>' + esc(titolo) + "</h1><p>Firenze, " + esc(oggi) + "</p></div>";
  }
  function firma() { var st = window.KoinlyStudio || {}; return '<p class="firma">Elaborazione a cura del ' + esc(st.professionista) + "</p>" + diritti(); }
  function apriStampa(h) {
    var box = document.getElementById("resoconto") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "resoconto" }));
    box.innerHTML = h;
    document.body.classList.add("in-stampa");
    var fine = function () { document.body.classList.remove("in-stampa"); window.removeEventListener("afterprint", fine); };
    window.addEventListener("afterprint", fine);
    window.print();
  }

  /* ---------- resoconto da stampare o salvare in PDF: riepilogo e tutti i periodi di ogni cripto ---------- */
  function stampa() {
    var iv = ivaca, righe = iv.righe.filter(function (r) { return r.incluso; });
    var st = window.KoinlyStudio || {};
    var h = intestazione("Giorni di detenzione e IVACA " + S.anno) +
      '<table class="dati"><tr><td>Transazioni</td><td>' + esc(S.tx.nome) + " (" + S.tx.dati.movimenti.length.toLocaleString("it-IT") + " righe; " + calcolo.transazioniAnno.toLocaleString("it-IT") + " nell'anno)</td></tr>" +
      "<tr><td>Saldi a inizio anno</td><td>" + esc(S.inizio.nome) + "</td></tr><tr><td>Saldi a fine anno</td><td>" + esc(S.fine.nome) + "</td></tr>" +
      "<tr><td>Fuso orario delle date</td><td>" + (calcolo.fuso === "UTC" ? "UTC" : "ora italiana") + "</td></tr><tr><td>Quota di possesso</td><td>" + Math.round(iv.quota * 10000) / 100 + "%</td></tr></table>" +
      "<h2>Criterio</h2><p>Per ogni cripto, sul totale di tutti i wallet, ogni cambio di quantità apre un nuovo periodo di detenzione: un acquisto dal giorno stesso; una vendita chiude il periodo nel giorno della vendita, con la quantità detenuta prima e il valore a quella data, e il residuo riparte dal giorno successivo. Valore iniziale e finale sono quelli di inizio e fine detenzione di ciascun periodo: il valore iniziale di un periodo è il valore finale del precedente. IVACA = valore finale × 0,20% × quota × giorni / 365 (istruzioni Redditi PF, quadro RW col. 33).</p>" +
      LEGENDA + "<h2>Riscontri</h2>" + avvisi() +
      '<h2>Riepilogo</h2><table class="det"><thead><tr><th>Cripto</th><th>Inizio detenzione</th><th>Fine detenzione</th><th class="n">Giorni</th><th class="n">Periodi</th><th class="n">Quantità 1/1</th><th class="n">Quantità 31/12</th><th class="n">Valore medio</th><th class="n">IVACA</th></tr></thead><tbody>' +
      righe.map(function (r) { return "<tr><td>" + esc(r.nome) + "</td><td>" + it(r.primo) + "</td><td>" + it(r.ultimo) + '</td><td class="n">' + r.giorni + '</td><td class="n">' + r.periodi.length + '</td><td class="n">' + QU(r.iniziale, r) + '</td><td class="n">' + QU(r.finale, r) + '</td><td class="n">' + E(r.valoreMedio) + '</td><td class="n">' + E(r.ivaca) + "</td></tr>"; }).join("") +
      '<tr class="tot"><td>Totale</td><td colspan="7"></td><td class="n">' + E(iv.totali.ivaca) + "</td></tr></tbody></table>" +
      (iv.totali.ivaca <= I.PARAMETRI.sogliaVersamento ? "<p>L'imposta non supera 12 €: non si versa.</p>" : "") +
      righe.map(function (r) {
        return '<h2 class="cripto">' + esc(r.nome) + " — " + r.periodi.length + (r.periodi.length === 1 ? " periodo" : " periodi") + ", IVACA " + E(r.ivaca) + '</h2><table class="det"><thead><tr><th>Inizio detenzione</th><th>Fine detenzione</th><th class="n">Giorni</th><th class="n">Quantità</th><th class="n">Valore iniziale</th><th class="n">Valore finale</th><th class="n">IVACA</th></tr></thead><tbody>' +
          r.periodi.map(function (p) { return "<tr><td>" + it(p.dal) + "</td><td>" + it(p.al) + '</td><td class="n">' + p.giorni + '</td><td class="n">' + QU(p.quantita, r) + '</td><td class="n">' + E(p.valoreIniziale) + fonte(p.fonteIniziale) + '</td><td class="n">' + E(p.valore) + fonte(p.fonteFinale) + '</td><td class="n">' + E(p.ivaca, 4) + "</td></tr>"; }).join("") + '<tr class="tot"><td>Totale</td><td></td><td class="n">' + r.periodi.reduce(function (a, p) { return a + p.giorni; }, 0) + '</td><td colspan="3"></td><td class="n">' + E(r.ivaca) + "</td></tr>" +
          "</tbody></table>" + (r.note.length ? '<p class="nota">' + r.note.map(esc).join(" · ") + "</p>" : "");
      }).join("") +
      '<p class="nota">Valori ai prezzi Koinly: dal controvalore in euro delle transazioni e, per i periodi che iniziano il 1/1 o finiscono il 31/12, dai report dei saldi. * prezzo stimato con l\'ultimo noto · ✎ valore inserito a mano. Il calcolo somma tutti i wallet; la circolare 30/E chiede un rigo RW per portafoglio. Stima da verificare: non sostituisce il parere del professionista.</p>' +
      firma();
    apriStampa(h);
  }

  /* ---------- eventi ---------- */
  document.getElementById("steps").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) { S.tab = +b.getAttribute("data-tab"); render(); } });
  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("input[type=file][data-slot]") && t.files.length) { carica(t.getAttribute("data-slot"), Array.prototype.slice.call(t.files)); return; }
    if (t.matches("[data-incl]")) { S.inclusi[t.getAttribute("data-incl")] = t.checked; ricalcola(); render(); return; }
    if (t.matches("[data-val]")) { var k = t.getAttribute("data-val"); S.valori[k] = t.value === "" ? null : +t.value; ricalcola(); render(); return; }
    if (t.matches("[data-corr]")) { var rc = t.getAttribute("data-corr"); if (t.value) S.correzioni[rc] = { azione: t.value, importo: (S.correzioni[rc] || {}).importo }; else delete S.correzioni[rc]; render(); return; }
    if (t.matches("[data-corrnota]")) { var rn = t.getAttribute("data-corrnota"); if (S.correzioni[rn]) S.correzioni[rn].motivo = t.value.trim(); return; }
    if (t.matches("[data-corrimp]")) { var ri = t.getAttribute("data-corrimp"); if (S.correzioni[ri]) S.correzioni[ri].importo = t.value === "" ? null : +t.value; render(); return; }
    if (t.matches("[data-cf]")) { var cf = t.getAttribute("data-cf"); S.costi.filtro[cf] = t.type === "checkbox" ? t.checked : t.value; render(); return; }
    if (t.matches("[data-cs]")) { var cs = t.getAttribute("data-cs"); S.costi[cs] = cs === "anno" ? +t.value : cs === "swapNeutri" ? t.value === "si" : t.value; render(); return; }
    if (t.matches("[data-lavoro]") && t.files[0]) { caricaLavoro(t.files[0]); return; }
    if (t.matches("[data-banca]") && t.files.length) { caricaBanca(t.files); return; }
    if (t.matches("[data-koinlyces]") && t.files[0]) { caricaKoinlyCes(t.files[0]); return; }
    if (t.matches("[data-etoro]") && t.files[0]) { caricaEtoro(t.files[0]); return; }
    if (t.matches("[data-etsoglia]")) { S.etoroSoglia = S.etoroSoglia || {}; S.etoroSoglia[+t.getAttribute("data-etsoglia")] = t.checked; render(); return; }
    if (t.matches("[data-et]")) { S.etoroAnno = +t.value; render(); return; }
    if (t.matches("[data-qanno]")) { var qa = +t.getAttribute("data-qanno"); S.quest.anni = S.quest.anni.filter(function (x) { return x !== qa; }); if (t.checked) S.quest.anni.push(qa); S.quest.anni.sort(); render(); return; }
    if (t.matches("[data-kreport]") && t.files.length) { caricaReportKoinly(t.files); return; }
    if (t.matches("[data-chiave]")) { S.quest.chiavi[t.getAttribute("data-chiave")] = t.value.trim(); render(); return; }
    if (t.matches("[data-flag]")) { S.quest.flag[t.getAttribute("data-flag")] = t.value; render(); return; }
    if (t.matches("[data-cliente]")) { S.quest.cliente[t.getAttribute("data-cliente")] = t.value.trim(); return; }
    if (t.matches("[data-modt]")) { S.modelli[t.getAttribute("data-modt")] = t.value.trim(); return; }
    if (t.matches("[data-mem]")) { S.memoria[t.getAttribute("data-mem")] = t.value.trim(); return; }
    if (t.matches("[data-alt]")) { var al = S.altri.filter(function (x) { return x.id === +t.getAttribute("data-alt"); })[0], ak = t.getAttribute("data-k"); if (al) al[ak] = ak === "anno" ? +t.value : t.value; render(); return; }
    if (t.matches("[data-mod]")) { S.modelli[t.getAttribute("data-mod")] = +t.value; render(); return; }
    if (t.matches("[data-sz]")) { S.sanz[t.getAttribute("data-sz")] = t.value || oggiIso; render(); return; }
    if (t.matches("[data-zfile]") && t.files[0]) { caricaReportAnno(+t.getAttribute("data-zfile"), t.files[0]); return; }
    if (t.matches("[data-za]")) {
      var za = S.sanz.anni.filter(function (x) { return x.id === +t.getAttribute("data-za"); })[0], zk = t.getAttribute("data-k");
      za[zk] = zk === "anno" ? +t.value : zk === "stato" || zk === "fonteRT" ? t.value : t.value === "" ? "" : +t.value; if (zk !== "anno" && zk !== "stato" && zk !== "fonteRT") za.fonte[zk] = "mano";
      if (zk === "anno") S.sanz.anni.sort(function (a, b) { return a.anno - b.anno; });
      render(); return;
    }
    if (t.matches("[data-k]")) { var key = t.getAttribute("data-k"); S[key] = key === "anno" ? +t.value : key === "quota" ? +t.value : t.value; if (key === "anno") { S.inclusi = {}; S.valori = {}; } ricalcola(); render(); }
  });
  app.addEventListener("click", function (e) {
    var t = e.target;
    if (t.matches("[data-apri]")) { var k = t.getAttribute("data-apri"); S.aperti[k] = !S.aperti[k]; render(); }
    else if (t.matches("[data-toglisaldi]")) { var dz = t.getAttribute("data-toglisaldi"); S.saldiFile = S.saldiFile.filter(function (z) { return z.data !== dz; }); scegliAnno(); ricalcola(); render(); }
    else if (t.matches("[data-annoivaca]")) { S.anno = +t.getAttribute("data-annoivaca"); S.inclusi = {}; S.valori = {}; ricalcola(); render(); }
    else if (t.matches("[data-togli]")) { var s = t.getAttribute("data-togli"); S[s] = null; S.errore[s] = null; if (s === "tx") S.anno = null; scegliAnno(); ricalcola(); render(); }
    else if (t.id === "excel") excel();
    else if (t.id === "stampa") stampa();
    else if (t.id === "aggiungiAnno") { nuovoAnno(); render(); }
    else if (t.id === "stampaSanz") stampaSanzioni();
    else if (t.id === "stampaRW") stampaRW();
    else if (t.id === "salvaLavoro") salvaLavoro();
    else if (t.id === "etoroNeiQuadri") etoroNeiQuadri();
    else if (t.id === "stampaEtoro") stampaEtoro();
    else if (t.id === "togliEtoro") { S.etoro = null; S.etoroErrore = null; render(); }
    else if (t.id === "togliKoinlyCes") { S.koinlyCes = null; S.koinlyCesErrore = null; render(); }
    else if (t.id === "richiestaCliente") stampaRichiesta();
    else if (t.matches("[data-toglireport]")) { var kr = t.getAttribute("data-toglireport"); S.report = S.report.filter(function (z) { return z.chiave !== kr; }); render(); }
    else if (t.id === "svuotaBanca") { S.banca = { movimenti: [], lette: 0, scartate: 0, file: 0 }; render(); }
    else if (t.id === "excelCosti") excelCosti();
    else if (t.id === "stampaCosti") stampaCosti();
    else if (t.id === "excelQuest") excelQuest();
    else if (t.id === "stampaQuest") stampaQuest();
    else if (t.id === "stampaDsan") stampaDsan();
    else if (t.id === "stampaMemoria") stampaMemoria();
    else if (t.id === "memoriaWord") memoriaWord();
    else if (t.matches("[data-blocco]")) {
      var az = t.getAttribute("data-blocco"), rr = costiAnno(S.costi.anno), Fb = S.costi.filtro;
      rr.daVerificare.filter(function (v) { return (!Fb.tipo || v.tipo === Fb.tipo) && (!Fb.cripto || v.cripto === Fb.cripto) && (!Fb.wallet || v.wallet === Fb.wallet) && (!Fb.soloAperte || !S.correzioni[v.riga]); })
        .forEach(function (v) { if (az) S.correzioni[v.riga] = { azione: az, motivo: S.costi.motivoBlocco || "" }; else delete S.correzioni[v.riga]; });
      render();
    }
    else if (t.id === "stampaGuida") apriStampa(intestazione("Koinly Tools · guida per il cliente") + (window.KoinlyGuida || "").replace(/^<h2>[^<]*<\/h2>/, "") + contattiStudio() + donazioni() + diritti());
    else if (t.matches("[data-tab]")) { S.tab = +t.getAttribute("data-tab"); render(); window.scrollTo(0, 0); }
    else if (t.id === "stampaRT") stampaRT();
    else if (t.id === "aggiungiAltro") { nuovoAltro(); render(); }
    else if (t.id === "stampaAltri") stampaAltri();
    else if (t.matches("[data-toglialtro]")) { var ta = +t.getAttribute("data-toglialtro"); S.altri = S.altri.filter(function (x) { return x.id !== ta; }); render(); }
    else if (t.id === "stampaF24") stampaF24();
    else if (t.matches("[data-toglianno]")) { var id = +t.getAttribute("data-toglianno"); S.sanz.anni = S.sanz.anni.filter(function (x) { return x.id !== id; }); render(); }
    else if (t.matches("[data-usaivaca]")) { var ya = S.sanz.anni.filter(function (x) { return x.id === +t.getAttribute("data-usaivaca"); })[0]; ya.ivaca = Math.round(ivaca.totali.ivaca * 100) / 100; ya.fonte.ivaca = "calcolo"; render(); }
  });
  render();
})();
