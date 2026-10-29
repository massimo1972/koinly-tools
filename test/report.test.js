/* Prove della lettura degli altri report Koinly (dati inventati): node test/report.test.js */
"use strict";
const assert = require("assert");
const R = require("../report.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

const INCOME_IT = [
  "Rapporto sulle entrate 2025", "",
  "Data,Attivo,Importo,Valore (EUR),Tipo,Descrizione,Nome del portafoglio",
  '2025-01-06 01:21,CRO,"5,57389880","0,84",Reward,Cardholder CRO Stake Reward,Crypto.com App',
  '2025-03-10 01:37,CRO,"1.005,26544210","1.230,37",Reward,Cardholder CRO Stake Reward,Crypto.com App',
  '2025-10-08 01:46,ETH,"0,00100000",0.0,Airdrop,,Wallet ETH', ""].join("\n");
const OTHER_EN = [
  "Other gains report 2025", "",
  "Date,Asset,Amount,Value (EUR),Type,Wallet Name",
  '2025-02-02 00:59,USDT,"-1,234.50000000","1,190.10",Loss,Exchange A',
  '2025-02-06 00:59,USDT,"72.77404848","70.13",Profit,Exchange A',
  '2025-03-01 00:59,USDT,"10.00000000","9.99",Profit,Exchange A'].join("\r\n");

t("Income in italiano: tipo, anno, quantità esatte e totale in centesimi", () => {
  const r = R.leggi(INCOME_IT);
  assert.equal(r.tipo, "redditi"); assert.equal(r.anno, 2025); assert.equal(r.formato, "it");
  assert.equal(r.righe.length, 3);
  assert.equal(r.righe[1].quantitaTesto, "1005.26544210");
  assert.equal(r.righe[1].valore, 1230.37);
  assert.equal(r.righe[2].valore, 0); // "0.0" all'inglese dentro un report italiano
  assert.equal(r.totale, 1231.21);
  assert.deepEqual(r.perTipo.map((x) => [x.chiave, x.n]), [["Reward · Cardholder CRO Stake Reward", 2], ["Airdrop", 1]]);
  assert.deepEqual(r.avvisi, ["1 righe hanno valore zero."]);
});
t("Other gains in inglese: il segno viene da Profit/Loss, netto e mesi", () => {
  const r = R.leggi(OTHER_EN);
  assert.equal(r.tipo, "altri"); assert.equal(r.formato, "en");
  assert.equal(r.profitti, 80.12); assert.equal(r.perdite, 1190.1); assert.equal(r.totale, -1109.98);
  assert.deepEqual(r.perMese.map((x) => [x.chiave, x.valore]), [["2025-02", -1119.97], ["2025-03", 9.99]]);
  assert.equal(r.perWallet[0].chiave, "Exchange A");
});
t("Expenses e Gifts: riconosciuti dal titolo; report vuoto senza errori", () => {
  const e = R.leggi('Rapporto costi e commissioni 2025\n\nData,Attivo,Importo,Valore (EUR),Tipo,Descrizione,Nome del portafoglio\n2025-01-01 14:54,SOL,"0,00203928","0,37",Other fee,,Wallet SOL\n');
  assert.equal(e.tipo, "commissioni"); assert.equal(e.totale, 0.37);
  const g = R.leggi('"Rapporto sui regali, le donazioni e le monete perse 2025"\n\nData,Attivo,Importo,Valore (EUR),Tipo,Descrizione,Nome del portafoglio\n');
  assert.equal(g.tipo, "perdite"); assert.equal(g.righe.length, 0); assert.equal(g.totale, 0);
});
t("Report dei saldi, Capital gains e Buy/sell: messaggio chiaro", () => {
  assert.ok(/saldi/.test(R.leggi("Saldi al 2025-01-01 00:00\n\nAttivo,Quantità,Costo (EUR),Valore (EUR),Descrizione\n").errore));
  assert.ok(/Capital gains/.test(R.leggi("Rapporto sulle plusvalenze 2025\n\nData vendita,Data acquisto,Attivo\n").errore));
  assert.ok(/Buy\/sell/.test(R.leggi("Buy/sell report 2025\n\nDate,Type,Amount\n").errore));
  assert.ok(R.leggi("a,b,c\n1,2,3\n").errore);
});
t("Valori in valuta diversa dall'euro: avviso", () => {
  const r = R.leggi('Income report 2024\n\nDate,Asset,Amount,Value (USD),Type,Description,Wallet Name\n2024-05-01 10:00,BTC,"0.001","60.00",Reward,,W\n');
  assert.equal(r.valuta, "USD"); assert.ok(r.avvisi[0].indexOf("USD") >= 0);
});
console.log(n + " prove superate");
