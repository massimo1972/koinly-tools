/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
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

  /* iv: risultato di KoinlyIvaca.calcola (righe con i periodi); opz: { titolo: 1-4, sogliaPeriodi: n }
     Le cripto con più di sogliaPeriodi periodi (per esempio interessi giornalieri) vanno in un rigo unico:
     col. 7 valore iniziale del primo periodo, col. 8 valore medio ponderato per i giorni, col. 10 giorni complessivi,
     così l'imposta del rigo è uguale alla somma dei periodi. */
  function quadroRW(iv, opz) {
    var o = opz || {}, quota = Math.round(iv.quota * 10000) / 100, righi = [], soglia = o.sogliaPeriodi == null ? 20 : o.sogliaPeriodi;
    iv.righe.filter(function (r) { return r.incluso; }).forEach(function (r) {
      if (soglia > 0 && r.periodi.length > soglia && r.valoreMedio != null) {
        var g = r.periodi.reduce(function (a, p) { return a + p.giorni; }, 0), ic = r.ivaca || 0;
        righi.push({ cripto: r.nome, dal: r.periodi[0].dal, al: r.periodi[r.periodi.length - 1].al, quantita: null, aggregato: r.periodi.length, valoreFinale: r.valoreFinale,
          c1: o.titolo || 1, c3: 21, c4: "", c5: quota, c6: 1, c7: r0(r.periodi[0].valoreIniziale), c8: r0(r.valoreMedio), c10: g, c12: 0, c16: false, c33: ic, c34: ic });
        return;
      }
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

  /* Quadro RT, sezione cripto-attività, secondo il modello dell'anno (istruzioni Redditi PF, fascicolo 2):
     anno 2023 → Redditi PF 2024, sezione II-B, righi RT31-RT39 (franchigia di 2.000 €: la parte che eccede, criterio dello studio;
       le istruzioni del rigo RT33 indicano la differenza intera se non inferiore a 2.000 €);
     anno 2024 → Redditi PF 2025, sezione V, righi RT41-RT45, RT57, RT88-RT90 (solo la parte oltre 2.000 €);
     anno 2025 → Redditi PF 2026, stessi righi, cessioni 2025 in RT41 col. 3-4 senza franchigia. Aliquota 26%.
     opz: { minusPrecedenti, eccedenzaPrecedente } */
  function quadroRT(anno, corrispettivi, costi, opz) {
    var o = opz || {}, c = r0(corrispettivi), k = r0(costi), diff = c - k, minus = r0(o.minusPrecedenti), ecc = r0(o.eccedenzaPrecedente);
    var out = { anno: anno, righi: [], minusvalenzaDaRiportare: 0 };
    var add = function (rigo, col, desc, v) { out.righi.push({ rigo: rigo, col: col, descrizione: desc, valore: v }); };
    if (anno === 2023) {
      out.modello = "Redditi PF 2024 · quadro RT, sezione II-B (cripto-attività)";
      // franchigia di 2.000 €: si indica la parte che eccede (criterio dello studio, come per il 2024)
      var plus23 = diff > 2000 ? diff - 2000 : 0, min23 = diff < -2000 ? -diff - 2000 : 0;
      add("RT31", "", "Totale dei corrispettivi", c);
      add("RT32", "2", "Totale dei costi o valori di acquisto", k);
      add("RT33", "1", "Minusvalenza (parte che eccede 2.000 €)", min23);
      add("RT33", "2", "Plusvalenza (RT31 − RT32 col. 2, per la parte che eccede 2.000 €)", plus23);
      var m23 = Math.min(minus, plus23);
      add("RT34", "", "Eccedenza delle minusvalenze degli anni precedenti", m23);
      add("RT35", "2", "Minusvalenze certificate dagli intermediari", 0);
      var base23 = plus23 - m23, imp23 = r0(base23 * 0.26), e23 = Math.min(ecc, imp23);
      add("RT36", "", "Differenza (RT33 col. 2 − RT34 − RT35 col. 2)", base23);
      add("RT37", "", "Imposta sostitutiva 26%", imp23);
      add("RT38", "", "Eccedenza d'imposta della dichiarazione precedente", e23);
      add("RT39", "", "Imposta sostitutiva dovuta", imp23 - e23);
      out.imposta = imp23 - e23; out.minusvalenzaDaRiportare = min23; out.rigoMinus = "RT94 col. 5";
      return out;
    }
    if (anno === 2024 || anno === 2025) {
      out.modello = (anno === 2024 ? "Redditi PF 2025" : "Redditi PF 2026") + " · quadro RT, sezione V (cripto-attività)";
      var soglia = anno === 2024 ? 2000 : 0; // dal 2025 nessuna franchigia per le cessioni dell'anno
      var plus = diff > soglia ? diff - soglia : 0, mn = diff < -soglia ? -diff - soglia : 0;
      if (anno === 2024) { add("RT41", "1", "Totale dei corrispettivi", c); add("RT41", "2", "Totale dei costi o valori di acquisto", k); }
      else { add("RT41", "3", "Corrispettivi delle cessioni 2025", c); add("RT41", "4", "Costi o valori di acquisto delle cessioni 2025", k); }
      var mm = Math.min(minus, plus);
      add("RT43", "", "Eccedenza delle minusvalenze degli anni precedenti", mm);
      add("RT44", "2", "Minusvalenze certificate dagli intermediari", 0);
      var e = Math.min(ecc, r0((plus - mm) * 0.26));
      add("RT45", "", "Eccedenza d'imposta della dichiarazione precedente", e);
      add("RT57", "1", "Minusvalenza", mn);
      add("RT57", "2", anno === 2024 ? "Plusvalenza, per la parte che eccede 2.000 €" : "Plusvalenza (nessuna franchigia per le cessioni 2025)", plus);
      add("RT88", "", "Differenza (RT57 col. 2 − RT43 − RT44 col. 2)", plus - mm);
      var imp = r0((plus - mm) * 0.26);
      add("RT89", "", "Imposta sostitutiva 26%", imp);
      add("RT90", "", "Imposta sostitutiva dovuta (RT89 − RT45)", imp - e);
      out.imposta = imp - e; out.minusvalenzaDaRiportare = mn; out.rigoMinus = "RT105 col. " + (anno === 2024 ? 5 : 5);
      return out;
    }
    out.nonGestito = anno <= 2022
      ? "Fino al 2022 le cripto seguono il regime delle valute (art. 67 c. 1 lett. c-ter TUIR): righi diversi, da compilare a cura dello studio dopo la verifica della giacenza oltre 51.645,69 €."
      : "Il modello Redditi PF per l'anno " + anno + " non è ancora disponibile.";
    return out;
  }

  /* Modello F24, sezione Erario, per i ravvedimenti calcolati (KoinlySanzioni.calcolaAnno).
     Codici: 1727 IC saldo, 1715 imposta sostitutiva RT, 8945 sanzione e 1945 interessi da ravvedimento sulle imposte
     (Ris. 36/E/2023, 10/E/2024, 12/E/2023; per l'IC per analogia), 8911 sanzione RW e dichiarazione tardiva.
     Anno di riferimento = anno d'imposta; rateazione 0101 solo per il 1727. Gli anni con dichiarazione omessa non vanno in F24. */
  function f24(calcoli) {
    var righe = [], esclusi = [];
    var add = function (codice, anno, importo, descr, rateazione) {
      importo = r2(importo); if (!(importo > 0)) return;
      var e = righe.filter(function (x) { return x.codice === codice && x.anno === anno; })[0];
      if (e) { e.importo = r2(e.importo + importo); e.descrizione += " + " + descr; } else righe.push({ codice: codice, anno: anno, rateazione: rateazione || "", importo: importo, descrizione: descr });
    };
    calcoli.forEach(function (r) {
      if (!r.ravvedibile) { esclusi.push(r.anno); return; }
      r.voci.forEach(function (v) {
        if (/IVACA/.test(v.voce)) { add("1727", r.anno, v.imposta, "IC saldo", "0101"); add("8945", r.anno, v.sanzione, "sanzione IC"); add("1945", r.anno, v.interessi, "interessi IC"); }
        else if (/RT/.test(v.voce)) { add("1715", r.anno, v.imposta, "imposta sostitutiva RT"); add("8945", r.anno, v.sanzione, "sanzione RT"); add("1945", r.anno, v.interessi, "interessi RT"); }
        else if (/RW/.test(v.voce)) add("8911", r.anno, v.sanzione, "sanzione RW");
        else if (/tardiva/.test(v.voce)) add("8911", r.anno, v.sanzione, "dichiarazione tardiva");
      });
    });
    var ordine = ["1727", "1715", "8945", "1945", "8911"];
    righe.sort(function (a, b) { return a.anno - b.anno || ordine.indexOf(a.codice) - ordine.indexOf(b.codice); });
    return { righe: righe, totale: r2(righe.reduce(function (a, x) { return a + x.importo; }, 0)), esclusi: esclusi };
  }

  /* Quadro RT, sezione dei redditi diversi al 26% (azioni, CFD e altri strumenti presso broker esteri), con importi inseriti a mano.
     Fino all'anno 2023 (Redditi PF 2021-2024): sezione II, righi RT21-RT29, minusvalenze da riportare in RT93 col. 5.
     Dall'anno 2024 (Redditi PF 2025-2026): sezione II-A, righi RT11-RT13, risultato in RT52, imponibile e imposta RT72-RT74, minus in RT102.
     Codice F24 1100. */
  function quadroRT26(anno, corrispettivi, costi, opz) {
    var o = opz || {}, c = r0(corrispettivi), k = r0(costi), diff = c - k, plus = diff > 0 ? diff : 0, minus = diff < 0 ? -diff : 0;
    var mp = Math.min(r0(o.minusPrecedenti), plus), base = plus - mp, imp = r0(base * 0.26);
    var out = { anno: anno, righi: [], imposta: imp, codiceTributo: "1100", minusvalenzaDaRiportare: minus };
    var add = function (rigo, col, desc, v) { out.righi.push({ rigo: rigo, col: col, descrizione: desc, valore: v }); };
    if (anno <= 2023) {
      out.modello = "Redditi PF " + (anno + 1) + " · quadro RT, sezione " + (anno === 2023 ? "II-A" : "II") + " (redditi diversi al 26%)";
      add("RT21", "", "Totale dei corrispettivi", c); add("RT22", "3", "Totale dei costi o valori di acquisto", k);
      add("RT23", "1", "Minusvalenza", minus); add("RT23", "2", "Plusvalenza", plus);
      add("RT24", "", "Minusvalenze degli anni precedenti (da RT93)", mp);
      add("RT26", "", "Imponibile", base); add("RT27", "", "Imposta sostitutiva 26%", imp); add("RT29", "", "Imposta dovuta", imp);
      out.rigoMinus = "RT93 col. 5";
    } else {
      out.modello = "Redditi PF " + (anno + 1) + " · quadro RT, sezione II-A (redditi diversi al 26%)";
      add("RT11", "1", "Totale dei corrispettivi", c); add("RT11", "2", "Totale dei costi o valori di acquisto", k);
      add("RT13", "", "Minusvalenze degli anni precedenti", mp);
      add("RT52", "1", "Minusvalenza", minus); add("RT52", "2", "Plusvalenza", plus);
      add("RT72", "", "Imponibile", base); add("RT73", "", "Imposta sostitutiva 26%", imp); add("RT74", "", "Imposta dovuta", imp);
      out.rigoMinus = "RT102";
    }
    return out;
  }
  /* Quadro RM, redditi di capitale di fonte estera senza ritenuta italiana (imposta sostitutiva 26% sul lordo delle ritenute estere).
     Fino all'anno 2023: sezione V, rigo RM12 (imposta in col. 6). Dall'anno 2024: sezione II-A, rigo RM31 (imposta in col. 8).
     righe: [{ lettera: "H" dividendi | "G" interessi bancari | "B" OICR armonizzati | "I" altri, stato: codice Stato, lordo }]. Codice F24 1242. */
  function quadroRM(anno, righe) {
    var rigo = anno <= 2023 ? "RM12" : "RM31", colImp = anno <= 2023 ? "6" : "8";
    var out = { anno: anno, rigo: rigo, codiceTributo: "1242", modello: "Redditi PF " + (anno + 1) + " · quadro RM, " + (anno <= 2023 ? "sezione V" : "sezione II-A") + ", rigo " + rigo, righi: [] };
    (righe || []).filter(function (x) { return r0(x.lordo) > 0; }).forEach(function (x) {
      var l = r0(x.lordo), imp = r0(l * 0.26);
      out.righi.push({ lettera: x.lettera || "H", stato: x.stato || "", lordo: l, aliquota: 26, imposta: imp, colImposta: colImp });
    });
    out.imposta = out.righi.reduce(function (s, x) { return s + x.imposta; }, 0);
    return out;
  }

  return { quadroRW: quadroRW, quadroRT: quadroRT, quadroRT26: quadroRT26, quadroRM: quadroRM, f24: f24 };
});
