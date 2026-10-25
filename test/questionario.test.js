/* Prove del questionario AdE: wallet, indirizzi e chiavi pubbliche (dati inventati): node test/questionario.test.js */
"use strict";
const assert = require("assert");
const D = require("../detenzione.js"), QZ = require("../questionario.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

const H = "ID (read-only),Parent ID (read-only),Date (UTC),Type,Tag,From Wallet (read-only),From Wallet ID,From Amount,From Currency,To Wallet (read-only),To Wallet ID,To Amount,To Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Fee Worth Amount,Fee Worth Currency,Net Value (read-only),Fee Value (read-only),Value Currency (read-only),Deleted,From Source (read-only),To Source (read-only),Negative Balances (read-only),Missing Rates (read-only),Missing Cost Basis (read-only),Synced To Accounting At (UTC read-only),TxSrc,TxDest,TxHash,Method Name (read-only),Description";
const riga = (id, data, tipo, wDa, qDa, vDa, wA, qA, vA, valore, src, dest, hash) => [id, "", data, tipo, "", wDa, "", qDa, vDa, wA, "", qA, vA, "0.0", "", "", "", "", "", valore, "0.0", "EUR;11", "false", "", "", "", "", "", "", src || "", dest || "", hash || "", "", ""].join(",");
const ETH = "0x2464aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0bd0";
const TX = [H,
  riga(1, "2024-01-10 10:00:00", "trade", "Binance;binance", "1000.0", "EUR;11", "Binance;binance", "0.5", "ETH;3", "1000.0"),
  riga(2, "2024-02-10 10:00:00", "transfer", "Binance;binance", "0.5", "ETH;3", "ETH 0x2464...0bD0 - SafePal;eth", "0.5", "ETH;3", "1100.0", "", ETH, "0xh2"),
  riga(3, "2024-03-10 10:00:00", "transfer", "ETH 0x2464...0bD0 - SafePal;eth", "0.1", "ETH;3", "", "0.0", "", "200.0", ETH, "0x9999999999999999999999999999999999999999", "0xh3"),
  riga(4, "2024-04-10 10:00:00", "deposit", "", "0.0", "", "BTC Ledger (xpub6Buw...HSx native segwit);btc", "0.01", "BTC;1", "600.0", "", "", "h4")
].join("\n");

t("Wallet con indirizzo completo dal file; wallet Bitcoin con xpub solo abbreviata da completare", () => {
  const q = QZ.calcola(D.leggiTransazioni(TX), { anni: [2024] });
  const eth = q.d3.chiavi.find((c) => /SafePal/.test(c.etichetta)), btc = q.d3.chiavi.find((c) => /Ledger/.test(c.etichetta)), bn = q.d3.chiavi.find((c) => /Binance/.test(c.etichetta));
  assert.deepEqual(eth.indirizzi, [ETH]); assert.equal(eth.daCompletare, false);
  assert.equal(btc.chiavePubblica, ""); assert.equal(btc.abbreviato, "xpub6Buw...HSx native segwit"); assert.equal(btc.daCompletare, true);
  assert.equal(bn.daCompletare, false);
});
console.log("\n" + n + " prove superate");
