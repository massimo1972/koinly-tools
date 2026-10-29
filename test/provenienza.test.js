/* Prove della verifica della provenienza dei fondi (dati inventati): node test/provenienza.test.js */
"use strict";
const assert = require("assert");
const P = require("../provenienza.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const livelli = (r) => r.anni.map((x) => x.anno + ":" + x.semaforo);

const MOV = [
  { data: "2023-02-01", intermediario: "Binance", verso: "versamento", importo: 5000 },
  { data: "2023-02-02", intermediario: "Binance", verso: "acquisto", importo: 4900 },
  { data: "2024-03-01", intermediario: "Binance", verso: "versamento", importo: 10000 },
  { data: "2024-09-01", intermediario: "Binance", verso: "prelievo", importo: 3000 },
  { data: "2024-05-01", intermediario: "Bitpanda", verso: "acquisto", importo: 1000 }
];
const BANCA = { anniBanca: [2023, 2024], perAnno: { 2023: { versamenti: 1, riscontrati: 1 }, 2024: { versamenti: 1, riscontrati: 1 } } };
const DICH = [{ anno: 2022, reddito: 30000, imposte: 7000 }, { anno: 2023, reddito: 32000, imposte: 7500 }, { anno: 2024, reddito: 33000, imposte: 8000 }];

t("Flussi: versamento seguito dall'acquisto contato una volta, prelievi come rientri", () => {
  const f = P.flussi(MOV);
  assert.equal(f[2023].entrate, 5000); assert.equal(f[2024].entrate, 11000); assert.equal(f[2024].uscite, 3000);
});
t("Verde: versamenti tracciati in banca e compatibili con i redditi dichiarati", () => {
  const r = P.valuta({ movimenti: MOV, riscontro: BANCA, dichiarazioni: DICH, anni: [2023, 2024] });
  assert.deepEqual(livelli(r), ["2023:verde", "2024:verde"]); assert.equal(r.semaforo, "verde");
  assert.equal(r.anni[1].impiego, 13000); assert.equal(r.anni[1].capacita, 23000 + 24500 + 25000);
});
t("Giallo: estratti conto mancanti, dichiarazione dell'anno mancante, depositi a costo zero", () => {
  const r = P.valuta({ movimenti: MOV, riscontro: { anniBanca: [2023], perAnno: { 2023: { versamenti: 1, riscontrati: 1 } } }, dichiarazioni: DICH.slice(0, 2),
    depositi: [{ data: "2023-06-01", valore: 2000, correzione: "zero" }], anni: [2023, 2024] });
  assert.deepEqual(livelli(r), ["2023:giallo", "2024:giallo"]); assert.equal(r.semaforo, "giallo");
  assert.ok(r.motivi.some((m) => /costo zero/.test(m.testo))); assert.ok(r.motivi.some((m) => /Manca la dichiarazione dei redditi del 2024/.test(m.testo)));
  assert.ok(r.motivi.some((m) => /Estratti conto del 2024 non caricati/.test(m.testo)));
});
t("Giallo: investito oltre il 70% dei redditi netti", () => {
  const r = P.valuta({ movimenti: [{ data: "2024-01-10", intermediario: "X", verso: "versamento", importo: 20000 }], riscontro: { anniBanca: [2024], perAnno: { 2024: { versamenti: 1, riscontrati: 1 } } }, dichiarazioni: [{ anno: 2024, reddito: 30000, imposte: 5000 }] });
  assert.equal(r.semaforo, "giallo"); assert.ok(/80%/.test(r.motivi[0].testo));
});
t("Rosso: investito più dei redditi e delle altre fonti; le altre fonti documentate lo riportano al giallo o al verde", () => {
  const m = [{ data: "2024-01-10", intermediario: "X", verso: "versamento", importo: 60000 }], b = { anniBanca: [2024], perAnno: { 2024: { versamenti: 1, riscontrati: 1 } } };
  assert.equal(P.valuta({ movimenti: m, riscontro: b, dichiarazioni: [{ anno: 2024, reddito: 30000, imposte: 5000 }] }).semaforo, "rosso");
  assert.equal(P.valuta({ movimenti: m, riscontro: b, dichiarazioni: [{ anno: 2024, reddito: 30000, imposte: 5000 }], fonti: [{ anno: 2020, importo: 100000, descrizione: "Eredità" }] }).semaforo, "verde");
});
t("Rosso: nessuna dichiarazione; depositi di cripto da wallet ignoti oltre la soglia", () => {
  assert.equal(P.valuta({ movimenti: MOV, riscontro: BANCA }).semaforo, "rosso");
  const r = P.valuta({ movimenti: MOV, riscontro: BANCA, dichiarazioni: DICH, depositi: [{ data: "2024-02-01", valore: 800, correzione: "" }, { data: "2024-02-02", valore: 50, correzione: "interno" }], anni: [2024] });
  assert.equal(r.semaforo, "rosso"); assert.ok(/1 depositi di cripto da wallet non collegati senza provenienza/.test(r.motivi[0].testo));
  assert.equal(P.valuta({ movimenti: [], dichiarazioni: DICH, depositi: [{ data: "2024-02-01", valore: 80, correzione: "" }] }).semaforo, "giallo");
});
t("Anno della dichiarazione dal testo (Redditi PF, 730, CU) o dal nome del file", () => {
  assert.deepEqual(P.annoDichiarazione("MODELLO REDDITI PERSONE FISICHE 2024 ... PERIODO D'IMPOSTA 2023", ""), { anno: 2023, tipo: "Redditi PF" });
  assert.deepEqual(P.annoDichiarazione("Modello 730/2025 redditi 2024", ""), { anno: 2024, tipo: "730" });
  assert.deepEqual(P.annoDichiarazione("CERTIFICAZIONE UNICA 2024", ""), { anno: 2023, tipo: "CU" });
  assert.equal(P.annoDichiarazione("", "dichiarazione 2022.pdf").anno, 2022);
  assert.ok(P.annoDichiarazione("", "dichiarazione 2022.pdf").daVerificare);
});
console.log("\n" + n + " prove superate");
