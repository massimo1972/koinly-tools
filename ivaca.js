/* Koinly Tools · imposta sul valore delle cripto-attività (IVACA, quadro RW col. 33).
   Istruzioni Redditi PF: imposta = valore finale × 0,20% × quota × giorni / 365 (art. 19 cc. 18-21 DL 201/2011).
   Valore iniziale e finale sono quelli di inizio e fine detenzione, non del 1/1 e del 31/12: ogni periodo a quantità
   costante è un rigo RW con i suoi giorni e il suo valore finale. Il valore medio ponderato per i giorni è solo un confronto. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyIvaca = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PARAMETRI = { aliquota: 0.002, divisore: 365, sogliaVersamento: 12 };

  /* prezzo medio per simbolo da un report Koinly di saldi (valore / quantità) */
  function prezziReport(saldi) {
    var rep = {};
    (saldi || []).forEach(function (s) { if (s.tipo !== "fiat" && s.quantita) { var r = rep[s.simbolo] || (rep[s.simbolo] = { q: 0, v: 0 }); r.q += s.quantita; r.v += s.valore || 0; } });
    var out = {}; Object.keys(rep).forEach(function (k) { if (rep[k].q > 0) out[k] = rep[k].v / rep[k].q; });
    return out;
  }

  /* calc: risultato di KoinlyDetenzione.calcola
     opz: { quota (0-1), saldiInizio, saldiFine (report Koinly), inclusi: { chiave: bool }, valori: { chiave: valore finale a mano } } */
  function calcola(calc, opz) {
    var o = opz || {}, P = Object.assign({}, PARAMETRI, o.parametri || {});
    var quota = o.quota == null ? 1 : o.quota, k = P.aliquota * quota / P.divisore;
    var inizio = calc.anno + "-01-01", fine = calc.anno + "-12-31";
    var pxIni = prezziReport(o.saldiInizio), pxFin = prezziReport(o.saldiFine);
    var righe = calc.righe.map(function (r) {
      var incluso = o.inclusi && o.inclusi[r.chiave] != null ? !!o.inclusi[r.chiave] : !r.spam;
      var periodi = r.periodi.map(function (p) {
        var q = Object.assign({}, p);
        q.fonteIniziale = q.inizioStimato ? "stima" : "transazione"; q.fonteFinale = q.prezzoStimato ? "stima" : "transazione";
        if (q.dal === inizio && pxIni[r.simbolo] != null) { q.prezzoInizio = pxIni[r.simbolo]; q.valoreIniziale = q.quantitaN * q.prezzoInizio; q.fonteIniziale = "report"; }
        if (q.al === fine && pxFin[r.simbolo] != null) { q.prezzo = pxFin[r.simbolo]; q.valore = q.quantitaN * q.prezzo; q.fonteFinale = "report"; }
        return q;
      });
      var ultimo = periodi[periodi.length - 1];
      if (ultimo && o.valori && o.valori[r.chiave] != null && o.valori[r.chiave] !== "") { ultimo.valore = +o.valori[r.chiave]; ultimo.fonteFinale = "manuale"; }
      // periodi consecutivi: il valore iniziale è il valore finale del periodo precedente
      periodi.forEach(function (p, i) {
        var prec = periodi[i - 1];
        if (prec && prec.valore != null && giornoDopo(prec.al) === p.dal) { p.valoreIniziale = prec.valore; p.fonteIniziale = "precedente"; }
      });
      periodi.forEach(function (p) { p.ivaca = p.valore == null ? null : p.valore * p.giorni * k; });
      var completi = periodi.every(function (p) { return p.valore != null; });
      var ivaca = completi ? periodi.reduce(function (a, p) { return a + p.ivaca; }, 0) : null;
      var sommaG = periodi.reduce(function (a, p) { return a + p.giorni; }, 0);
      var valMedio = sommaG && completi ? periodi.reduce(function (a, p) { return a + p.valore * p.giorni; }, 0) / sommaG : null;
      var note = r.note.slice();
      var stimati = periodi.filter(function (p) { return p.fonteFinale === "stima"; }).length;
      if (stimati) note.push(stimati + (stimati === 1 ? " valore finale stimato" : " valori finali stimati") + " con l'ultimo prezzo noto: verificarli" + (ultimo && ultimo.fonteFinale === "stima" ? " (l'ultimo si può inserire a mano)" : ""));
      if (!completi) note.push("Valori mancanti: inserire il valore finale a mano");
      return { chiave: r.chiave, nome: r.nome, spam: r.spam, incluso: incluso, giorni: r.giorni, iniziale: r.iniziale, finale: r.finale, primo: r.primo, ultimo: r.ultimo,
        periodi: periodi, quantitaMedia: r.quantitaMedia,
        valoreIniziale: periodi.length ? periodi[0].valoreIniziale : null, valoreFinale: ultimo ? ultimo.valore : null, fonteFinale: ultimo ? ultimo.fonteFinale : null,
        valoreMedio: valMedio, ivaca: ivaca, ivacaMedia: valMedio != null ? valMedio * sommaG * k : null, note: note };
    });
    var tot = function (key) { return righe.reduce(function (a, r) { return a + (r.incluso && r[key] != null ? r[key] : 0); }, 0); };
    var totale = tot("ivaca");
    return { anno: calc.anno, quota: quota, parametri: P, righe: righe,
      totali: { ivaca: totale, ivacaMedia: tot("ivacaMedia"), righiRw: righe.reduce(function (a, r) { return a + (r.incluso ? r.periodi.length : 0); }, 0) },
      daVersare: totale > P.sogliaVersamento, mancanti: righe.filter(function (r) { return r.incluso && r.ivaca == null; }).length };
  }

  function giornoDopo(g) { return new Date(Date.parse(g + "T00:00:00Z") + 86400000).toISOString().slice(0, 10); }

  return { calcola: calcola, PARAMETRI: PARAMETRI };
});
