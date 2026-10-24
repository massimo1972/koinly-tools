/* Koinly Tools · interfaccia. I file caricati restano nel browser: non vengono salvati né inviati in rete. */
(function () {
  "use strict";
  var L = window.KoinlyLettura, D = window.KoinlyDetenzione, I = window.KoinlyIvaca, Z = window.KoinlySanzioni, MOD = window.KoinlyModelli;
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "comune/vendor/pdf.worker.min.js";
  var app = document.getElementById("app");

  var TABS = ["Giorni di detenzione e IVACA", "Sanzioni RW e RT", "Quadri RW, RT e F24"];
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
  /* plusvalenze nette RT = corrispettivi delle vendite − costi di acquisto */
  function plusvalenzeAnno(a) { return (+a.corrispettivi || 0) - (+a.costi || 0); }
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
        '<label class="f"><span class="t">RT · corrispettivi delle vendite <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="corrispettivi" value="' + esc(a.corrispettivi) + '"><span class="small">' + (a.fonte.corrispettivi === "report" ? "«Il ricavato delle vendite» del riepilogo plusvalenze Koinly." : "Corrispettivi delle cessioni dell'anno.") + "</span></label>" +
        '<label class="f"><span class="t">RT · costi di acquisto <span class="muted small">(€)</span></span><input class="num" type="number" step="any" data-za="' + a.id + '" data-k="costi" value="' + esc(a.costi) + '"><span class="small">' + (a.fonte.costi === "report" ? "«Costi di acquisizione» del riepilogo plusvalenze Koinly (commissioni comprese)." : "Costi delle cripto cedute.") + "</span></label>" +
        '<div class="f"><span class="t">Plusvalenze nette RT <span class="muted small">(€)</span></span><div class="v" style="font:600 1.1rem var(--f-mono)">' + E(plusvalenzeAnno(a)) + '</div><span class="small">Corrispettivi delle vendite − costi di acquisto. Dati Koinly non rettificati con i criteri dello studio.' + (a.redditi ? " Il report indica anche " + E(a.redditi) + " di altri redditi (interessi, reward, airdrop) non compresi: valutarne la qualificazione." : "") + "</span></div>" +
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
  /* ---------- quadri del modello Redditi PF e F24 ---------- */
  var TITOLI = { 1: "proprietà", 2: "usufrutto", 3: "nuda proprietà", 4: "altro" };
  S.modelli = { titolo: 1, sogliaPeriodi: 20 };
  function tabellaRW(q) {
    var testa = '<thead><tr><th>Modulo / rigo</th><th>Cripto · periodo</th><th class="n">Col. 1<br>titolo</th><th class="n">Col. 3<br>codice</th><th class="n">Col. 4<br>Stato</th><th class="n">Col. 5<br>quota %</th><th class="n">Col. 6<br>criterio</th><th class="n">Col. 7<br>valore iniziale</th><th class="n">Col. 8<br>valore finale</th><th class="n">Col. 10<br>giorni</th><th class="n">Col. 12<br>credito</th><th class="n">Col. 16<br>solo monit.</th><th class="n">Col. 33<br>imposta</th><th class="n">Col. 34<br>dovuta</th></tr></thead>';
    var righe = q.righi.map(function (x) {
      return "<tr><td>" + x.modulo + " / " + x.rigo + "</td><td>" + esc(x.cripto) + ' <span class="u">' + it(x.dal) + "–" + it(x.al) + " · " + (x.aggregato ? "rigo unico di " + x.aggregato + " periodi: col. 8 valore medio (finale " + E(x.valoreFinale, 0) + ")" : Q(x.quantita)) + '</span></td><td class="n">' + x.c1 + '</td><td class="n">' + x.c3 + '</td><td class="n">' + (x.c4 || "–") + '</td><td class="n">' + String(x.c5).replace(".", ",") +
        '</td><td class="n">' + x.c6 + '</td><td class="n">' + E(x.c7, 0) + '</td><td class="n">' + E(x.c8, 0) + '</td><td class="n">' + x.c10 + '</td><td class="n">' + (x.c12 ? E(x.c12, 0) : "–") + '</td><td class="n">' + (x.c16 ? "X" : "") + '</td><td class="n">' + E(x.c33, x.c33 < 0.01 && x.c33 > 0 ? 4 : 2) + '</td><td class="n">' + E(x.c34, x.c34 < 0.01 && x.c34 > 0 ? 4 : 2) + "</td></tr>";
    }).join("");
    var w = q.rw8;
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
        '<div class="f"><span class="t">Anno ' + q.anno + '</span><span class="small">' + q.righi.length + " righi in " + q.moduli + " moduli: un rigo per periodo di detenzione. Codice 21 (cripto-attività), criterio 1 (valore di mercato), quota " + String(ivaca.quota * 100).replace(".", ",") + "%.</span></div></div>" +
        '<p class="small">La circolare 30/E chiede un rigo per ogni portafoglio: qui i periodi sono calcolati sul totale dei wallet di ciascuna cripto.</p>' +
        '<div class="scroll">' + tabellaRW(q) + "</div></div>";
    }
    h += '<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Quadro RT e modello F24</h3><p class="muted">In preparazione: righi della sezione cripto-attività del quadro RT e F24 con i codici tributo di imposte, sanzioni e interessi, dopo la verifica dei codici sulle risoluzioni dell\'Agenzia.</p></div>';
    return h;
  }
  function stampaRW() {
    var q = MOD.quadroRW(ivaca, { titolo: S.modelli.titolo, sogliaPeriodi: S.modelli.sogliaPeriodi });
    apriStampa(intestazione("Modello Redditi PF · Quadro RW cripto-attività · anno " + q.anno) +
      '<table class="dati"><tr><td>Titolo di possesso (col. 1)</td><td>' + S.modelli.titolo + " · " + TITOLI[S.modelli.titolo] + "</td></tr><tr><td>Righi</td><td>" + q.righi.length + " (" + q.moduli + " moduli)</td></tr><tr><td>Transazioni</td><td>" + esc(S.tx.nome) + "</td></tr></table>" +
      tabellaRW(q) + '<p class="nota">' + (S.modelli.sogliaPeriodi > 0 ? "Le cripto con più di " + S.modelli.sogliaPeriodi + " periodi sono in un rigo unico: col. 7 valore iniziale del primo periodo, col. 8 valore medio ponderato per i giorni, col. 10 giorni complessivi; l'imposta è uguale alla somma dei periodi. " : "") + 'Per le altre, un rigo per ogni periodo di detenzione a quantità costante: valore iniziale e finale di inizio e fine detenzione, giorni del periodo, imposta = valore finale × 0,20% × quota × giorni / 365. Codice bene 21; codice Stato non obbligatorio per le cripto-attività. La circolare 30/E chiede un rigo per portafoglio: i periodi sono calcolati sul totale dei wallet di ciascuna cripto.</p>' + firma());
  }
  function render() {
    nav();
    var aperto = document.getElementById("spam"); if (aperto) S.spamAperti = aperto.open;
    app.innerHTML = S.tab === 0 ? viewIvaca() : S.tab === 1 ? viewSanzioni() : viewModelli();
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

  /* intestazione dello studio e titolo, per tutti i resoconti stampati */
  function intestazione(titolo) {
    var st = window.KoinlyStudio || {}, oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    var unisci = function (v) { return v.filter(Boolean).map(esc).join(" · "); };
    return '<div class="studio"><div><b>' + esc(st.professionista) + "</b><br><span>" + esc(st.qualifica) + "</span></div>" +
      '<div class="contatti">' + [esc(st.indirizzo || ""), unisci([st.telefono && "Tel. " + st.telefono, st.email && "mail: " + st.email]), unisci([st.sito, st.partitaIva && "P.IVA " + st.partitaIva])].filter(Boolean).join("<br>") + "</div></div>" +
      '<div class="testata"><h1>' + esc(titolo) + "</h1><p>Firenze, " + esc(oggi) + "</p></div>";
  }
  function firma() { var st = window.KoinlyStudio || {}; return '<p class="firma">Elaborazione a cura del ' + esc(st.professionista) + "</p>"; }
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
    if (t.matches("input[type=file][data-slot]") && t.files[0]) { carica(t.getAttribute("data-slot"), t.files[0]); return; }
    if (t.matches("[data-incl]")) { S.inclusi[t.getAttribute("data-incl")] = t.checked; ricalcola(); render(); return; }
    if (t.matches("[data-val]")) { var k = t.getAttribute("data-val"); S.valori[k] = t.value === "" ? null : +t.value; ricalcola(); render(); return; }
    if (t.matches("[data-mod]")) { S.modelli[t.getAttribute("data-mod")] = +t.value; render(); return; }
    if (t.matches("[data-sz]")) { S.sanz[t.getAttribute("data-sz")] = t.value || oggiIso; render(); return; }
    if (t.matches("[data-zfile]") && t.files[0]) { caricaReportAnno(+t.getAttribute("data-zfile"), t.files[0]); return; }
    if (t.matches("[data-za]")) {
      var za = S.sanz.anni.filter(function (x) { return x.id === +t.getAttribute("data-za"); })[0], zk = t.getAttribute("data-k");
      za[zk] = zk === "anno" ? +t.value : zk === "stato" ? t.value : t.value === "" ? "" : +t.value; if (zk !== "anno" && zk !== "stato") za.fonte[zk] = "mano";
      if (zk === "anno") S.sanz.anni.sort(function (a, b) { return a.anno - b.anno; });
      render(); return;
    }
    if (t.matches("[data-k]")) { var key = t.getAttribute("data-k"); S[key] = key === "anno" ? +t.value : key === "quota" ? +t.value : t.value; if (key === "anno") { S.inclusi = {}; S.valori = {}; } ricalcola(); render(); }
  });
  app.addEventListener("click", function (e) {
    var t = e.target;
    if (t.matches("[data-apri]")) { var k = t.getAttribute("data-apri"); S.aperti[k] = !S.aperti[k]; render(); }
    else if (t.matches("[data-togli]")) { var s = t.getAttribute("data-togli"); S[s] = null; S.errore[s] = null; if (s === "tx") S.anno = null; scegliAnno(); ricalcola(); render(); }
    else if (t.id === "excel") excel();
    else if (t.id === "stampa") stampa();
    else if (t.id === "aggiungiAnno") { nuovoAnno(); render(); }
    else if (t.id === "stampaSanz") stampaSanzioni();
    else if (t.id === "stampaRW") stampaRW();
    else if (t.matches("[data-toglianno]")) { var id = +t.getAttribute("data-toglianno"); S.sanz.anni = S.sanz.anni.filter(function (x) { return x.id !== id; }); render(); }
    else if (t.matches("[data-usaivaca]")) { var ya = S.sanz.anni.filter(function (x) { return x.id === +t.getAttribute("data-usaivaca"); })[0]; ya.ivaca = Math.round(ivaca.totali.ivaca * 100) / 100; ya.fonte.ivaca = "calcolo"; render(); }
  });
  render();
})();
