/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · lettura del rendiconto eToro («Account statement» in PDF, versione italiana o inglese) e riepilogo per anno
   dei dati letti: posizioni chiuse per categoria, trasferimenti al wallet cripto, dividendi, airdrop, portafoglio e saldo.
   I dati si portano nella forma comune dei broker esteri (normalizza) e i quadri RT (sezione al 26%), RM (dividendi esteri)
   e RW (con IVAFE e IVACA) di ogni anno si calcolano con il motore comune (estero.js).
   Privacy: dal PDF si leggono solo tabelle numeriche; intestazione, nome utente e indirizzo non vengono conservati. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./estero.js"));
  else root.KoinlyEtoro = factory(root.KoinlyEstero);
})(typeof self !== "undefined" ? self : this, function (X) {
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

  /* ---------- forma comune dei broker esteri e quadri del modello Redditi PF (motore in estero.js) ---------- */
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

  /* dati del rendiconto nella forma comune dei broker esteri, in euro.
     - Operazioni: posizioni chiuse; corrispettivo = importo investito + profitto (in euro), costo = importo investito al cambio implicito
       della posizione (profitto in euro / profitto in dollari) o, se manca, al cambio del giorno di chiusura. Commissioni overnight
       e dividendi su CFD dell'anno sono operazioni accessorie (oneri e componenti positive del differenziale).
     - Redditi: dividendi di azioni ed ETF, lettera H, al lordo della ritenuta estera.
     - Posizioni: quelle detenute in ogni anno (posizioniAnno) e il saldo liquido del conto in dollari. */
  function normalizza(d) {
    var cambio = cambi(d), aa = anni(d), out = { broker: "eToro", statoRW: "101", anni: aa, operazioni: [], redditi: [], posizioni: [],
      notaImporti: "Corrispettivi e costi in euro dal profitto in euro di eToro e dall'importo investito al cambio implicito della posizione; a rigore ciascuno va al cambio del giorno dell'operazione (art. 9 c. 2 TUIR)." };
    d.chiuse.filter(function (c) { return c.chiusura; }).forEach(function (c) {
      var rr = c.profittoUsd && Math.abs(c.profittoUsd) >= 0.5 && c.profittoEur ? c.profittoEur / c.profittoUsd : cambio(c.chiusura);
      var costo = (c.importo || 0) * rr;
      out.operazioni.push({ data: c.chiusura, categoria: c.categoria, nome: c.nome, isin: c.isin || "", corrispettivo: costo + (c.profittoEur || 0), costo: costo });
    });
    aa.forEach(function (anno) {
      var r = riepilogo(d, anno), cfd = r.rt.CFD, fine = anno + "-12-31";
      if (cfd) {
        if (cfd.overnight) out.operazioni.push({ data: fine, categoria: "CFD", nome: "Commissioni overnight", corrispettivo: 0, costo: -cfd.overnight, accessoria: true });
        if (cfd.dividendiCfd) out.operazioni.push({ data: fine, categoria: "CFD", nome: "Dividendi su CFD", corrispettivo: cfd.dividendiCfd, costo: 0, accessoria: true });
      }
      r.rm.righe.forEach(function (x) { out.redditi.push({ data: x.data, lettera: "H", nome: x.nome, isin: x.isin || "", stato: "", lordo: (x.nettoEur || 0) + (x.ritenutaEur || 0), ritenuta: x.ritenutaEur || 0 }); });
      posizioniAnno(d, anno).forEach(function (x) { out.posizioni.push(Object.assign({ anno: anno }, x)); });
      if (r.rw.saldoFineUsd != null && (r.rw.saldoFineUsd > 0 || r.rw.saldoInizioUsd > 0))
        out.posizioni.push({ anno: anno, nome: "Liquidità sul conto eToro (USD)", categoria: "Liquidità", dal: anno + "-01-01", al: fine, giorni: anno % 4 === 0 ? 366 : 365,
          valoreIniziale: Math.round((r.rw.saldoInizioUsd || 0) * cambio(anno + "-01-01")), valoreFinale: Math.round((r.rw.saldoFineUsd || 0) * cambio(fine)) });
    });
    return out;
  }
  /* quadri dell'anno e di tutti gli anni (con le minusvalenze riportate per quattro anni), dal motore comune */
  function quadri(d, anno, opz) { return X.quadri(normalizza(d), anno, opz); }
  function quadriTutti(d, opz) { return X.quadriTutti(normalizza(d), opz); }

  return { leggi: leggi, riepilogo: riepilogo, normalizza: normalizza, quadri: quadri, quadriTutti: quadriTutti, posizioniAnno: posizioniAnno, anni: anni, categoria: categoria, num: num };
});
