/* Prove delle sanzioni e del ravvedimento: node test/sanzioni.test.js */
"use strict";
const assert = require("assert");
const Z = require("../sanzioni.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const PAG = "2026-10-24";
const voce = (r, re) => r.voci.find((v) => re.test(v.voce));

t("2022, dichiarazione presentata, testo previgente: oltre il termine della dichiarazione dell'anno successivo → 1/6", () => {
  const r = Z.calcolaAnno({ anno: 2022, stato: "presentata", valoreRw: 100000, ivaca: 500, plusvalenze: 10000, pagamento: PAG });
  assert.equal(r.regime, "previgente"); assert.equal(r.frazione.lettera, "b-ter");
  near(voce(r, /RW/).sanzione, 100000 * 0.03 / 6);
  near(voce(r, /RT/).imposta, 2600); near(voce(r, /RT/).sanzione, 2600 * 0.9 / 6);
  assert.ok(!voce(r, /IVACA/)); // IVACA non dovuta prima del 2023, resta la sanzione RW
  assert.ok(r.note.some((x) => /non era dovuta/.test(x)));
});
t("2023, termine 31/10/2024 (dopo il 1/9/2024): nuovo testo, oltre il termine dell'anno della violazione → 1/7; franchigia di 2.000 € anche nel 2023", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  assert.equal(r.regime, "nuovo"); assert.equal(r.frazione.lettera, "b-bis");
  near(voce(r, /RW/).sanzione, 70000 * 0.03 / 7);
  near(voce(r, /RT/).imposta, 3000 * 0.26); near(voce(r, /RT/).sanzione, 780 * 0.5 / 7);
  assert.ok(!voce(Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 1999, pagamento: PAG }), /RT/));
  near(voce(Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 5000, pagamento: PAG }), /RT/).imposta, 3000 * 0.26); // 2024: solo l'eccedenza
  near(voce(r, /IVACA/).sanzione, 140 * 0.5 / 7);
});
t("2024: ravvedimento entro il termine della dichiarazione del 2025 (31/10/2026) → 1/8", () => {
  const r = Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 50000, ivaca: 0, plusvalenze: 0, pagamento: PAG });
  assert.equal(r.frazione.lettera, "b"); near(r.sanzioni, 50000 * 0.03 / 8);
});
t("2025: dichiarazione ancora in termine → solo omesso versamento del saldo (25%, oltre 90 giorni → 1/8) e interessi", () => {
  const r = Z.calcolaAnno({ anno: 2025, stato: "presentata", valoreRw: 80000, ivaca: 160, plusvalenze: 1000, pagamento: PAG });
  assert.ok(!voce(r, /RW/)); near(voce(r, /IVACA/).sanzione, 160 * 0.25 / 8); near(voce(r, /RT/).imposta, 260);
  near(voce(r, /IVACA/).interessi, 160 * 0.016 * 116 / 365, 0.001);
});
t("Interessi legali giorno per giorno con il tasso di ciascun anno", () => {
  const i = Z.interessi(1000, "2024-12-31", "2025-01-31");
  near(i.importo, 1000 * 0.02 * 31 / 365, 0.0001); assert.equal(i.giorni, 31);
  const j = Z.interessi(1000, "2023-12-30", "2024-01-02");
  near(j.importo, 1000 * 0.05 * 1 / 365 + 1000 * 0.025 * 2 / 365, 0.0001);
});
t("Dichiarazione omessa dal 1/9/2024: non ravvedibile; principale la presentazione prima dei controlli al 75%, alternativa la contestazione definita a 1/3", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "omessa", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  assert.equal(r.ravvedibile, false);
  near(r.sanzionePiena, Math.max((140 + 780) * 1.2, 250) + 70000 * 0.03); near(r.sanzioneUnTerzo, r.sanzionePiena / 3);
  near(r.sanzioni, 920 * 0.75 + 2100); assert.ok(r.versioni.find((v) => v.principale && /c\. 1-bis/.test(v.titolo)));
  assert.ok(r.note.some((x) => /più prudente/.test(x)) && r.note.some((x) => /attendendo la contestazione/.test(x)));
  const v = r.ravvedimentoValido, p = Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  assert.ok(v && v.ravvedibile); near(v.sanzioni, p.sanzioni); near(v.totale, p.totale);
  const c = Z.calcolaAnno({ anno: 2023, stato: "omessa", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG, controlli: "accesso" });
  assert.ok(!c.tardiva); near(c.sanzioni, c.sanzioneUnTerzo);
});
t("Dichiarazione omessa fino al 31/8/2024: 60% minimo 200 € se presentata entro il termine dell'anno successivo, poi 120% definibile a 1/3", () => {
  const a = Z.calcolaAnno({ anno: 2021, stato: "omessa", valoreRw: 0, ivaca: 0, plusvalenze: 10000, pagamento: "2023-06-15" });
  assert.equal(a.regime, "previgente"); near(a.sanzioni, 2600 * 0.6);
  const b = Z.calcolaAnno({ anno: 2021, stato: "omessa", valoreRw: 0, ivaca: 0, plusvalenze: 10000, pagamento: PAG });
  assert.ok(!b.tardiva); near(b.sanzioni, 2600 * 1.2 / 3);
});
t("Dichiarazione omessa ma entro 90 giorni: tardiva con 1/10 di 250 € e ravvedimento dei versamenti", () => {
  const r = Z.calcolaAnno({ anno: 2024, stato: "omessa", valoreRw: 1000, ivaca: 50, plusvalenze: 0, pagamento: "2025-12-15" });
  assert.equal(r.ravvedibile, true); near(voce(r, /tardiva/).sanzione, 25); near(voce(r, /RW/).sanzione, 25.8); // RW: 258 € a 1/10
});
t("Dal 1/9/2024: integrativa al 50% (c. 2-bis), confronto con l'infedele contestata al 70% minimo 150 € (c. 2); prima del 2024 nessun confronto", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 0, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  near(r.contestata, 150 + 780 * 0.7); // minimo di 150 € per ciascuna imposta: IVACA 98 € → 150 €
  assert.ok(r.note.some((x) => /70%, minimo 150/.test(x)));
  near(Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 0, ivaca: 100, plusvalenze: 0, pagamento: PAG }).contestata, 150);
  assert.ok(Z.calcolaAnno({ anno: 2022, stato: "presentata", valoreRw: 1000, ivaca: 0, plusvalenze: 10000, pagamento: PAG }).contestata == null);
});
t("T1: infedele RT 2020, imposta 10.000 €, integrativa a ottobre 2026: testo previgente, 90% a 1/6 = 1.500 €; con la maggiorazione per redditi esteri 2.000 €", () => {
  const d = { anno: 2020, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 10000 / 0.26, pagamento: "2026-10-20" };
  const r = Z.calcolaAnno(d);
  assert.equal(r.regime, "previgente"); assert.equal(r.frazione.lettera, "b-ter"); near(r.sanzioni, 1500);
  assert.equal(voce(r, /RT/).interessi, Z.interessi(10000, "2021-06-30", "2026-10-20").importo);
  near(Z.calcolaAnno(Object.assign({ esteri: true }, d)).sanzioni, 2000);
  assert.ok(r.note.some((x) => /tesi prudenziale/.test(x)) && r.note.some((x) => /Favor rei/.test(x)));
  assert.ok(r.avvisi.some((x) => /scade il 31\/12\/2026/.test(x))); // presentata nel 2021: decadenza al 31/12/2026, entro 90 giorni
});
t("T2: infedele 2024, imposta 10.000 €: 50% a 1/8 = 625 € entro il 31/10/2026, poi 1/7 = 714,29 €; T3 dopo il PVC 70% a 1/5 = 1.400 €", () => {
  const d = { anno: 2024, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 2000 + 10000 / 0.26 };
  near(Z.calcolaAnno(Object.assign({ pagamento: "2026-10-20" }, d)).sanzioni, 625);
  near(Z.calcolaAnno(Object.assign({ pagamento: "2026-11-05" }, d)).sanzioni, 714.29);
  const p = Z.calcolaAnno(Object.assign({ pagamento: "2026-10-20", controlli: "pvc" }, d));
  assert.equal(p.frazione.lettera, "b-quater"); near(p.sanzioni, 1400);
  near(Z.calcolaAnno(Object.assign({ pagamento: "2026-10-20", controlli: "schema" }, d)).sanzioni, 7000 / 6);
  near(Z.calcolaAnno(Object.assign({ pagamento: "2026-10-20", controlli: "schemaPvc" }, d)).sanzioni, 7000 / 4);
  const av = Z.calcolaAnno(Object.assign({ pagamento: "2026-10-20", controlli: "avviso" }, d));
  assert.equal(av.ravvedibile, false); near(av.sanzioni, 7000 / 3);
});
t("T4: omessa 2024, imposta 10.000 €, presentata a ottobre 2026 prima dei controlli: 75% = 7.500 €, non ravvedibile", () => {
  const r = Z.calcolaAnno({ anno: 2024, stato: "omessa", valoreRw: 0, ivaca: 0, plusvalenze: 2000 + 10000 / 0.26, pagamento: "2026-10-20" });
  assert.equal(r.ravvedibile, false); near(r.sanzioni, 7500); near(r.tardiva.sanzione, 7500);
});
t("T5: omesso versamento di 10.000 € con 10 giorni di ritardo: 12,5% × 10/15 = 8,333% ridotto a 1/10 = 83,33 €", () => {
  const b = Z.baseVersamento("2026-10-16", "2026-10-26"), f = Z.frazioneVersamento("2026-10-16", "2026-10-26");
  near(10000 * b.aliquota * f.f, 83.33);
});
t("Minimo di 150 € ridotto, riduzione di 1/3, RW 258 € entro 90 giorni, soglie penali", () => {
  const m = Z.calcolaAnno({ anno: 2022, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 100, pagamento: PAG });
  near(m.sanzioni, 150 / 6); // 26 € × 90% sotto il minimo: si usa 150 € ridotto a 1/6
  const r = Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 0, ivaca: 0, plusvalenze: 2000 + 10000 / 0.26, pagamento: "2026-10-20", controlli: "accesso", riduzione: true });
  near(r.sanzioni, 10000 * 0.7 * 2 / 3 / 8);
  const t9 = Z.calcolaAnno({ anno: 2024, stato: "omessa", valoreRw: 5000, ivaca: 0, plusvalenze: 0, pagamento: "2025-12-15" });
  near(voce(t9, /258/).sanzione, 25.8); assert.ok(t9.note.some((x) => /28,67/.test(x)));
  assert.ok(Z.calcolaAnno({ anno: 2024, stato: "omessa", valoreRw: 0, ivaca: 0, plusvalenze: 300000, pagamento: PAG }).avvisi.some((x) => /art\. 5 D\.Lgs\. 74\/2000/.test(x)));
});
t("Caso dubbio: 2023 con termine al 31/10/2024 ma dichiarazione inviata prima del 1/9/2024: si mostrano le due versioni", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 10000, ivaca: 20, plusvalenze: 5000, pagamento: PAG, invio: "2024-07-15" });
  assert.equal(r.regime, "nuovo"); assert.ok(r.note.some((x) => /Caso dubbio/.test(x)));
});
console.log("\n" + n + " prove superate");
