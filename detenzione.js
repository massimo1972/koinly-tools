/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · giorni di detenzione delle cripto-attività in un anno (per RW e IVACA).
   Dati: CSV delle transazioni Koinly (backup "backup_transactions_koinly.csv" o "transaction history").
   Regole dello studio:
   - totale di tutti i wallet per ciascuna cripto; escluse le valute tradizionali, incluse le stablecoin;
   - saldo al 1/1 = somma dei movimenti precedenti (+ ricevuto, − inviato, − commissioni);
   - un giorno conta se a inizio giornata il saldo è positivo oppure se nel giorno c'è un'entrata; massimo 365/366;
   - aritmetica esatta sui decimali (BigInt), nessuna correzione d'ufficio dei saldi negativi. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyDetenzione = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FIAT = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "TRY", "BRL", "AED", "HKD", "SGD", "MXN", "ZAR", "INR", "KRW", "CNY", "RUB", "UAH", "NZD", "ILS"];
  var SCALA = 18, UNO = BigInt("1" + "0".repeat(SCALA));

  /* "0.0050529275" → BigInt in diciottesimi; accetta anche 1e-8 */
  function dec(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return 0n;
    if (/e/i.test(t)) t = Number(t).toFixed(SCALA);
    var neg = t[0] === "-"; if (neg || t[0] === "+") t = t.slice(1);
    var p = t.split("."), int = p[0].replace(/\D/g, "") || "0", fr = (p[1] || "").replace(/\D/g, "").slice(0, SCALA);
    var v = BigInt(int) * UNO + BigInt((fr + "0".repeat(SCALA)).slice(0, SCALA));
    return neg ? -v : v;
  }
  function decStr(v, cifre) {
    var neg = v < 0n; if (neg) v = -v;
    var i = v / UNO, f = (v % UNO).toString().padStart(SCALA, "0").slice(0, cifre == null ? SCALA : cifre).replace(/0+$/, "");
    return (neg ? "-" : "") + i.toString() + (f ? "." + f : "");
  }
  function decNum(v) { return Number(decStr(v)); }

  /* ---------- CSV ---------- */
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
  /* due formati: backup (Date (UTC), From Amount, From Currency "BTC;1", To..., Fee...) e transaction history (Date, Sent Amount, Sent Currency, Received..., Fee...) */
  var FORMATI = [
    { nome: "backup", data: "Date (UTC)", fuso: "UTC", da: ["From Amount", "From Currency"], a: ["To Amount", "To Currency"], fee: ["Fee Amount", "Fee Currency"], tipo: "Type", tag: "Tag", cancellata: "Deleted", id: "ID (read-only)" },
    { nome: "history", data: "Date", fuso: null, da: ["Sent Amount", "Sent Currency"], a: ["Received Amount", "Received Currency"], fee: ["Fee Amount", "Fee Currency"], tipo: "Type", tag: "Tag", cancellata: null, id: "TxHash" }
  ];
  function leggiTransazioni(testo) {
    var tab = righeCsv(String(testo).replace(/^﻿/, ""));
    var fmt = null, iH = -1;
    for (var i = 0; i < Math.min(tab.length, 10) && !fmt; i++) {
      var h = tab[i].map(function (x) { return x.trim(); });
      FORMATI.forEach(function (f) { if (!fmt && h.indexOf(f.data) >= 0 && h.indexOf(f.da[0]) >= 0 && h.indexOf(f.a[0]) >= 0) { fmt = f; iH = i; } });
    }
    if (!fmt) return { errore: "Il file non sembra un export delle transazioni di Koinly: mancano le colonne data, importi inviati e ricevuti." };
    var H = tab[iH].map(function (x) { return x.trim(); });
    var col = function (n) { return H.indexOf(n); };
    var c = { data: col(fmt.data), da: col(fmt.da[0]), daV: col(fmt.da[1]), a: col(fmt.a[0]), aV: col(fmt.a[1]), fee: col(fmt.fee[0]), feeV: col(fmt.fee[1]), tipo: col(fmt.tipo), tag: col(fmt.tag), canc: fmt.cancellata ? col(fmt.cancellata) : -1, val: col("Net Value (read-only)") >= 0 ? col("Net Value (read-only)") : col("Net Value (EUR)") };
    /* numeri: il backup usa 1234.5678; la transaction history in italiano usa 1.234,5678 */
    var it = false;
    for (var z = iH + 1; z < Math.min(tab.length, iH + 400) && !it; z++) [c.da, c.a, c.fee].forEach(function (k) { if (k >= 0 && /^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/.test((tab[z][k] || "").trim())) it = true; });
    var norm = function (v) { var t = String(v == null ? "" : v).trim(); return it ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""); };
    var fusoFile = fmt.fuso;
    var movimenti = [], scartate = 0, cancellate = 0, senzaData = 0;
    for (var r = iH + 1; r < tab.length; r++) {
      var x = tab[r];
      if (x.length < 3 || !x.join("").trim()) continue;
      if (c.canc >= 0 && /^true$/i.test((x[c.canc] || "").trim())) { cancellate++; continue; }
      var d = parseData(x[c.data]);
      if (!d) { senzaData++; continue; }
      if (!fusoFile && /UTC\s*$/.test(x[c.data] || "")) fusoFile = "UTC";
      var t = { riga: r + 1, ts: d, tipo: (x[c.tipo] || "").trim(), tag: (x[c.tag] || "").trim(), valore: c.val >= 0 ? parseFloat(norm(x[c.val])) || 0 : 0, voci: [] };
      var voce = function (qta, val, segno, lato) {
        var v = valuta(val); if (!v) return;
        var q = dec(norm(qta)); if (q === 0n) return;
        t.voci.push({ valuta: v.chiave, simbolo: v.simbolo, q: segno < 0 ? -q : q, lato: lato });
      };
      voce(x[c.da], x[c.daV], -1, "da"); voce(x[c.a], x[c.aV], 1, "a"); if (c.fee >= 0) voce(x[c.fee], x[c.feeV], -1, "fee");
      if (t.voci.length) movimenti.push(t); else scartate++;
    }
    movimenti.sort(function (p, q) { return p.ts - q.ts || p.riga - q.riga; });
    return { formato: fmt.nome, numeri: it ? "it" : "en", fuso: fusoFile, movimenti: movimenti, righe: tab.length - iH - 1, cancellate: cancellate, senzaData: senzaData, senzaImporti: scartate };
  }
  /* "BTC;1" → { chiave: "BTC;1", simbolo: "BTC" } */
  function valuta(s) {
    var t = String(s == null ? "" : s).trim(); if (!t) return null;
    var p = t.split(";");
    return { chiave: t.toUpperCase(), simbolo: p[0].trim().toUpperCase() };
  }
  /* "2023-05-01 12:34:56" (UTC per il backup) → millisecondi; accetta anche "01/05/2023 12:34" */
  function parseData(s) {
    var t = String(s == null ? "" : s).trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t))) return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if ((m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t))) return Date.UTC(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  }

  /* giorno di calendario nel fuso scelto: "UTC" o "Europe/Rome" (ora legale compresa) */
  var fmtRoma = null;
  function giorno(ts, fuso) {
    if (fuso !== "Europe/Rome") return new Date(ts).toISOString().slice(0, 10);
    if (!fmtRoma) fmtRoma = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
    return fmtRoma.format(new Date(ts));
  }
  function giorniAnno(anno) {
    var out = [], d = Date.UTC(anno, 0, 1);
    while (new Date(d).getUTCFullYear() === anno) { out.push(new Date(d).toISOString().slice(0, 10)); d += 86400000; }
    return out;
  }

  /* ---------- calcolo ---------- */
  function calcola(dati, anno, opzioni) {
    var o = opzioni || {};
    var fuso = o.fuso || dati.fuso || "UTC";
    var inizio = anno + "-01-01", fine = anno + "-12-31";
    var cripto = {}, nAnno = 0;
    function voce(k, simbolo) {
      if (!cripto[k]) cripto[k] = { chiave: k, simbolo: simbolo, nMov: 0, positivo: false, saldo: 0n, iniziale: null, perGiorno: {}, entrate: {}, minimo: null, negativo: null, prezzo: null, prezzi: {} };
      return cripto[k];
    }
    dati.movimenti.forEach(function (t) {
      var g = giorno(t.ts, fuso);
      if (g > fine) return;
      if (g >= inizio) nAnno++;
      // movimento netto per valuta nella riga: un trasferimento tra wallet propri non è un'entrata
      var netto = {};
      t.voci.forEach(function (v) {
        if (FIAT.indexOf(v.simbolo) >= 0) return;
        netto[v.valuta] = (netto[v.valuta] || 0n) + v.q;
        var c = voce(v.valuta, v.simbolo); c.nMov++;
        if (g <= fine && t.valore > 0 && v.lato !== "fee" && t.voci.filter(function (z) { return z.lato !== "fee" && FIAT.indexOf(z.simbolo) < 0; }).length === 1) { c.prezzo = t.valore / Math.abs(decNum(v.q)); c.prezzi[g] = c.prezzo; }
      });
      Object.keys(netto).forEach(function (k) {
        var c = cripto[k];
        if (g < inizio) { c.saldo += netto[k]; return; }
        if (c.iniziale === null) c.iniziale = c.saldo;
        (c.perGiorno[g] = c.perGiorno[g] || []).push(netto[k]);
        if (netto[k] > 0n) c.entrate[g] = true;
      });
    });
    var giorni = giorniAnno(anno), righe = [];
    /* saldi al 1° gennaio dal report Koinly "beginning of year holdings": prevalgono su quelli ricostruiti.
       La quantità del report va al token principale di ogni simbolo (quello con più movimenti); gli altri partono da zero. */
    var iniz = o.iniziali || null, principaleK = {}, diffIniziali = [];
    Object.keys(cripto).forEach(function (k) { var c = cripto[k], p = principaleK[c.simbolo]; if (!p || c.nMov > cripto[p].nMov) principaleK[c.simbolo] = k; });
    if (iniz) Object.keys(iniz).forEach(function (sym) { if (!principaleK[sym] && FIAT.indexOf(sym) < 0) { voce(sym, sym); principaleK[sym] = sym; } });
    Object.keys(cripto).forEach(function (k) {
      var c = cripto[k];
      var saldo = c.iniziale === null ? c.saldo : c.iniziale;
      if (iniz) {
        var dalReport = principaleK[c.simbolo] === k ? dec(iniz[c.simbolo] || "0") : 0n;
        var scarto = dalReport > saldo ? dalReport - saldo : saldo - dalReport;
        if (scarto > (dalReport < 0n ? -dalReport : dalReport) / 1000000000n + UNO / 1000000n && (principaleK[c.simbolo] === k || saldo > 0n)) diffIniziali.push({ simbolo: c.simbolo, chiave: k, ricostruito: decNum(saldo), report: decNum(dalReport) });
        saldo = dalReport;
      }
      var iniziale = saldo;
      var detenuti = 0, primo = null, ultimo = null, buchi = 0, negativo = null, massimo = saldo, inMezzo = 0;
      /* periodi a quantità costante: si chiude un periodo a ogni cambio di quantità.
         Acquisto: il nuovo periodo parte dal giorno dell'acquisto. Vendita: il periodo si chiude nel giorno della vendita con la
         quantità detenuta prima, valutata al prezzo di quel giorno, e il residuo apre un nuovo periodo dal giorno successivo.
         Cripto comprata e venduta in giornata: vale il massimo raggiunto. */
      var periodi = [], cur = null;
      giorni.forEach(function (g) {
        var tenuto = saldo > 0n || !!c.entrate[g], apertura = saldo, picco = saldo;
        (c.perGiorno[g] || []).forEach(function (q) { saldo += q; if (saldo < 0n && !negativo) negativo = g; if (saldo > massimo) massimo = saldo; if (saldo > picco) picco = saldo; });
        if (tenuto) { detenuti++; if (!primo) primo = g; if (ultimo && giornoDopo(ultimo) !== g) buchi += 1; ultimo = g; }
        // vendita (quantità in calo): il giorno chiude il periodo con la quantità di prima; il residuo parte dal giorno dopo
        var qGiorno = !tenuto ? 0n : apertura > 0n && saldo < apertura ? apertura : saldo > 0n ? saldo : picco;
        if (qGiorno <= 0n) { cur = null; return; }
        if (cur && cur.q === qGiorno && giornoDopo(cur.al) === g) { cur.al = g; cur.giorni++; }
        else { cur = { dal: g, al: g, q: qGiorno, giorni: 1 }; periodi.push(cur); }
      });
      /* valore iniziale e finale di ogni periodo: prezzo del giorno di inizio e del giorno di fine detenzione, ricavato dal
         controvalore in euro delle transazioni; in mancanza l'ultimo prezzo noto (stimato) */
      var date = Object.keys(c.prezzi).sort();
      var prezzoAl = function (g, alt) {
        if (c.prezzi[g] != null) return { px: c.prezzi[g], stimato: false };
        if (alt && c.prezzi[alt] != null) return { px: c.prezzi[alt], stimato: false };
        for (var i = date.length - 1; i >= 0; i--) if (date[i] <= g) return { px: c.prezzi[date[i]], stimato: true };
        return date.length ? { px: c.prezzi[date[0]], stimato: true } : { px: null, stimato: true };
      };
      periodi.forEach(function (p) {
        var a = prezzoAl(p.dal), b = prezzoAl(p.al, giornoDopo(p.al));
        p.quantita = decStr(p.q); p.quantitaN = decNum(p.q);
        p.prezzoInizio = a.px; p.inizioStimato = a.stimato; p.valoreIniziale = a.px == null ? null : p.quantitaN * a.px;
        p.prezzo = b.px; p.prezzoStimato = b.stimato; p.valore = b.px == null ? null : p.quantitaN * b.px;
        delete p.q;
      });
      var sommaGiorni = periodi.reduce(function (a, p) { return a + p.giorni; }, 0);
      var qMedia = sommaGiorni ? periodi.reduce(function (a, p) { return a + p.quantitaN * p.giorni; }, 0) / sommaGiorni : 0;
      var valMedio = sommaGiorni && periodi.every(function (p) { return p.valore != null; }) ? periodi.reduce(function (a, p) { return a + p.valore * p.giorni; }, 0) / sommaGiorni : null;
      if (iniziale < 0n && !negativo) negativo = inizio;
      if (detenuti === 0 && saldo === 0n && iniziale === 0n) return; // mai posseduta nell'anno
      var finale = saldo;
      var valoreStimato = c.prezzo != null ? Math.abs(decNum(massimo)) * c.prezzo : null;
      var note = [];
      if (negativo) note.push("Saldo negativo dal " + it(negativo) + ": storico incompleto, da verificare");
      if (buchi > 0) note.push("Periodi a saldo zero durante l'anno: detenzione non continuativa");
      if (valoreStimato != null && valoreStimato < (o.sogliaResiduo == null ? 1 : o.sogliaResiduo) && detenuti > 0) note.push("Residuo minimo (valore stimato inferiore a " + (o.sogliaResiduo == null ? 1 : o.sogliaResiduo) + " €): esporlo o scartarlo");
      righe.push({ periodi: periodi, quantitaMedia: qMedia, valoreMedio: valMedio, mai: !(massimo > 0n), chiave: k, simbolo: c.simbolo, iniziale: decStr(iniziale), finale: decStr(finale), inizialeN: decNum(iniziale), finaleN: decNum(finale), giorni: detenuti,
        primo: primo, ultimo: ultimo, negativo: negativo, interruzioni: buchi, residuo: note.some(function (n) { return /^Residuo/.test(n); }), note: note });
    });
    /* token sospetti (spam, phishing, "address poisoning"): esclusi dai totali ma elencati, l'utente può includerli */
    var principale = {};
    righe.forEach(function (r) { var p = principale[r.simbolo]; if (!p || cripto[r.chiave].nMov > cripto[p.chiave].nMov) principale[r.simbolo] = r; });
    righe.forEach(function (r) {
      var m = motivoSpam(r, principale[r.simbolo] !== r);
      r.spam = !!m; if (m) r.note.unshift("Token sospetto: " + m);
    });
    // simboli uguali con identificativi diversi in Koinly: si mostra la chiave completa
    var conta = {}; righe.forEach(function (r) { if (!r.spam) conta[r.simbolo] = (conta[r.simbolo] || 0) + 1; });
    righe.forEach(function (r) { r.nome = r.spam || conta[r.simbolo] > 1 ? r.chiave : r.simbolo; });
    righe.sort(function (a, b) { return (a.spam - b.spam) || b.giorni - a.giorni || a.nome.localeCompare(b.nome); });
    return { anno: anno, fuso: fuso, giorniAnno: giorni.length, transazioniAnno: nAnno, righe: righe,
      spam: righe.filter(function (r) { return r.spam; }).length, saldiInizialiDaReport: !!iniz,
      // differenze tra report di inizio anno e saldi ricostruiti, esclusi i token sospetti
      differenzeIniziali: diffIniziali.filter(function (d) {
        var r = righe.filter(function (x) { return x.chiave === d.chiave; })[0];
        return !(r && r.spam) && !motivoSpam({ chiave: d.simbolo, mai: false }, false);
      }),
      anomalie: righe.filter(function (r) { return r.negativo && !r.spam; }).length };
  }
  function motivoSpam(r, secondario) {
    var s = r.chiave.split(";")[0];
    if (/[^\x20-\x7E]/.test(s)) return "simbolo con caratteri non latini o invisibili, imita un token noto";
    if (/https?:|www\.|\.(xyz|site|com|io|net|org|link|app|me|top|pro|vip|cc|gift)\b|t\.me\/|\bclaim\b|\bvisit\b|\bvoucher\b|\breward/i.test(s) || /\s/.test(s)) return "nome con indirizzo web o invito a «riscattare»";
    if (/^\d+$/.test(s)) return "simbolo solo numerico (NFT o token senza nome)";
    if (r.mai) return "saldo mai positivo nell'anno (movimenti senza entrate)";
    if (secondario) return "stesso simbolo di un token più usato, con identificativo Koinly diverso";
    return "";
  }
  function giornoDopo(g) { return new Date(Date.parse(g + "T00:00:00Z") + 86400000).toISOString().slice(0, 10); }
  function it(g) { return g ? g.slice(8, 10) + "/" + g.slice(5, 7) + "/" + g.slice(0, 4) : ""; }

  /* confronto delle quantità al 31/12 con il report Koinly dei saldi di fine anno (letto da lettura.js) */
  function confronta(calc, saldiReport) {
    var perSimbolo = {};
    (saldiReport || []).forEach(function (s) { if (s.tipo !== "fiat") perSimbolo[s.simbolo] = (perSimbolo[s.simbolo] || 0) + (s.quantita || 0); });
    var diff = [];
    var valZero = {}; (saldiReport || []).forEach(function (s) { if (!s.valore) valZero[s.simbolo] = true; });
    calc.righe.forEach(function (r) {
      if (r.spam) return;
      var q = perSimbolo[r.simbolo] || 0;
      if (Math.abs(q - r.finaleN) > Math.max(1e-6, Math.abs(q) * 1e-6)) diff.push({ simbolo: r.nome, calcolato: r.finaleN, report: q });
      delete perSimbolo[r.simbolo];
    });
    Object.keys(perSimbolo).forEach(function (k) { if (perSimbolo[k] > 1e-9 && !valZero[k]) diff.push({ simbolo: k, calcolato: 0, report: perSimbolo[k] }); });
    return diff;
  }

  return { leggiTransazioni: leggiTransazioni, calcola: calcola, confronta: confronta, dec: dec, decStr: decStr, giorno: giorno, it: it };
});
