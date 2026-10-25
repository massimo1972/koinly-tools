/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · lettura dei report Koinly (Complete Tax Report in PDF, End of Year Holdings in CSV).
   Restituisce anno, riepilogo plusvalenze, redditi e saldi di fine anno. Funziona nel browser e in Node per le prove.
   I report possono essere in italiano o in inglese e con numeri in formato 1,234.56 oppure 1.234,56. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyLettura = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FIAT = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "TRY", "BRL", "AED", "HKD", "SGD"];
  var STABLE = ["USDT", "USDC", "DAI", "EURC", "EURT", "BUSD", "TUSD", "USDP", "FDUSD", "PYUSD", "USDE", "EURS", "GUSD", "LUSD", "FRAX", "USDD", "EUROC"];

  /* Formato dei numeri del documento: "it" se compare un importo come 1.234,56 o 12,34 €, altrimenti "en" */
  function formatoNumeri(testo) {
    if (/\d,\d{2}\s?€/.test(testo) || /€\s?\d{1,3}(\.\d{3})+,\d{2}\b/.test(testo)) return "it";
    if (/€\s?\d[\d,]*\.\d{2}\b/.test(testo)) return "en";
    // senza simbolo dell'euro: le quantità Koinly hanno 8 decimali (1,00000000 in italiano, 1.00000000 in inglese)
    var it = (testo.match(/\b\d+,\d{8}\b/g) || []).length, en = (testo.match(/\b\d+\.\d{8}\b/g) || []).length;
    return it > en ? "it" : "en";
  }
  function numero(s, fmt) {
    if (s == null) return null;
    var t = String(s).replace(/[€\s]|EUR/g, "").replace(/^\((.*)\)$/, "-$1");
    if (t === "" || t === "-" || t === "–") return null;
    if (fmt === "it") t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  /* stessa cifra come testo decimale esatto ("1234.56780000"), per i calcoli in aritmetica esatta */
  function numeroTesto(s, fmt) {
    var t = String(s == null ? "" : s).replace(/[€\s]|EUR/g, "");
    if (!/\d/.test(t)) return null;
    t = fmt === "it" ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
  }
  var NUM = "-?€?\\s?\\(?-?[\\d.,]+\\)?\\s?€?";

  /* "HBAR (Hedera Hashgraph)" → "HBAR"; i nomi dei token spam possono contenere spazi: si toglie solo la descrizione tra parentesi finale */
  function simbolo(nomeAttivo) { var t = String(nomeAttivo).trim(), m = /^(.*?)\s*\([^()]*\)?\s*$/.exec(t); return (m && m[1] ? m[1] : t).toUpperCase(); }
  function tipoAttivo(sym) { return FIAT.indexOf(sym) >= 0 ? "fiat" : STABLE.indexOf(sym) >= 0 ? "stablecoin" : "cripto"; }

  /* riga di saldo: "HBAR (Hedera Hashgraph) 244,564.677 18,068.65 19,132.38 @ €0.08 per HBAR" */
  var RIGA_SALDO = new RegExp("^(.+?)\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+(@.*)$");
  var RIGA_TOTALE = /^(Totale|Total)\b\s+[-–]?\s*([\d.,€\s]+?)\s+([\d.,€\s]+?)(\s+[-–])?\s*$/i;

  function leggiSaldi(righe, fmt) {
    var saldi = [], totale = null;
    righe.forEach(function (r) {
      var t = RIGA_TOTALE.exec(r);
      if (t) { totale = { costo: numero(t[2], fmt), valore: numero(t[3], fmt) }; return; }
      var m = RIGA_SALDO.exec(r);
      if (!m) return;
      var sym = simbolo(m[1]);
      saldi.push({ attivo: m[1].trim(), simbolo: sym, tipo: tipoAttivo(sym), quantita: numero(m[2], fmt), quantitaTesto: numeroTesto(m[2], fmt), costo: numero(m[3], fmt), valore: numero(m[4], fmt), descrizione: m[5] });
    });
    return { saldi: saldi, totale: totale };
  }

  function annoDaTesto(testo) {
    var m = /(?:Periodo|Period)[:\s]+(.+)/i.exec(testo);
    var periodo = m ? m[1].trim() : null;
    var anni = periodo ? periodo.match(/\b(20\d{2})\b/g) || [] : [];
    var anno = anni.length ? +anni[anni.length - 1] : null;
    if (!anno) { var a = /(?:ANNO FISCALE|TAX YEAR)\s+(20\d{2})/i.exec(testo); if (a) anno = +a[1]; }
    var annoSolare = periodo ? anni.length === 2 && anni[0] === anni[1] && /(1 gen|jan 1|1 jan|01\/01)/i.test(periodo) && /(31 dic|dec 31|31 dec|31\/12)/i.test(periodo) : !!anno;
    return { anno: anno, periodo: periodo, annoSolare: annoSolare };
  }

  /* importo che segue un'etichetta nella stessa riga */
  function importoDopo(testo, etichette, fmt) {
    for (var i = 0; i < etichette.length; i++) {
      var re = new RegExp("(?:^|\\n)\\s*" + etichette[i] + "\\s+(" + NUM + ")", "i");
      var m = re.exec(testo);
      if (m) return numero(m[1], fmt);
    }
    return null;
  }

  var VOCI_REDDITO = [["Airdrop", "airdrop"], ["Fork", "fork"], ["Mining", "mining"], ["Reward", "reward"], ["Salary", "salary"], ["Lending interest", "lendingInterest"], ["Other income", "otherIncome"], ["Staking", "staking"]];

  function leggiPdf(pagine) {
    var testo = pagine.map(function (p) { return p.text; }).join("\n");
    var fmt = formatoNumeri(testo);
    var a = annoDaTesto(testo);
    var plus = {
      cessioni: importoDopo(testo, ["Numero di cessioni", "Number of disposals"], "en"),
      ricavato: importoDopo(testo, ["Il ricavato delle vendite", "Disposal proceeds", "Proceeds"], fmt),
      costi: importoDopo(testo, ["Costi di acquisizione", "Cost basis", "Costs"], fmt),
      profitti: importoDopo(testo, ["Profitti, prima delle perdite", "Gains before losses", "Gains"], fmt),
      perdite: importoDopo(testo, ["Perdite", "Losses"], fmt),
      netto: importoDopo(testo, ["Ricavi netti", "Net gains"], fmt)
    };
    var redditi = { voci: {}, totale: 0 };
    VOCI_REDDITO.forEach(function (v) { var x = importoDopo(testo, [v[0]], fmt); if (x != null) { redditi.voci[v[1]] = x; redditi.totale += x; } });
    // saldi: dalla sezione "Saldi di fine anno" / "End of year balances" fino alla riga del totale
    var righe = testo.split("\n"), dentro = false, sez = [];
    for (var i = 0; i < righe.length; i++) {
      var r = righe[i].trim();
      if (!dentro && /^(Saldi di fine anno|End of year balances|End of Year Holdings)\s*$/i.test(r)) { dentro = true; continue; }
      if (dentro) { sez.push(r); if (RIGA_TOTALE.test(r)) break; }
    }
    var s = leggiSaldi(sez, fmt);
    return controlli({ fonte: "pdf", formato: fmt, anno: a.anno, periodo: a.periodo, annoSolare: a.annoSolare, plusvalenze: plus, redditi: redditi, saldi: s.saldi, totaleReport: s.totale });
  }

  /* CSV con virgolette (Koinly: "1,234.56") */
  function righeCsv(testo) {
    var out = [], riga = [], campo = "", q = false;
    for (var i = 0; i < testo.length; i++) {
      var c = testo[i];
      if (q) { if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
      else if (c === '"') q = true;
      else if (c === ",") { riga.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && testo[i + 1] === "\n") i++; riga.push(campo); out.push(riga); riga = []; campo = ""; }
      else campo += c;
    }
    if (campo || riga.length) { riga.push(campo); out.push(riga); }
    return out;
  }
  function leggiCsv(testo) {
    var tab = righeCsv(testo.replace(/^﻿/, ""));
    var intest = (tab[0] || []).join(" ");
    // "Saldi al 31/12/2023 23:59" oppure "Saldi al 2025-01-01 00:00": report di fine o di inizio anno
    var d = /(\d{2})\/(\d{2})\/(20\d{2})/.exec(intest), iso = /(20\d{2})-(\d{2})-(\d{2})/.exec(intest);
    if (!d && iso) d = [iso[3] + "/" + iso[2] + "/" + iso[1], iso[3], iso[2], iso[1]];
    var fineAnno = d ? d[1] === "31" && d[2] === "12" : null;
    var inizioAnno = d ? d[1] === "01" && d[2] === "01" : null;
    var iH = tab.findIndex(function (r) { return /^(Attivo|Asset)$/i.test((r[0] || "").trim()); });
    if (iH < 0) return { errore: "Il CSV non sembra un report di saldi Koinly (manca la colonna Attivo/Asset)." };
    var fmt = tab.slice(iH + 1).some(function (r) { return /^\d{1,3}(\.\d{3})*,\d+$/.test((r[2] || "").trim()); }) ? "it" : "en";
    var righe = tab.slice(iH + 1).filter(function (r) { return r.length >= 4 && r[0].trim(); }).map(function (r) {
      return r[0].trim() + " " + r[1].trim() + " " + r[2].trim() + " " + r[3].trim() + " " + (r[4] && r[4].trim() !== "-" ? r[4].trim() : "@");
    });
    // la riga del totale ha "-" al posto della quantità
    var totale = null;
    tab.slice(iH + 1).forEach(function (r) { if (/^(Totale|Total)$/i.test((r[0] || "").trim())) totale = { costo: numero(r[2], fmt), valore: numero(r[3], fmt) }; });
    var s = leggiSaldi(righe.filter(function (x) { return !/^(Totale|Total)\b/i.test(x); }), fmt);
    return controlli({ fonte: "csv", formato: fmt, anno: d ? +d[3] : null, periodo: intest.trim(), annoSolare: fineAnno || inizioAnno, dataSaldi: d ? d[0] : null, fineAnno: fineAnno, inizioAnno: inizioAnno,
      tipoSaldi: fineAnno ? "fine" : inizioAnno ? "inizio" : null,
      plusvalenze: null, redditi: null, saldi: s.saldi, totaleReport: totale });
  }

  /* somme e verifiche di quadratura */
  function controlli(r) {
    var somma = function (f) { return r.saldi.reduce(function (a, x) { return a + (f(x) ? x.valore || 0 : 0); }, 0); };
    r.valoreCripto = somma(function (x) { return x.tipo !== "fiat"; });
    r.valoreFiat = somma(function (x) { return x.tipo === "fiat"; });
    r.valoreTotale = r.valoreCripto + r.valoreFiat;
    r.avvisi = [];
    if (!r.anno) r.avvisi.push("Anno del report non trovato: indicarlo a mano.");
    if (r.annoSolare === false) r.avvisi.push(r.fonte === "csv" ? "Il CSV riporta i saldi al " + (r.dataSaldi || "(data sconosciuta)") + ", né al 1° gennaio né al 31 dicembre." : "Il periodo del report non è un anno solare intero (" + r.periodo + "): i saldi potrebbero non essere quelli al 31/12.");
    if (!r.saldi.length) r.avvisi.push("Nessun saldo di fine anno trovato nel documento.");
    if (r.totaleReport && r.totaleReport.valore != null && Math.abs(r.totaleReport.valore - r.valoreTotale) > Math.max(2, r.totaleReport.valore * 0.001))
      r.avvisi.push("La somma dei saldi letti (" + r.valoreTotale.toFixed(2) + " €) non coincide con il totale del report (" + r.totaleReport.valore.toFixed(2) + " €): controllare righe mancanti.");
    if (r.valoreFiat > 0) r.avvisi.push("Il report contiene saldi in valuta tradizionale (" + r.saldi.filter(function (x) { return x.tipo === "fiat"; }).map(function (x) { return x.simbolo; }).join(", ") + "): sono esclusi dal valore delle cripto-attività.");
    if (r.plusvalenze && r.plusvalenze.netto == null) r.avvisi.push("Riepilogo plusvalenze non trovato: inserire a mano l'importo per l'RT.");
    return r;
  }

  /* Elenco delle cessioni del Complete tax report («Transazioni di plusvalenze» / «Capital gains transactions»):
     una riga per strato ceduto: data vendita, data acquisto, attivo, quantità, costo, ricavo, plusvalenza, note e wallet.
     Le righe dello stesso attivo con la stessa data e ora di vendita formano una cessione. Le date sono nel fuso indicato dal report. */
  var RIGA_CESSIONE = new RegExp("^(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}:\\d{2})\\s+(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}:\\d{2})\\s+(\\S+)\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")\\s*(.*)$");
  function leggiCessioniPdf(pagine) {
    var testo = pagine.map(function (p) { return p.text; }).join("\n"), fmt = formatoNumeri(testo), a = annoDaTesto(testo);
    var fuso = /Europe\/Rome/.test(testo) || /ANNO FISCALE \d{4}-12-31 23:00:00/.test(testo) ? "Europe/Rome" : "UTC";
    var iso = function (d) { return d.slice(6, 10) + "-" + d.slice(3, 5) + "-" + d.slice(0, 2); };
    var perCessione = {}, ordine = [], righe = 0;
    testo.split("\n").forEach(function (r) {
      var m = RIGA_CESSIONE.exec(r.trim()); if (!m) return;
      righe++;
      var k = m[1] + " " + m[2] + "|" + m[5].toUpperCase();
      var c = perCessione[k];
      if (!c) { c = perCessione[k] = { data: iso(m[1]), ora: m[2], cripto: m[5].toUpperCase(), quantita: 0, costo: 0, ricavo: 0, risultato: 0, strati: 0, wallet: "", note: "" }; ordine.push(k); }
      c.quantita += numero(m[6], fmt) || 0; c.costo += numero(m[7], fmt) || 0; c.ricavo += numero(m[8], fmt) || 0; c.risultato += numero(m[9], fmt) || 0; c.strati++;
      var resto = (m[10] || "").trim(); if (resto && !c.wallet) c.wallet = resto;
    });
    return { periodo: a.periodo, anno: a.anno, annoSolare: a.annoSolare, fuso: fuso, righe: righe, cessioni: ordine.map(function (k) { return perCessione[k]; }) };
  }

  return { leggiPdf: leggiPdf, leggiCessioniPdf: leggiCessioniPdf, leggiCsv: leggiCsv, numero: numero, formatoNumeri: formatoNumeri, tipoAttivo: tipoAttivo };
});
