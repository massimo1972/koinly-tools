/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · lettura anonimizzata degli estratti conto bancari (testo dei PDF).
   Privacy: di ogni riga si conservano SOLO data, importo, segno e il nome dell'exchange riconosciuto.
   Le righe che non riguardano cripto-attività sono scartate alla lettura (se ne conta solo il numero);
   anche nelle righe tenute il testo originale (nomi, IBAN, indirizzi, causali) non viene mai conservato né mostrato. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyBanca = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // controparti riconosciute: nome mostrato e parole da cercare (in minuscolo) nella descrizione del movimento
  var CONTROPARTI = [
    ["Binance", /binance/], ["Coinbase", /coinbase/], ["Kraken", /kraken|payward/], ["Bitpanda", /bitpanda/], ["Young Platform", /young\s?platform|young plat/],
    ["Nexo", /\bnexo\b/], ["Crypto.com", /crypto\.com|foris dax|cro card/], ["Bybit", /bybit/], ["Bitstamp", /bitstamp/], ["Bitvavo", /bitvavo/],
    ["Relai", /\brelai\b/], ["Conio", /\bconio\b/], ["The Rock Trading", /the ?rock ?trading/], ["Bitfinex", /bitfinex|ifinex/], ["KuCoin", /kucoin/],
    ["OKX", /\bokx\b|okcoin/], ["Bitget", /bitget/], ["Gate.io", /gate\.io/], ["MEXC", /\bmexc\b/], ["Revolut (cripto)", /revolut.{0,20}(crypto|cripto|bitcoin)/],
    ["MoonPay", /moonpay/], ["Ramp", /ramp network|rampnetwork/], ["Paybis", /paybis/], ["Banxa", /banxa/], ["Wirex", /wirex/], ["SwissBorg", /swissborg/],
    ["Uphold", /uphold/], ["Bit2Me", /bit2me/], ["eToro", /etoro/], ["Paymium", /paymium/], ["Bitonic", /bitonic/], ["Strike", /\bstrike\b/],
    ["Cripto (generico)", /\b(crypto|cripto|bitcoin|btc|ethereum|usdt|exchange cripto)\b/]
  ];
  var MESI = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
  var USCITA = /(bonifico (a favore|disposto|verso|in uscita)|pagamento|addebito|acquisto|prelievo|disposizione|giroconto a|sepa direct debit|carta)/i;
  var ENTRATA = /(bonifico (da|a vostro favore|ricevuto|in entrata)|accredito|versamento|ordinante|incasso|rimborso|giroconto da)/i;

  function controparte(testo) {
    var t = testo.toLowerCase();
    for (var i = 0; i < CONTROPARTI.length; i++) if (CONTROPARTI[i][1].test(t)) return CONTROPARTI[i][0];
    return null;
  }
  function data(testo) {
    var m = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/.exec(testo);
    if (m) { var a = +m[3]; if (a < 100) a += 2000; return a + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2); }
    m = /\b(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+(\d{4})\b/i.exec(testo);
    if (m) return m[3] + "-" + ("0" + MESI[m[2].toLowerCase()]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return null;
  }
  /* importi nella riga: formato italiano 1.234,56 o inglese 1,234.56, con segno o parentesi */
  function importi(testo) {
    var out = [], re = /(^|[\s€(])([+\-−]?)\s?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(?=\s|€|\)|$)/g, m;
    while ((m = re.exec(testo))) {
      var s = m[3], v = /,\d{2}$/.test(s) ? parseFloat(s.replace(/[.\s]/g, "").replace(",", ".")) : parseFloat(s.replace(/,/g, ""));
      if (isFinite(v)) out.push({ v: v, segno: m[2] === "-" || m[2] === "−" ? -1 : m[2] === "+" ? 1 : 0 });
    }
    return out;
  }

  /* pagine: [{ text }] dal PDF (comune/pdftext.js). Restituisce solo i movimenti con exchange, anonimizzati. */
  function leggi(pagine, nomeFile) {
    var righe = [], scartate = 0, lette = 0;
    pagine.forEach(function (p) {
      // una riga con la data ma senza importo prosegue sulla riga successiva (descrizioni lunghe che vanno a capo)
      var linee = String(p.text || "").split("\n"), unite = [];
      for (var i = 0; i < linee.length; i++) {
        var l = linee[i];
        while (data(l) && !importi(l.replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ")).length && i + 1 < linee.length && !data(linee[i + 1])) l += " " + linee[++i];
        unite.push(l);
      }
      unite.forEach(function (riga) {
        var d = data(riga); if (!d) return;
        var imp = importi(riga.replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ")); if (!imp.length) return;
        lette++;
        var cp = controparte(riga);
        if (!cp) { scartate++; return; }
        // il primo importo della riga è quello del movimento (i successivi sono di solito il saldo)
        var x = imp[0], segno = x.segno || (ENTRATA.test(riga) ? 1 : USCITA.test(riga) ? -1 : -1);
        righe.push({ data: d, importo: x.v, segno: segno, controparte: cp, descrizione: (segno > 0 ? "accredito da " : "addebito verso ") + cp });
        // il testo originale della riga NON viene conservato
      });
    });
    righe.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return { file: nomeFile ? "estratto conto " + (nomeFile.match(/(20\d{2})/) || ["", ""])[1] : "estratto conto", movimenti: righe, righeLette: lette, righeScartate: scartate };
  }

  /* riscontro con i movimenti in valuta di Koinly sugli exchange (versamenti e prelievi): importo uguale (±1% o ±2 €)
     e date entro 7 giorni. movKoinly: [{ data, intermediario, verso: "versamento"|"prelievo", importo }] */
  function riscontra(banca, movKoinly) {
    var usati = {};
    banca.forEach(function (b) {
      var best = null;
      movKoinly.forEach(function (k, i) {
        if (usati[i]) return;
        if ((b.segno < 0) !== (k.verso === "versamento" || k.verso === "acquisto")) return;
        var tol = Math.max(2, k.importo * 0.01), gg = Math.abs((Date.parse(b.data) - Date.parse(k.data)) / 86400000);
        if (Math.abs(k.importo - b.importo) > tol || gg > 7) return;
        if (!best || gg < best.gg) best = { i: i, gg: gg };
      });
      if (best) { usati[best.i] = true; b.riscontro = movKoinly[best.i]; }
    });
    var nonInBanca = movKoinly.filter(function (k, i) { return !usati[i]; });
    return { riscontrati: banca.filter(function (b) { return b.riscontro; }).length, senzaRiscontro: banca.filter(function (b) { return !b.riscontro; }), koinlySenzaBanca: nonInBanca };
  }

  return { leggi: leggi, riscontra: riscontra, controparte: controparte, importi: importi, data: data };
});
