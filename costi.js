/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · ricostruzione dei costi di carico con strati LIFO globali, dall'origine.
   Si parte dalla prima transazione dello storico Koinly (non dai saldi di inizio anno) e si costruisce, per ogni cripto,
   una pila di strati di costo unica per tutti i wallet e per tutti gli anni (LIFO globale, continuo):
   - acquisto con valuta tradizionale: strato al costo pagato, commissioni comprese;
   - permuta: la cripto ceduta esce al valore del momento (corrispettivo), quella ricevuta entra con quel valore;
   - interessi, reward, airdrop, cashback e altri proventi: strato al valore del giorno di ricezione;
   - trasferimenti tra wallet propri: nessun effetto, salvo la commissione;
   - commissioni pagate in cripto: scaricano strati LIFO; il loro valore si aggiunge al costo dell'acquisto o riduce il corrispettivo;
   - depositi da wallet non collegati: strato al valore del giorno, da verificare; prelievi senza corrispettivo: scaricano strati.
   Ogni cessione scarica gli strati più recenti (LIFO) e ne riporta il costo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./detenzione.js"));
  else root.KoinlyCosti = factory(root.KoinlyDetenzione);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  var STABLE = ["USDT", "USDC", "DAI", "EURC", "EURT", "BUSD", "TUSD", "USDP", "FDUSD", "PYUSD", "USDE", "EURS", "GUSD", "LUSD", "FRAX", "USDD", "EUROC"];
  var PROVENTI = /^(reward|staking|lending_interest|airdrop|mining|cashback|income|other_income|fork|salary|realized_gain|fee_refund)$/i;
  var USCITE = /^(cost|loan_fee|margin_fee|tax|gift|donation|lost|stolen|interest_payment|margin_repayment|loan_repayment)$/i;

  function fiat(s) { return D.FIAT.indexOf(s) >= 0; }
  /* etichette: il backup usa «lending_interest», la transaction history «Lending interest» */
  function etichetta(t) { return String(t || "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }

  /* Prelievi e depositi della stessa cripto che Koinly non ha abbinato: se la quantità ricevuta è quasi uguale a quella inviata
     (differenza fino al 2%, la commissione) e le date distano al massimo 3 giorni, sono trattati come trasferimento tra wallet propri. */
  function abbinaTrasferimenti(movimenti) {
    var uscite = [], entrate = [], abbinati = 0;
    movimenti.forEach(function (t, i) {
      if (t.voci.length < 1 || t.voci.length > 2) return;
      var da = t.voci.filter(function (v) { return v.lato === "da"; }), a = t.voci.filter(function (v) { return v.lato === "a"; });
      var tag = etichetta(t.tag);
      if (da.length === 1 && !a.length && !tag && !fiat(da[0].simbolo)) uscite.push({ i: i, t: t, v: da[0] });
      if (a.length === 1 && !da.length && !tag && !fiat(a[0].simbolo)) entrate.push({ i: i, t: t, v: a[0], usata: false });
    });
    var TRE = 3 * 86400000;
    uscite.forEach(function (u) {
      var q = -u.v.q, best = null;
      entrate.forEach(function (e) {
        if (e.usata || e.v.valuta !== u.v.valuta || Math.abs(e.t.ts - u.t.ts) > TRE) return;
        if (e.v.q > q || e.v.q * 100n < q * 98n) return;
        if (!best || Math.abs(e.t.ts - u.t.ts) < Math.abs(best.t.ts - u.t.ts)) best = e;
      });
      if (best) { best.usata = true; u.t.abbinata = best.t.riga; best.t.abbinata = u.t.riga; u.t.trasfDiff = q - best.v.q; best.t.trasfIn = true; abbinati++; }
    });
    return abbinati;
  }
  function stable(s) { return STABLE.indexOf(s) >= 0; }
  function r2(x) { return Math.round(x * 100) / 100; }

  /* pila LIFO di una cripto */
  function pila(k, simbolo) { return { chiave: k, simbolo: simbolo, strati: [], parcheggio: [], saldoMax: 0n, scoperto: 0n, nMov: 0 }; }
  function carica(P, q, costo, data, origine, rif) {
    if (q <= 0n) return;
    P.strati.push({ q: q, costo: costo, data: data, origine: origine, rif: rif });
    var tot = P.strati.reduce(function (a, s) { return a + s.q; }, 0n); if (tot > P.saldoMax) P.saldoMax = tot;
  }
  /* scarica q dagli strati più recenti; restituisce costo scaricato, strati usati e quantità scoperta (senza strati) */
  function scarica(P, q) {
    var resto = q, costo = 0, usati = [];
    while (resto > 0n && P.strati.length) {
      var s = P.strati[P.strati.length - 1], prendi = s.q < resto ? s.q : resto;
      var c = prendi === s.q ? s.costo : s.costo * D.decNum(prendi) / D.decNum(s.q);
      usati.push({ data: s.data, q: prendi, costo: c, origine: s.origine });
      costo += c; s.q -= prendi; s.costo -= c; resto -= prendi;
      if (s.q === 0n) P.strati.pop();
    }
    if (resto > 0n) P.scoperto += resto;
    return { costo: costo, usati: usati, scoperto: resto };
  }
  function fotografia(pile) {
    var out = {};
    Object.keys(pile).forEach(function (k) {
      var P = pile[k], q = P.strati.reduce(function (a, s) { return a + s.q; }, 0n);
      out[k] = { q: q, costo: P.strati.reduce(function (a, s) { return a + s.costo; }, 0), strati: P.strati.map(function (s) { return { q: s.q, costo: s.costo, data: s.data, origine: s.origine }; }) };
    });
    return out;
  }

  /* Correzioni dello studio, per riga del file Koinly (opz.correzioni[riga] = { azione, importo }):
     - valore: controvalore in euro dell'operazione inserito a mano (operazioni senza valore o con valore errato);
     - deposito da wallet non collegato: «costo» (costo d'acquisto documentato), «interno» (rientro da wallet proprio: recupera
       gli strati messi da parte da un prelievo «interno» della stessa cripto), «zero» (costo zero, prudenziale), predefinito valore del giorno;
     - prelievo verso indirizzo non collegato: «interno» (trasferimento a wallet proprio: gli strati restano da parte, senza cessione),
       «cessione» (cessione a terzi con corrispettivo = importo), predefinito uscita senza corrispettivo. */
  function correzione(o, t) { var c = o.correzioni && o.correzioni[t.riga]; return c && c.azione ? c : null; }

  /* dati: risultato di KoinlyDetenzione.leggiTransazioni; opz: { anno, fuso, correzioni } */
  function calcola(dati, opz) {
    var o = opz || {}, fuso = o.fuso || dati.fuso || "UTC", anno = o.anno, daVerificare = [];
    var inizio = anno + "-01-01", fine = anno + "-12-31";
    var pile = {}, eventi = [], avvisi = {}, fotoInizio = null, fotoFine = null, valuteValore = {};
    var get = function (v) { return pile[v.valuta] || (pile[v.valuta] = pila(v.valuta, v.simbolo)); };
    var abbinati = abbinaTrasferimenti(dati.movimenti);
    var nota = function (k, testo) { avvisi[k] = avvisi[k] || { testo: testo, n: 0 }; avvisi[k].n++; };

    dati.movimenti.forEach(function (t) {
      var g = D.giorno(t.ts, fuso);
      if (anno && !fotoInizio && g >= inizio) fotoInizio = fotografia(pile);
      if (anno && !fotoFine && g > fine) fotoFine = fotografia(pile);
      valuteValore[t.valutaValore] = true;
      var da = t.voci.filter(function (v) { return v.lato === "da"; })[0], a = t.voci.filter(function (v) { return v.lato === "a"; })[0], fee = t.voci.filter(function (v) { return v.lato === "fee"; })[0];
      var nel = anno ? g >= inizio && g <= fine : true;
      var registra = function (e) { e.data = g; e.riga = t.riga; e.tipoKoinly = t.tipo; e.tag = t.tag; if (nel) eventi.push(e); };
      var tag = etichetta(t.tag);
      // trasferimento abbinato tra wallet propri: gli strati restano; la differenza (commissione) si scarica
      if (t.abbinata) {
        if (t.trasfDiff > 0n && da) { var Pd = get(da); Pd.nMov++; var sd = scarica(Pd, t.trasfDiff); registra({ tipo: "commissione", chiave: da.valuta, simbolo: da.simbolo, q: t.trasfDiff, corrispettivo: 0, costo: sd.costo, scoperto: sd.scoperto, usati: sd.usati }); }
        if (da) get(da).nMov++; if (a) get(a).nMov++;
        return;
      }

      // commissione: in valuta tradizionale è un onere; in cripto scarica strati (il valore è quello indicato da Koinly)
      var onere = 0;
      if (fee) {
        if (fiat(fee.simbolo)) onere = fee.simbolo === "EUR" ? -D.decNum(fee.q) : t.valoreFee;
        else {
          var Pf = get(fee); Pf.nMov++;
          var sf = scarica(Pf, -fee.q);
          onere = t.valoreFee || 0;
          if (sf.scoperto > 0n) nota("scopertoFee", "Commissioni pagate con cripto senza strati di costo: storico incompleto");
          registra({ tipo: "commissione", chiave: fee.valuta, simbolo: fee.simbolo, q: -fee.q, corrispettivo: onere, costo: sf.costo, scoperto: sf.scoperto, usati: sf.usati });
        }
      }
      // trasferimento tra wallet propri: stessa cripto in uscita e in entrata
      if (da && a && da.valuta === a.valuta) {
        var diff = -da.q - a.q; // eventuale differenza = commissione implicita
        if (diff > 0n && !fiat(da.simbolo)) { var Pt = get(da); var st = scarica(Pt, diff); registra({ tipo: "commissione", chiave: da.valuta, simbolo: da.simbolo, q: diff, corrispettivo: 0, costo: st.costo, scoperto: st.scoperto, usati: st.usati }); }
        return;
      }
      var daF = da && fiat(da.simbolo), aF = a && fiat(a.simbolo);
      var corr0 = correzione(o, t);
      // corrispettivo / costo in euro dell'operazione
      var valoreOp = daF && da.simbolo === "EUR" ? -D.decNum(da.q) : aF && a.simbolo === "EUR" ? D.decNum(a.q) : t.valore;
      var segnala = function (tipo, v) { daVerificare.push({ riga: t.riga, data: g, tipo: tipo, cripto: v.simbolo, chiave: v.valuta, q: D.decStr(v.q < 0n ? -v.q : v.q), wallet: tipo === "prelievo" ? t.walletDa : t.walletA, valore: t.valore, txHash: t.txHash, indirizzo: tipo === "prelievo" ? t.txDest : t.txSrc, correzione: corr0 }); };
      if (corr0 && corr0.azione === "valore" && corr0.importo != null) valoreOp = +corr0.importo;
      else if (!(valoreOp > 0) && (da || a) && !(daF && aF)) {
        nota("senzaValore", "Operazioni senza controvalore in euro nel file Koinly: costo o corrispettivo pari a zero, da verificare");
        if (!(da && a && !daF && !aF && PROVENTI.test(tag))) segnala("senza valore", (a && !aF) ? a : da);
      }

      // uscita della cripto ceduta
      if (da && !daF) {
        var P = get(da); P.nMov++;
        var s = scarica(P, -da.q);
        if (s.scoperto > 0n) nota("scoperto", "Cessioni di quantità senza strati di costo (saldo negativo): storico incompleto, costo zero sulla parte scoperta");
        var tipo, corr;
        if (a && aF) { tipo = "contro valuta"; corr = valoreOp - onere; }
        else if (a) { tipo = stable(a.simbolo) ? (stable(da.simbolo) ? "stablecoin / stablecoin" : "contro stablecoin") : stable(da.simbolo) ? "acquisto con stablecoin" : "permuta tra cripto"; corr = valoreOp; }
        else if (USCITE.test(tag)) { tipo = "uscita (" + tag.replace(/_/g, " ") + ")"; corr = 0; }
        else {
          segnala("prelievo", da);
          if (corr0 && corr0.azione === "interno") {
            // trasferimento a wallet proprio non collegato: gli strati restano da parte, nessuna cessione
            s.usati.forEach(function (u) { P.parcheggio.push({ q: u.q, costo: u.costo, data: u.data, origine: u.origine }); });
            registra({ tipo: "trasferimento a wallet proprio", chiave: da.valuta, simbolo: da.simbolo, q: -da.q, corrispettivo: 0, costo: 0, scoperto: s.scoperto, usati: s.usati, parcheggiato: s.costo });
            return finisciEntrata();
          }
          if (corr0 && corr0.azione === "cessione") { tipo = "cessione a terzi"; corr = +corr0.importo || 0; }
          else { tipo = "prelievo senza corrispettivo"; corr = 0; nota("prelievo", "Prelievi verso wallet non collegati a Koinly: il costo esce senza corrispettivo; verificare se sono trasferimenti a wallet propri"); }
        }
        registra({ tipo: tipo, chiave: da.valuta, simbolo: da.simbolo, q: -da.q, corrispettivo: corr, costo: s.costo, scoperto: s.scoperto, usati: s.usati, controparte: a ? a.simbolo : "" });
      }
      return finisciEntrata();
      // entrata della cripto ricevuta: nuovo strato
      function finisciEntrata() {
      if (a && !aF) {
        var Pa = get(a); Pa.nMov++;
        var costo, origine;
        if (da && daF) { costo = valoreOp + onere; origine = "acquisto con " + da.simbolo; }
        else if (da) { costo = valoreOp + (fee && !fiat(fee.simbolo) ? 0 : onere); origine = "permuta da " + da.simbolo; }
        else if (PROVENTI.test(tag)) { costo = valoreOp; origine = tag.replace(/_/g, " "); }
        else if (/loan/i.test(tag)) { costo = valoreOp; origine = "prestito ricevuto"; nota("prestito", "Cripto ricevute in prestito: caricate al valore del giorno, da verificare"); }
        else {
          segnala("deposito", a);
          if (corr0 && corr0.azione === "interno") {
            // rientro da wallet proprio: si recuperano gli strati messi da parte (LIFO), il resto al valore del giorno
            var resto = a.q, rec = 0;
            while (resto > 0n && Pa.parcheggio.length) {
              var sp = Pa.parcheggio[Pa.parcheggio.length - 1], pr = sp.q < resto ? sp.q : resto, cp = pr === sp.q ? sp.costo : sp.costo * D.decNum(pr) / D.decNum(sp.q);
              carica(Pa, pr, cp, sp.data, sp.origine + " (rientro da wallet proprio)", t.riga); rec += cp;
              sp.q -= pr; sp.costo -= cp; resto -= pr; if (sp.q === 0n) Pa.parcheggio.pop();
            }
            if (resto > 0n) { var vr = valoreOp * D.decNum(resto) / D.decNum(a.q); carica(Pa, resto, vr, g, "rientro da wallet proprio senza strati da parte: valore del giorno", t.riga); rec += vr; nota("rientro", "Rientri da wallet proprio superiori ai prelievi messi da parte: la differenza è caricata al valore del giorno"); }
            registra({ tipo: "carico", chiave: a.valuta, simbolo: a.simbolo, q: a.q, costo: rec, origine: "rientro da wallet proprio" });
            return;
          }
          if (corr0 && corr0.azione === "costo") { costo = +corr0.importo || 0; origine = "deposito con costo documentato"; }
          else if (corr0 && corr0.azione === "zero") { costo = 0; origine = "deposito a costo zero (prudenziale)"; }
          else { costo = valoreOp; origine = "deposito"; nota("deposito", "Depositi da wallet non collegati a Koinly: caricati al valore del giorno, verificare il costo d'origine"); }
        }
        carica(Pa, a.q, costo, g, origine, t.riga);
        registra({ tipo: "carico", chiave: a.valuta, simbolo: a.simbolo, q: a.q, costo: costo, origine: origine });
      }
      }
    });
    if (anno && !fotoInizio) fotoInizio = fotografia(pile);
    if (anno && !fotoFine) fotoFine = fotografia(pile);
    if (Object.keys(valuteValore).some(function (v) { return v !== "EUR"; })) nota("valuta", "Il file Koinly riporta controvalori in " + Object.keys(valuteValore).join(", ") + ": impostare l'euro come valuta dell'account Koinly");
    var r = riassunto(pile, eventi, fotoInizio, fotoFine, avvisi, anno, fuso);
    r.trasferimentiAbbinati = abbinati;
    // operazioni da verificare in tutto lo storico (incidono sui costi di ogni anno successivo), esclusi i token sospetti
    var spamK = {}; r.righe.forEach(function (x) { if (x.spam) spamK[x.chiave] = true; });
    r.daVerificare = daVerificare.filter(function (x) { return !spamK[x.chiave] && !D.motivoSpam({ chiave: x.chiave, mai: false }, false); });
    return r;
  }

  function riassunto(pile, eventi, fi, ff, avvisi, anno, fuso) {
    // token sospetti (spam): nome con indirizzi web, caratteri non latini, o mai con saldo positivo
    var principale = {};
    Object.keys(pile).forEach(function (k) { var P = pile[k], p = principale[P.simbolo]; if (!p || P.nMov > pile[p].nMov) principale[P.simbolo] = k; });
    var spam = function (k) { var P = pile[k]; return !!D.motivoSpam({ chiave: k, mai: !(P.saldoMax > 0n) }, false) || (principale[P.simbolo] !== k && P.saldoMax === 0n); };
    var righe = [];
    Object.keys(pile).forEach(function (k) {
      var P = pile[k], a = fi[k] || { q: 0n, costo: 0, strati: [] }, b = ff[k] || { q: 0n, costo: 0, strati: [] };
      var ev = eventi.filter(function (e) { return e.chiave === k; });
      var car = ev.filter(function (e) { return e.tipo === "carico"; }), sc = ev.filter(function (e) { return e.tipo !== "carico"; });
      if (a.q === 0n && b.q === 0n && !ev.length) return;
      righe.push({ chiave: k, simbolo: P.simbolo, spam: spam(k),
        qInizio: D.decStr(a.q), costoInizio: a.costo, qFine: D.decStr(b.q), costoFine: b.costo,
        qCaricata: D.decStr(car.reduce(function (s, e) { return s + e.q; }, 0n)), costoCaricato: car.reduce(function (s, e) { return s + e.costo; }, 0),
        qScaricata: D.decStr(sc.reduce(function (s, e) { return s + e.q; }, 0n)), costoScaricato: sc.reduce(function (s, e) { return s + e.costo; }, 0),
        corrispettivi: sc.reduce(function (s, e) { return s + (e.corrispettivo || 0); }, 0),
        stratiFine: b.strati.map(function (s) { return { data: s.data, q: D.decStr(s.q), costo: s.costo, unitario: D.decNum(s.q) ? s.costo / D.decNum(s.q) : 0, origine: s.origine }; }),
        scoperto: D.decStr(sc.reduce(function (s, e) { return s + (e.scoperto || 0n); }, 0n)) });
    });
    var conta = {}; righe.forEach(function (r) { if (!r.spam) conta[r.simbolo] = (conta[r.simbolo] || 0) + 1; });
    righe.forEach(function (r) { r.nome = r.spam || conta[r.simbolo] > 1 ? r.chiave : r.simbolo; });
    righe.sort(function (x, y) { return (x.spam - y.spam) || (y.costoFine + y.costoScaricato) - (x.costoFine + x.costoScaricato); });
    var spamK = {}; righe.forEach(function (r) { if (r.spam) spamK[r.chiave] = true; });
    var cessioni = eventi.filter(function (e) { return e.tipo !== "carico" && !spamK[e.chiave]; }).map(function (e) {
      return { data: e.data, riga: e.riga, cripto: e.simbolo, chiave: e.chiave, q: D.decStr(e.q), tipo: e.tipo, controparte: e.controparte || "", corrispettivo: e.corrispettivo || 0, costo: e.costo,
        risultato: (e.corrispettivo || 0) - e.costo, scoperto: e.scoperto && e.scoperto > 0n ? D.decStr(e.scoperto) : "",
        strati: (e.usati || []).map(function (u) { return { data: u.data, q: D.decStr(u.q), costo: u.costo, origine: u.origine }; }) };
    });
    // totali per tipo di cessione: fino al 2022 rilevano tutte; dal 2023, per il criterio dello studio, solo contro valuta e contro stablecoin
    var perTipo = {};
    cessioni.forEach(function (c) { var t = perTipo[c.tipo] || (perTipo[c.tipo] = { n: 0, corrispettivi: 0, costi: 0 }); t.n++; t.corrispettivi += c.corrispettivo; t.costi += c.costo; });
    var rilevanti = function (c) { return c.tipo === "contro valuta" || c.tipo === "contro stablecoin"; };
    var somma = function (f) { return cessioni.filter(f).reduce(function (s, c) { return { corrispettivi: s.corrispettivi + c.corrispettivo, costi: s.costi + c.costo }; }, { corrispettivi: 0, costi: 0 }); };
    var cessioniVere = function (c) { return !/^commissione|^prelievo|^uscita/.test(c.tipo); };
    return { anno: anno, fuso: fuso, righe: righe, cessioni: cessioni, perTipo: perTipo,
      totali: { tutte: somma(cessioniVere), controValutaStable: somma(rilevanti) },
      avvisi: Object.keys(avvisi).map(function (k) { return avvisi[k].testo + " (" + avvisi[k].n + ")"; }),
      spam: righe.filter(function (r) { return r.spam; }).length };
  }

  /* confronto con il costo dei report Koinly di inizio e fine anno (colonna «Costo (EUR)»), per simbolo */
  function confronta(ris, saldiInizio, saldiFine) {
    var perSimbolo = function (saldi) { var m = {}; (saldi || []).forEach(function (s) { if (s.tipo !== "fiat") { var x = m[s.simbolo] || (m[s.simbolo] = { q: 0, costo: 0 }); x.q += s.quantita || 0; x.costo += s.costo || 0; } }); return m; };
    var I = perSimbolo(saldiInizio), F = perSimbolo(saldiFine);
    ris.righe.forEach(function (r) {
      if (r.spam) return;
      if (I[r.simbolo]) { r.koinlyCostoInizio = I[r.simbolo].costo; delete I[r.simbolo]; }
      if (F[r.simbolo]) { r.koinlyCostoFine = F[r.simbolo].costo; delete F[r.simbolo]; }
    });
    var tot = function (k) { return ris.righe.reduce(function (s, r) { return s + (r.spam ? 0 : r[k] || 0); }, 0); };
    ris.confronto = { costoInizio: tot("costoInizio"), koinlyInizio: tot("koinlyCostoInizio"), costoFine: tot("costoFine"), koinlyFine: tot("koinlyCostoFine") };
    return ris;
  }

  /* Confronto cessione per cessione con l'elenco del Complete tax report Koinly (lettura.leggiCessioniPdf).
     ris: risultato di calcola per l'anno; koinly: cessioni Koinly (anche di più anni: si tengono solo quelle dell'anno).
     Abbinamento: stessa cripto, date entro un giorno (Koinly usa l'ora italiana), quantità uguale entro lo 0,5%.
     La differenza tra la plusvalenza Koinly dell'anno e la nostra plusvalenza rilevante si scompone in:
     operazioni che Koinly tassa ma che per noi non rilevano, differenze di corrispettivo e di costo sulle stesse cessioni,
     cessioni presenti solo in Koinly e cessioni presenti solo da noi. */
  function rilevante(tipo, anno) { return anno >= 2023 ? /^contro (valuta|stablecoin)$|^cessione a terzi$/.test(tipo) : !/^commissione|^prelievo|^uscita|^trasferimento/.test(tipo); }
  function confrontaCessioniKoinly(ris, koinly, anno) {
    var K = (koinly || []).filter(function (c) { return +c.data.slice(0, 4) === anno; });
    var N = ris.cessioni.map(function (c, i) { return { i: i, c: c, q: Number(c.q), usata: false }; });
    var giorni = function (a, b) { return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000; };
    var coppie = [], soloKoinly = [];
    K.forEach(function (k) {
      var best = null;
      N.forEach(function (n) {
        if (n.usata || n.c.cripto !== k.cripto || giorni(n.c.data, k.data) > 1) return;
        var d = Math.abs(n.q - k.quantita), tol = Math.max(1e-8, k.quantita * 0.005);
        if (d > tol) return;
        if (!best || d < best.d || (d === best.d && giorni(n.c.data, k.data) < giorni(best.n.c.data, k.data))) best = { n: n, d: d };
      });
      if (best) { best.n.usata = true; coppie.push({ k: k, n: best.n.c }); } else soloKoinly.push(k);
    });
    var soloNostre = N.filter(function (n) { return !n.usata; }).map(function (n) { return n.c; });
    var somma = function (arr, f) { return arr.reduce(function (s, x) { return s + f(x); }, 0); };
    var rilev = function (c) { return rilevante(c.tipo, anno); };
    var coppieRil = coppie.filter(function (p) { return rilev(p.n); }), coppieNonRil = coppie.filter(function (p) { return !rilev(p.n); });
    var soloNostreRil = soloNostre.filter(rilev);
    var plusKoinly = somma(K, function (k) { return k.risultato; });
    var voci = [
      { voce: "Plusvalenza Koinly dell'anno (elenco cessioni del report)", importo: plusKoinly },
      { voce: (anno >= 2023 ? "− operazioni che Koinly tassa ma che dal 2023 non rilevano (permute tra cripto, acquisti con stablecoin, commissioni, uscite)" : "− commissioni e uscite che Koinly tratta come cessioni"), importo: -somma(coppieNonRil, function (p) { return p.k.risultato; }), n: coppieNonRil.length },
      { voce: "+ differenze di corrispettivo sulle stesse cessioni", importo: somma(coppieRil, function (p) { return p.n.corrispettivo - p.k.ricavo; }), n: coppieRil.length },
      { voce: "− differenze di costo sulle stesse cessioni (LIFO globale dall'origine e correzioni)", importo: -somma(coppieRil, function (p) { return p.n.costo - p.k.costo; }), n: coppieRil.length },
      { voce: "− cessioni presenti solo in Koinly", importo: -somma(soloKoinly, function (k) { return k.risultato; }), n: soloKoinly.length },
      { voce: "+ cessioni rilevanti presenti solo nella ricostruzione", importo: somma(soloNostreRil, function (c) { return c.risultato; }), n: soloNostreRil.length }
    ];
    var calcolata = voci.reduce(function (s, v) { return s + v.importo; }, 0);
    var nostra = somma(ris.cessioni.filter(rilev), function (c) { return c.risultato; });
    return {
      anno: anno, koinly: { n: K.length, ricavo: somma(K, function (k) { return k.ricavo; }), costo: somma(K, function (k) { return k.costo; }), risultato: plusKoinly },
      nostra: { n: ris.cessioni.filter(rilev).length, risultato: nostra },
      voci: voci, quadratura: nostra - calcolata,
      differenze: coppieRil.map(function (p) { return { data: p.k.data, cripto: p.k.cripto, quantita: p.k.quantita, tipo: p.n.tipo, ricavoKoinly: p.k.ricavo, ricavo: p.n.corrispettivo, costoKoinly: p.k.costo, costo: p.n.costo, scarto: (p.n.corrispettivo - p.n.costo) - (p.k.ricavo - p.k.costo) }; })
        .sort(function (a, b) { return Math.abs(b.scarto) - Math.abs(a.scarto); }),
      nonRilevanti: coppieNonRil.map(function (p) { return { data: p.k.data, cripto: p.k.cripto, quantita: p.k.quantita, tipo: p.n.tipo, risultatoKoinly: p.k.risultato }; }),
      soloKoinly: soloKoinly, soloNostre: soloNostreRil
    };
  }

  return { calcola: calcola, confronta: confronta, confrontaCessioniKoinly: confrontaCessioniKoinly, rilevante: rilevante, STABLE: STABLE };
});
