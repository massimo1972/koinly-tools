/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · lettura degli altri report Koinly in CSV (Income, Expenses, Gifts/Donations/Lost assets, Other gains).
   Danno solo informazioni in più e riscontri: non cambiano i calcoli delle altre schede.
   I report possono essere in italiano o in inglese e con numeri in formato 1,234.56 oppure 1.234,56. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyReport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* tipo di report dalla prima riga (titolo) */
  var TIPI = [
    { tipo: "redditi", re: /entrate|income/i, titolo: "Redditi (Income report)" },
    { tipo: "commissioni", re: /costi e commissioni|expense|fees?\b/i, titolo: "Costi e commissioni (Expenses report)" },
    { tipo: "perdite", re: /regali|donazioni|monete perse|gift|donation|lost/i, titolo: "Regali, donazioni e monete perse (Gifts, donations & lost assets)" },
    { tipo: "altri", re: /other gains|altri (guadagni|profitti)/i, titolo: "Altri profitti e perdite (Other gains report)" }
  ];
  /* report riconosciuti ma letti altrove o non ancora usati */
  var ALTRI = [
    [/saldi al|holdings/i, "è un report dei saldi: va negli spazi «Saldi a inizio anno» o «Saldi a fine anno»."],
    [/plusvalenze|capital gains/i, "il Capital gains report non è ancora usato da Koinly Tools."],
    [/buy\/sell|acquisti e vendite/i, "il Buy/sell report non è ancora usato da Koinly Tools."]
  ];
  /* colonne in italiano e in inglese */
  var COLONNE = {
    data: /^(data|date)\b/i, attivo: /^(attivo|asset)$/i, quantita: /^(importo|amount)$/i, valore: /^(valore|value)\s*\(/i,
    tipo: /^(tipo|type)$/i, descrizione: /^(descrizione|description)$/i, wallet: /^(nome del portafoglio|wallet name|wallet)$/i
  };

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
  /* numero come testo decimale esatto ("-1234.5678"). In formato italiano un valore senza virgola è un intero con i punti
     delle migliaia (1.234) oppure, come capita nei CSV Koinly, uno zero scritto all'inglese (0.0) */
  function decimale(s, fmt) {
    var t = String(s == null ? "" : s).replace(/[€\s]/g, "");
    if (!/\d/.test(t)) return null;
    if (fmt === "it") t = t.indexOf(",") >= 0 || /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
    else t = t.replace(/,/g, "");
    return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
  }
  /* importo in centesimi interi, per sommare senza errori di arrotondamento */
  function centesimi(t) {
    if (t == null) return 0;
    var neg = t[0] === "-", p = t.replace("-", "").split("."), f = ((p[1] || "") + "000").slice(0, 3);
    var c = +p[0] * 100 + +f.slice(0, 2) + (+f[2] >= 5 ? 1 : 0);
    return neg ? -c : c;
  }

  function leggi(testo) {
    var tab = righeCsv(String(testo).replace(/^﻿/, ""));
    var titolo = (tab[0] || []).join(" ").trim();
    for (var a = 0; a < ALTRI.length; a++) if (ALTRI[a][0].test(titolo)) return { errore: ALTRI[a][1] };
    var def = TIPI.filter(function (x) { return x.re.test(titolo); })[0];
    var iH = tab.findIndex(function (r) { return r.some(function (c) { return COLONNE.attivo.test(c.trim()); }) && r.some(function (c) { return COLONNE.valore.test(c.trim()); }); });
    if (!def || iH < 0) return { errore: "non è un report Koinly riconosciuto (Income, Expenses, Gifts/Donations/Lost assets, Other gains)." };
    var anno = (/(\d{4})\s*$/.exec(titolo) || [])[1];
    var col = {};
    tab[iH].forEach(function (c, i) { Object.keys(COLONNE).forEach(function (k) { if (col[k] == null && COLONNE[k].test(c.trim())) col[k] = i; }); });
    var valuta = (/\(([A-Z]{3})\)/.exec(tab[iH][col.valore]) || [])[1] || "EUR";
    var dati = tab.slice(iH + 1).filter(function (r) { return r.length > col.valore && (r[col.data] || "").trim(); });
    var fmt = dati.some(function (r) { return /^-?\d{1,3}(\.\d{3})*,\d+$/.test((r[col.quantita] || "").trim()) || /^-?\d{1,3}(\.\d{3})*,\d+$/.test((r[col.valore] || "").trim()); }) ? "it" : "en";
    var cella = function (r, k) { return col[k] == null ? "" : String(r[col[k]] || "").trim(); };
    var righe = dati.map(function (r) {
      var q = decimale(cella(r, "quantita"), fmt), v = decimale(cella(r, "valore"), fmt), tipo = cella(r, "tipo");
      var c = Math.abs(centesimi(v));
      // Other gains: il valore è sempre positivo, il segno viene dal tipo (Profit/Loss)
      if (def.tipo === "altri" && /^(loss|perdita)/i.test(tipo)) c = -c;
      return { data: cella(r, "data").slice(0, 10), ora: cella(r, "data").slice(11), attivo: cella(r, "attivo"), quantitaTesto: q, quantita: q == null ? null : +q, valoreCent: c, valore: c / 100, tipo: tipo, descrizione: cella(r, "descrizione"), wallet: cella(r, "wallet") };
    });
    return riepilogo({ fonte: "csv", tipo: def.tipo, titolo: def.titolo, titoloReport: titolo, anno: anno ? +anno : null, valuta: valuta, formato: fmt, righe: righe });
  }

  function raggruppa(righe, chiave) {
    var m = {};
    righe.forEach(function (r) { var k = chiave(r) || "(non indicato)"; var x = m[k] || (m[k] = { chiave: k, n: 0, cent: 0, profittiCent: 0, perditeCent: 0 }); x.n++; x.cent += r.valoreCent; if (r.valoreCent >= 0) x.profittiCent += r.valoreCent; else x.perditeCent -= r.valoreCent; });
    return Object.keys(m).map(function (k) { var x = m[k]; return { chiave: x.chiave, n: x.n, valore: x.cent / 100, profitti: x.profittiCent / 100, perdite: x.perditeCent / 100 }; })
      .sort(function (a, b) { return Math.abs(b.valore) - Math.abs(a.valore) || (a.chiave < b.chiave ? -1 : 1); });
  }
  function riepilogo(r) {
    var tot = 0, pro = 0, per = 0;
    r.righe.forEach(function (x) { tot += x.valoreCent; if (x.valoreCent >= 0) pro += x.valoreCent; else per -= x.valoreCent; });
    r.totale = tot / 100; r.profitti = pro / 100; r.perdite = per / 100;
    r.perTipo = raggruppa(r.righe, function (x) { return x.tipo + (x.descrizione ? " · " + x.descrizione : ""); });
    r.perAttivo = raggruppa(r.righe, function (x) { return x.attivo; });
    r.perWallet = raggruppa(r.righe, function (x) { return x.wallet; });
    r.perMese = raggruppa(r.righe, function (x) { return x.data.slice(0, 7); }).sort(function (a, b) { return a.chiave < b.chiave ? -1 : 1; });
    r.avvisi = [];
    if (r.valuta !== "EUR") r.avvisi.push("I valori del report sono in " + r.valuta + ", non in euro: in Koinly impostate l'euro come valuta del conto.");
    var fuori = r.anno ? r.righe.filter(function (x) { return x.data.slice(0, 4) !== String(r.anno); }).length : 0;
    if (fuori) r.avvisi.push(fuori + " righe hanno una data fuori dal " + r.anno + ".");
    var zero = r.righe.filter(function (x) { return x.valoreCent === 0; }).length;
    if (zero) r.avvisi.push(zero + " righe hanno valore zero.");
    return r;
  }

  return { leggi: leggi, decimale: decimale, centesimi: centesimi, TIPI: TIPI };
});
