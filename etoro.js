/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · lettura del rendiconto eToro («Account statement» in PDF, versione italiana o inglese) e riepilogo per anno
   dei dati letti: posizioni chiuse per categoria, trasferimenti al wallet cripto, dividendi, airdrop, portafoglio e saldo.
   Dai dati si calcolano i quadri RT (sezione al 26%), RM (dividendi esteri) e RW (con IVAFE e IVACA) di ogni anno.
   Privacy: dal PDF si leggono solo tabelle numeriche; intestazione, nome utente e indirizzo non vengono conservati. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyEtoro = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MESI = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12 };
  // numero eToro: 1234.56, (12.34) negativo, «-» assente
  function num(s) {
    s = String(s == null ? "" : s).trim(); if (!s || s === "-" || s === "N/A") return null;
    var neg = /^\(.*\)$/.test(s) || /^-\d/.test(s); s = s.replace(/[()\s,%]/g, "").replace(/^-/, "");
    var v = parseFloat(s); return isFinite(v) ? (neg ? -v : v) : null;
  }
  function iso(s) { var m = /(\d{2})[-\/](\d{2})[-\/](\d{4})/.exec(s); return m ? m[3] + "-" + m[2] + "-" + m[1] : null; }
  function dataTitolo(s) { var m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(s); return m && MESI[m[1].toLowerCase()] ? m[3] + "-" + ("0" + MESI[m[1].toLowerCase()]).slice(-2) + "-" + ("0" + m[2]).slice(-2) : null; }
  var RE_NUM = "\\(?-?\\d[\\d,]*(?:\\.\\d+)?\\)?";

  /* tipologia fiscale della posizione: le cripto e le azioni con leva o allo scoperto su eToro sono CFD */
  function categoria(tipo, leva, direzione) {
    var t = String(tipo || "").toLowerCase();
    var cfd = /cfd/.test(t) || (leva && leva > 1) || /short/i.test(direzione || "");
    if (cfd) return "CFD";
    if (/cripto|crypto/.test(t)) return "Cripto";
    if (/etf/.test(t)) return "ETF";
    if (/azion|stock/.test(t)) return "Azioni";
    return t ? tipo : "Altro";
  }

  function sezioni(pagine) {
    var out = { holdings: [], chiuse: [], attivita: [], dividendi: [], finanziario: [], riepilogo: [] };
    var cor = null;
    pagine.forEach(function (p) {
      var testo = String(p.text || ""), prima = testo.split("\n")[0];
      if (/^(Holdings|Posizioni aperte|Open Positions)\b/i.test(prima)) cor = { k: "holdings", data: dataTitolo(prima) };
      else if (/^(Posizioni chiuse|Closed Positions)\b/i.test(prima)) cor = { k: "chiuse" };
      else if (/^(Attività account|Account Activity)\b/i.test(prima)) cor = { k: "attivita" };
      else if (/^(Dividendi|Dividends)\b/i.test(prima)) cor = { k: "dividendi" };
      else if (/^(Riepilogo finanziario|Financial Summary)\b/i.test(prima)) cor = { k: "finanziario" };
      else if (/^(Account Statement Glossary|Glossario)/i.test(prima)) cor = null;
      else if (p.n === 1 || /Riepilogo dell'Account|Account Summary/i.test(testo.slice(0, 400))) cor = { k: "riepilogo" };
      if (!cor) return;
      if (cor.k === "holdings") { var h = out.holdings.filter(function (x) { return x.data === cor.data; })[0]; if (!h) out.holdings.push(h = { data: cor.data, testo: [] }); h.testo.push(testo); }
      else out[cor.k].push(testo);
    });
    return out;
  }

  // posizioni detenute a una data: «Asset ID Long|Short dd-mm-yyyy hh:mm:ss Xn apertura unità corrente USD EUR Tipo ISIN»
  function leggiHoldings(testo) {
    var t = testo.replace(/\n/g, " "), re = new RegExp("(\\S[^\\n]*?) (\\d{6,}) (Long|Short|Buy|Sell) (\\d{2}-\\d{2}-\\d{4}) \\d{2}:\\d{2}:\\d{2} X(\\d+(?:\\.\\d+)?) (" + RE_NUM + ") (" + RE_NUM + ") (" + RE_NUM + ") (" + RE_NUM + ") (" + RE_NUM + "|N/A) (.+?) (-|[A-Z]{2}[A-Z0-9]{9}\\d)(?= |$)", "g"), m, righe = [];
    while ((m = re.exec(t))) {
      var nome = m[1].replace(/^.*(?:ISIN|Type|Tipo|-|\d) (?=[^ ]+$)/, "");
      righe.push({ asset: nome.trim(), id: m[2], direzione: m[3], apertura: iso(m[4]), leva: +m[5], tassoApertura: num(m[6]), unita: num(m[7]), tassoCorrente: num(m[8]), usd: num(m[9]), eur: num(m[10]), tipo: m[11].trim(), isin: m[12] === "-" ? "" : m[12], categoria: categoria(m[11], +m[5], m[3]) });
    }
    return righe;
  }

  /* posizioni chiuse: nome, ID, Long/Short, importo, unità, apertura, chiusura, Xn, spread, spread di mercato, profitto USD e EUR,
     cambi (spesso «-»), tassi di apertura e chiusura, take profit, stop loss e overnight, eventuale trader copiato, tipologia, ISIN */
  function leggiChiuse(testi) {
    // si tolgono le intestazioni di colonna (dal titolo fino a «ISIN»); ogni posizione si riconosce da «ID / Long|Short»
    var t = "\n" + testi.map(function (x) { return x.replace(/^(Posizioni chiuse|Closed Positions)[\s\S]*?\nISIN\n/, ""); }).join("\n") + "\n";
    var ancore = [], re = /\n(\d{6,})\n(Long|Short|Buy|Sell)\n/g, m;
    while ((m = re.exec(t))) ancore.push(m.index);
    var TIPI = /^(Criptovalute|Crypto Currencies|Crypto|Azioni|Stocks|ETF|CFD|Materie prime|Commodities|Valute|Currencies|Indici|Indices)(?: ([A-Z]{2}[A-Z0-9]{9}\d))?(?: ([\s\S]*))?$/;
    var nome = t.slice(0, ancore[0] || 0).replace(/\s+/g, " ").trim(), out = [];
    ancore.forEach(function (ini, i) {
      var seg = t.slice(ini, i + 1 < ancore.length ? ancore[i + 1] : t.length), k = seg.trim().split(/\s+/), c = 0;
      var x = { nome: nome, id: k[c++], direzione: k[c++], importo: num(k[c++]), unita: num(k[c++]) };
      x.apertura = iso(k[c]); c += 2; x.chiusura = iso(k[c]); c += 2;
      x.leva = +(String(k[c++]).replace(/^X/, "")) || 1;
      x.spread = num(k[c++]); x.spreadMercato = num(k[c++]); x.profittoUsd = num(k[c++]); x.profittoEur = num(k[c++]);
      x.cambioApertura = num(k[c++]); x.cambioChiusura = num(k[c++]); x.tassoApertura = num(k[c++]); x.tassoChiusura = num(k[c++]);
      x.takeProfit = num(k[c++]); x.stopLoss = num(k[c++]);
      x.copiatoDa = ""; if (k[c] != null && !/^\(?-?\d/.test(k[c]) && k[c] !== "-") x.copiatoDa = k[c++];
      x.overnight = num(k[c++]);
      var resto = TIPI.exec(k.slice(c).join(" ")) || ["", "", "", k.slice(c).join(" ")];
      x.tipo = resto[1]; x.isin = resto[2] || ""; nome = (resto[3] || "").trim();
      x.simbolo = (/\(([^()]+)\)\s*$/.exec(x.nome) || [])[1] || "";
      x.categoria = categoria(x.tipo, x.leva, x.direzione);
      if (x.chiusura) out.push(x);
    });
    return out;
  }

  // attività del conto: «dd-mm-yyyy hh:mm:ss Tipologia [Dettagli] Importo Unità Variazione Patrimonio Saldo ID TipoAsset»
  function leggiAttivita(testi) {
    var t = testi.join("\n").replace(/^(Attività account|Account Activity).*$/gm, "");
    var rec = t.split(/\n(?=\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/), out = [];
    var re = new RegExp("^(\\d{2}-\\d{2}-\\d{4}) (\\d{2}:\\d{2}:\\d{2}) (.*?) (" + RE_NUM + "|-) (" + RE_NUM + "|-) (" + RE_NUM + "|-) (" + RE_NUM + ") (" + RE_NUM + ") (\\d+|-) (\\S.*)$");
    rec.forEach(function (r) {
      var l = r.replace(/\n/g, " ").replace(/\s+/g, " ").trim(), m = re.exec(l); if (!m) return;
      var testo = m[3], tipo = (/^(Profitto\/perdita dell'operazione|Trasferimento al wallet cripto|Commissione overnight|Commissione di prelievo|Richiesta di prelievo|Apri posizione|Deposito|AirDrop|Aggiustamento|Dividendo|Dividend|Interessi|Interest|corp action: \w+|Edit Stop Loss|Avvia copia|Stop Copy|Account balance to mirror|Mirror balance to account|Open Position|Position closed|Profit\/Loss of Trade|Transfer to Crypto Wallet|Overnight fee|Withdraw Request|Withdraw Fee|Deposit|Adjustment)/i.exec(testo) || ["", testo.split(" ")[0]])[1];
      out.push({ data: iso(m[1]), ora: m[2], tipo: tipo, dettagli: testo.slice(tipo.length).trim(), importo: num(m[4]), unita: num(m[5]), variazione: num(m[6]), patrimonio: num(m[7]), saldo: num(m[8]), id: m[9] === "-" ? "" : m[9], tipoAsset: m[10] === "-" ? "" : m[10] });
    });
    return out;
  }

  // dividendi: «data nome netto USD netto EUR aliquota % ritenuta USD ritenuta EUR ID Tipologia ISIN»
  function leggiDividendi(testi) {
    var t = testi.join("\n").replace(/\n/g, " ").replace(/\s+/g, " ");
    var re = new RegExp("(\\d{2}\\/\\d{2}\\/\\d{4}) (.+?) (" + RE_NUM + ") (" + RE_NUM + ") (\\d+(?:\\.\\d+)?) ?% (" + RE_NUM + ") (" + RE_NUM + ") (\\d{6,}) (\\S+) ([A-Z]{2}[A-Z0-9]{9}\\d|-)", "g"), m, out = [];
    while ((m = re.exec(t))) {
      var tipo = m[9];
      out.push({ data: iso(m[1]), nome: m[2].replace(/^.*(?:ISIN|Tipologia) /, "").trim(), nettoUsd: num(m[3]), nettoEur: num(m[4]), aliquota: +m[5], ritenutaUsd: num(m[6]), ritenutaEur: num(m[7]), id: m[8], tipo: tipo, isin: m[10] === "-" ? "" : m[10],
        categoria: /cfd/i.test(tipo) ? "CFD" : /etf/i.test(tipo) ? "ETF" : "Azioni" });
    }
    return out;
  }

  function leggiVoci(testi) {
    var out = [];
    testi.join("\n").split("\n").forEach(function (l) {
      var m = new RegExp("^(.+?) (" + RE_NUM + "|N/A) (" + RE_NUM + "|N/A)$").exec(l.trim());
      if (m && !/^\d/.test(m[1]) && !/(GEN|JAN)[A-Z]* \d{1,2}, \d{4}/i.test(m[1])) out.push({ voce: m[1], usd: num(m[2]), eur: num(m[3]) });
    });
    return out;
  }

  function leggi(pagine) {
    var s = sezioni(pagine);
    var periodo = (/(?:GEN|JAN)[A-Z]* \d{1,2}, \d{4} (?:A|TO|-) [A-Z]{3} \d{1,2}, \d{4}/i.exec(pagine.map(function (p) { return p.text; }).join("\n")) || [""])[0];
    var r = {
      periodo: periodo,
      holdings: s.holdings.map(function (h) { return { data: h.data, righe: leggiHoldings(h.testo.join("\n")) }; }).filter(function (h) { return h.data; }),
      chiuse: leggiChiuse(s.chiuse), attivita: leggiAttivita(s.attivita), dividendi: leggiDividendi(s.dividendi),
      finanziario: leggiVoci(s.finanziario), riepilogo: leggiVoci(s.riepilogo).filter(function (v) { return !/Piazza|Via|Nome utente/i.test(v.voce); })
    };
    if (!r.chiuse.length && !r.attivita.length && !r.holdings.length) throw new Error("Il PDF non sembra un rendiconto eToro («Account statement»): non ci sono le tabelle delle posizioni e dell'attività.");
    return r;
  }

  /* Riepilogo per anno.
     - RT: posizioni chiuse per categoria (Azioni, ETF, CFD, Cripto) per data di chiusura; profitto in euro di eToro.
       I «trasferimenti al wallet cripto» non sono cessioni (eToro non li elenca tra le posizioni chiuse): le cripto passano al wallet
       eToro dello stesso titolare; se ne riportano quantità, valore e costo d'acquisto (importo investito all'apertura) per il wallet di arrivo.
       Commissioni overnight delle posizioni CFD: componente negativa del differenziale; i dividendi CFD sono componente positiva.
     - RM: dividendi di azioni ed ETF incassati senza ritenuta italiana: lordo = netto + ritenuta estera.
     - RW: valore a inizio e fine anno delle posizioni (ultima e prima fotografia disponibile) e saldo liquido del conto. */
  function riepilogo(d, anno) {
    var a = String(anno), dentro = function (g) { return g && g.slice(0, 4) === a; };
    // apertura di ogni posizione (importo investito in USD), per il costo delle cripto trasferite al wallet
    var aperte = {}; d.attivita.forEach(function (x) { if (/^(Apri posizione|Open Position)/i.test(x.tipo) && x.id) aperte[x.id] = x; });
    var cat = {};
    var add = function (k, campo, v) { var c = cat[k] || (cat[k] = { n: 0, profitti: 0, perdite: 0, risultato: 0, importo: 0, overnight: 0, dividendiCfd: 0, posizioni: [] }); c[campo] += v; return c; };
    var trasf = { n: 0, valoreUsd: 0, costoUsd: 0, perCripto: {}, righe: [] };
    d.attivita.filter(function (x) { return dentro(x.data) && /Trasferimento al wallet cripto|Transfer to Crypto Wallet/i.test(x.tipo); }).forEach(function (x) {
      var cr = String(x.dettagli || "").split("/")[0].trim(), ap = aperte[x.id], costo = ap ? ap.importo : null;
      var r = { data: x.data, cripto: cr, unita: x.unita, valoreUsd: x.importo, costoUsd: costo, apertura: ap ? ap.data : null, id: x.id };
      trasf.n++; trasf.valoreUsd += x.importo || 0; trasf.costoUsd += costo || 0; trasf.righe.push(r);
      var z = trasf.perCripto[cr] || (trasf.perCripto[cr] = { unita: 0, valoreUsd: 0, costoUsd: 0, n: 0 }); z.n++; z.unita += x.unita || 0; z.valoreUsd += x.importo || 0; z.costoUsd += costo || 0;
    });
    d.chiuse.filter(function (c) { return dentro(c.chiusura); }).forEach(function (c) {
      var p = c.profittoEur || 0;
      var x = add(c.categoria, "n", 1); x.risultato += p; x.importo += c.importo || 0; if (p >= 0) x.profitti += p; else x.perdite += p; x.posizioni.push(c);
    });
    // overnight e dividendi CFD dell'anno (in USD nell'attività: si convertono con il cambio medio implicito dei profitti in euro dell'anno)
    var cambio = (function () { var u = 0, e = 0; d.chiuse.filter(function (c) { return dentro(c.chiusura) && c.profittoUsd && Math.abs(c.profittoUsd) > 0.5; }).forEach(function (c) { u += Math.abs(c.profittoUsd); e += Math.abs(c.profittoEur || 0); }); return u > 0 ? e / u : null; })();
    var overnight = { CFD: 0, altro: 0 }, airdrop = [], depositi = 0, prelievi = 0, commPrelievo = 0;
    d.attivita.filter(function (x) { return dentro(x.data); }).forEach(function (x) {
      if (/overnight/i.test(x.tipo)) { if (/cfd/i.test(x.tipoAsset)) overnight.CFD += x.importo || 0; else overnight.altro += x.importo || 0; }
      else if (/airdrop/i.test(x.tipo)) airdrop.push(x);
      else if (/^Deposito|^Deposit/i.test(x.tipo)) depositi += x.importo || 0;
      else if (/Richiesta di prelievo|Withdraw Request/i.test(x.tipo)) prelievi += x.importo || 0;
      else if (/Commissione di prelievo|Withdraw Fee/i.test(x.tipo)) commPrelievo += x.importo || 0;
    });
    var div = d.dividendi.filter(function (x) { return dentro(x.data); });
    var divRM = div.filter(function (x) { return x.categoria !== "CFD"; }), divCfd = div.filter(function (x) { return x.categoria === "CFD"; });
    var somma = function (l, k) { return l.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
    var dividendi = { n: divRM.length, nettoEur: somma(divRM, "nettoEur"), ritenutaEur: somma(divRM, "ritenutaEur"), lordoEur: somma(divRM, "nettoEur") + somma(divRM, "ritenutaEur"), righe: divRM,
      cfdNettoEur: somma(divCfd, "nettoEur") };
    if (cat.CFD || divCfd.length || overnight.CFD) {
      var c = cat.CFD || add("CFD", "n", 0);
      c.overnight = cambio ? overnight.CFD * cambio : overnight.CFD; c.dividendiCfd = dividendi.cfdNettoEur;
    }
    // fotografie: fine anno (31/12) e inizio (1/1 o 31/12 dell'anno prima)
    var foto = function (pred) { return d.holdings.filter(pred).sort(function (x, y) { return x.data < y.data ? -1 : 1; }); };
    var fine = foto(function (h) { return h.data === a + "-12-31"; })[0] || null;
    var inizio = foto(function (h) { return h.data === a + "-01-01" || h.data === (anno - 1) + "-12-31"; }).pop() || null;
    var perCat = function (h) { var o = {}; (h ? h.righe : []).forEach(function (r) { var k = r.categoria, z = o[k] || (o[k] = { n: 0, eur: 0, usd: 0, posizioni: [] }); z.n++; z.eur += r.eur || 0; z.usd += r.usd || 0; z.posizioni.push(r); }); return o; };
    // saldo liquido: ultimo «saldo» dell'anno (USD) e saldo medio giornaliero dell'anno
    var mov = d.attivita.filter(function (x) { return x.saldo != null; }), saldoFine = null, saldoInizio = null;
    mov.forEach(function (x) { if (x.data <= a + "-12-31") saldoFine = x.saldo; if (x.data < a + "-01-01") saldoInizio = x.saldo; });
    return {
      anno: anno, cambioMedio: cambio,
      rt: cat, trasferimentiWallet: trasf, airdrop: { n: airdrop.length, usd: somma(airdrop, "importo"), righe: airdrop },
      overnightUsd: overnight, rm: dividendi,
      rw: { dataInizio: inizio && inizio.data, dataFine: fine && fine.data, inizio: perCat(inizio), fine: perCat(fine), saldoInizioUsd: saldoInizio, saldoFineUsd: saldoFine },
      conto: { depositiUsd: depositi, prelieviUsd: prelievi, commissioniPrelievoUsd: commPrelievo }
    };
  }
  function anni(d) {
    var s = {};
    d.chiuse.forEach(function (c) { if (c.chiusura) s[+c.chiusura.slice(0, 4)] = true; });
    d.attivita.forEach(function (x) { if (x.data) s[+x.data.slice(0, 4)] = true; });
    d.holdings.forEach(function (h) { if (h.data) s[+h.data.slice(0, 4)] = true; });
    return Object.keys(s).map(Number).sort();
  }

  /* ---------- quadri del modello Redditi PF (istruzioni del fascicolo 2, modelli 2021-2026) ---------- */
  // codici Stato (elenco del fascicolo 1) per i Paesi più frequenti, dal prefisso dell'ISIN; gli altri vanno indicati a mano
  var STATI = { US: ["Stati Uniti", "069"], CA: ["Canada", "013"], IE: ["Irlanda", "040"], GB: ["Regno Unito", "031"], DE: ["Germania", "094"], FR: ["Francia", "029"], NL: ["Paesi Bassi", "050"], CH: ["Svizzera", "071"], CY: ["Cipro", "101"] };
  var r2 = function (x) { return Math.round((x || 0) * 100) / 100; }, r0 = function (x) { return Math.round(x || 0); };

  /* cambio euro per dollaro alla data: dalla fotografia del portafoglio o dalla posizione chiusa più vicina (euro / dollari) */
  function cambi(d) {
    var punti = [];
    d.holdings.forEach(function (h) { var u = 0, e = 0; h.righe.forEach(function (x) { if (x.usd > 0 && x.eur > 0) { u += x.usd; e += x.eur; } }); if (u > 1) punti.push({ data: h.data, r: e / u }); });
    d.chiuse.forEach(function (c) { if (c.profittoUsd && Math.abs(c.profittoUsd) >= 1 && c.profittoEur) punti.push({ data: c.chiusura, r: c.profittoEur / c.profittoUsd }); });
    return function (data) {
      if (!punti.length) return 0.9;
      var best = punti[0], dist = Infinity, t = Date.parse(data);
      punti.forEach(function (p) { var x = Math.abs(Date.parse(p.data) - t); if (x < dist) { dist = x; best = p; } });
      return best.r;
    };
  }

  /* posizioni detenute nell'anno, una per ID, con valore iniziale e finale in euro e giorni (quadro RW).
     Valore iniziale: fotografia al 1/1 (o al 31/12 precedente), altrimenti importo investito all'apertura.
     Valore finale: fotografia al 31/12, altrimenti valore alla chiusura (importo + profitto) o al trasferimento al wallet. */
  function posizioniAnno(d, anno) {
    var a = String(anno), ini = a + "-01-01", fin = a + "-12-31", cambio = cambi(d), out = [];
    var fotoIni = d.holdings.filter(function (h) { return h.data === ini || h.data === (anno - 1) + "-12-31"; }).pop();
    var fotoFin = d.holdings.filter(function (h) { return h.data === fin; })[0];
    var aperture = {}, uscite = {}, chiuse = {}, foto = {}, tutte = {};
    d.attivita.forEach(function (x) {
      if (/^(Apri posizione|Open Position|AirDrop)/i.test(x.tipo) && x.id && !aperture[x.id]) aperture[x.id] = x;
      if (/Trasferimento al wallet cripto|Transfer to Crypto Wallet/i.test(x.tipo) && x.id) uscite[x.id] = { data: x.data, usd: x.importo };
    });
    d.chiuse.forEach(function (c) { chiuse[c.id] = c; });
    d.holdings.forEach(function (h) { h.righe.forEach(function (x) { foto[x.id] = x; }); });
    [aperture, chiuse, foto].forEach(function (o) { Object.keys(o).forEach(function (id) { tutte[id] = true; }); });
    Object.keys(tutte).forEach(function (id) {
      var c = chiuse[id], ap = aperture[id], u = uscite[id], h = foto[id];
      var hi = fotoIni && fotoIni.righe.filter(function (x) { return x.id === id; })[0], hf = fotoFin && fotoFin.righe.filter(function (x) { return x.id === id; })[0];
      var dataAp = (c && c.apertura) || (ap && ap.data) || (h && h.apertura); if (!dataAp) return;
      var dataCh = (c && c.chiusura) || (u && u.data) || null;
      if (dataAp > fin || (dataCh && dataCh < ini)) return;
      var tipo = c ? c.tipo : h ? h.tipo : ap ? ap.tipoAsset : "", leva = c ? c.leva : h ? h.leva : 1, dir = c ? c.direzione : h ? h.direzione : "Long";
      var cat = categoria(tipo, leva, dir), nome = c ? c.nome : h ? h.asset : ap ? String(ap.dettagli).split("/")[0] : id;
      var investito = c ? c.importo : ap ? ap.importo : h ? (h.tassoApertura || 0) * (h.unita || 0) : 0, nota = [];
      var vi = dataAp >= ini ? investito * cambio(dataAp) : hi ? hi.eur : null;
      if (vi == null) { vi = investito * cambio(ini); nota.push("valore iniziale stimato dal costo: manca la fotografia al 1/1"); }
      var vf;
      if (dataCh && dataCh <= fin) vf = u ? u.usd * cambio(dataCh) : (c.profittoEur || 0) + (c.importo || 0) * cambio(dataCh);
      else if (hf) vf = hf.eur;
      else { vf = investito * cambio(fin); nota.push("valore finale stimato dal costo: manca la fotografia al 31/12"); }
      var dal = dataAp > ini ? dataAp : ini, al = dataCh && dataCh <= fin ? dataCh : fin;
      out.push({ id: id, nome: nome, categoria: cat, isin: (c && c.isin) || (h && h.isin) || "", dal: dal, al: al, giorni: Math.round((Date.parse(al) - Date.parse(dal)) / 86400000) + 1, valoreIniziale: vi, valoreFinale: vf, nota: nota.join("; ") });
    });
    return out;
  }

  /* quadri per l'anno: RT (sezione al 26% per azioni e CFD; cripto secondo il regime dell'anno), RM (dividendi), RW (righe per tipo di bene).
     opz: { sogliaValute: true se la giacenza in valuta ha superato 51.645,69 € per 7 giorni lavorativi (cripto fino al 2022),
            minusPrecedenti: minusvalenze riportabili della sezione al 26% } */
  function quadri(d, anno, opz) {
    var o = opz || {}, r = riepilogo(d, anno), cambio = cambi(d), out = { anno: anno, modello: "Redditi PF " + (anno + 1), rt: [], rm: [], rw: [], f24: [], note: [] };
    var add = function (rigo, col, desc, v) { out.rt.push({ rigo: rigo, col: col, descrizione: desc, valore: v }); };
    // RT: corrispettivo = importo investito + profitto (in euro), costo = importo investito al cambio implicito della posizione
    var tot = { corr: 0, costo: 0, n: 0 }, cripto = { corr: 0, costo: 0, n: 0 };
    d.chiuse.filter(function (c) { return c.chiusura && c.chiusura.slice(0, 4) === String(anno); }).forEach(function (c) {
      var rr = c.profittoUsd && Math.abs(c.profittoUsd) >= 0.5 && c.profittoEur ? c.profittoEur / c.profittoUsd : cambio(c.chiusura);
      var costo = (c.importo || 0) * rr, z = c.categoria === "Cripto" ? cripto : tot;
      z.corr += costo + (c.profittoEur || 0); z.costo += costo; z.n++;
    });
    var cfd = r.rt.CFD; if (cfd) { tot.costo -= cfd.overnight; tot.corr += cfd.dividendiCfd; }
    var criptoInValute = anno <= 2022;
    if (criptoInValute && o.sogliaValute) { tot.corr += cripto.corr; tot.costo += cripto.costo; }
    var diff = r0(tot.corr) - r0(tot.costo), plus = diff > 0 ? diff : 0, minus = diff < 0 ? -diff : 0, mp = Math.min(r0(o.minusPrecedenti), plus), base = plus - mp, imp = r0(base * 0.26);
    out.corrispettivi = r0(tot.corr); out.costi = r0(tot.costo); out.minusUsate = mp;
    if (tot.n) {
      if (anno <= 2023) {
        out.sezione26 = "Quadro RT, sezione " + (anno === 2023 ? "II-A" : "II") + " · redditi diversi al 26%";
        add("RT21", "", "Totale dei corrispettivi", r0(tot.corr)); add("RT22", "3", "Totale dei costi (compresi gli oneri overnight dei CFD)", r0(tot.costo));
        add("RT23", "1", "Minusvalenza", minus); add("RT23", "2", "Plusvalenza", plus);
        add("RT24", "", "Minusvalenze degli anni precedenti (da RT93)", mp);
        add("RT26", "", "Imponibile", base); add("RT27", "", "Imposta sostitutiva 26%", imp); add("RT29", "", "Imposta dovuta", imp);
        if (minus) add("RT93", "5", "Minusvalenza dell'anno da riportare (4 anni)", minus);
      } else {
        out.sezione26 = "Quadro RT, sezione II-A · redditi diversi al 26%";
        add("RT11", "1", "Totale dei corrispettivi", r0(tot.corr)); add("RT11", "2", "Totale dei costi (compresi gli oneri overnight dei CFD)", r0(tot.costo));
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
    if (tot.n || cripto.n) out.note.push("Corrispettivi e costi in euro dal profitto in euro di eToro e dall'importo investito al cambio implicito della posizione; a rigore ciascuno va al cambio del giorno dell'operazione (art. 9 c. 2 TUIR).");

    // RM: dividendi di azioni ed ETF senza ritenuta italiana, al lordo della ritenuta estera, per Stato (dall'ISIN)
    var perStato = {};
    r.rm.righe.forEach(function (x) { var k = (x.isin || "").slice(0, 2) || "??", z = perStato[k] || (perStato[k] = { lordo: 0, ritenuta: 0, n: 0 }); z.n++; z.lordo += (x.nettoEur || 0) + (x.ritenutaEur || 0); z.ritenuta += x.ritenutaEur || 0; });
    out.rmRigo = anno <= 2023 ? "RM12" : "RM31"; out.rmColImposta = anno <= 2023 ? "6" : "8";
    Object.keys(perStato).sort().forEach(function (k) {
      var z = perStato[k], st = STATI[k];
      out.rm.push({ rigo: out.rmRigo, lettera: "H", stato: st ? st[1] : "", statoNome: st ? st[0] : "ISIN " + k + ": codice Stato da indicare", lordoEsatto: r2(z.lordo), lordo: r0(z.lordo), imposta: r0(r0(z.lordo) * 0.26), ritenutaEstera: r2(z.ritenuta), n: z.n });
    });
    var impRM = out.rm.reduce(function (s, x) { return s + x.imposta; }, 0);
    if (impRM) out.f24.push({ codice: "1242", descrizione: "Imposta sostitutiva sui redditi di capitale di fonte estera (quadro RM)", importo: impRM });
    if (out.rm.length) out.note.push("Dividendi esteri: quadro RM, rigo " + out.rmRigo + ", lettera H, al lordo della ritenuta estera (26%, senza credito per la ritenuta subita all'estero); in unità di euro." + (out.rm.every(function (x) { return !x.lordo; }) ? " Arrotondati all'euro valgono zero." : ""));

    // RW: una riga per tipo di bene, con valori e giorni dalle posizioni dell'anno
    var p = posizioniAnno(d, anno), gruppi = {}, bis = anno % 4 === 0 ? 366 : 365;
    p.forEach(function (x) {
      var codice = x.categoria === "Cripto" ? (anno >= 2023 ? "21" : "14") : x.categoria === "Azioni" ? "2" : x.categoria === "ETF" ? "4" : x.categoria === "CFD" ? "9" : "20";
      var g = gruppi[codice] || (gruppi[codice] = { codice: codice, n: 0, valoreIniziale: 0, valoreFinale: 0, imposta: 0, stimati: 0, ponderati: 0 });
      g.n++; g.valoreIniziale += x.valoreIniziale; g.valoreFinale += x.valoreFinale; g.ponderati += x.giorni * x.valoreFinale; if (x.nota) g.stimati++;
      g.imposta += x.valoreFinale * 0.002 * x.giorni / bis;
    });
    var ivafe = 0, ivaca = 0, DESC = { "21": "Cripto-attività su eToro", "14": "Cripto-attività su eToro", "2": "Azioni presso eToro", "4": "ETF presso eToro", "9": "Contratti derivati (CFD) presso eToro", "20": "Altri strumenti presso eToro" };
    Object.keys(gruppi).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var g = gruppi[k], cr = k === "21" || k === "14";
      var riga = { codice: k, descrizione: DESC[k], stato: cr ? "" : "101", n: g.n, valoreIniziale: r0(g.valoreIniziale), valoreFinale: r0(g.valoreFinale), giorni: Math.min(bis, Math.round(g.ponderati / (g.valoreFinale || 1)) || 0), stimati: g.stimati, ivafe: 0, ivaca: 0 };
      if (k === "21") { riga.ivaca = r2(g.imposta); ivaca += g.imposta; } else if (!cr) { riga.ivafe = r2(g.imposta); ivafe += g.imposta; }
      out.rw.push(riga);
    });
    if (r.rw.saldoFineUsd != null && (r.rw.saldoFineUsd > 0 || r.rw.saldoInizioUsd > 0)) out.rw.push({ codice: "1", descrizione: "Liquidità sul conto eToro (USD)", stato: "101", n: 1, valoreIniziale: r0((r.rw.saldoInizioUsd || 0) * cambio(anno + "-01-01")), valoreFinale: r0((r.rw.saldoFineUsd || 0) * cambio(anno + "-12-31")), giorni: bis, ivafe: 0, ivaca: 0 });
    out.ivafe = r2(ivafe); out.ivaca = r2(ivaca);
    out.colonne = anno >= 2023 ? "IVAFE col. 29-30 (totale RW6, codice F24 4043); IVACA col. 33-34 (totale RW8, codice F24 1727)" : "IVAFE col. 11-15 (totale RW6, codice F24 4043)";
    if (r0(ivafe) >= 12) out.f24.push({ codice: "4043", descrizione: "IVAFE saldo (RW6)", importo: r0(ivafe) });
    else if (ivafe > 0) out.note.push("IVAFE di " + r2(ivafe) + " €: sotto i 12 € non si versa.");
    if (r0(ivaca) >= 12) out.f24.push({ codice: "1727", descrizione: "IVACA saldo (RW8)", importo: r0(ivaca) });
    else if (ivaca > 0) out.note.push("IVACA sulle cripto eToro di " + r2(ivaca) + " €: va sommata a quella degli altri wallet (RW8); sotto i 12 € complessivi non si versa.");
    if (gruppi["14"]) out.note.push("Fino al 2022 le cripto vanno nel quadro RW con il codice 14, senza Stato estero e senza IVAFE.");
    if (gruppi["9"]) out.note.push("CFD nel quadro RW (codice 9): l'Agenzia non indica il criterio di valore; qui il margine investito o il valore alla chiusura. L'IVAFE sui CFD è prudenziale.");
    if (out.rw.some(function (x) { return x.codice === "1"; })) out.note.push("Liquidità sul conto eToro (codice 1): l'IVAFE fissa di 34,20 € vale per i conti bancari con giacenza media oltre 5.000 €; per eToro, intermediario non bancario, il trattamento è da valutare.");
    if (p.some(function (x) { return x.nota; })) out.note.push("Alcuni valori del quadro RW sono stimati dal costo perché il rendiconto non contiene la fotografia del portafoglio a inizio o fine anno: chiedere a eToro il rendiconto a quella data.");
    out.posizioni = p;
    return out;
  }

  /* quadri di tutti gli anni, con le minusvalenze della sezione al 26% riportate per quattro anni */
  function quadriTutti(d, opz) {
    var o = opz || {}, riporti = [], out = {};
    anni(d).forEach(function (a) {
      riporti = riporti.filter(function (m) { return a - m.anno <= 4 && m.residuo > 0; });
      var disp = riporti.reduce(function (s, m) { return s + m.residuo; }, 0);
      var q = quadri(d, a, { minusPrecedenti: disp, sogliaValute: !!(o.sogliaValute && o.sogliaValute[a]) });
      var usate = q.minusUsate; riporti.forEach(function (m) { var u = Math.min(m.residuo, usate); m.residuo -= u; usate -= u; });
      if (q.minusvalenzaDaRiportare) riporti.push({ anno: a, residuo: q.minusvalenzaDaRiportare });
      out[a] = q;
    });
    return out;
  }

  return { leggi: leggi, riepilogo: riepilogo, quadri: quadri, quadriTutti: quadriTutti, posizioniAnno: posizioniAnno, anni: anni, categoria: categoria, num: num };
});
