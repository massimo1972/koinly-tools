/* Prove del motore comune dei broker esteri e del modello CSV generico (dati inventati): node test/estero.test.js */
"use strict";
const assert = require("assert");
const X = require("../estero.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const val = (q, rigo, col) => q.rt.find((x) => x.rigo === rigo && String(x.col) === String(col || "")).valore;

const CSV = [
  "Tipo;Data;Strumento;ISIN;Categoria;Corrispettivo;Costo;Lordo;Ritenuta;Stato;Dal;Al;Valore iniziale;Valore finale;Codice RW",
  "#cessione;15/03/2024;Esempio;;Azioni;1,00;1,00;;;;;;;;",
  "cessione;15/03/2023;Alfa SA;FR0000000001;Azioni;800,00;1.300,00;;;;;;;;",
  "cessione;10/06/2024;Apple Inc;US0378331005;Azioni;1.250,00;1.000,00;;;;;;;;",
  "cessione;12/09/2024;MSCI World;IE00B4L5Y983;ETF;2.000;1.500;;;;;;;;",
  "cessione;01/10/2024;Bitcoin;;Cripto;3.000,00;2.000,00;;;;;;;;",
  "dividendo;10/05/2024;Apple Inc;US0378331005;Azioni;;;12,00;1,80;;;;;;",
  "dividendo;11/08/2024;Apple Inc;US0378331005;Azioni;;;8,00;1,20;;;;;;",
  "interesse;31/12/2024;Interessi sulla liquidità;;;;;35,20;;094;;;;;",
  "posizione;;Apple Inc;US0378331005;Azioni;;;;;094;01/01/2024;10/06/2024;5.000,00;6.200,00;",
  "posizione;;MSCI World;IE00B4L5Y983;ETF;;;;;094;01/01/2024;31/12/2024;10.000,00;12.000,00;",
  "liquidità;;Conto Trade Republic;;;;;;;094;01/01/2024;31/12/2024;800,00;1.500,00;",
  "dividendo;;Senza data;;;;;5;;;;;;;",
  "posizione;;Biennale;;Azioni;;;;;094;01/06/2023;31/01/2024;1;1;",
  "vendita;01/01/2024;Tipo sbagliato;;;;;;;;;;;;"
].join("\r\n");

t("Modello CSV: righe lette, commenti ignorati, numeri italiani, errori per riga", () => {
  const d = X.leggiCsv(CSV, "Trade Republic");
  assert.equal(d.broker, "Trade Republic");
  assert.equal(d.operazioni.length, 4); assert.equal(d.redditi.length, 3); assert.equal(d.posizioni.length, 3);
  assert.equal(d.operazioni[2].corrispettivo, 2000); assert.equal(d.operazioni[1].costo, 1000);
  assert.equal(d.redditi[2].lettera, "G"); assert.equal(d.posizioni[2].categoria, "Liquidità");
  assert.equal(d.errori.length, 3);
  assert.ok(/Riga 13/.test(d.errori[0]) && /Riga 14.*un solo anno/.test(d.errori[1]) && /Riga 15.*vendita/.test(d.errori[2]));
});
t("Modello vuoto: intestazione ed esempi commentati, rileggibile senza righe utili", () => {
  const m = X.modelloCsv();
  assert.ok(m.indexOf("Tipo;Data;Strumento") >= 0);
  assert.throws(() => X.leggiCsv(m, "x"));
  assert.throws(() => X.leggiCsv("a;b\n1;2", "x"));
});
t("Separatore virgola e numeri all'inglese", () => {
  const d = X.leggiCsv('Tipo,Data,Strumento,Categoria,Corrispettivo,Costo\ncessione,2024-02-01,Beta,ETF,"1,234.50",1000\n', "B");
  assert.equal(d.operazioni[0].corrispettivo, 1234.5); assert.equal(d.operazioni[0].data, "2024-02-01");
});
t("Quadri: RT al 26% con minusvalenza riportata, cripto a parte, RM per tipo e Stato, RW con IVAFE e liquidità", () => {
  const d = X.leggiCsv(CSV, "Trade Republic"), tutti = X.quadriTutti(d);
  assert.deepEqual(X.anni(d), [2023, 2024]);
  const a = tutti[2023]; assert.equal(a.minusvalenzaDaRiportare, 500); assert.equal(val(a, "RT23", 1), 500);
  const q = tutti[2024];
  assert.equal(val(q, "RT11", 1), 3250); assert.equal(val(q, "RT11", 2), 2500);
  assert.equal(val(q, "RT13"), 500); assert.equal(val(q, "RT72"), 250); assert.equal(val(q, "RT73"), 65);
  assert.equal(q.cripto.n, 1); near(q.cripto.corrispettivi, 3000);
  assert.deepEqual(q.rm.map((x) => [x.lettera, x.stato, x.lordo]), [["G", "094", 35], ["H", "069", 20]]);
  assert.equal(q.rm[1].statoNome, "Stati Uniti"); near(q.rm[1].ritenutaEstera, 3);
  assert.deepEqual(q.rw.map((x) => x.codice), ["2", "4", "1"]);
  const az = q.rw[0]; assert.equal(az.stato, "094"); assert.equal(az.giorni, 162); near(az.ivafe, 6200 * 0.002 * 162 / 366);
  near(q.ivafe, 6200 * 0.002 * 162 / 366 + 12000 * 0.002, 0.01);
  assert.equal(q.rw[2].descrizione, "Conto Trade Republic"); assert.equal(q.rw[2].ivafe, 0);
  assert.deepEqual(q.f24.map((x) => x.codice), ["1100", "1242", "4043"]);
});
t("Cripto fino al 2022: nella sezione al 26% solo con la soglia delle valute superata", () => {
  const d = X.leggiCsv("Tipo;Data;Strumento;Categoria;Corrispettivo;Costo\ncessione;01/02/2022;BTC;Cripto;5000;1000\n", "B");
  assert.equal(X.quadri(d, 2022, {}).rt.length, 0);
  assert.equal(X.quadri(d, 2022, { sogliaValute: true }).rt.find((x) => x.rigo === "RT26").valore, 4000);
});
console.log("\n" + n + " prove superate");
