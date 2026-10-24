/* Koinly Tools · interfaccia. I file caricati restano nel browser: non vengono salvati né inviati in rete. */
(function () {
  "use strict";
  var L = window.KoinlyLettura, D = window.KoinlyDetenzione, I = window.KoinlyIvaca;
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "comune/vendor/pdf.worker.min.js";
  var app = document.getElementById("app");

  var TABS = ["Giorni di detenzione e IVACA", "Sanzioni RW e RT"];
  var S = { tab: 0, tx: null, inizio: null, fine: null, anno: null, fuso: "UTC", quota: 100, inclusi: {}, valori: {}, aperti: {}, spamAperti: false, errore: {} };
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
  async function carica(slot, f) {
    S.errore[slot] = null;
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
        // un report di fine anno N-1 vale come saldo di inizio anno N
        if (slot === "inizio" && r.tipoSaldi !== "inizio") { r.annoInizio = r.anno + 1; r.nota = "Saldi al 31/12/" + r.anno + " usati come saldi al 1° gennaio " + (r.anno + 1) + "."; }
        else if (slot === "inizio") r.annoInizio = r.anno;
        if (slot === "fine" && r.tipoSaldi === "inizio") throw new Error("Questo è il report dei saldi di inizio anno: va nello spazio accanto.");
        S[slot] = { nome: f.name, r: r };
      }
      scegliAnno();
    } catch (e) { S.errore[slot] = e.message || String(e); }
    ricalcola(); render();
  }
  function scegliAnno() {
    if (S.fine) S.anno = S.fine.r.anno;
    else if (S.inizio) S.anno = S.inizio.r.annoInizio;
    else if (S.tx && !S.anno) { var a = anniTx(); S.anno = a.filter(function (x) { return x < new Date().getFullYear(); }).pop() || a.pop(); }
  }
  function anniTx() {
    if (!S.tx) return [];
    var m = S.tx.dati.movimenti, set = {};
    m.forEach(function (t) { set[new Date(t.ts).getUTCFullYear()] = true; });
    return Object.keys(set).map(Number).filter(function (a) { return a >= 2023; }).sort();
  }

  /* ---------- calcolo ---------- */
  function ricalcola() {
    calcolo = ivaca = null;
    if (!S.tx || !S.inizio || !S.fine || !S.anno) return;
    var iniz = null;
    if (S.inizio && S.inizio.r.annoInizio === S.anno) { iniz = {}; S.inizio.r.saldi.forEach(function (s) { if (s.tipo !== "fiat" && s.quantitaTesto != null) iniz[s.simbolo] = s.quantitaTesto; }); }
    calcolo = D.calcola(S.tx.dati, S.anno, { fuso: S.fuso, iniziali: iniz });
    var saldiFine = S.fine && S.fine.r.anno === S.anno ? S.fine.r.saldi : null;
    calcolo.differenzeFine = saldiFine ? D.confronta(calcolo, saldiFine) : null;
    var saldiInizio = S.inizio && S.inizio.r.annoInizio === S.anno ? S.inizio.r.saldi : null;
    ivaca = I.calcola(calcolo, { quota: Math.min(100, Math.max(0, +S.quota || 0)) / 100, saldiInizio: saldiInizio, saldiFine: saldiFine, inclusi: S.inclusi, valori: S.valori });
  }

  /* ---------- viste ---------- */
  function nav() {
    document.getElementById("steps").innerHTML = TABS.map(function (t, i) {
      return '<button type="button" data-tab="' + i + '"' + (S.tab === i ? ' aria-current="step"' : "") + '><span class="n">' + (i + 1) + "</span>" + esc(t) + "</button>";
    }).join("");
  }
  function slot(id, titolo, obbl, testo, accetta) {
    var x = S[id], err = S.errore[id], stato = "";
    if (err) stato = '<p class="stato" style="color:var(--hi)">' + esc(err) + "</p>";
    else if (x && id === "tx") stato = '<p class="stato"><b>' + esc(x.nome) + "</b><br>" + x.dati.movimenti.length.toLocaleString("it-IT") + " transazioni lette" +
      (x.dati.cancellate ? ", " + x.dati.cancellate + " cancellate escluse" : "") + "; date in " + (x.dati.fuso || "fuso non indicato") + "; numeri in formato " + (x.dati.numeri === "it" ? "italiano" : "inglese") + ".</p>";
    else if (x) stato = '<p class="stato"><b>' + esc(x.nome) + "</b><br>" + x.r.saldi.length + " cripto, valore " + E(x.r.valoreCripto) + " — saldi " + (x.r.tipoSaldi === "inizio" ? "al 1/1/" + x.r.anno : "al 31/12/" + x.r.anno) +
      (x.r.nota ? "<br>" + esc(x.r.nota) : "") + (x.r.avvisi.length ? '<br><span style="color:var(--mid)">' + x.r.avvisi.map(esc).join("<br>") + "</span>" : "") + "</p>";
    return '<div class="slot' + (err ? " err" : x ? " ok" : "") + '"><span class="req">' + (obbl ? "Obbligatorio" : "Facoltativo") + "</span><h3>" + titolo + '</h3><p class="small muted" style="margin:0">' + testo + "</p>" +
      '<input type="file" accept="' + accetta + '" data-slot="' + id + '">' + stato + (x ? '<button type="button" class="btnlink small" data-togli="' + id + '">Togli il file</button>' : "") + "</div>";
  }
  function viewIvaca() {
    var h = '<h2>Giorni di detenzione e IVACA</h2><p class="lead">Dalle transazioni Koinly si ricostruiscono, cripto per cripto e sul totale di tutti i wallet, i giorni di detenzione dell\'anno e i periodi a quantità costante; con il valore di fine anno si calcola l\'imposta sul valore delle cripto-attività (quadro RW, col. 33).</p>' +
      '<div class="banner"><strong>Riservatezza</strong><p>I file restano in questo browser: non vengono salvati né inviati in rete.</p></div>' +
      '<div class="panel"><div class="slots">' +
      slot("tx", "Transazioni", true, "CSV di Koinly con tutte le transazioni: «backup_transactions_koinly.csv» oppure «transaction history».", ".csv,text/csv") +
      slot("inizio", "Saldi a inizio anno", true, "«Beginning of year holdings» in CSV (o il report di fine dell'anno precedente): quantità e valori al 1° gennaio.", ".csv,.pdf") +
      slot("fine", "Saldi a fine anno", true, "«End of year holdings» in CSV o «Complete tax report» in PDF: quantità e valori al 31/12, per il riscontro e il valore finale.", ".csv,.pdf") +
      "</div></div>";
    var manca = [!S.tx && "le transazioni", !S.inizio && "i saldi a inizio anno", !S.fine && "i saldi a fine anno"].filter(Boolean);
    if (manca.length) return h + '<p class="muted" style="margin-top:14px">Per calcolare servono tutti e tre i file: mancano ' + manca.join(", ").replace(/, ([^,]*)$/, " e $1") + ".</p>";
    var anni = anniTx(); if (S.anno && anni.indexOf(S.anno) < 0) anni.push(S.anno);
    h += '<div class="panel" style="margin-top:14px"><div class="grid2">' +
      '<label class="f"><span class="t">Anno</span><select data-k="anno">' + anni.map(function (a) { return "<option" + (a === S.anno ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span class="t">Fuso orario delle date</span><select data-k="fuso"><option value="UTC"' + (S.fuso === "UTC" ? " selected" : "") + '>UTC (come nel file Koinly)</option><option value="Europe/Rome"' + (S.fuso === "Europe/Rome" ? " selected" : "") + ">Ora italiana</option></select><span class=\"small\">Il giorno di un movimento fatto di notte può cambiare.</span></label>" +
      '<label class="f"><span class="t">Quota di possesso <span class="muted small">(%)</span></span><input class="num" type="number" min="0" max="100" step="any" data-k="quota" value="' + esc(S.quota) + '"></label>' +
      "</div></div>";
    if (!calcolo) return h;
    return h + risultati();
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
  function viewSanzioni() {
    return '<h2>Sanzioni RW e RT</h2><p class="lead">In preparazione: calcolo delle sanzioni e del ravvedimento sul valore finale dichiarato (RW) e sulle plusvalenze (RT), dai report Koinly.</p>';
  }
  function render() {
    nav();
    var aperto = document.getElementById("spam"); if (aperto) S.spamAperti = aperto.open;
    app.innerHTML = S.tab === 0 ? viewIvaca() : viewSanzioni();
  }

  /* ---------- Excel ---------- */
  function excel() {
    var X = window.LumesXlsx, a = S.anno, iv = ivaca, righe = iv.righe.filter(function (r) { return r.incluso; });
    var fonteTxt = function (f) { return f === "report" ? "report Koinly" : f === "manuale" ? "a mano" : f === "stima" ? "stimato" : "transazione"; };
    // foglio 1: un rigo per periodo di detenzione (righi RW), con l'imposta a formula
    var rw = [[{ v: "Quadro RW " + a + " · periodi di detenzione e IVACA", s: "titolo" }],
      ["Transazioni: " + S.tx.nome + (S.inizio ? " · Saldi iniziali: " + S.inizio.nome : "") + (S.fine ? " · Saldi finali: " + S.fine.nome : "") + " · date in " + calcolo.fuso],
      ["Aliquota", { v: I.PARAMETRI.aliquota }, "Quota", { v: iv.quota, s: "inputPct" }, "Divisore", { v: I.PARAMETRI.divisore }], [],
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

  /* ---------- resoconto da stampare o salvare in PDF: riepilogo e tutti i periodi di ogni cripto ---------- */
  function stampa() {
    var iv = ivaca, righe = iv.righe.filter(function (r) { return r.incluso; });
    var oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    var h = '<div class="testata"><h1>Giorni di detenzione e IVACA ' + S.anno + "</h1><p>Koinly Tools · " + esc(oggi) + "</p></div>" +
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
      '<p class="nota">Valori ai prezzi Koinly: dal controvalore in euro delle transazioni e, per i periodi che iniziano il 1/1 o finiscono il 31/12, dai report dei saldi. * prezzo stimato con l\'ultimo noto · ✎ valore inserito a mano. Il calcolo somma tutti i wallet; la circolare 30/E chiede un rigo RW per portafoglio. Stima da verificare: non sostituisce il parere del professionista.</p>';
    var box = document.getElementById("resoconto") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "resoconto" }));
    box.innerHTML = h;
    document.body.classList.add("in-stampa");
    var fine = function () { document.body.classList.remove("in-stampa"); window.removeEventListener("afterprint", fine); };
    window.addEventListener("afterprint", fine);
    window.print();
  }

  /* ---------- eventi ---------- */
  document.getElementById("steps").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) { S.tab = +b.getAttribute("data-tab"); render(); } });
  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("input[type=file][data-slot]") && t.files[0]) { carica(t.getAttribute("data-slot"), t.files[0]); return; }
    if (t.matches("[data-incl]")) { S.inclusi[t.getAttribute("data-incl")] = t.checked; ricalcola(); render(); return; }
    if (t.matches("[data-val]")) { var k = t.getAttribute("data-val"); S.valori[k] = t.value === "" ? null : +t.value; ricalcola(); render(); return; }
    if (t.matches("[data-k]")) { var key = t.getAttribute("data-k"); S[key] = key === "anno" ? +t.value : key === "quota" ? +t.value : t.value; if (key === "anno") { S.inclusi = {}; S.valori = {}; } ricalcola(); render(); }
  });
  app.addEventListener("click", function (e) {
    var t = e.target;
    if (t.matches("[data-apri]")) { var k = t.getAttribute("data-apri"); S.aperti[k] = !S.aperti[k]; render(); }
    else if (t.matches("[data-togli]")) { var s = t.getAttribute("data-togli"); S[s] = null; S.errore[s] = null; if (s === "tx") S.anno = null; scegliAnno(); ricalcola(); render(); }
    else if (t.id === "excel") excel();
    else if (t.id === "stampa") stampa();
  });
  render();
})();
