/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · motore comune dei broker esteri: dai dati di un intermediario in forma normalizzata calcola, per anno,
   i quadri RT (sezione al 26%), RM (redditi di capitale esteri) e RW (con IVAFE e IVACA) e i codici F24.
   Ogni broker ha un suo lettore (etoro.js per il rendiconto eToro, la funzione leggiCsv qui sotto per il modello generico)
   che produce questa forma, tutta in euro:
   { broker: "eToro", statoRW: "101", anni: [2023, 2024],
     operazioni: [{ data, categoria: "Azioni"|"ETF"|"CFD"|"Cripto"|"Obbligazioni"|"Altro", nome, isin, corrispettivo, costo, accessoria }],
     redditi:    [{ data, lettera: "H"|"B"|"G"|"I", nome, isin, stato, lordo, ritenuta }],
     posizioni:  [{ anno, nome, categoria, isin, stato, codiceRW, dal, al, giorni, valoreIniziale, valoreFinale, nota }],
     notaImporti: testo sull'origine degli importi in euro }
   Le operazioni «accessorie» (commissioni overnight, dividendi su CFD) entrano nei totali ma non contano come posizioni chiuse. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyEstero = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // codici Stato (elenco del fascicolo 1) per i Paesi più frequenti, dal prefisso dell'ISIN; gli altri vanno indicati a mano
  var STATI = { US: ["Stati Uniti", "069"], CA: ["Canada", "013"], IE: ["Irlanda", "040"], GB: ["Regno Unito", "031"], DE: ["Germania", "094"], FR: ["Francia", "029"], NL: ["Paesi Bassi", "050"], CH: ["Svizzera", "071"], CY: ["Cipro", "101"], LU: ["Lussemburgo", "092"] };
  var NOMI_STATO = {}; Object.keys(STATI).forEach(function (k) { NOMI_STATO[STATI[k][1]] = STATI[k][0]; });
  var LETTERE = { H: "dividendi", B: "proventi di OICR armonizzati", G: "interessi su conti bancari", I: "altri redditi di capitale" };
  var r2 = function (x) { return Math.round((x || 0) * 100) / 100; }, r0 = function (x) { return Math.round(x || 0); };
  var dentro = function (data, anno) { return !!data && data.slice(0, 4) === String(anno); };

  function anni(dati) {
    var s = {};
    (dati.anni || []).forEach(function (a) { s[a] = true; });
    dati.operazioni.forEach(function (x) { if (x.data) s[+x.data.slice(0, 4)] = true; });
    dati.redditi.forEach(function (x) { if (x.data) s[+x.data.slice(0, 4)] = true; });
    dati.posizioni.forEach(function (x) { if (x.anno) s[x.anno] = true; });
    return Object.keys(s).map(Number).sort();
  }
  function codiceRW(x, anno) {
    if (x.codiceRW) return String(x.codiceRW);
    return x.categoria === "Liquidità" ? "1" : x.categoria === "Cripto" ? (anno >= 2023 ? "21" : "14") : x.categoria === "Azioni" ? "2" : x.categoria === "ETF" ? "4" : x.categoria === "CFD" ? "9" : "20";
  }
  function giorni(x) { return x.giorni != null ? x.giorni : Math.round((Date.parse(x.al) - Date.parse(x.dal)) / 86400000) + 1; }

  /* quadri per l'anno: RT (sezione al 26% per azioni, ETF, CFD e altri titoli; cripto secondo il regime dell'anno), RM (redditi di capitale), RW.
     opz: { sogliaValute: true se la giacenza in valuta ha superato 51.645,69 € per 7 giorni lavorativi (cripto fino al 2022),
            minusPrecedenti: minusvalenze riportabili della sezione al 26% } */
  function quadri(dati, anno, opz) {
    var o = opz || {}, B = dati.broker || "broker estero", out = { anno: anno, broker: B, modello: "Redditi PF " + (anno + 1), rt: [], rm: [], rw: [], f24: [], note: [] };
    var add = function (rigo, col, desc, v) { out.rt.push({ rigo: rigo, col: col, descrizione: desc, valore: v }); };
    var ops = dati.operazioni.filter(function (x) { return dentro(x.data, anno); });
    var tot = { corr: 0, costo: 0, n: 0 }, cripto = { corr: 0, costo: 0, n: 0 }, cfd = false;
    ops.forEach(function (x) {
      var z = x.categoria === "Cripto" ? cripto : tot;
      z.corr += x.corrispettivo || 0; z.costo += x.costo || 0; if (!x.accessoria) z.n++;
      if (x.categoria === "CFD") cfd = true;
    });
    var criptoInValute = anno <= 2022;
    if (criptoInValute && o.sogliaValute) { tot.corr += cripto.corr; tot.costo += cripto.costo; tot.n += cripto.n; }
    var diff = r0(tot.corr) - r0(tot.costo), plus = diff > 0 ? diff : 0, minus = diff < 0 ? -diff : 0, mp = Math.min(r0(o.minusPrecedenti), plus), base = plus - mp, imp = r0(base * 0.26);
    out.corrispettivi = r0(tot.corr); out.costi = r0(tot.costo); out.minusUsate = mp;
    var descCosti = cfd ? "Totale dei costi (compresi gli oneri overnight dei CFD)" : "Totale dei costi o valori di acquisto";
    if (tot.n) {
      if (anno <= 2023) {
        out.sezione26 = "Quadro RT, sezione " + (anno === 2023 ? "II-A" : "II") + " · redditi diversi al 26%";
        add("RT21", "", "Totale dei corrispettivi", r0(tot.corr)); add("RT22", "3", descCosti, r0(tot.costo));
        add("RT23", "1", "Minusvalenza", minus); add("RT23", "2", "Plusvalenza", plus);
        add("RT24", "", "Minusvalenze degli anni precedenti (da RT93)", mp);
        add("RT26", "", "Imponibile", base); add("RT27", "", "Imposta sostitutiva 26%", imp); add("RT29", "", "Imposta dovuta", imp);
        if (minus) add("RT93", "5", "Minusvalenza dell'anno da riportare (4 anni)", minus);
      } else {
        out.sezione26 = "Quadro RT, sezione II-A · redditi diversi al 26%";
        add("RT11", "1", "Totale dei corrispettivi", r0(tot.corr)); add("RT11", "2", descCosti, r0(tot.costo));
        add("RT13", "", "Minusvalenze degli anni precedenti", mp);
        add("RT52", "1", "Minusvalenza", minus); add("RT52", "2", "Plusvalenza", plus);
        add("RT72", "", "Imponibile", base); add("RT73", "", "Imposta sostitutiva 26%", imp); add("RT74", "", "Imposta dovuta", imp);
        if (minus) add("RT102", "", "Minusvalenza dell'anno da riportare (4 anni)", minus);
      }
      if (imp) out.f24.push({ codice: "1100", descrizione: "Imposta sostitutiva su plusvalenze e differenziali (quadro RT)", importo: imp });
    }
    out.minusvalenzaDaRiportare = minus;
    out.cripto = { corrispettivi: r2(cripto.corr), costi: r2(cripto.costo), n: cripto.n };
    if (cripto.n) {
      if (criptoInValute) out.note.push("Cripto vendute nel " + anno + " (" + cripto.n + " posizioni, risultato " + r2(cripto.corr - cripto.costo) + " €): fino al 2022 seguono il regime delle valute (art. 67 c. 1-ter TUIR) e sono tassate solo se la giacenza complessiva in valuta ha superato 51.645,69 € per almeno 7 giorni lavorativi continui; " + (o.sogliaValute ? "soglia indicata come superata: comprese nella sezione al 26%." : "soglia non superata: non imponibili (né deducibili le minusvalenze)."));
      else out.note.push("Cripto vendute nel " + anno + " (corrispettivi " + r2(cripto.corr) + " €, costi " + r2(cripto.costo) + " €): vanno sommate alle cessioni degli altri wallet ed exchange nel quadro RT delle cripto-attività (art. 67 c. 1 lett. c-sexies, codice F24 1715).");
    }
    if (cfd) out.note.push("CFD (anche su cripto e azioni con leva o allo scoperto): differenziali art. 67 c. 1 lett. c-quater TUIR, nella sezione al 26%; le commissioni overnight sono oneri e i dividendi su CFD componenti positive.");
    if ((tot.n || cripto.n) && dati.notaImporti) out.note.push(dati.notaImporti);

    // RM: redditi di capitale esteri senza ritenuta italiana, al lordo della ritenuta estera, per tipo e Stato (indicato o dall'ISIN)
    var gruppi = {};
    dati.redditi.filter(function (x) { return dentro(x.data, anno); }).forEach(function (x) {
      var pre = (x.isin || "").slice(0, 2) || "??", st = x.stato || (STATI[pre] ? STATI[pre][1] : ""), lettera = x.lettera || "H";
      var k = lettera + "|" + (x.stato ? x.stato : pre), z = gruppi[k] || (gruppi[k] = { lettera: lettera, stato: st, pre: pre, lordo: 0, ritenuta: 0, n: 0 });
      z.n++; z.lordo += x.lordo || 0; z.ritenuta += x.ritenuta || 0;
    });
    out.rmRigo = anno <= 2023 ? "RM12" : "RM31"; out.rmColImposta = anno <= 2023 ? "6" : "8";
    Object.keys(gruppi).sort().forEach(function (k) {
      var z = gruppi[k], nome = NOMI_STATO[z.stato];
      out.rm.push({ rigo: out.rmRigo, lettera: z.lettera, stato: z.stato, statoNome: nome || (z.stato ? "" : "ISIN " + z.pre + ": codice Stato da indicare"), lordoEsatto: r2(z.lordo), lordo: r0(z.lordo), imposta: r0(r0(z.lordo) * 0.26), ritenutaEstera: r2(z.ritenuta), n: z.n });
    });
    var impRM = out.rm.reduce(function (s, x) { return s + x.imposta; }, 0);
    if (impRM) out.f24.push({ codice: "1242", descrizione: "Imposta sostitutiva sui redditi di capitale di fonte estera (quadro RM)", importo: impRM });
    if (out.rm.length) {
      var lett = out.rm.map(function (x) { return x.lettera; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
      out.note.push("Redditi di capitale esteri: quadro RM, rigo " + out.rmRigo + ", " + (lett.length === 1 ? "lettera " + lett[0] + " (" + LETTERE[lett[0]] + ")" : "lettere " + lett.join(", ")) + ", al lordo della ritenuta estera (26%, senza credito per la ritenuta subita all'estero); in unità di euro." + (out.rm.every(function (x) { return !x.lordo; }) ? " Arrotondati all'euro valgono zero." : ""));
    }

    // RW: una riga per tipo di bene (e Stato), con valori e giorni delle posizioni dell'anno; la liquidità in righe a parte
    var pos = dati.posizioni.filter(function (x) { return x.anno === anno; }), p = pos.filter(function (x) { return x.categoria !== "Liquidità"; });
    var gr = {}, bis = anno % 4 === 0 ? 366 : 365;
    p.forEach(function (x) {
      var codice = codiceRW(x, anno), cr = codice === "21" || codice === "14", stato = cr ? "" : x.stato || dati.statoRW || "", k = codice + "|" + stato, gg = giorni(x);
      var g = gr[k] || (gr[k] = { codice: codice, stato: stato, cr: cr, n: 0, valoreIniziale: 0, valoreFinale: 0, imposta: 0, stimati: 0, ponderati: 0 });
      g.n++; g.valoreIniziale += x.valoreIniziale || 0; g.valoreFinale += x.valoreFinale || 0; g.ponderati += gg * (x.valoreFinale || 0); if (x.nota) g.stimati++;
      g.imposta += (x.valoreFinale || 0) * 0.002 * gg / bis;
    });
    var ivafe = 0, ivaca = 0, DESC = { "21": "Cripto-attività su ", "14": "Cripto-attività su ", "2": "Azioni presso ", "4": "ETF presso ", "9": "Contratti derivati (CFD) presso ", "20": "Altri strumenti presso " };
    Object.keys(gr).sort(function (a, b) { return parseFloat(a) - parseFloat(b) || (a < b ? -1 : 1); }).forEach(function (k) {
      var g = gr[k];
      var riga = { codice: g.codice, descrizione: (DESC[g.codice] || "Attività (codice " + g.codice + ") presso ") + B, stato: g.stato, n: g.n, valoreIniziale: r0(g.valoreIniziale), valoreFinale: r0(g.valoreFinale), giorni: Math.min(bis, Math.round(g.ponderati / (g.valoreFinale || 1)) || 0), stimati: g.stimati, ivafe: 0, ivaca: 0 };
      if (g.codice === "21") { riga.ivaca = r2(g.imposta); ivaca += g.imposta; } else if (!g.cr) { riga.ivafe = r2(g.imposta); ivafe += g.imposta; }
      out.rw.push(riga);
    });
    pos.filter(function (x) { return x.categoria === "Liquidità"; }).forEach(function (x) {
      out.rw.push({ codice: "1", descrizione: x.nome || "Liquidità sul conto " + B, stato: x.stato || dati.statoRW || "", n: 1, valoreIniziale: r0(x.valoreIniziale), valoreFinale: r0(x.valoreFinale), giorni: Math.min(bis, giorni(x)), ivafe: 0, ivaca: 0 });
    });
    out.ivafe = r2(ivafe); out.ivaca = r2(ivaca);
    out.colonne = anno >= 2023 ? "IVAFE col. 29-30 (totale RW6, codice F24 4043); IVACA col. 33-34 (totale RW8, codice F24 1727)" : "IVAFE col. 11-15 (totale RW6, codice F24 4043)";
    if (r0(ivafe) >= 12) out.f24.push({ codice: "4043", descrizione: "IVAFE saldo (RW6)", importo: r0(ivafe) });
    else if (ivafe > 0) out.note.push("IVAFE di " + r2(ivafe) + " €: sotto i 12 € non si versa.");
    if (r0(ivaca) >= 12) out.f24.push({ codice: "1727", descrizione: "IVACA saldo (RW8)", importo: r0(ivaca) });
    else if (ivaca > 0) out.note.push("IVACA sulle cripto presso " + B + " di " + r2(ivaca) + " €: va sommata a quella degli altri wallet (RW8); sotto i 12 € complessivi non si versa.");
    if (out.rw.some(function (x) { return x.codice === "14"; })) out.note.push("Fino al 2022 le cripto vanno nel quadro RW con il codice 14, senza Stato estero e senza IVAFE.");
    if (out.rw.some(function (x) { return x.codice === "9"; })) out.note.push("CFD nel quadro RW (codice 9): l'Agenzia non indica il criterio di valore; qui il margine investito o il valore alla chiusura. L'IVAFE sui CFD è prudenziale.");
    if (out.rw.some(function (x) { return x.codice === "1"; })) out.note.push("Liquidità sul conto " + B + " (codice 1): l'IVAFE fissa di 34,20 € vale per i conti bancari con giacenza media oltre 5.000 €; per gli intermediari non bancari il trattamento è da valutare.");
    if (out.rw.some(function (x) { return x.codice !== "21" && x.codice !== "14" && !x.stato; })) out.note.push("Quadro RW: indicare il codice dello Stato estero (col. 4) dove manca.");
    if (p.some(function (x) { return x.nota; })) out.note.push("Alcuni valori del quadro RW sono stimati dal costo perché manca il valore del portafoglio a inizio o fine anno: chiedere a " + B + " il rendiconto a quella data.");
    out.posizioni = p;
    return out;
  }

  /* quadri di tutti gli anni, con le minusvalenze della sezione al 26% riportate per quattro anni */
  function quadriTutti(dati, opz) {
    var o = opz || {}, riporti = [], out = {};
    anni(dati).forEach(function (a) {
      riporti = riporti.filter(function (m) { return a - m.anno <= 4 && m.residuo > 0; });
      var disp = riporti.reduce(function (s, m) { return s + m.residuo; }, 0);
      var q = quadri(dati, a, { minusPrecedenti: disp, sogliaValute: !!(o.sogliaValute && o.sogliaValute[a]) });
      var usate = q.minusUsate; riporti.forEach(function (m) { var u = Math.min(m.residuo, usate); m.residuo -= u; usate -= u; });
      if (q.minusvalenzaDaRiportare) riporti.push({ anno: a, residuo: q.minusvalenzaDaRiportare });
      out[a] = q;
    });
    return out;
  }

  /* ---------- modello generico in CSV, per qualunque broker (Trade Republic, Degiro, Interactive Brokers, Revolut...) ----------
     Una riga per voce; colonne (intestazione in qualunque ordine, separatore «;» o «,», numeri 1.234,56 o 1234.56, date AAAA-MM-GG o GG/MM/AAAA):
     Tipo; Data; Strumento; ISIN; Categoria; Corrispettivo; Costo; Lordo; Ritenuta; Stato; Dal; Al; Valore iniziale; Valore finale; Codice RW
     Tipo: cessione | dividendo | provento OICR | interesse | altro reddito di capitale | posizione | liquidità. Righe che iniziano con # ignorate. */
  var INTESTAZIONE = ["Tipo", "Data", "Strumento", "ISIN", "Categoria", "Corrispettivo", "Costo", "Lordo", "Ritenuta", "Stato", "Dal", "Al", "Valore iniziale", "Valore finale", "Codice RW"];
  var ESEMPI = [
    "# Righe di esempio: cancellatele (o lasciate il # davanti) e inserite i dati del cliente. Importi in euro al cambio del giorno dell'operazione.",
    "#cessione;15/03/2024;Apple Inc;US0378331005;Azioni;1.250,00;1.000,00;;;;;;;;",
    "#dividendo;10/05/2024;Apple Inc;US0378331005;Azioni;;;12,00;1,80;;;;;;",
    "#interesse;31/12/2024;Interessi sulla liquidità;;;;;35,20;;094;;;;;",
    "#posizione;;Apple Inc;US0378331005;Azioni;;;;;094;01/01/2024;31/12/2024;5.000,00;6.200,00;",
    "#liquidità;;Conto presso il broker;;;;;;;094;01/01/2024;31/12/2024;800,00;1.500,00;"
  ];
  function modelloCsv() { return "﻿" + INTESTAZIONE.join(";") + "\r\n" + ESEMPI.join("\r\n") + "\r\n"; }

  function righeCsv(testo, sep) {
    var out = [], riga = [], campo = "", q = false;
    for (var i = 0; i < testo.length; i++) {
      var c = testo[i];
      if (q) { if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
      else if (c === '"') q = true;
      else if (c === sep) { riga.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && testo[i + 1] === "\n") i++; riga.push(campo); out.push(riga); riga = []; campo = ""; }
      else campo += c;
    }
    if (campo || riga.length) { riga.push(campo); out.push(riga); }
    return out;
  }
  function numero(s) {
    var t = String(s == null ? "" : s).replace(/[€\s]/g, "");
    if (!t) return null;
    // con punto e virgola insieme è decimale il segno che viene per ultimo (1.234,56 o 1,234.56)
    if (t.indexOf(",") >= 0 && t.indexOf(".") >= 0) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (t.indexOf(",") >= 0) t = t.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    var v = Number(t); return isFinite(v) ? v : NaN;
  }
  function data(s) {
    var t = String(s || "").trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(t))) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return t ? undefined : null;
  }
  var CATEGORIE = { azioni: "Azioni", azione: "Azioni", etf: "ETF", cfd: "CFD", obbligazioni: "Obbligazioni", obbligazione: "Obbligazioni", cripto: "Cripto", crypto: "Cripto", altro: "Altro" };
  var TIPI_REDDITO = { dividendo: "H", "provento oicr": "B", interesse: "G", "altro reddito di capitale": "I" };

  function leggiCsv(testo, broker) {
    testo = String(testo).replace(/^﻿/, "");
    var prima = testo.split(/\r?\n/)[0] || "", sep = (prima.match(/;/g) || []).length >= (prima.match(/,/g) || []).length ? ";" : ",";
    var tab = righeCsv(testo, sep), testa = (tab[0] || []).map(function (c) { return c.trim().toLowerCase(); });
    var col = {}; INTESTAZIONE.forEach(function (h) { col[h] = testa.indexOf(h.toLowerCase()); });
    if (col.Tipo < 0) throw new Error("Non è il modello «Altri broker esteri»: manca la colonna «Tipo». Scaricate il modello vuoto e compilatelo.");
    var dati = { broker: broker || "broker estero", statoRW: "", operazioni: [], redditi: [], posizioni: [], errori: [],
      notaImporti: "Importi in euro come indicati nel modello compilato: ciascuno va al cambio del giorno dell'operazione (art. 9 c. 2 TUIR)." };
    tab.slice(1).forEach(function (r, i) {
      var v = function (h) { return col[h] < 0 ? "" : String(r[col[h]] == null ? "" : r[col[h]]).trim(); };
      var tipo = v("Tipo").toLowerCase(), riga = i + 2;
      if (!tipo || tipo[0] === "#") return;
      var err = function (m) { dati.errori.push("Riga " + riga + ": " + m); };
      var n = function (h, obblig) { var x = numero(v(h)); if (x === null) { if (obblig) err("manca «" + h + "»."); return 0; } if (isNaN(x)) { err("«" + h + "» non è un numero (" + v(h) + ")."); return 0; } return x; };
      var d = function (h) { var x = data(v(h)); if (x === undefined) err("data «" + h + "» non valida (" + v(h) + "): usate GG/MM/AAAA."); return x || null; };
      var cat = CATEGORIE[v("Categoria").toLowerCase()] || (v("Categoria") ? null : "Altro");
      if (cat === null) { err("categoria «" + v("Categoria") + "» non prevista (Azioni, ETF, CFD, Obbligazioni, Cripto, Altro)."); cat = "Altro"; }
      if (tipo === "cessione") {
        var dc = d("Data"); if (!dc) return err("manca la data della cessione.");
        dati.operazioni.push({ data: dc, categoria: cat, nome: v("Strumento"), isin: v("ISIN").toUpperCase(), corrispettivo: n("Corrispettivo", true), costo: n("Costo", true) });
      } else if (TIPI_REDDITO[tipo]) {
        var dr = d("Data"); if (!dr) return err("manca la data dell'incasso.");
        dati.redditi.push({ data: dr, lettera: TIPI_REDDITO[tipo], nome: v("Strumento"), isin: v("ISIN").toUpperCase(), stato: v("Stato"), lordo: n("Lordo", true), ritenuta: n("Ritenuta") });
      } else if (tipo === "posizione" || tipo === "liquidità" || tipo === "liquidita") {
        var dal = d("Dal"), al = d("Al");
        if (!dal || !al) return err("servono le date «Dal» e «Al» del periodo di possesso nell'anno.");
        if (dal.slice(0, 4) !== al.slice(0, 4)) return err("il periodo deve stare in un solo anno (una riga per anno).");
        if (al < dal) return err("la data «Al» precede «Dal».");
        dati.posizioni.push({ anno: +dal.slice(0, 4), nome: v("Strumento"), categoria: tipo === "posizione" ? cat : "Liquidità", isin: v("ISIN").toUpperCase(), stato: v("Stato"), codiceRW: v("Codice RW"), dal: dal, al: al, valoreIniziale: n("Valore iniziale", true), valoreFinale: n("Valore finale", true) });
      } else err("tipo «" + v("Tipo") + "» non previsto (cessione, dividendo, provento OICR, interesse, altro reddito di capitale, posizione, liquidità).");
    });
    if (!dati.operazioni.length && !dati.redditi.length && !dati.posizioni.length && !dati.errori.length) throw new Error("Il modello non contiene righe compilate.");
    return dati;
  }

  return { quadri: quadri, quadriTutti: quadriTutti, anni: anni, leggiCsv: leggiCsv, modelloCsv: modelloCsv, STATI: STATI, LETTERE: LETTERE };
});
