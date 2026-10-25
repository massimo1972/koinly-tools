/* Prove dei quadri RT e del modello F24: node test/modelli.test.js */
"use strict";
const assert = require("assert");
const M = require("../modelli.js"), Z = require("../sanzioni.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const val = (q, rigo, col) => q.righi.find((x) => x.rigo === rigo && String(x.col) === String(col || "")).valore;

t("RT 2023 (Redditi PF 2024): franchigia di 2.000 €, righi RT31-RT39", () => {
  const q = M.quadroRT(2023, 10000, 7000);
  assert.equal(val(q, "RT33", 2), 1000); assert.equal(val(q, "RT37"), 260); assert.equal(val(q, "RT39"), 260);
  assert.equal(val(M.quadroRT(2023, 10000, 8500), "RT33", 2), 0);
  assert.equal(M.quadroRT(2023, 1000, 5000).minusvalenzaDaRiportare, 2000);
});
t("RT 2024 (Redditi PF 2025): solo l'eccedenza oltre 2.000 €, righi RT41, RT57, RT88-RT90", () => {
  const q = M.quadroRT(2024, 10000, 7000);
  assert.equal(val(q, "RT41", 1), 10000); assert.equal(val(q, "RT57", 2), 1000); assert.equal(val(q, "RT89"), 260); assert.equal(val(q, "RT90"), 260);
});
t("RT 2025 (Redditi PF 2026): cessioni 2025 in RT41 col. 3-4 senza franchigia", () => {
  const q = M.quadroRT(2025, 10000, 7000);
  assert.equal(val(q, "RT41", 3), 10000); assert.equal(val(q, "RT57", 2), 3000); assert.equal(val(q, "RT90"), 780);
  assert.ok(M.quadroRT(2022, 1, 0).nonGestito);
});
t("F24: codici 1727, 1715, 8945, 1945, 8911 con anno d'imposta; anni omessi esclusi", () => {
  const PAG = "2026-10-24";
  const a = Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 50000, ivaca: 100, plusvalenze: 10000, pagamento: PAG });
  const b = Z.calcolaAnno({ anno: 2023, stato: "omessa", valoreRw: 1000, ivaca: 10, plusvalenze: 0, pagamento: PAG });
  const f = M.f24([a, b]);
  const cod = (c) => f.righe.find((x) => x.codice === c);
  assert.equal(cod("1727").importo, 100); assert.equal(cod("1727").rateazione, "0101"); assert.equal(cod("1727").anno, 2024);
  assert.equal(cod("1715").importo, 2080); // (10.000 − 2.000) × 26%
  assert.ok(cod("8945").importo > 0 && cod("1945").importo > 0);
  assert.equal(cod("8911").importo, Math.round(50000 * 0.03 / 8 * 100) / 100);
  assert.deepEqual(f.esclusi, [2023]);
  assert.equal(f.totale, Math.round(f.righe.reduce((s, x) => s + x.importo, 0) * 100) / 100);
});
t("Quadri RT al 26% e RM inseriti a mano: righi per anno, minusvalenze pregresse, imposta sul lordo", () => {
  const a = M.quadroRT26(2021, 727.4, 810.2, {});
  assert.equal(a.righi.find((x) => x.rigo === "RT23" && x.col === "1").valore, 83); assert.equal(a.imposta, 0); assert.equal(a.rigoMinus, "RT93 col. 5");
  const b = M.quadroRT26(2024, 1000, 400, { minusPrecedenti: 100 });
  assert.equal(b.righi.find((x) => x.rigo === "RT52" && x.col === "2").valore, 600); assert.equal(b.righi.find((x) => x.rigo === "RT72").valore, 500); assert.equal(b.imposta, 130);
  const c = M.quadroRM(2020, [{ lettera: "H", stato: "069", lordo: 100.4 }, { lettera: "H", stato: "013", lordo: 0.3 }]);
  assert.equal(c.rigo, "RM12"); assert.equal(c.righi.length, 1); assert.equal(c.imposta, 26);
  assert.equal(M.quadroRM(2025, [{ lettera: "H", lordo: 50 }]).rigo, "RM31");
});
t("IVACA e quadro RW: fino al 2022 codice 14 senza imposta, dal 2023 codice 21 con lo 0,20%", () => {
  const I = require("../ivaca.js");
  const calc = (anno) => ({ anno, righe: [{ chiave: "BTC;1", nome: "BTC", simbolo: "BTC", spam: false, giorni: 365, iniziale: "1", finale: "1", note: [],
    periodi: [{ dal: anno + "-01-01", al: anno + "-12-31", giorni: 365, quantita: "1", quantitaN: 1, valoreIniziale: 20000, valore: 30000 }] }] });
  const v22 = I.calcola(calc(2022)), v23 = I.calcola(calc(2023));
  assert.equal(v22.dovuta, false); assert.equal(v22.totali.ivaca, 0); assert.ok(/31\/12\/2022/.test(v22.nonDovuta));
  assert.equal(v23.dovuta, true); assert.ok(Math.abs(v23.totali.ivaca - 60) < 0.01);
  const q22 = M.quadroRW(v22, {}), q23 = M.quadroRW(v23, {});
  assert.equal(q22.righi[0].c3, 14); assert.equal(q22.righi[0].c34, null); assert.equal(q22.rw8, null); assert.equal(q22.righi[0].c8, 30000);
  assert.equal(q23.righi[0].c3, 21); assert.equal(q23.rw8.imposta, 60);
});
console.log("\n" + n + " prove superate");
