/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · elementi di risposta al questionario dell'Agenzia delle Entrate sulle cripto-attività, dagli elaborati Koinly.
   Domande tipo (inviti ex art. 32 DPR 600/1973):
   1 modalità di acquisto e intermediari; 2 movimentazione bancaria; 3 elenco dei wallet alle date, tipologia, indirizzi;
   4 elenco delle transazioni con tipologia e transaction ID; 5 composizione e valore del saldo di ogni wallet;
   6 rimborsi, cessioni, permute e altri proventi; 7 trasferimenti verso terzi; 8 rilevanza reddituale.
   Quello che Koinly non contiene (estratti conto, natura certa dei wallet) è segnalato come da integrare. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./detenzione.js"), require("./costi.js"));
  else root.KoinlyQuestionario = factory(root.KoinlyDetenzione, root.KoinlyCosti);
})(typeof self !== "undefined" ? self : this, function (D, C) {
  "use strict";

  var NON_CUSTODIAL = /(xpub|ypub|zpub|\b0x[0-9a-f]{3,}|bc1|\bledger|safepal|trezor|metamask|trust ?wallet|exodus|phantom|keplr|electrum|rabby|coinbase wallet|tangem|bitbox|cold|hardware|self.?custody|wallet \(|\.\.\.)/i;
  var CUSTODIAL = /(binance|coinbase(?! wallet)|kraken|bitpanda|crypto\.com|nexo|bybit|bitget|gate|kucoin|okx|young platform|relai|bitstamp|revolut|bitfinex|huobi|htx|mexc|conio|the rock|bitvavo|blockfi|celsius|paypal|n26|wirex|swissborg|uphold|bit2me|etoro|trade republic|scalable)/i;
  var IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g;

  function fiat(s) { return D.FIAT.indexOf(s) >= 0; }
  function tipoWallet(nome) {
    if (!nome) return "";
    if (CUSTODIAL.test(nome) && !/(xpub|0x[0-9a-f]{3,}|bc1)/i.test(nome)) return "custodial (exchange)";
    if (NON_CUSTODIAL.test(nome)) return "non custodial";
    return "da verificare";
  }
  function indirizzo(s) { return /^(0x[0-9a-f]{20,}|bc1[0-9a-z]{20,}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|[1-9A-HJ-NP-Za-km-z]{32,44}|r[1-9A-HJ-NP-Za-km-z]{24,34}|T[1-9A-HJ-NP-Za-km-z]{33})$/i.test(String(s || "")); }

  /* d: dati di KoinlyDetenzione.leggiTransazioni; opz: { anni: [2023, 2024], fuso, correzioni, saldiReport: { "2024-12-31": saldi, "2024-01-01": saldi }, ivaca: { 2024: importo } } */
  function prepara(d, opz) {
    var o = opz || {}, fuso = o.fuso || d.fuso || "UTC", anni = (o.anni || []).slice().sort();
    var nelPeriodo = function (g) { return anni.indexOf(+g.slice(0, 4)) >= 0; };
    var mov = d.movimenti.map(function (t) { return { t: t, g: D.giorno(t.ts, fuso) }; });

    /* --- wallet: nome, tipo, indirizzi, periodo di utilizzo --- */
    var wallet = {};
    var W = function (nome, id) { if (!nome) return null; var k = nome; return wallet[k] || (wallet[k] = { nome: nome, id: id || "", tipo: tipoWallet(nome), indirizzi: {}, primo: null, ultimo: null, n: 0 }); };
    mov.forEach(function (m) {
      var t = m.t;
      [[t.walletDa, t.idDa, t.txSrc], [t.walletA, t.idA, t.txDest]].forEach(function (x) {
        var w = W(x[0], x[1]); if (!w) return;
        w.n++; if (!w.primo || m.g < w.primo) w.primo = m.g; if (!w.ultimo || m.g > w.ultimo) w.ultimo = m.g;
        if (indirizzo(x[2]) && w.tipo !== "custodial (exchange)") w.indirizzi[x[2].toLowerCase()] = (w.indirizzi[x[2].toLowerCase()] || 0) + 1;
      });
    });
    Object.keys(wallet).forEach(function (k) {
      var w = wallet[k], m = /\(([^)]+)\)|((?:0x|bc1)[0-9a-z.]+)/i.exec(w.nome);
      w.riferimento = m ? (m[1] || m[2]) : "";
      // indirizzi: se il nome Koinly contiene l'indirizzo abbreviato (0x2464...0bD0) si tengono solo quelli che corrispondono,
      // così si escludono i contratti (router, bridge) che compaiono come origine o destinazione
      var ab = /(0x[0-9a-f]{3,6})\.\.\.([0-9a-f]{3,6})/i.exec(w.nome), tutti = Object.keys(w.indirizzi);
      w.indirizzi = ab ? tutti.filter(function (x) { return x.indexOf(ab[1].toLowerCase()) === 0 && x.slice(-ab[2].length) === ab[2].toLowerCase(); }) : tutti.filter(function (x) { return w.indirizzi[x] > 1; });
      if (/[xyz]pub/i.test(w.riferimento)) w.chiavePubblica = w.riferimento;
    });

    /* --- saldi per wallet e cripto alle date (1/1 = inizio giornata, 31/12 = fine giornata) --- */
    var date = [];
    anni.forEach(function (a) { date.push({ chiave: a + "-01-01", etichetta: "1/1/" + a, prima: true }, { chiave: a + "-12-31", etichetta: "31/12/" + a, prima: false }); });
    var saldi = {}, cumul = {}, iD = 0;
    // saldi per identificativo Koinly della cripto (BTC;1, USDT;8…): le imitazioni hanno lo stesso simbolo ma un identificativo diverso
    var simboloDi = {};
    var aggiungi = function (w, v) { if (!w) return; simboloDi[v.valuta] = v.simbolo; var c = cumul[w] || (cumul[w] = {}); c[v.valuta] = (c[v.valuta] || 0n) + v.q; };
    var foto = function () { var f = {}; Object.keys(cumul).forEach(function (w) { Object.keys(cumul[w]).forEach(function (s) { var q = cumul[w][s]; if (q !== 0n) (f[w] = f[w] || {})[s] = q; }); }); return f; };
    var prezzi = {}; // ultimo prezzo noto in euro per simbolo, dalle transazioni con una sola cripto
    var prezziAl = {};
    mov.forEach(function (m) {
      while (iD < date.length && (date[iD].prima ? m.g >= date[iD].chiave : m.g > date[iD].chiave)) { saldi[date[iD].chiave] = foto(); prezziAl[date[iD].chiave] = Object.assign({}, prezzi); iD++; }
      var t = m.t;
      t.voci.forEach(function (v) { aggiungi(v.lato === "a" ? t.walletA : (t.walletDa || t.walletA), v); });
      var cr = t.voci.filter(function (v) { return v.lato !== "fee" && !fiat(v.simbolo); });
      if (cr.length === 1 && t.valore > 0) prezzi[cr[0].simbolo] = t.valore / Math.abs(D.decNum(cr[0].q));
    });
    while (iD < date.length) { saldi[date[iD].chiave] = foto(); prezziAl[date[iD].chiave] = Object.assign({}, prezzi); iD++; }
    // stablecoin senza prezzo nelle transazioni: si usa quello di un'altra stablecoin in dollari della stessa data
    Object.keys(prezziAl).forEach(function (k) { var p = prezziAl[k], rif = p.USDT || p.USDC || p.DAI; if (rif) ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "FDUSD", "PYUSD"].forEach(function (s) { if (p[s] == null) p[s] = rif; }); });
    // prezzi dei report Koinly alle date, se caricati, al posto di quelli delle transazioni
    Object.keys(o.saldiReport || {}).forEach(function (k) {
      (o.saldiReport[k] || []).forEach(function (s) { if (s.quantita) { prezziAl[k] = prezziAl[k] || {}; prezziAl[k][s.simbolo] = s.valore / s.quantita; } });
    });

    /* --- costi LIFO e cessioni per anno --- */
    var costi = {};
    anni.forEach(function (a) { costi[a] = C.calcola(d, { anno: a, fuso: fuso, correzioni: o.correzioni }); });
    var spam = {}; anni.forEach(function (a) { costi[a].righe.forEach(function (r) { if (r.spam) spam[r.chiave] = true; }); });
    var nonSpam = function (k) { return !spam[k] && !D.motivoSpam({ chiave: k, mai: false }, false); };
    var perRiga = {}; d.movimenti.forEach(function (t) { perRiga[t.riga] = t; });

    return { d: d, o: o, fuso: fuso, anni: anni, mov: mov, nelPeriodo: nelPeriodo, wallet: wallet, date: date, saldi: saldi, prezziAl: prezziAl, costi: costi, nonSpam: nonSpam, perRiga: perRiga, simboloDi: simboloDi };
  }

  function calcola(d, opz) {
    var X = prepara(d, opz), anni = X.anni;
    var nel = function (m) { return X.nelPeriodo(m.g); };

    // 1. modalità di acquisto: acquisti con valuta tradizionale per intermediario e anno; altre provenienze dai costi LIFO
    var acquisti = {};
    X.mov.filter(nel).forEach(function (m) {
      var t = m.t, da = t.voci.filter(function (v) { return v.lato === "da"; })[0], a = t.voci.filter(function (v) { return v.lato === "a"; })[0];
      if (!da || !a || !fiat(da.simbolo) || fiat(a.simbolo)) return;
      var k = m.g.slice(0, 4) + "|" + (t.walletA || t.walletDa || "(non indicato)");
      var x = acquisti[k] || (acquisti[k] = { anno: +m.g.slice(0, 4), intermediario: t.walletA || t.walletDa || "(non indicato)", tipo: tipoWallet(t.walletA || t.walletDa), n: 0, importo: 0, valute: {}, cripto: {} });
      x.n++; x.importo += da.simbolo === "EUR" ? -D.decNum(da.q) : t.valore; x.valute[da.simbolo] = true; x.cripto[a.simbolo] = true;
    });
    var provenienze = {};
    anni.forEach(function (a) {
      var p = provenienze[a] = {};
      // le provenienze si ricavano dagli eventi di carico dell'anno nei costi LIFO
    });
    X.mov.filter(nel).forEach(function (m) {
      var t = m.t, a = t.voci.filter(function (v) { return v.lato === "a" && !fiat(v.simbolo); })[0], da = t.voci.filter(function (v) { return v.lato === "da"; })[0];
      if (!a || !X.nonSpam(a.valuta) || t.abbinata) return;
      if (da && da.valuta === a.valuta) return;
      var tag = String(t.tag || "").toLowerCase().replace(/[\s-]+/g, "_");
      var voce = da ? (fiat(da.simbolo) ? "acquisto con valuta" : "permuta / acquisto con altre cripto") : tag ? "provento (" + tag.replace(/_/g, " ") + ")" : "deposito da wallet non collegato";
      var p = provenienze[+m.g.slice(0, 4)]; var x = p[voce] || (p[voce] = { n: 0, valore: 0 }); x.n++; x.valore += t.valore || 0;
    });

    // 2. movimentazione bancaria: versamenti e prelievi in valuta sugli exchange, con gli IBAN citati nelle descrizioni
    var bonifici = [], iban = {};
    X.mov.filter(nel).forEach(function (m) {
      var t = m.t; if (!t.voci.length || t.voci.some(function (v) { return !fiat(v.simbolo); })) return;
      var v = t.voci.filter(function (x) { return x.lato !== "fee"; })[0]; if (!v) return;
      (t.descrizione.match(IBAN) || []).forEach(function (i) { iban[i.replace(/\s/g, "")] = true; });
      bonifici.push({ data: m.g, intermediario: v.lato === "a" ? t.walletA : t.walletDa, verso: v.lato === "a" ? "versamento" : "prelievo", importo: Math.abs(D.decNum(v.q)), valuta: v.simbolo, descrizione: t.descrizione });
    });
    var bonificiSintesi = {};
    bonifici.forEach(function (b) { var k = b.data.slice(0, 4) + "|" + b.intermediario + "|" + b.valuta; var x = bonificiSintesi[k] || (bonificiSintesi[k] = { anno: +b.data.slice(0, 4), intermediario: b.intermediario, valuta: b.valuta, versamenti: 0, prelievi: 0, n: 0 }); x.n++; x[b.verso === "versamento" ? "versamenti" : "prelievi"] += b.importo; });

    // 3 e 5. wallet alle date, con tipologia, indirizzi, composizione e valore
    var walletAlleDate = X.date.map(function (dt) {
      var f = X.saldi[dt.chiave] || {}, px = X.prezziAl[dt.chiave] || {};
      var righe = [];
      Object.keys(f).forEach(function (w) {
        Object.keys(f[w]).forEach(function (k) {
          var s = X.simboloDi[k] || k;
          if (fiat(s) || !X.nonSpam(k)) return;
          var q = f[w][k]; if (q <= 0n) return;
          var qn = D.decNum(q), p = px[s];
          righe.push({ wallet: w, tipo: (X.wallet[w] || {}).tipo || tipoWallet(w), cripto: s, quantita: D.decStr(q), valore: p != null ? qn * p : null, fontePrezzo: (X.o.saldiReport || {})[dt.chiave] ? "report Koinly" : "transazioni" });
        });
      });
      righe.sort(function (a, b) { return a.wallet.localeCompare(b.wallet) || (b.valore || 0) - (a.valore || 0); });
      return { data: dt.etichetta, chiave: dt.chiave, righe: righe, totale: righe.reduce(function (s, r) { return s + (r.valore || 0); }, 0) };
    });
    // wallet usati fino alla fine del periodo (quelli aperti dopo non c'entrano)
    var finePeriodo = (anni[anni.length - 1] || 9999) + "-12-31";
    var elencoWallet = Object.keys(X.wallet).map(function (k) { return X.wallet[k]; }).filter(function (w) { return w.primo <= finePeriodo; })
      .sort(function (a, b) { return a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome); });

    // 4. elenco delle transazioni con tipologia e transaction ID
    var transazioni = X.mov.filter(nel).filter(function (m) { return m.t.voci.every(function (v) { return fiat(v.simbolo) || X.nonSpam(v.valuta); }); }).map(function (m) {
      var t = m.t, f = function (l) { return t.voci.filter(function (v) { return v.lato === l; })[0]; }, da = f("da"), a = f("a"), fe = f("fee");
      return { data: m.g, ora: new Date(t.ts).toISOString().slice(11, 19), tipo: t.tipo, tag: t.tag, walletDa: t.walletDa, qDa: da ? D.decStr(-da.q) : "", valDa: da ? da.simbolo : "",
        walletA: t.walletA, qA: a ? D.decStr(a.q) : "", valA: a ? a.simbolo : "", fee: fe ? D.decStr(-fe.q) + " " + fe.simbolo : "", valore: t.valore, txHash: t.txHash, txSrc: t.txSrc, txDest: t.txDest, abbinata: !!t.abbinata };
    });

    // 6. rimborsi, cessioni a titolo oneroso, permute e altri proventi (costi LIFO)
    var cessioni = {}, proventi = {};
    anni.forEach(function (a) {
      var c = X.costi[a];
      cessioni[a] = Object.keys(c.perTipo).filter(function (k) { return !/^commissione|^prelievo|^uscita/.test(k); }).map(function (k) { var t = c.perTipo[k]; return { tipo: k, n: t.n, corrispettivi: t.corrispettivi, costi: t.costi, risultato: t.corrispettivi - t.costi }; });
      var p = provenienze[a] || {};
      proventi[a] = Object.keys(p).filter(function (k) { return /^provento/.test(k); }).map(function (k) { return { voce: k.replace(/^provento \(|\)$/g, ""), n: p[k].n, valore: p[k].valore }; });
    });

    // 7. trasferimenti verso terzi: prelievi verso indirizzi non collegati a Koinly e uscite senza corrispettivo
    var terzi = [];
    anni.forEach(function (a) {
      X.costi[a].cessioni.filter(function (c) { return /^prelievo|^uscita \((gift|donation|lost|stolen)/.test(c.tipo); }).forEach(function (c) {
        var t = X.perRiga[c.riga] || {};
        terzi.push({ data: c.data, cripto: c.cripto, quantita: c.q, tipo: c.tipo, walletDa: t.walletDa || "", destinazione: t.txDest || "", txHash: t.txHash || "", valore: t.valore || 0, costo: c.costo });
      });
    });

    /* Elenco di wallet, chiavi pubbliche e indirizzi da attribuire (mio / non mio / da chiarire):
       wallet registrati in Koinly (piattaforme e wallet non custodial) e indirizzi esterni dei movimenti non abbinati. */
    var propri = {}; Object.keys(X.wallet).forEach(function (k) { X.wallet[k].indirizzi.forEach(function (i) { propri[i] = k; }); });
    var chiavi = elencoWallet.map(function (w) {
      return { id: "w:" + w.nome, genere: "wallet Koinly", etichetta: w.nome, tipo: w.tipo, chiavePubblica: w.chiavePubblica || "", indirizzi: w.indirizzi, primo: w.primo, ultimo: w.ultimo, n: w.n,
        proposta: w.tipo === "custodial (exchange)" ? "piattaforma" : "da chiarire" };
    });
    var esterni = {};
    anni.forEach(function (a) {
      (X.costi[a].daVerificare || []).forEach(function (v) {
        var ind = (v.indirizzo || "").toLowerCase(); if (!indirizzo(ind) || propri[ind]) return;
        var e = esterni[ind] || (esterni[ind] = { id: "a:" + ind, genere: "indirizzo esterno", etichetta: ind, tipo: v.tipo === "prelievo" ? "destinatario di invii" : "mittente di versamenti", chiavePubblica: "", indirizzi: [ind], primo: v.data, ultimo: v.data, n: 0, cripto: {}, valore: 0, proposta: "da chiarire" });
        e.n++; e.cripto[v.cripto] = true; e.valore += v.valore || 0; if (v.data < e.primo) e.primo = v.data; if (v.data > e.ultimo) e.ultimo = v.data;
      });
    });
    Object.keys(esterni).forEach(function (k) { var e = esterni[k]; e.cripto = Object.keys(e.cripto).join(", "); chiavi.push(e); });

    // 8. rilevanza reddituale per anno
    var rilevanza = anni.map(function (a) {
      var c = X.costi[a], tv = c.totali.controValutaStable, tutte = c.totali.tutte;
      var prov = (proventi[a] || []).reduce(function (s, p) { return s + p.valore; }, 0);
      var regime = a <= 2022 ? "Fino al 2022 le cripto seguono il regime delle valute (art. 67 c. 1 lett. c-ter e c. 1-ter TUIR): le plusvalenze rilevano se la giacenza ha superato 51.645,69 € per almeno 7 giorni lavorativi continui; da verificare."
        : a <= 2024 ? "Dal 2023 art. 67 c. 1 lett. c-sexies TUIR: rilevano le cessioni contro valuta e contro stablecoin; le permute tra cripto con eguali caratteristiche non rilevano. Franchigia di 2.000 € (2023 e 2024). Imposta sul valore delle cripto-attività (IVACA) 2 per mille."
        : "Dal 2025 art. 67 c. 1 lett. c-sexies TUIR senza franchigia; imposta sul valore delle cripto-attività (IVACA) 2 per mille.";
      return { anno: a, corrispettiviRilevanti: tv.corrispettivi, costiRilevanti: tv.costi, plusvalenzaRilevante: tv.corrispettivi - tv.costi,
        corrispettiviTutti: tutte.corrispettivi, costiTutti: tutte.costi, proventi: prov, ivaca: X.o.ivaca && X.o.ivaca[a] != null ? X.o.ivaca[a] : null, regime: regime, avvisi: c.avvisi };
    });

    return { anni: anni, fuso: X.fuso,
      d1: { acquisti: Object.keys(acquisti).map(function (k) { var x = acquisti[k]; x.valute = Object.keys(x.valute).join(", "); x.cripto = Object.keys(x.cripto).join(", "); return x; }).sort(function (a, b) { return a.anno - b.anno || b.importo - a.importo; }), provenienze: provenienze },
      d2: { movimenti: bonifici, sintesi: Object.keys(bonificiSintesi).map(function (k) { return bonificiSintesi[k]; }), iban: Object.keys(iban) },
      d3: { wallet: elencoWallet, alleDate: walletAlleDate, chiavi: chiavi },
      d4: { transazioni: transazioni },
      d5: { alleDate: walletAlleDate },
      d6: { cessioni: cessioni, proventi: proventi },
      d7: { trasferimenti: terzi },
      d8: { anni: rilevanza },
      costi: X.costi };
  }

  return { calcola: calcola, tipoWallet: tipoWallet };
});
