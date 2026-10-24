/* Koinly Tools · sanzioni e ravvedimento per cripto-attività non dichiarate (quadri RW e RT, imposta sul valore IVACA).
   Norme lette su Normattiva il 24/10/2026, testo previgente e testo modificato dal D.Lgs. 87/2024
   (violazioni commesse dal 1° settembre 2024, art. 5 c. 1 D.Lgs. 87/2024):
   - art. 13 D.Lgs. 472/1997 (ravvedimento): a) 1/10 entro 30 giorni dal mancato pagamento; a-bis) 1/9 entro 90 giorni dal termine
     della dichiarazione; b) 1/8 entro il termine della dichiarazione dell'anno in cui è commessa la violazione; b-bis) 1/7:
     previgente entro il termine della dichiarazione dell'anno successivo, nuovo testo oltre il termine della lettera b);
     b-ter) previgente 1/6 oltre tale termine (nel nuovo testo 1/6 solo dopo lo schema d'atto).
   - art. 1 D.Lgs. 471/1997: infedele dal 90% (previgente) / 70% min. 150 € (nuovo); con integrativa (c. 2-bis, nuovo) 25% × 2 = 50%;
     omessa dal 120% min. 250 € (previgente 120%-240%).
   - art. 13 D.Lgs. 471/1997: omesso versamento 30% (previgente) / 25% (nuovo); metà entro 90 giorni; entro 15 giorni 1/15 per giorno.
   - art. 5 c. 2 DL 167/1990: RW omesso o infedele dal 3% al 15% degli importi non dichiarati (per le cripto niente raddoppio
     black list, circ. 30/E/2023).
   - interessi legali giorno per giorno (art. 13 c. 2 D.Lgs. 472/1997).
   La sanzione da infedele assorbe quella da omesso versamento sulla stessa imposta (circ. 42/E/2016): non si sommano. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlySanzioni = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NUOVO_REGIME = "2024-09-01";
  /* termine di presentazione della dichiarazione Redditi PF e scadenza del saldo, per anno d'imposta */
  var TERMINI = {
    2019: { dichiarazione: "2020-12-10", saldo: "2020-07-20" },
    2020: { dichiarazione: "2021-11-30", saldo: "2021-06-30" },
    2021: { dichiarazione: "2022-11-30", saldo: "2022-06-30" },
    2022: { dichiarazione: "2023-11-30", saldo: "2023-06-30" },
    2023: { dichiarazione: "2024-10-31", saldo: "2024-07-01" },
    2024: { dichiarazione: "2025-10-31", saldo: "2025-06-30" },
    2025: { dichiarazione: "2026-10-31", saldo: "2026-06-30" },
    2026: { dichiarazione: "2027-10-31", saldo: "2027-06-30" }
  };
  /* tasso di interesse legale per anno solare (art. 1284 c.c.) */
  var INTERESSI = { 2019: 0.008, 2020: 0.0005, 2021: 0.0001, 2022: 0.0125, 2023: 0.05, 2024: 0.025, 2025: 0.02, 2026: 0.016, 2027: 0.016 };

  function termini(anno) { return TERMINI[anno] || { dichiarazione: (anno + 1) + "-10-31", saldo: (anno + 1) + "-06-30" }; }
  function giorni(dal, al) { return Math.round((Date.parse(al + "T00:00:00Z") - Date.parse(dal + "T00:00:00Z")) / 86400000); }
  function piuGiorni(g, n) { return new Date(Date.parse(g + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
  function it(g) { return g ? g.slice(8, 10) + "/" + g.slice(5, 7) + "/" + g.slice(0, 4) : ""; }

  /* interessi legali dal giorno dopo la scadenza fino al giorno del pagamento compreso, con il tasso di ciascun anno */
  function interessi(importo, scadenza, pagamento) {
    if (!(importo > 0) || pagamento <= scadenza) return { importo: 0, giorni: 0, dettaglio: [] };
    var tot = 0, gg = 0, dett = [], d = piuGiorni(scadenza, 1);
    while (d <= pagamento) {
      var anno = +d.slice(0, 4), fineAnno = anno + "-12-31", fino = pagamento < fineAnno ? pagamento : fineAnno;
      var n = giorni(d, fino) + 1, tasso = INTERESSI[anno] != null ? INTERESSI[anno] : 0.016;
      var quota = importo * tasso * n / 365;
      dett.push({ anno: anno, giorni: n, tasso: tasso, importo: quota }); tot += quota; gg += n;
      d = piuGiorni(fino, 1);
    }
    return { importo: tot, giorni: gg, dettaglio: dett };
  }

  /* riduzione da ravvedimento per una violazione commessa in dichiarazione (termine "violazione") */
  function frazioneDichiarazione(violazione, pagamento) {
    var nuovo = violazione >= NUOVO_REGIME, annoV = +violazione.slice(0, 4);
    var tB = termini(annoV).dichiarazione;          // dichiarazione relativa all'anno in cui è commessa la violazione
    var tBbis = termini(annoV + 1).dichiarazione;   // previgente: dichiarazione dell'anno successivo
    if (pagamento <= piuGiorni(violazione, 90)) return { f: 1 / 9, lettera: "a-bis", testo: "1/9: entro 90 giorni dal termine della dichiarazione" };
    if (pagamento <= tB) return { f: 1 / 8, lettera: "b", testo: "1/8: entro il termine della dichiarazione per l'anno " + annoV + " (" + it(tB) + ")" };
    if (nuovo) return { f: 1 / 7, lettera: "b-bis", testo: "1/7: oltre il termine della dichiarazione per l'anno " + annoV + " (testo dal D.Lgs. 87/2024)" };
    if (pagamento <= tBbis) return { f: 1 / 7, lettera: "b-bis", testo: "1/7: entro il termine della dichiarazione per l'anno " + (annoV + 1) + " (" + it(tBbis) + ", testo previgente)" };
    return { f: 1 / 6, lettera: "b-ter", testo: "1/6: oltre il termine della dichiarazione per l'anno " + (annoV + 1) + " (testo previgente)" };
  }
  /* riduzione da ravvedimento per un omesso versamento (scadenza del saldo) */
  function frazioneVersamento(scadenza, pagamento) {
    var ritardo = giorni(scadenza, pagamento);
    if (ritardo <= 30) return { f: 1 / 10, lettera: "a", testo: "1/10: entro 30 giorni dalla scadenza" };
    if (ritardo <= 90) return { f: 1 / 9, lettera: "a-bis", testo: "1/9: entro 90 giorni dalla scadenza" };
    var r = frazioneDichiarazione(scadenza, pagamento);
    if (r.lettera === "a-bis") r = { f: 1 / 8, lettera: "b", testo: "1/8" };
    return r;
  }
  /* sanzione base dell'omesso versamento (art. 13 D.Lgs. 471/1997) secondo il ritardo */
  function baseVersamento(scadenza, pagamento) {
    var piena = scadenza >= NUOVO_REGIME ? 0.25 : 0.30, ritardo = giorni(scadenza, pagamento);
    if (ritardo <= 15) return { aliquota: piena / 2 * ritardo / 15, testo: (piena * 50) + "% × " + ritardo + "/15 (ritardo fino a 15 giorni)" };
    if (ritardo <= 90) return { aliquota: piena / 2, testo: (piena * 50) + "% (ritardo fino a 90 giorni)" };
    return { aliquota: piena, testo: (piena * 100) + "%" };
  }

  /* imposta sulle plusvalenze RT: aliquota e franchigia per anno */
  function regimeRt(anno) {
    if (anno <= 2022) return { aliquota: 0.26, franchigia: 0, nota: "Fino al 2022 le cripto seguono il regime delle valute: plusvalenze tassate solo se la giacenza ha superato 51.645,69 € per 7 giorni lavorativi continui. Verificare il presupposto prima di usare questo importo." };
    if (anno <= 2024) return { aliquota: 0.26, franchigia: 2000, nota: "Franchigia di 2.000 €: è tassata solo l'eccedenza (art. 67 c. 1 lett. c-sexies TUIR)." };
    if (anno === 2025) return { aliquota: 0.26, franchigia: 0, nota: "Dal 2025 nessuna franchigia." };
    return { aliquota: 0.33, franchigia: 0, nota: "Dal 2026 aliquota del 33% (26% per i token di moneta elettronica in euro)." };
  }

  /* d: { anno, stato: "presentata" | "omessa", valoreRw, ivaca, plusvalenze, pagamento (AAAA-MM-GG) } */
  function calcolaAnno(d) {
    var T = termini(d.anno), pag = d.pagamento, out = { anno: d.anno, stato: d.stato, termini: T, voci: [], note: [] };
    // l'imposta sul valore è dovuta dal 2023: prima resta solo l'obbligo di monitoraggio (RW) e la relativa sanzione
    var valoreRw = Math.max(0, +d.valoreRw || 0), ivaca = d.anno >= 2023 ? Math.max(0, +d.ivaca || 0) : 0, plus = +d.plusvalenze || 0;
    var rt = regimeRt(d.anno), baseRt = Math.max(0, plus - rt.franchigia), impRt = baseRt * rt.aliquota;
    var imposte = ivaca + impRt;
    out.rt = { plusvalenze: plus, franchigia: rt.franchigia, base: baseRt, aliquota: rt.aliquota, imposta: impRt, nota: rt.nota };
    if (d.anno < 2023) out.note.push("Per il " + d.anno + " l'imposta sul valore delle cripto-attività (IVACA) non era dovuta (si applica dal 2023): niente imposta né sanzioni IVACA, resta la sanzione per omesso monitoraggio nel quadro RW.");

    var inTermine = pag <= T.dichiarazione;
    var regime = T.dichiarazione >= NUOVO_REGIME ? "nuovo" : "previgente";
    out.regime = regime;
    if (d.stato === "omessa" && !inTermine && giorni(T.dichiarazione, pag) > 90) {
      /* dichiarazione omessa: niente ravvedimento; sanzioni minime e definizione agevolata a 1/3 */
      var omImp = imposte > 0 ? Math.max(imposte * 1.2, 250) : 250;
      var omRw = valoreRw * 0.03;
      out.ravvedibile = false;
      out.voci.push({ voce: "Imposta sul valore (IVACA)", imposta: ivaca, sanzione: null, interessi: interessi(ivaca, T.saldo, pag).importo });
      out.voci.push({ voce: "Imposta sulle plusvalenze (RT)", imposta: impRt, sanzione: null, interessi: interessi(impRt, T.saldo, pag).importo });
      out.voci.push({ voce: "Sanzione per omessa dichiarazione: 120% delle imposte" + (regime === "previgente" ? " (minimo; previgente dal 120% al 240%)" : "") + ", minimo 250 €", imposta: 0, sanzione: omImp, interessi: 0 });
      out.voci.push({ voce: "Sanzione quadro RW: 3% (minimo) del valore non dichiarato di " + fmt(valoreRw), imposta: 0, sanzione: omRw, interessi: 0 });
      out.sanzionePiena = omImp + omRw;
      out.sanzioneUnTerzo = out.sanzionePiena / 3;
      out.note.push("Dichiarazione omessa (non è stato presentato nulla per il " + d.anno + ", neanche per altri redditi): il ravvedimento non è tecnicamente possibile, perché la dichiarazione presentata oltre 90 giorni dalla scadenza è considerata omessa (art. 13 c. 2-ter D.Lgs. 472/1997).");
      out.note.push("In caso di contestazione la sanzione si può definire pagando un terzo di quella irrogata: " + fmt(out.sanzioneUnTerzo) + " sulle sanzioni minime qui calcolate. È opportuno che la violazione sia contestata dall'Agenzia delle Entrate e non pagata in autonomia.");
      out.totale = imposte + out.voci.reduce(function (a, v) { return a + (v.interessi || 0); }, 0) + out.sanzioneUnTerzo;
      // per confronto: le sanzioni se il ravvedimento fosse valido (come per una dichiarazione presentata da integrare)
      out.ravvedimentoValido = calcolaAnno({ anno: d.anno, stato: "presentata", valoreRw: valoreRw, ivaca: ivaca, plusvalenze: plus, pagamento: pag });
      out.note.push("Per confronto, con un ravvedimento valido le sanzioni sarebbero " + fmt(out.ravvedimentoValido.sanzioni) + " (totale con imposte e interessi " + fmt(out.ravvedimentoValido.totale) + ").");
      return chiudi(out);
    }
    out.ravvedibile = true;
    if (d.stato === "omessa") {
      // dichiarazione omessa ma presentabile entro 90 giorni: tardiva, 1/10 del minimo per l'omissione (lettera c)
      out.note.push("Dichiarazione non ancora presentata ma entro 90 giorni dalla scadenza (" + it(T.dichiarazione) + "): presentandola ora si applica 1/10 della sanzione minima per l'omessa dichiarazione, 25 € (art. 13 c. 1 lett. c D.Lgs. 472/1997), più le sanzioni sui versamenti.");
      out.voci.push({ voce: "Dichiarazione tardiva: 1/10 di 250 €", imposta: 0, sanzione: 25, interessi: 0 });
    }

    if (inTermine || d.stato === "omessa") {
      // termine non scaduto, o dichiarazione tardiva entro 90 giorni: RW e RT si indicano senza sanzioni da infedeltà; resta l'omesso versamento del saldo
      if (inTermine) out.note.push("Il termine della dichiarazione per il " + d.anno + " (" + it(T.dichiarazione) + ") non è ancora scaduto: indicando RW e RT nella dichiarazione non ci sono sanzioni per infedele dichiarazione. Il saldo era dovuto il " + it(T.saldo) + ": si ravvede l'omesso versamento.");
      var bv = baseVersamento(T.saldo, pag), fv = frazioneVersamento(T.saldo, pag);
      [["Imposta sul valore (IVACA)", ivaca], ["Imposta sulle plusvalenze (RT)", impRt]].forEach(function (x) {
        if (!(x[1] > 0)) return;
        out.voci.push({ voce: x[0] + " · omesso versamento " + bv.testo + " ridotto a " + fv.testo, imposta: x[1], sanzione: pag > T.saldo ? x[1] * bv.aliquota * fv.f : 0, interessi: interessi(x[1], T.saldo, pag).importo, frazione: fv });
      });
      return chiudi(out);
    }

    // dichiarazione presentata (o tardiva) senza RW e RT: integrativa con ravvedimento
    var fd = frazioneDichiarazione(T.dichiarazione, pag);
    var aliqInf = regime === "nuovo" ? 0.50 : 0.90;
    var testoInf = regime === "nuovo" ? "infedele con integrativa 50% (25% × 2, art. 1 c. 2-bis D.Lgs. 471/1997)" : "infedele 90% (minimo, art. 1 c. 2 D.Lgs. 471/1997 previgente)";
    out.frazione = fd;
    [["Imposta sul valore (IVACA)", ivaca], ["Imposta sulle plusvalenze (RT)", impRt]].forEach(function (x) {
      if (!(x[1] > 0)) return;
      var s = x[1] * aliqInf * fd.f; // il minimo di 150 € è del comma 2 (infedele contestata), non dell'integrativa del comma 2-bis
      out.voci.push({ voce: x[0] + " · " + testoInf + ", ridotta a " + fd.testo, imposta: x[1], sanzione: s, interessi: interessi(x[1], T.saldo, pag).importo, frazione: fd });
    });
    if (valoreRw > 0) out.voci.push({ voce: "Quadro RW · 3% (minimo, art. 5 c. 2 DL 167/1990) di " + fmt(valoreRw) + ", ridotto a " + fd.testo, imposta: 0, sanzione: valoreRw * 0.03 * fd.f, interessi: 0, frazione: fd });
    return chiudi(out);
  }
  function chiudi(out) {
    var s = function (k) { return out.voci.reduce(function (a, v) { return a + (v[k] || 0); }, 0); };
    out.imposte = s("imposta"); out.sanzioni = out.ravvedibile ? s("sanzione") : out.sanzioneUnTerzo; out.interessi = s("interessi");
    if (out.ravvedibile) out.totale = out.imposte + out.sanzioni + out.interessi;
    return out;
  }
  function fmt(x) { try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(x); } catch (e) { return x.toFixed(2) + " €"; } }

  return { calcolaAnno: calcolaAnno, termini: termini, interessi: interessi, frazioneDichiarazione: frazioneDichiarazione, frazioneVersamento: frazioneVersamento, regimeRt: regimeRt, TERMINI: TERMINI, INTERESSI: INTERESSI };
});
