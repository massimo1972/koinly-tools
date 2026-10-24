/* Koinly Tools · compilazione dei quadri del modello Redditi PF (RW, RT) e del modello F24.
   Quadro RW (istruzioni Redditi PF, fascicolo 2): un rigo per ogni periodo di detenzione, cinque righi (RW1-RW5) per modulo.
   Colonne usate per le cripto-attività: 1 titolo di possesso, 3 codice bene 21, 4 codice Stato (non obbligatorio per le cripto),
   5 quota di possesso, 6 criterio del valore (1 = valore di mercato), 7 valore iniziale, 8 valore finale, 10 giorni (IC),
   12 credito per imposte patrimoniali estere, 16 solo monitoraggio, 33 imposta calcolata, 34 imposta dovuta; rigo RW8 liquidazione. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyModelli = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function r2(x) { return Math.round((x || 0) * 100) / 100; }
  function r0(x) { return Math.round(x || 0); } // nel modello gli importi vanno in unità di euro

  /* iv: risultato di KoinlyIvaca.calcola (righe con i periodi); opz: { titolo: 1-4 } */
  function quadroRW(iv, opz) {
    var o = opz || {}, quota = Math.round(iv.quota * 10000) / 100, righi = [];
    iv.righe.filter(function (r) { return r.incluso; }).forEach(function (r) {
      r.periodi.forEach(function (p) {
        var ic = p.ivaca == null ? 0 : p.ivaca;
        righi.push({ cripto: r.nome, dal: p.dal, al: p.al, quantita: p.quantita,
          c1: o.titolo || 1, c3: 21, c4: "", c5: quota, c6: 1, c7: r0(p.valoreIniziale), c8: r0(p.valore), c10: p.giorni, c12: 0, c16: false, c33: ic, c34: ic });
      });
    });
    righi.forEach(function (x, i) { x.modulo = Math.floor(i / 5) + 1; x.rigo = "RW" + (i % 5 + 1); });
    var totale = righi.reduce(function (a, x) { return a + x.c34; }, 0);
    /* RW8: imposta complessiva sulla somma esatta dei righi (l'imposta di un rigo di un giorno vale frazioni di centesimo),
       arrotondata all'euro solo nel totale; si versa solo se supera 12 euro */
    var rw8 = { esatta: totale, imposta: r0(totale), eccedenzaPrecedente: 0, eccedenzaCompensata: 0, acconti: 0 };
    rw8.debito = rw8.imposta > 12 ? r0(rw8.imposta - rw8.acconti) : 0;
    return { anno: iv.anno, righi: righi, moduli: righi.length ? righi[righi.length - 1].modulo : 0, rw8: rw8 };
  }

  return { quadroRW: quadroRW };
});
