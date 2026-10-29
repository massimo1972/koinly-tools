/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · sanzioni e ravvedimento per cripto-attività non dichiarate (quadri RW e RT, imposta sul valore IVACA).
   Norme lette su Normattiva il 24/10/2026, testo previgente e testo modificato dal D.Lgs. 87/2024
   (violazioni commesse dal 1° settembre 2024, art. 5 c. 1 D.Lgs. 87/2024):
   - art. 13 D.Lgs. 472/1997 (ravvedimento): a) 1/10 entro 30 giorni dal mancato pagamento; a-bis) 1/9 entro 90 giorni dal termine
     della dichiarazione; b) 1/8 entro il termine della dichiarazione dell'anno in cui è commessa la violazione; b-bis) 1/7:
     previgente entro il termine della dichiarazione dell'anno successivo, nuovo testo oltre il termine della lettera b);
     b-ter) previgente 1/6 oltre tale termine (nel nuovo testo 1/6 solo dopo lo schema d'atto).
   - art. 1 D.Lgs. 471/1997: infedele dal 90% (previgente) / 70% min. 150 € (nuovo, c. 2, se contestata); con integrativa presentata
     prima di accessi, ispezioni e verifiche (c. 2-bis, nuovo) 25% × 2 = 50%, la misura che si applica al ravvedimento;
     omessa dal 120% min. 250 € (previgente 120%-240%); nuovo c. 1-bis: dichiarazione presentata oltre 90 giorni, entro i termini
     dell'accertamento e prima di accessi, ispezioni e verifiche, 25% × 3 = 75% delle imposte (se non dovute, da 250 a 1.000 €).
     Testo verificato su def.finanze.it (art. 1 in vigore dal 29/06/2024) il 29/10/2026.
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
  var INTERESSI = { 2017: 0.001, 2018: 0.003, 2019: 0.008, 2020: 0.0005, 2021: 0.0001, 2022: 0.0125, 2023: 0.05, 2024: 0.025, 2025: 0.02, 2026: 0.016, 2027: 0.016 };

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
  function frazioneDichiarazione(violazione, pagamento, nuovoForzato) {
    var nuovo = nuovoForzato != null ? nuovoForzato : violazione >= NUOVO_REGIME, annoV = +violazione.slice(0, 4);
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
    // 2023 e 2024: franchigia di 2.000 €, si tassa solo la parte che eccede (criterio dello studio; per il 2024 rigo RT57 Redditi PF 2025.
    // Le istruzioni Redditi PF 2024, rigo RT33, per il 2023 indicano invece la differenza intera se non inferiore a 2.000 €)
    if (anno === 2023 || anno === 2024) return { aliquota: 0.26, franchigia: 2000, nota: "Franchigia di 2.000 €: si tassa solo la parte che eccede." + (anno === 2023 ? " Nota: le istruzioni Redditi PF 2024 (rigo RT33) per il 2023 indicano la plusvalenza intera se non inferiore a 2.000 €." : "") };
    if (anno === 2025) return { aliquota: 0.26, franchigia: 0, nota: "Dal 2025 nessuna franchigia." };
    return { aliquota: 0.33, franchigia: 0, nota: "Dal 2026 aliquota del 33% (26% per i token di moneta elettronica in euro)." };
  }

  /* stato dei controlli alla data del ravvedimento (art. 13 c. 1 D.Lgs. 472/1997) */
  var CONTROLLI = { nessuno: "nessun controllo formalmente conosciuto", accesso: "accesso, ispezione o verifica in corso", pvc: "processo verbale di constatazione (PVC) notificato", schema: "schema di atto ricevuto, senza PVC", schemaPvc: "schema di atto ricevuto dopo il PVC", avviso: "avviso di accertamento o di liquidazione notificato" };
  /* riduzione da ravvedimento secondo i controlli in corso; senza controlli quella temporale */
  function frazioneControlli(violazione, pagamento, controlli, nuovo) {
    if (controlli === "pvc") return { f: 1 / 5, lettera: "b-quater", testo: "1/5: dopo la constatazione con processo verbale (PVC)" };
    if (controlli === "schema" && nuovo) return { f: 1 / 6, lettera: "b-ter", testo: "1/6: dopo lo schema di atto non preceduto da PVC (art. 6-bis c. 3 L. 212/2000)" };
    if (controlli === "schemaPvc") return nuovo ? { f: 1 / 4, lettera: "b-quinquies", testo: "1/4: dopo lo schema di atto preceduto da PVC" } : { f: 1 / 5, lettera: "b-quater", testo: "1/5: dopo il PVC (lo schema di atto non è previsto dal testo previgente)" };
    return frazioneDichiarazione(violazione, pagamento, nuovo);
  }
  /* termine di accertamento (art. 43 DPR 600/1973): 31/12 del quinto anno successivo a quello di presentazione, settimo se omessa */
  function decadenza(anno, omessa) { return (+termini(anno).dichiarazione.slice(0, 4) + (omessa ? 7 : 5)) + "-12-31"; }

  /* d: { anno, stato: "presentata" | "omessa", valoreRw, ivaca, plusvalenze, pagamento (AAAA-MM-GG),
          controlli: chiave di CONTROLLI (predefinito "nessuno"), esteri: tesi prudenziale della maggiorazione di 1/3 per redditi esteri
          (solo testo previgente), riduzione: maggiore imposta < 3% e < 30.000 € (art. 1 c. 4), fraudolente: condotte del comma 3,
          invio: data di invio della dichiarazione originaria (caso dubbio sulla decorrenza), regime: "previgente" | "nuovo" per forzarlo } */
  function calcolaAnno(d) {
    var T = termini(d.anno), pag = d.pagamento, C = CONTROLLI[d.controlli] ? d.controlli : "nessuno";
    var out = { anno: d.anno, stato: d.stato, termini: T, voci: [], note: [], avvisi: [], controlli: C };
    // l'imposta sul valore è dovuta dal 2023: prima resta solo l'obbligo di monitoraggio (RW) e la relativa sanzione
    // imposte in unità di euro, come nei quadri RW (rigo RW8) e RT della dichiarazione da cui si versano
    var valoreRw = Math.max(0, +d.valoreRw || 0), ivaca = d.anno >= 2023 ? Math.round(Math.max(0, +d.ivaca || 0)) : 0, plus = +d.plusvalenze || 0;
    var rt = regimeRt(d.anno), baseRt = Math.round(Math.max(0, plus - rt.franchigia)), impRt = Math.round(baseRt * rt.aliquota);
    var imposte = ivaca + impRt, tributi = [["Imposta sul valore (IVACA)", ivaca], ["Imposta sulle plusvalenze (RT)", impRt]];
    out.rt = { plusvalenze: plus, franchigia: rt.franchigia, base: baseRt, aliquota: rt.aliquota, imposta: impRt, nota: rt.nota };
    if (d.anno < 2023) out.note.push("Per il " + d.anno + " l'imposta sul valore delle cripto-attività (IVACA) non era dovuta (si applica dal 2023): niente imposta né sanzioni IVACA, resta la sanzione per omesso monitoraggio nel quadro RW.");

    var inTermine = pag <= T.dichiarazione;
    var regime = d.regime || (T.dichiarazione >= NUOVO_REGIME ? "nuovo" : "previgente"), nuovo = regime === "nuovo";
    var esteri = !nuovo && !!d.esteri, mEst = esteri ? 4 / 3 : 1;
    out.regime = regime; out.esteri = esteri;
    out.decadenza = decadenza(d.anno, d.stato === "omessa");
    var omessaOltre = d.stato === "omessa" && !inTermine && giorni(T.dichiarazione, pag) > 90;

    if (omessaOltre) {
      /* dichiarazione omessa oltre 90 giorni: non ravvedibile (art. 2 c. 7 DPR 322/1998). Versioni: presentazione spontanea prima dei controlli
         (testo vigente c. 1-bis 75%; previgente c. 1 secondo periodo 60% min. 200 € entro il termine della dichiarazione dell'anno successivo)
         e contestazione (120% min. 250 €, definibile a 1/3) */
      out.ravvedibile = false;
      tributi.forEach(function (x) { out.voci.push({ voce: x[0], imposta: x[1], sanzione: null, interessi: interessi(x[1], T.saldo, pag).importo }); });
      var intOm = out.voci.reduce(function (a, v) { return a + (v.interessi || 0); }, 0), omRw = valoreRw * 0.03;
      var omImp = imposte > 0 ? Math.max(imposte * 1.2 * mEst, 250) : 250;
      out.voci.push({ voce: "Sanzione per omessa dichiarazione: " + (esteri ? "160% (120% aumentato di 1/3 per redditi esteri, c. 8 previgente)" : "120%") + " delle imposte" + (nuovo ? "" : " (minimo; previgente dal 120% al 240%)") + ", minimo 250 € (art. 1 c. 1 D.Lgs. 471/1997)", imposta: 0, sanzione: omImp, interessi: 0 });
      out.voci.push({ voce: "Sanzione quadro RW: 3% (minimo, art. 5 c. 2 DL 167/1990) del valore non dichiarato di " + fmt(valoreRw), imposta: 0, sanzione: omRw, interessi: 0 });
      out.sanzionePiena = omImp + omRw;
      out.sanzioneUnTerzo = out.sanzionePiena / 3;
      out.versioni = [{ titolo: "Contestazione dell'Agenzia, sanzioni minime senza riduzioni", sanzione: out.sanzionePiena }, { titolo: "Contestazione definita con il pagamento di un terzo", sanzione: out.sanzioneUnTerzo }];
      var spont = null;
      if (C === "nessuno") {
        if (nuovo && pag <= out.decadenza) spont = { sanzione: (imposte > 0 ? imposte * 0.75 : 250) + omRw, titolo: "Dichiarazione presentata ora, prima dei controlli: 75% delle imposte (25% × 3, art. 1 c. 1-bis D.Lgs. 471/1997)" + (imposte > 0 ? "" : "; senza imposte dovute da 250 a 1.000 €") + ", più RW" };
        else if (!nuovo && pag <= termini(d.anno + 1).dichiarazione) spont = { sanzione: (imposte > 0 ? Math.max(imposte * 0.6 * mEst, 200) : 150) + omRw, titolo: "Dichiarazione presentata entro il termine di quella dell'anno successivo (" + it(termini(d.anno + 1).dichiarazione) + "), prima dei controlli: " + (esteri ? "80%" : "60%") + " delle imposte, minimo 200 € (art. 1 c. 1 secondo periodo D.Lgs. 471/1997 previgente), più RW" };
      }
      if (spont) {
        out.tardiva = { sanzione: spont.sanzione, totale: imposte + intOm + spont.sanzione };
        out.versioni.push({ titolo: spont.titolo, sanzione: spont.sanzione, principale: true });
        out.sanzioni = spont.sanzione; out.totale = out.tardiva.totale;
        out.note.push("Dichiarazione omessa per il " + d.anno + " (nulla presentato, neanche per altri redditi): oltre 90 giorni dalla scadenza non è ravvedibile, ma presentandola ora, prima di accessi, ispezioni o verifiche, la sanzione sulle imposte è quella indicata nella versione principale: " + fmt(spont.sanzione) + " con il quadro RW. È la versione più prudente: chiude la violazione senza attendere l'accertamento.");
        out.note.push("In alternativa, attendendo la contestazione dell'Agenzia, la sanzione minima (" + fmt(out.sanzionePiena) + ") si può definire pagando un terzo (" + fmt(out.sanzioneUnTerzo) + "), ma dipende dall'avvio del controllo e l'imposta resta dovuta con gli interessi.");
      } else {
        out.sanzioni = out.sanzioneUnTerzo; out.totale = imposte + intOm + out.sanzioneUnTerzo;
        out.note.push("Dichiarazione omessa per il " + d.anno + " (nulla presentato, neanche per altri redditi): il ravvedimento non è possibile, perché la dichiarazione presentata oltre 90 giorni dalla scadenza è considerata omessa (art. 2 c. 7 DPR 322/1998)" + (C !== "nessuno" ? "; con i controlli in corso non si applicano neanche le misure ridotte della presentazione spontanea" : "") + ".");
        out.note.push("In caso di contestazione la sanzione si può definire pagando un terzo di quella irrogata: " + fmt(out.sanzioneUnTerzo) + " sulle sanzioni minime qui calcolate.");
      }
      // per confronto: le sanzioni se il ravvedimento fosse valido (come per una dichiarazione presentata da integrare)
      out.ravvedimentoValido = calcolaAnno(Object.assign({}, d, { stato: "presentata", interno: true }));
      out.note.push("Per confronto, con un ravvedimento valido le sanzioni sarebbero " + fmt(out.ravvedimentoValido.sanzioni) + " (totale con imposte e interessi " + fmt(out.ravvedimentoValido.totale) + ").");
      return avvertenze(out, d, imposte, impRt, valoreRw);
    }
    if (d.stato !== "omessa" && !inTermine && C === "avviso") {
      // ravvedimento precluso dalla notifica dell'atto: sanzione piena per infedele e RW, definibile a 1/3 (acquiescenza)
      out.ravvedibile = false; out.precluso = true;
      var bp = nuovo ? 0.7 : 0.9 * mEst, rid = d.riduzione ? 2 / 3 : 1, fr = d.fraudolente ? 1.5 : 1, piena = 0;
      tributi.forEach(function (x) { if (!(x[1] > 0)) return; var s = Math.max(x[1] * bp * rid * fr, 150 * rid); piena += s; out.voci.push({ voce: x[0] + " · infedele " + pct(bp * rid * fr) + ", minimo " + fmt(150 * rid) + " (art. 1 c. 2 D.Lgs. 471/1997" + (nuovo ? "" : " previgente") + ")", imposta: x[1], sanzione: s, interessi: interessi(x[1], T.saldo, pag).importo }); });
      if (valoreRw > 0) { piena += valoreRw * 0.03; out.voci.push({ voce: "Quadro RW · 3% (minimo, art. 5 c. 2 DL 167/1990) di " + fmt(valoreRw), imposta: 0, sanzione: valoreRw * 0.03, interessi: 0 }); }
      out.sanzionePiena = piena; out.sanzioneUnTerzo = piena / 3;
      out.versioni = [{ titolo: "Sanzioni minime dell'atto, senza riduzioni", sanzione: piena }, { titolo: "Acquiescenza o definizione: un terzo delle sanzioni", sanzione: piena / 3, principale: true }];
      out.sanzioni = piena / 3; out.totale = imposte + out.voci.reduce(function (a, v) { return a + (v.interessi || 0); }, 0) + piena / 3;
      out.note.push("Avviso di accertamento o di liquidazione notificato: il ravvedimento è precluso (art. 13 c. 1-ter D.Lgs. 472/1997). Restano l'accertamento con adesione e l'acquiescenza.");
      out.ravvedimentoValido = calcolaAnno(Object.assign({}, d, { controlli: "nessuno", interno: true }));
      return avvertenze(out, d, imposte, impRt, valoreRw);
    }
    out.ravvedibile = true;
    if (d.stato === "omessa") {
      // dichiarazione omessa ma presentabile entro 90 giorni: tardiva, 1/10 del minimo per l'omissione (lettera c)
      out.note.push("Dichiarazione non ancora presentata ma entro 90 giorni dalla scadenza (" + it(T.dichiarazione) + "): presentandola ora si applica 1/10 della sanzione minima per l'omessa dichiarazione, 25 € (art. 13 c. 1 lett. c D.Lgs. 472/1997), più le sanzioni sui versamenti.");
      out.voci.push({ voce: "Dichiarazione tardiva: 1/10 di 250 €", imposta: 0, sanzione: 25, interessi: 0 });
      if (valoreRw > 0) {
        out.voci.push({ voce: "Quadro RW nella dichiarazione tardiva entro 90 giorni: 258 € (art. 5 c. 2 DL 167/1990) ridotti a 1/10", imposta: 0, sanzione: 25.8, interessi: 0 });
        out.note.push("Quadro RW nella dichiarazione presentata entro 90 giorni: la sanzione fissa di 258 € si riduce a 1/10 (25,80 €) con la lettera c; secondo un'altra lettura si riduce a 1/9 (28,67 €). È più prudente la seconda.");
      }
    }

    if (inTermine || d.stato === "omessa") {
      // termine non scaduto, o dichiarazione tardiva entro 90 giorni: RW e RT si indicano senza sanzioni da infedeltà; resta l'omesso versamento del saldo
      if (inTermine) out.note.push("Il termine della dichiarazione per il " + d.anno + " (" + it(T.dichiarazione) + ") non è ancora scaduto: indicando RW e RT nella dichiarazione non ci sono sanzioni per infedele dichiarazione. Il saldo era dovuto il " + it(T.saldo) + ": si ravvede l'omesso versamento.");
      var bv = baseVersamento(T.saldo, pag), fv = frazioneVersamento(T.saldo, pag);
      tributi.forEach(function (x) {
        if (!(x[1] > 0)) return;
        out.voci.push({ voce: x[0] + " · omesso versamento " + bv.testo + " ridotto a " + fv.testo, imposta: x[1], sanzione: pag > T.saldo ? x[1] * bv.aliquota * fv.f : 0, interessi: interessi(x[1], T.saldo, pag).importo, frazione: fv });
      });
      return avvertenze(chiudi(out), d, imposte, impRt, valoreRw);
    }

    // dichiarazione presentata senza RW e RT: integrativa con ravvedimento
    var fd = frazioneControlli(T.dichiarazione, pag, C, nuovo);
    var c2 = !nuovo || C !== "nessuno" || d.fraudolente; // senza controlli e senza frodi, nel testo vigente vale il comma 2-bis
    var base = nuovo ? (c2 ? 0.7 : 0.5) : 0.9 * mEst, r13 = c2 && d.riduzione ? 2 / 3 : 1, f3 = d.fraudolente ? 1.5 : 1, minimo = c2 ? 150 * r13 : 0;
    var aliq = base * r13 * f3;
    var testoInf = !nuovo ? "infedele " + pct(aliq) + (esteri ? " (90% aumentato di 1/3 per redditi esteri, c. 8 previgente)" : "") + ", minimo " + fmt(minimo) + " (art. 1 c. 2 D.Lgs. 471/1997 previgente" + (d.riduzione ? ", ridotta di 1/3 per il c. 4" : "") + (d.fraudolente ? ", aumentata della metà per il c. 3" : "") + ")"
      : c2 ? "infedele " + pct(aliq) + ", minimo " + fmt(minimo) + " (art. 1 c. 2 D.Lgs. 471/1997" + (C !== "nessuno" ? ": con i controlli in corso il comma 2-bis non spetta" : "") + (d.riduzione ? "; ridotta di 1/3 per il c. 4" : "") + (d.fraudolente ? "; aumentata della metà per il c. 3" : "") + ")"
      : "infedele con integrativa 50% (25% × 2, art. 1 c. 2-bis D.Lgs. 471/1997)";
    out.frazione = fd; out.aliquotaInfedele = aliq;
    tributi.forEach(function (x) {
      if (!(x[1] > 0)) return;
      // il minimo in euro si applica quando la percentuale dà un importo inferiore, e si riduce anch'esso con il ravvedimento
      var s = Math.max(x[1] * aliq, minimo) * fd.f;
      out.voci.push({ voce: x[0] + " · " + testoInf + ", ridotta a " + fd.testo, imposta: x[1], sanzione: s, interessi: interessi(x[1], T.saldo, pag).importo, frazione: fd });
    });
    if (valoreRw > 0) out.voci.push({ voce: "Quadro RW · 3% (minimo, art. 5 c. 2 DL 167/1990) di " + fmt(valoreRw) + ", ridotto a " + fd.testo, imposta: 0, sanzione: valoreRw * 0.03 * fd.f, interessi: 0, frazione: fd });
    if (!c2 && d.riduzione) out.note.push("La riduzione di 1/3 dell'art. 1 c. 4 riguarda la sanzione del comma 2 (infedele contestata), non quella del comma 2-bis: non è applicata.");
    if (nuovo && imposte > 0 && !c2) {
      // per confronto: infedele contestata dall'Agenzia, art. 1 c. 2 nel nuovo testo (70%, minimo 150 €), senza le riduzioni del ravvedimento
      out.contestata = tributi.reduce(function (a, x) { return a + (x[1] > 0 ? Math.max(x[1] * 0.7 * (d.riduzione ? 2 / 3 : 1), 150 * (d.riduzione ? 2 / 3 : 1)) : 0); }, 0);
      out.note.push("Con l'integrativa presentata prima di accessi, ispezioni o verifiche la sanzione è il 50% delle imposte (art. 1 c. 2-bis D.Lgs. 471/1997), ridotto con il ravvedimento. Se invece l'infedeltà fosse contestata dall'Agenzia si applicherebbe il 70%, minimo 150 € (art. 1 c. 2): " + fmt(out.contestata) + " sulle imposte, oltre alla sanzione RW.");
    }
    if (C !== "nessuno") out.note.push("Controlli: " + CONTROLLI[C] + ". Il ravvedimento resta possibile fino alla notifica dell'avviso di accertamento o di liquidazione; la riduzione è " + fd.testo + ".");
    if (valoreRw > 0 && fd.lettera === "a-bis") out.note.push("Quadro RW integrato entro 90 giorni dal termine: secondo una lettura si applica la sanzione fissa di 258 € ridotta a 1/9 (28,67 €) invece del 3% ridotto; qui è calcolato il 3% ridotto.");
    if (nuovo && out.voci.filter(function (v) { return v.sanzione > 0; }).length > 1) out.note.push("Dal 1/9/2024 il cumulo giuridico si applica anche al ravvedimento (art. 12 c. 8 D.Lgs. 472/1997): le violazioni dello stesso periodo d'imposta possono essere punite con una sanzione unica. Qui le sanzioni sono sommate per tributo e per il quadro RW: è la versione più prudente.");
    return avvertenze(chiudi(out), d, imposte, impRt, valoreRw);
  }
  function pct(x) { return String(Math.round(x * 10000) / 100).replace(".", ",") + "%"; }
  /* avvertenze comuni: versioni alternative (redditi esteri, caso dubbio sulla decorrenza, favor rei), termini di accertamento, soglie penali */
  function avvertenze(out, d, imposte, impRt, valoreRw) {
    if (d.interno) return out;
    var conSanzioni = !out.ravvedibile || out.voci.some(function (v) { return /infedele|RW/.test(v.voce); }), alt = function (x) { return calcolaAnno(Object.assign({}, d, x, { interno: true })); };
    if (out.regime === "previgente" && imposte > 0 && conSanzioni) {
      var e = alt({ esteri: !d.esteri });
      out.note.push("Redditi esteri (c. 8 previgente, aumento di 1/3): la maggiorazione per le cripto è controversa. " + (d.esteri ? "Qui è applicata la tesi prudenziale; con la tesi dell'aterritorialità delle cripto (criterio dello studio) le sanzioni sarebbero " : "Qui le cripto sono considerate aterritoriali (criterio dello studio); con la tesi prudenziale della maggiorazione le sanzioni sarebbero ") + fmt(e.sanzioni) + ". La più prudente è quella con la maggiorazione.");
    }
    if (out.termini.dichiarazione >= NUOVO_REGIME && d.invio && d.invio < NUOVO_REGIME && d.stato !== "omessa" && conSanzioni) {
      var a = alt({ regime: out.regime === "nuovo" ? "previgente" : "nuovo" });
      out.note.push("Caso dubbio: termine della dichiarazione dopo il 1/9/2024 ma invio il " + it(d.invio) + ". La tesi prevalente guarda al termine di presentazione (testo dal D.Lgs. 87/2024, qui applicato); guardando all'invio si applicherebbe il testo previgente, con sanzioni di " + fmt(a.sanzioni) + ". Manca una presa di posizione ufficiale univoca: la più prudente è la versione con le sanzioni più alte (" + fmt(Math.max(a.sanzioni, out.sanzioni)) + ").");
    }
    if (out.regime === "previgente" && conSanzioni && (imposte > 0 || valoreRw > 0)) {
      var n = alt({ regime: "nuovo" });
      out.note.push("Favor rei: per il ravvedimento si applica il testo previgente (art. 5 D.Lgs. 87/2024 esclude la retroattività delle misure più miti; legittimo per Cass. 1274/2025). Solo come possibile tesi difensiva in contenzioso (Cass. 2951/2025; CGT II grado Lombardia 1616/2026; CGT I grado Roma 2288/2026) le misure del nuovo testo darebbero sanzioni di " + fmt(n.sanzioni) + ".");
    }
    var gg = giorni(out.decadenza, d.pagamento);
    if (gg > 0) out.avvisi.push("Termine di accertamento scaduto il " + it(out.decadenza) + " (art. 43 DPR 600/1973" + (out.stato === "omessa" ? ", settimo anno per la dichiarazione omessa" : "") + "): l'anno non è più accertabile, salvo il raddoppio dei termini per le attività detenute in Stati o territori a fiscalità privilegiata. Valutare se regolarizzare.");
    else if (gg > -90) out.avvisi.push("Il termine di accertamento scade il " + it(out.decadenza) + ", entro 90 giorni dalla data di versamento (art. 43 DPR 600/1973).");
    else out.note.push("Termine di accertamento: " + it(out.decadenza) + " (art. 43 DPR 600/1973" + (out.stato === "omessa" ? ", settimo anno per la dichiarazione omessa" : "") + "); possibile raddoppio per le attività detenute in Stati o territori a fiscalità privilegiata.");
    if (out.stato === "omessa" && impRt > 50000) out.avvisi.push("Soglia penale: imposta evasa sulle plusvalenze di " + fmt(impRt) + ", oltre 50.000 € (omessa dichiarazione, art. 5 D.Lgs. 74/2000). Il ravvedimento non esclude il profilo penale, salvo le cause di non punibilità.");
    else if (out.stato !== "omessa" && impRt > 100000) out.avvisi.push("Possibile soglia penale: imposta evasa sulle plusvalenze di " + fmt(impRt) + ", oltre 100.000 € (dichiarazione infedele, art. 4 D.Lgs. 74/2000, se gli elementi attivi sottratti superano anche il 10% di quelli dichiarati o 2 milioni). Il ravvedimento non esclude il profilo penale, salvo le cause di non punibilità.");
    return out;
  }
  function chiudi(out) {
    var s = function (k) { return out.voci.reduce(function (a, v) { return a + (v[k] || 0); }, 0); };
    out.imposte = s("imposta"); out.sanzioni = out.ravvedibile ? s("sanzione") : out.sanzioneUnTerzo; out.interessi = s("interessi");
    if (out.ravvedibile) out.totale = out.imposte + out.sanzioni + out.interessi;
    return out;
  }
  function fmt(x) { try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(x); } catch (e) { return x.toFixed(2) + " €"; } }

  return { calcolaAnno: calcolaAnno, CONTROLLI: CONTROLLI, decadenza: decadenza, termini: termini, interessi: interessi, frazioneDichiarazione: frazioneDichiarazione, frazioneVersamento: frazioneVersamento, baseVersamento: baseVersamento, regimeRt: regimeRt, TERMINI: TERMINI, INTERESSI: INTERESSI };
});
