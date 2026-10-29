/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · verifica della provenienza dei fondi investiti in cripto-attività, per il fascicolo di risposta all'Agenzia.
   Per ogni anno, in modo cumulato dal primo anno:
   - impiego: denaro entrato nelle piattaforme di cripto-attività (versamenti in valuta o acquisti pagati direttamente in valuta),
     meno quello tornato al cliente (prelievi in valuta o vendite accreditate direttamente);
   - capacità: redditi netti delle dichiarazioni (reddito complessivo meno imposte) e altre fonti documentate (eredità, donazioni,
     vendite di immobili, TFR...), degli anni fino a quello esaminato, anche precedenti al primo investimento;
   - tracciabilità: versamenti ritrovati negli estratti conto del cliente;
   - cripto entrate da wallet non collegati: provenienza da documentare (correzioni della scheda «Costi di carico»).
   Semaforo: verde = provenienza dimostrata; giallo = compatibile ma con avvisi; rosso = provenienza non dimostrata.
   Le soglie sono criteri dello studio, non previsti dalla norma. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyProvenienza = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SOGLIE = { impegno: 0.7, depositiIgnoti: 500 };
  var LIVELLO = { verde: 0, giallo: 1, rosso: 2 }, COLORI = ["verde", "giallo", "rosso"];
  var e = function (x) { return (Math.round((x || 0) * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };

  /* movimenti in valuta per anno e intermediario, dalla forma di movKoinlyValuta (ui.js): { data, intermediario, verso, importo }.
     Per ogni intermediario e anno, entrate = il maggiore tra versamenti e acquisti in valuta (un versamento seguito dall'acquisto non conta due volte),
     uscite = il maggiore tra prelievi e vendite in valuta. */
  function flussi(movimenti) {
    var g = {};
    (movimenti || []).forEach(function (m) {
      var k = m.data.slice(0, 4) + "|" + (m.intermediario || ""), x = g[k] || (g[k] = { anno: +m.data.slice(0, 4), versamenti: 0, acquisti: 0, prelievi: 0, vendite: 0, nVersamenti: 0 });
      if (m.verso === "versamento") { x.versamenti += m.importo; x.nVersamenti++; } else if (m.verso === "acquisto") x.acquisti += m.importo;
      else if (m.verso === "prelievo") x.prelievi += m.importo; else if (m.verso === "vendita") x.vendite += m.importo;
    });
    var anni = {};
    Object.keys(g).forEach(function (k) {
      var x = g[k], a = anni[x.anno] || (anni[x.anno] = { anno: x.anno, entrate: 0, uscite: 0 });
      a.entrate += Math.max(x.versamenti, x.acquisti); a.uscite += Math.max(x.prelievi, x.vendite);
    });
    return anni;
  }

  /* dati: {
       movimenti: [{ data, intermediario, verso, importo }] in valuta (Koinly),
       riscontro: { anniBanca: [2023], perAnno: { 2023: { versamenti: n, riscontrati: n } } } dagli estratti conto (o null),
       dichiarazioni: [{ anno, reddito, imposte, tipo }], fonti: [{ anno, importo, descrizione }],
       depositi: [{ data, valore, correzione: ""|"interno"|"costo"|"zero" }] cripto entrate da wallet non collegati,
       anni: anni da esaminare (facoltativo: altrimenti tutti quelli con movimenti) } */
  function valuta(dati, soglie) {
    var S = Object.assign({}, SOGLIE, soglie || {}), F = flussi(dati.movimenti);
    var dich = dati.dichiarazioni || [], fonti = dati.fonti || [], dep = dati.depositi || [], banca = dati.riscontro;
    var tutti = {};
    Object.keys(F).forEach(function (a) { tutti[a] = true; });
    dep.forEach(function (d) { tutti[d.data.slice(0, 4)] = true; });
    var elenco = (dati.anni && dati.anni.length ? dati.anni : Object.keys(tutti).map(Number)).slice().sort();
    if (!elenco.length) return { anni: [], semaforo: "verde", motivi: [], soglie: S };
    var primo = Math.min.apply(null, Object.keys(tutti).map(Number).concat(elenco)), ultimo = Math.max.apply(null, elenco);
    var netto = function (x) { return (+x.reddito || 0) - (+x.imposte || 0); };
    var out = [], impiego = 0, max = 0;
    for (var a = primo; a <= ultimo; a++) {
      var f = F[a] || { entrate: 0, uscite: 0 };
      impiego = Math.max(0, impiego + f.entrate - f.uscite);
      var capacita = dich.filter(function (x) { return x.anno <= a; }).reduce(function (s, x) { return s + netto(x); }, 0) + fonti.filter(function (x) { return x.anno <= a; }).reduce(function (s, x) { return s + (+x.importo || 0); }, 0);
      var haDich = dich.some(function (x) { return x.anno <= a; }) || fonti.some(function (x) { return x.anno <= a; });
      var motivi = [], add = function (l, t) { motivi.push({ livello: l, testo: t }); };
      if (f.entrate > 0 || impiego > 0) {
        if (!haDich) add("rosso", "Nessuna dichiarazione dei redditi né altra fonte documentata fino al " + a + ": impiego di " + e(impiego) + " senza riscontro reddituale.");
        else if (impiego > capacita) add("rosso", "Importi investiti al netto dei rientri (" + e(impiego) + ") superiori ai redditi netti dichiarati e alle altre fonti documentate fino al " + a + " (" + e(capacita) + ").");
        else if (impiego > capacita * S.impegno) add("giallo", "Importi investiti (" + e(impiego) + ") pari al " + Math.round(impiego / capacita * 100) + "% dei redditi netti e delle altre fonti fino al " + a + " (" + e(capacita) + "): compatibili, ma oltre il " + Math.round(S.impegno * 100) + "%; documentare i risparmi o altre entrate.");
        else add("verde", "Importi investiti (" + e(impiego) + ") compatibili con i redditi netti dichiarati e le altre fonti fino al " + a + " (" + e(capacita) + ").");
        if (f.entrate > 0 && haDich && !dich.some(function (x) { return x.anno === a; }) && !fonti.some(function (x) { return x.anno === a; })) add("giallo", "Manca la dichiarazione dei redditi del " + a + ", anno con versamenti per " + e(f.entrate) + ".");
      }
      if (f.entrate > 0) {
        var b = banca && banca.perAnno && banca.perAnno[a];
        if (!banca || (banca.anniBanca || []).indexOf(a) < 0) add("giallo", "Estratti conto del " + a + " non caricati: la provenienza dei versamenti (" + e(f.entrate) + ") dal conto del cliente non è verificata.");
        else if (b && b.versamenti && b.riscontrati < b.versamenti) add("giallo", (b.versamenti - b.riscontrati) + " versamenti su " + b.versamenti + " del " + a + " non ritrovati negli estratti conto caricati.");
        else add("verde", "Versamenti del " + a + " ritrovati negli estratti conto del cliente.");
      }
      var da = dep.filter(function (d) { return +d.data.slice(0, 4) === a; });
      var ignoti = da.filter(function (d) { return !d.correzione; }), zero = da.filter(function (d) { return d.correzione === "zero"; }), ok = da.filter(function (d) { return d.correzione === "interno" || d.correzione === "costo"; });
      var som = function (l) { return l.reduce(function (s, d) { return s + Math.abs(d.valore || 0); }, 0); };
      if (ignoti.length) add(som(ignoti) >= S.depositiIgnoti ? "rosso" : "giallo", ignoti.length + " depositi di cripto da wallet non collegati senza provenienza documentata (" + e(som(ignoti)) + "): chiarirli nella scheda «Costi di carico».");
      if (zero.length) add("giallo", zero.length + " depositi di cripto caricati a costo zero in via prudenziale (" + e(som(zero)) + "): la provenienza resta da documentare.");
      if (ok.length) add("verde", ok.length + " depositi di cripto da wallet non collegati documentati (rientri da wallet propri o costo d'acquisto documentato).");
      var lv = motivi.reduce(function (m, x) { return Math.max(m, LIVELLO[x.livello]); }, 0);
      if (elenco.indexOf(a) >= 0) { out.push({ anno: a, entrate: f.entrate, uscite: f.uscite, impiego: impiego, capacita: capacita, semaforo: motivi.length ? COLORI[lv] : "verde", motivi: motivi }); max = Math.max(max, lv); }
    }
    return { anni: out, semaforo: COLORI[max], motivi: out.reduce(function (l, x) { return l.concat(x.motivi.filter(function (m) { return m.livello !== "verde"; }).map(function (m) { return { anno: x.anno, livello: m.livello, testo: m.testo }; })); }, []), soglie: S };
  }

  /* anno d'imposta dal testo della prima pagina di una dichiarazione (Redditi PF, 730, CU) o dal nome del file */
  function annoDichiarazione(testo, nome) {
    var t = String(testo || ""), m;
    if ((m = /periodo\s+d['’]?\s*imposta\s+(20\d{2})/i.exec(t))) return { anno: +m[1], tipo: /730/.test(t) ? "730" : /certificazione unica/i.test(t) ? "CU" : "Redditi PF" };
    if ((m = /\b730\s*[\/\-]?\s*(20\d{2})/i.exec(t))) return { anno: +m[1] - 1, tipo: "730" };
    if ((m = /certificazione unica\s*(20\d{2})/i.exec(t))) return { anno: +m[1] - 1, tipo: "CU" };
    if ((m = /redditi\s*(?:pf\s*)?(20\d{2})/i.exec(t)) && /persone fisiche/i.test(t)) return { anno: +m[1] - 1, tipo: "Redditi PF" };
    if ((m = /(20\d{2})/.exec(String(nome || "")))) return { anno: +m[1], tipo: /730/.test(nome) ? "730" : /cu/i.test(nome) ? "CU" : "Redditi PF", daVerificare: true };
    return { anno: null, tipo: "Redditi PF", daVerificare: true };
  }

  return { valuta: valuta, flussi: flussi, annoDichiarazione: annoDichiarazione, SOGLIE: SOGLIE };
});
