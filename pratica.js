/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · pratica con l'Agenzia delle Entrate: dall'invito (art. 32 DPR 600/1973) allo schema di atto (art. 6-bis L. 212/2000)
   e all'atto impositivo. Lettura del PDF dell'atto (testo estratto con pdf.js), scadenze, scenari delle osservazioni e testo delle
   osservazioni nello schema dello studio.
   Metodo dello studio per le osservazioni allo schema di atto: i dati sono quelli dell'Ufficio (stesse operazioni, stessi controvalori,
   stesso costo); si contestano solo profili di diritto, componente per componente, con un prospetto a colonne (schema e tesi).
   Privacy: dell'atto si tengono i dati dell'Ufficio, i rilievi e gli importi; nome e codice fiscale del contribuente servono solo a
   proporre i dati del cliente e non sono conservati nei dati dell'atto. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KoinlyPratica = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STABLE = ["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "PYUSD", "USDE", "GUSD", "LUSD", "FRAX", "USDD", "EURC", "EUROC", "EURT", "EURS"];
  var r0 = function (x) { return Math.round(x || 0); }, r2 = function (x) { return Math.round((x || 0) * 100) / 100; };

  /* importo in formato italiano, anche spezzato da spazi dall'estrazione del testo («130.49 7 ,00», «279, 32») */
  function importo(s) {
    var t = String(s == null ? "" : s).replace(/[€\s]/g, "");
    if (!/\d/.test(t)) return null;
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    var v = parseFloat(t); return isFinite(v) ? v : null;
  }
  var NUM = "\\d[\\d.\\s]*,\\s*\\d\\s*\\d|\\d{1,3}(?:\\.\\d{3})+|\\d+"; // importo, anche con spazi interni
  function iso(g) { var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(g || ""); return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : null; }
  function piuGiorni(g, n) { return new Date(Date.parse(g + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }

  /* tipo dell'atto dal testo */
  function tipoAtto(testo) {
    var t = String(testo || "");
    if (/SCHEMA DI ATTO/i.test(t) && /6\s*-?\s*bis/i.test(t)) return "schema";
    if (/AVVISO DI ACCERTAMENTO/i.test(t)) return "avviso";
    if (/ATTO DI CONTESTAZIONE|IRROGAZIONE (DELLE|DI) SANZIONI/i.test(t)) return "contestazione";
    if (/INVITO/i.test(t) && /art(icolo|\.)\s*32/i.test(t)) return "invito";
    return null;
  }
  var NOMI_TIPO = { invito: "Invito o questionario (art. 32 DPR 600/1973)", schema: "Schema di atto (art. 6-bis L. 212/2000)", avviso: "Avviso di accertamento", contestazione: "Atto di contestazione o irrogazione delle sanzioni" };

  /* dati comuni degli atti: Ufficio, numero, anno, invito precedente, funzionario referente; il contribuente solo per proporre i dati del cliente */
  function intestazione(testo) {
    var t = String(testo || ""), m, o = {};
    if ((m = /(DIREZIONE (?:PROVINCIALE|REGIONALE) DI [A-ZÀ-Ü' ]+?)\s*-\s*(UFFICIO [A-ZÀ-Ü' ]+)/.exec(t))) { o.direzione = titolo(m[1]); o.ufficio = titolo(m[1]) + " – " + titolo(m[2]); }
    if ((m = /UFFICIO CONTROLLI\s*\n\s*(VIA [^\n]+)/i.exec(t))) o.indirizzo = titolo(m[1].replace(/\s+-\s+/, " – "));
    if ((m = /([a-z0-9._-]+@pce\.agenziaentrate\.it)/i.exec(t))) o.pec = m[1].toLowerCase();
    if ((m = /SCHEMA DI ATTO N\.?\s*([A-Z0-9]+\/\d{4})/i.exec(t)) || (m = /numero dello schema d'atto:\s*([A-Z0-9]+\/\d{4})/i.exec(t)) || (m = /AVVISO DI ACCERTAMENTO N\.?\s*([A-Z0-9]+\/?\d*)/i.exec(t))) o.numero = m[1];
    if ((m = /anno di imposta\s*(\d{4})/i.exec(t)) || (m = /periodo di imposta\s*(\d{4})/i.exec(t))) o.anno = +m[1];
    if ((m = /invito n\.?\s*([A-Z0-9]+\/\d{4}),?\s*notificato il\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t))) o.invito = { numero: m[1], data: iso(m[2]) };
    if ((m = /Funzionario referente[^:]*:\s*\n\s*([A-ZÀ-Ü' ]+)\n/i.exec(t))) o.funzionario = titolo(m[1].trim());
    if ((m = /Mail:\s*([a-z0-9._-]+@agenziaentrate\.it)/i.exec(t))) o.emailFunzionario = m[1].toLowerCase();
    if ((m = /entro il termine di (\d+) giorni\s*\n?\s*dalla notifica/i.exec(t))) o.giorniOsservazioni = +m[1];
    o.dichiarazioneOmessa = /dichiarazione risulta omessa|OMESSA PRESENTAZIONE DELLA\s*\n?\s*DICHIARAZIONE/i.test(t);
    var c = {};
    if ((m = /Codice fiscale\s+([A-Z0-9]{16})/i.exec(t))) c.cf = m[1].toUpperCase();
    if ((m = /Il signor[a]?\s+([A-ZÀ-Ü' ]+)\n/.exec(t)) || (m = /La signora\s+([A-ZÀ-Ü' ]+)\n/.exec(t))) c.nome = titolo(m[1].trim());
    return { atto: o, contribuente: c };
  }
  function titolo(s) { return String(s).toLowerCase().replace(/(^|[\s'’(-])([a-zà-ü])/g, function (a, b, c) { return b + c.toUpperCase(); }).replace(/\b(Di|Del|Della|Dei|Delle|E)\b/g, function (w) { return w.toLowerCase(); }); }

  /* componenti della tabella «Componenti quadro RT» e loro natura */
  function natura(voce) {
    var v = voce.toLowerCase(), m;
    if (/deduzione|franchigia|art\.?\s*67/.test(v)) return { tipo: "franchigia", segno: -1 };
    if (/minusvalenz/.test(v)) return { tipo: "minusvalenze", segno: -1 };
    if (/permuta|conversion|→|\bswap\b/.test(v) || /[A-Z]{2,6}\s*\/\s*[A-Z]{2,6}/.test(voce)) {
      m = /(?:(\d[\d.,]*)\s+)?([A-Z]{2,6})\s*(?:\/|→|->|in)\s*([A-Z]{2,6})/.exec(voce);
      var da = m ? m[2] : "", a = m ? m[3] : "";
      return { tipo: "permuta", segno: 1, da: da, a: a, quantita: m && m[1] ? m[1] : "", stablecoin: STABLE.indexOf(a) >= 0 && STABLE.indexOf(da) < 0 };
    }
    if (/wallet|prelev|esterni|trasferiment|deflus/.test(v)) return { tipo: "prelievi", segno: 1 };
    if (/card|carta/.test(v)) return { tipo: "carta", segno: 1 };
    if (/staking|reward|provent|airdrop/.test(v)) return { tipo: "proventi", segno: 1 };
    return { tipo: "altro", segno: 1 };
  }
  var NOMI_NATURA = { carta: "Vendite con carta (cessione contro valuta)", permuta: "Permuta tra cripto-attività", prelievi: "Prelievi verso wallet non riconosciuti", minusvalenze: "Minusvalenze", franchigia: "Franchigia di 2.000 €", proventi: "Proventi", altro: "Altra componente" };

  function leggiComponenti(testo) {
    var i = testo.search(/Componenti quadro RT/i); if (i < 0) return null;
    var resto = testo.slice(i).split("\n").slice(1), out = [], buf = [], totale = null;
    var reRiga = new RegExp("^(.*?)\\s*(" + NUM + ")\\s*([+\\-–=])?\\s*$");
    for (var k = 0; k < resto.length; k++) {
      var l = resto[k].trim(); if (!l) continue;
      var mt = new RegExp("^Totale imponibile\\s*(" + NUM + ")", "i").exec(l);
      if (mt) { totale = importo(mt[1]); break; }
      var m = reRiga.exec(l);
      if (m && /,\s*\d\s*\d$/.test(m[2])) {
        var voce = buf.concat(m[1] ? [m[1]] : []).join(" ").replace(/\s+/g, " ").trim(); buf = [];
        var n = natura(voce), segnoStampato = m[3] === "-" || m[3] === "–" ? -1 : m[3] === "+" ? 1 : null;
        out.push(Object.assign({ voce: voce, importo: importo(m[2]), segnoStampato: segnoStampato }, n));
      } else buf.push(l);
      if (out.length > 40) break;
    }
    return { componenti: out, totale: totale };
  }
  /* data dell'operazione: la prima data del capoverso delle motivazioni in cui compare l'importo della componente */
  function dataComponente(testo, c, anno) {
    var s = num(c.importo), j = testo.indexOf(s);
    var fine = testo.search(/Componenti quadro RT/i);
    if (j < 0 || (fine >= 0 && j > fine)) return null;
    var inizio = testo.lastIndexOf("\n- ", j); if (inizio < 0) inizio = Math.max(0, j - 800);
    // la prima data dell'anno d'imposta nel capoverso (le altre sono date di PEC o di protocollo)
    var date = (testo.slice(inizio, j).match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(iso).filter(function (g) { return !anno || +g.slice(0, 4) === anno; });
    return date[0] || null;
  }

  /* lettura dello schema di atto: pagine [{ n, text }] di pdf.js */
  function leggiSchema(pagine) {
    // l'intestazione ripetuta su ogni pagina si toglie dal testo delle motivazioni
    var testo = pagine.map(function (p) { return String(p.text || "").split("\n").filter(function (l) { return !/^Pagina \d+ di \d+$|^COMUNICAZIONE DELLO SCHEMA DI ATTO N\.|^Articolo 6\s*-\s*bis, commi/.test(l.trim()); }).join("\n"); }).join("\n");
    var tipo = tipoAtto(pagine.map(function (p) { return p.text; }).join("\n"));
    if (tipo !== "schema") return { errore: tipo ? "È un " + NOMI_TIPO[tipo].toLowerCase() + ": per ora si legge lo schema di atto." : "Il PDF non sembra uno schema di atto dell'Agenzia delle Entrate (art. 6-bis L. 212/2000)." };
    var h = intestazione(pagine.map(function (p) { return p.text; }).join("\n")), o = h.atto, m, avvisi = [];
    var tab = leggiComponenti(testo) || { componenti: [], totale: null };
    tab.componenti.forEach(function (c) { c.data = c.tipo === "franchigia" || c.tipo === "minusvalenze" ? null : dataComponente(testo, c, o.anno); });
    // prospetto «dichiarato / accertabile»: righi RT e RW con i due importi
    var prospetto = [];
    testo.split("\n").forEach(function (l) {
      var x = new RegExp("^((?:RT|RW|RM|RN)\\d*\\s*(?:col\\.\\s*\\d+)?)\\s*-?\\s*(.*?)\\s+(" + NUM + ")\\s+(" + NUM + ")\\s*$").exec(l.trim());
      if (x) prospetto.push({ rigo: x[1].replace(/\s+/g, " ").trim(), descrizione: x[2].trim(), dichiarato: importo(x[3]), accertabile: importo(x[4]) });
    });
    var rigo = function (re) { return prospetto.filter(function (p) { return re.test(p.rigo + " " + p.descrizione); })[0]; };
    var rtImp = rigo(/Imposta sostitutiva/i), rtCorr = rigo(/corrispettivi/i), rtBase = rigo(/Differenza|Imponibile/i) || rigo(/Plusvalenz/i);
    var aliq = (m = /\((\d+(?:,\d+)?)\s*%\s*di\s*RT/i.exec(testo)) ? importo(m[1]) / 100 : (m = /imposta sostitutiva del\s*(\d+(?:,\d+)?)\s*%/i.exec(testo)) ? importo(m[1]) / 100 : null;
    var ivaca = (m = new RegExp("cripto\\s*-?\\s*attività dovuta per il periodo\\s*\\n?\\s*d'imposta \\d{4} è determinata in €\\s*(" + NUM + ")", "i").exec(testo)) ? importo(m[1]) : null;
    var rwValore = rigo(/Valore finale/i), rw8 = rigo(/RW8/i);
    if (ivaca == null && rw8) ivaca = rw8.accertabile;
    // sanzioni
    var sanz = { violazioni: [], totale: null };
    if ((m = new RegExp("DETERMINA[\\s\\S]{0,80}?Euro\\s*(" + NUM + ")", "i").exec(testo))) sanz.totale = importo(m[1]);
    var bloccoV = (/VIOLAZIONI ACCERTABILI([\s\S]*?)Si riepilogano/i.exec(testo) || [])[1] || "";
    bloccoV.split(/\n(?=\d+\s+\S)/).forEach(function (v) {
      var mm = /SANZIONE PECUNIARIA DEL\s*(\d+)%/i.exec(v); if (!mm) return;
      var importi = (v.match(new RegExp(NUM, "g")) || []).map(importo).filter(function (x) { return x != null && x > 100; });
      sanz.violazioni.push({ descrizione: (/^\d+\s+([\s\S]*?)\n\s*a\)/.exec(v.trim()) || ["", v])[1].replace(/\s+/g, " ").trim(), norma: ((/(ART\.[^\n]*)/i.exec(v) || [])[1] || "").trim(), misura: +mm[1] / 100, minima: importi[importi.length - 2] || null, massima: importi[importi.length - 1] || null });
    });
    var rwSeparato = /quadro RW[\s\S]{0,400}?separato atto/i.test(testo);
    var d = { tipo: "schema", atto: o, componenti: tab.componenti, totaleImponibile: tab.totale, prospetto: prospetto,
      rt: { corrispettivi: rtCorr ? rtCorr.accertabile : null, imponibile: rtBase ? rtBase.accertabile : tab.totale, imposta: rtImp ? rtImp.accertabile : null, aliquota: aliq },
      ivaca: ivaca, rw: { valore: rwValore ? rwValore.accertabile : null, imposta: rw8 ? rw8.accertabile : null, sanzioneSeparata: rwSeparato },
      sanzioni: sanz, contribuente: h.contribuente, avvisi: avvisi };
    d.verifiche = verifiche(d);
    return d;
  }

  /* controlli formali sui numeri dello schema */
  function verifiche(d) {
    var out = [], c = d.componenti;
    if (!c.length) { out.push({ livello: "giallo", testo: "Tabella dei componenti del quadro RT non trovata: inserire i rilievi a mano." }); return out; }
    var conNatura = c.reduce(function (s, x) { return s + x.segno * x.importo; }, 0);
    var stampati = c.reduce(function (s, x) { return s + (x.segnoStampato || x.segno) * x.importo; }, 0);
    c.forEach(function (x) { if (x.segnoStampato && x.segnoStampato !== x.segno) out.push({ livello: "giallo", testo: "Segno stampato incoerente per «" + x.voce + "» (" + (x.segnoStampato < 0 ? "–" : "+") + "): " + (Math.abs(conNatura - d.totaleImponibile) < 1 ? "il totale dello schema lo considera invece " + (x.segno < 0 ? "in diminuzione" : "in aumento") + "." : "verificare.") }); });
    if (d.totaleImponibile != null) {
      if (Math.abs(conNatura - d.totaleImponibile) < 1) out.push({ livello: "verde", testo: "La somma dei componenti torna con il totale imponibile dello schema (" + eur(d.totaleImponibile) + ")." });
      else out.push({ livello: "rosso", testo: "La somma dei componenti (" + eur(conNatura) + ", con i segni stampati " + eur(stampati) + ") non torna con il totale imponibile dello schema (" + eur(d.totaleImponibile) + ")." });
    }
    if (d.rt.imposta != null && d.rt.aliquota && d.rt.imponibile != null && Math.abs(r0(r0(d.rt.imponibile) * d.rt.aliquota) - d.rt.imposta) > 1) out.push({ livello: "rosso", testo: "Imposta sostitutiva dello schema (" + eur(d.rt.imposta) + ") diversa da imponibile × aliquota (" + eur(r0(r0(d.rt.imponibile) * d.rt.aliquota)) + ")." });
    var v = d.sanzioni.violazioni[0];
    if (v && d.rt.imposta != null) {
      var base = r0((d.rt.imposta || 0) + (d.ivaca || 0)), att = r2(base * v.misura);
      if (Math.abs(att - (d.sanzioni.totale || v.minima || 0)) < 1) out.push({ livello: "verde", testo: "Sanzione dello schema = " + Math.round(v.misura * 100) + "% di imposta sostitutiva e IVACA arrotondate (" + eur(base) + "): " + eur(att) + "." });
      else out.push({ livello: "giallo", testo: "Sanzione dello schema (" + eur(d.sanzioni.totale) + ") diversa dal " + Math.round(v.misura * 100) + "% delle imposte (" + eur(att) + "): verificare la base." });
    }
    var fr = c.filter(function (x) { return x.tipo === "franchigia"; })[0];
    if (fr && d.atto.anno >= 2025) out.push({ livello: "rosso", testo: "Franchigia di 2.000 € applicata per il " + d.atto.anno + ": dal 2025 non esiste più." });
    if (!fr && (d.atto.anno === 2023 || d.atto.anno === 2024)) out.push({ livello: "giallo", testo: "Lo schema non applica la franchigia di 2.000 € prevista per il " + d.atto.anno + "." });
    if (d.rw.sanzioneSeparata) out.push({ livello: "giallo", testo: "La sanzione per il quadro RW sarà oggetto di un atto separato: resta possibile il ravvedimento (art. 13 D.Lgs. 472/1997) prima della contestazione." });
    return out;
  }
  function eur(x) { return x == null ? "–" : num(x) + " €"; }

  /* ---------- scenari delle osservazioni: stessi dati dell'Ufficio, profili di diritto contestati ---------- */
  var TESI = {
    stablecoin: { titolo: "Le permute di cripto-attività in stablecoin non sono fiscalmente rilevanti", breve: "Permute in stablecoin neutre" },
    aliquota: { titolo: "Per il 2023 e il 2024 l'aliquota dell'imposta sostitutiva è del 12,50%", breve: "Aliquota 12,50%" }
  };
  /* colonne: schema, poi le tesi scelte in modo cumulativo (come nel prospetto dello studio) */
  function scenari(d, tesi) {
    var anno = d.atto.anno, misura = d.sanzioni.violazioni[0] ? d.sanzioni.violazioni[0].misura : null, ivaca = d.ivaca || 0;
    var scelte = Object.keys(TESI).filter(function (k) { return tesi && tesi[k] && applicabile(k, d); });
    var colonne = [{ titolo: "Schema di atto", tesi: [] }];
    scelte.forEach(function (k, i) { colonne.push({ titolo: scelte.slice(0, i + 1).map(function (x) { return TESI[x].breve; }).join(" + "), tesi: scelte.slice(0, i + 1) }); });
    colonne.forEach(function (col) {
      var esclusa = function (c) { return col.tesi.indexOf("stablecoin") >= 0 && c.tipo === "permuta" && c.stablecoin; };
      col.righe = d.componenti.filter(function (c) { return c.tipo !== "franchigia"; }).map(function (c) { return { voce: c.voce, importo: esclusa(c) ? 0 : c.segno * c.importo, escluso: esclusa(c) }; });
      col.netto = col.righe.reduce(function (s, x) { return s + x.importo; }, 0);
      var haFr = d.componenti.some(function (c) { return c.tipo === "franchigia"; });
      col.franchigia = haFr ? -Math.min(2000, Math.max(0, col.netto)) : 0;
      col.imponibile = r2(col.netto + col.franchigia);
      col.aliquota = col.tesi.indexOf("aliquota") >= 0 ? 0.125 : (d.rt.aliquota || 0.26);
      col.imposta = r0(col.imponibile * col.aliquota);
      col.ivaca = ivaca;
      col.sanzione = misura != null ? r2(r0(col.imposta + col.ivaca) * misura) : null;
      col.totale = col.imposta + col.ivaca + (col.sanzione || 0);
    });
    return { colonne: colonne, misura: misura, permute: d.componenti.filter(function (c) { return c.tipo === "permuta" && c.stablecoin; }) };
  }
  function applicabile(k, d) {
    if (k === "stablecoin") return d.componenti.some(function (c) { return c.tipo === "permuta" && c.stablecoin; });
    if (k === "aliquota") return (d.atto.anno === 2023 || d.atto.anno === 2024) && (d.rt.aliquota || 0.26) > 0.125;
    return false;
  }

  /* giorni festivi nazionali e Pasquetta; una scadenza che cade di sabato, domenica o festivo slitta al primo giorno lavorativo */
  function pasqua(a) {
    var b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((8 * c + 13) / 25), h = (19 * b + c - e - g + 15) % 30;
    var i = Math.floor(d / 4), k = d % 4, l = (32 + 2 * f + 2 * i - h - k) % 7, m = Math.floor((b + 11 * h + 19 * l) / 433), mese = Math.floor((h + l - 7 * m + 90) / 25), giorno = (h + l - 7 * m + 33 * mese + 19) % 32;
    return a + "-" + ("0" + mese).slice(-2) + "-" + ("0" + giorno).slice(-2);
  }
  function lavorativo(g) {
    var a = +g.slice(0, 4), fest = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].map(function (x) { return a + "-" + x; }).concat([piuGiorni(pasqua(a), 1)]);
    var w = new Date(g + "T00:00:00Z").getUTCDay();
    return w !== 0 && w !== 6 && fest.indexOf(g) < 0;
  }
  function proroga(g) { var x = g; while (!lavorativo(x)) x = piuGiorni(x, 1); return x; }
  /* scadenze dalla data di notifica; data = termine prorogato al primo giorno lavorativo, nominale = termine di calendario */
  function scadenze(tipo, notifica, giorni) {
    return elencoScadenze(tipo, notifica, giorni).map(function (x) { var d = proroga(x.data); return { data: d, nominale: x.data, prorogata: d !== x.data, voce: x.voce }; });
  }
  function elencoScadenze(tipo, notifica, giorni) {
    if (!notifica) return [];
    if (tipo === "schema") return [
      { data: piuGiorni(notifica, 30), voce: "Istanza di accertamento con adesione, in alternativa alle osservazioni (30 giorni, art. 6-bis c. 3 L. 212/2000 e art. 6 c. 2-quater D.Lgs. 218/1997)" },
      { data: piuGiorni(notifica, giorni || 60), voce: "Osservazioni e controdeduzioni; richiesta di accesso agli atti del fascicolo (" + (giorni || 60) + " giorni dalla notifica)" }];
    if (tipo === "avviso") return [
      { data: piuGiorni(notifica, 15), voce: "Istanza di accertamento con adesione, se non già presentata dopo lo schema di atto (15 giorni, art. 6 c. 2-bis D.Lgs. 218/1997)" },
      { data: piuGiorni(notifica, 60), voce: "Ricorso alla Corte di giustizia tributaria di primo grado o acquiescenza con sanzioni a 1/3 (60 giorni, più la sospensione feriale dal 1° al 31 agosto per il ricorso)" }];
    if (tipo === "invito") return [{ data: piuGiorni(notifica, giorni || 15), voce: "Risposta all'invito (termine indicato nell'atto)" }];
    return [];
  }

  /* ---------- testo delle osservazioni allo schema di atto (blocchi per docx-mini) ---------- */
  function osservazioni(d, opz) {
    var o = opz || {}, A = d.atto, st = o.studio || {}, cl = o.cliente || {}, sc = scenari(d, o.tesi), cols = sc.colonne, ult = cols[cols.length - 1], sch = cols[0];
    var v = function (x) { return x || "____________________"; }, e = eur, B = [];
    var permute = sc.permute, totPermute = permute.reduce(function (s, c) { return s + c.importo; }, 0);
    var conTesi = function (k) { return cols.some(function (c) { return c.tesi.indexOf(k) >= 0; }); };
    var desc = function (c) { return (c.quantita ? c.quantita + " " : "") + c.da + " in " + c.a + (c.data ? " del " + it(c.data) : ""); };
    B.push({ t: "p", testo: "**Spett.le**\n**Agenzia delle Entrate**\n" + v(A.ufficio) + (A.indirizzo ? "\n" + A.indirizzo : "") + (A.pec ? "\nPEC: " + A.pec : "") + (A.funzionario ? "\nAlla c.a. di " + A.funzionario + (A.emailFunzionario ? " – " + A.emailFunzionario : "") : ""), allinea: "left" });
    B.push({ t: "p", testo: "**Oggetto: Schema di atto n. " + v(A.numero) + ", ai sensi dell'art. 6-bis, commi 1 e 3, della L. 212/2000 – Contribuente: " + v(cl.nome) + (cl.cf ? ", C.F. " + cl.cf : "") + " – Anno d'imposta " + v(A.anno) + " – Osservazioni e controdeduzioni.**" });
    B.push({ t: "titolo", testo: "Osservazioni e controdeduzioni" });
    B.push({ t: "p", testo: "Il sottoscritto " + v(st.professionista) + (st.qualifica ? ", " + st.qualifica : "") + (st.indirizzo ? ", con studio in " + st.indirizzo : "") + ", in qualità di procuratore speciale di " + v(cl.nome) + (cl.nascita ? ", nato/a a " + cl.nascita : "") + (cl.residenza ? ", residente in " + cl.residenza : "") + (cl.cf ? ", C.F. " + cl.cf : "") + " (di seguito, il \"contribuente\"), giusta procura speciale già agli atti dell'Ufficio" + (o.pecDomicilio ? ", con domicilio digitale eletto presso l'indirizzo PEC " + o.pecDomicilio : "") + "," });
    B.push({ t: "titolo", testo: "Premesso che" });
    var prem = [];
    if (A.invito) prem.push("con l'invito n. " + A.invito.numero + ", notificato il " + it(A.invito.data) + " ai sensi dell'art. 32 del D.P.R. n. 600/1973, l'Ufficio ha chiesto al contribuente dati, notizie e documenti relativi alle operazioni in cripto-attività;");
    (o.premesse || []).forEach(function (p) { if (String(p).trim()) prem.push(String(p).trim()); });
    prem.push("con lo schema di atto in oggetto" + (o.notifica ? ", notificato in data " + it(o.notifica) : "") + ", l'Ufficio ha ritenuto accertabile per il periodo d'imposta " + A.anno + ", ai sensi degli artt. 67, comma 1, lett. c-sexies), e 68, comma 9-bis, del TUIR, una plusvalenza imponibile di euro " + num(d.rt.imponibile != null ? d.rt.imponibile : d.totaleImponibile) + ", assoggettata all'imposta sostitutiva del " + pct(d.rt.aliquota) + " (euro " + num(d.rt.imposta) + ")" + (d.ivaca ? ", oltre all'imposta sul valore delle cripto-attività di euro " + num(d.ivaca) : "") + (d.sanzioni.totale ? " e alla sanzione" + (d.sanzioni.violazioni[0] ? " per " + d.sanzioni.violazioni[0].descrizione.toLowerCase().replace(/^imp\.sostit\.\s*-?\s*/, "") : "") + " di euro " + num(d.sanzioni.totale) : "") + ";");
    prem.push("la plusvalenza è stata determinata " + d.componenti.map(function (c) { return (c.segno < 0 ? "al netto di " : "") + c.voce.toLowerCase() + " (euro " + num(c.importo) + ")"; }).join(", ") + ";");
    prem.push("lo schema di atto assegna al contribuente il termine di " + (A.giorniOsservazioni || 60) + " giorni dalla notifica per presentare osservazioni e controdeduzioni;");
    B.push({ t: "elenco", numerato: true, voci: prem });
    B.push({ t: "p", testo: "tutto ciò premesso, il sottoscritto, nell'interesse del contribuente e nel termine assegnato," });
    B.push({ t: "titolo", testo: "Presenta" });
    B.push({ t: "p", testo: "le seguenti osservazioni e controdeduzioni, unitamente al file Excel \"Prospetto di calcolo – osservazioni allo schema di atto " + v(A.numero) + "\" (di seguito, il \"Prospetto\", allegato 1), che ne costituisce parte integrante, ed" });
    B.push({ t: "titolo", testo: "Espone quanto segue" });
    var n = 1, profili = [];
    if (conTesi("stablecoin")) profili.push("la rilevanza fiscale delle permute di cripto-attività in stablecoin (" + permute.map(desc).join("; ") + "), per complessivi euro " + num(totPermute));
    if (conTesi("aliquota")) profili.push("la misura dell'aliquota dell'imposta sostitutiva, che per i periodi d'imposta 2023 e 2024 è pari al 12,50% e non al " + pct(d.rt.aliquota));
    B.push({ t: "sottotitolo", testo: (n++) + ". Perimetro delle osservazioni: i dati sono quelli dell'Ufficio" });
    B.push({ t: "p", testo: "Le presenti osservazioni non propongono una diversa ricostruzione delle operazioni. Si basano esclusivamente sui calcoli già effettuati dall'Ufficio nello schema di atto: gli stessi wallet, le stesse piattaforme, le stesse operazioni, gli stessi controvalori in euro e lo stesso criterio di determinazione del costo. Su questa base comune si contesta" + (profili.length > 1 ? "no" : "") + " " + (profili.length ? (profili.length === 1 ? "un solo profilo" : profili.length === 2 ? "due soli profili" : profili.length + " profili") + " di diritto:" : "quanto segue.") });
    if (profili.length) B.push({ t: "elenco", voci: profili.map(function (p, i) { return String.fromCharCode(97 + i) + ") " + p + (i === profili.length - 1 ? "." : ";"); }) });
    B.push({ t: "p", testo: "Il Prospetto riporta, voce per voce, gli importi dello schema e la loro rideterminazione per effetto delle osservazioni" + (profili.length > 1 ? ", che sono tra loro indipendenti" : "") + ". La limitazione delle presenti osservazioni a tali profili non costituisce acquiescenza sugli altri elementi dello schema." });
    if (conTesi("stablecoin")) {
      B.push({ t: "sottotitolo", testo: (n++) + ". Le permute di cripto-attività in stablecoin non sono fiscalmente rilevanti" });
      TESTO_STABLECOIN.forEach(function (p) { B.push(p); });
      var c1 = cols.filter(function (c) { return c.tesi.length === 1 && c.tesi[0] === "stablecoin"; })[0] || cols[1];
      B.push({ t: "p", testo: "**Effetto sulla base imponibile.** Escluse le permute, la plusvalenza si riduce di euro " + num(totPermute) + " e l'imponibile passa da euro " + num(sch.imponibile) + " a euro " + num(c1.imponibile) + ". Tutte le altre voci restano quelle dello schema. Il costo delle cripto-attività permutate, pari a zero secondo lo schema, si trasferisce sulle stablecoin ricevute." });
    }
    if (conTesi("aliquota")) {
      B.push({ t: "sottotitolo", testo: (n++) + ". Per il " + A.anno + " l'aliquota dell'imposta sostitutiva è del 12,50%" });
      TESTO_ALIQUOTA.forEach(function (p) { B.push(p); });
      var solo = r0(sch.imponibile * 0.125);
      B.push({ t: "p", testo: "**Effetto sull'imposta.** Applicando il 12,50% all'imponibile " + (conTesi("stablecoin") ? "rideterminato al paragrafo precedente (euro " + num(ult.imponibile) + ")" : "dello schema (euro " + num(ult.imponibile) + ")") + ", l'imposta sostitutiva è pari a euro " + num(ult.imposta) + "." + (conTesi("stablecoin") ? " La seconda osservazione è indipendente dalla prima: la stessa aliquota, applicata all'imponibile dello schema (euro " + num(sch.imponibile) + "), darebbe un'imposta di euro " + num(solo) + "." : "") });
    }
    B.push({ t: "sottotitolo", testo: (n++) + ". Rideterminazione delle imposte e delle sanzioni" });
    B.push({ t: "p", testo: "La tabella riepiloga gli importi dello schema e quelli che risultano dalle osservazioni. Il dettaglio e le formule sono nel Prospetto (allegato 1)." });
    B.push({ t: "tabella", intest: ["Voce"].concat(cols.map(function (c) { return c.titolo; })), numeri: cols.map(function (c, i) { return i + 1; }), righe: tabellaScenari(sc) });
    B.push({ t: "p", testo: "La sanzione è calcolata come nello schema, sull'importo arrotondato di imposta sostitutiva e imposta sul valore delle cripto-attività. Gli interessi andranno ricalcolati sulle imposte rideterminate." });
    (o.verifiche || []).forEach(function (x) { B.push({ t: "p", testo: x }); });
    B.push({ t: "titolo", testo: "Chiede" });
    var ch = ["acquisire agli atti le presenti osservazioni e il Prospetto (allegato 1)" + ((o.allegati || []).length ? ", " + o.allegati.join(", ") : "") + ";"];
    if (conTesi("stablecoin")) ch.push("escludere dalla plusvalenza imponibile le permute " + permute.map(desc).join(", ") + ", per complessivi euro " + num(totPermute) + ", rideterminando l'imponibile in euro " + num((cols.filter(function (c) { return c.tesi.length === 1 && c.tesi[0] === "stablecoin"; })[0] || ult).imponibile) + ";");
    if (conTesi("aliquota")) ch.push("applicare all'imponibile l'aliquota del 12,50% prevista dall'art. 5, comma 2, del D.Lgs. 461/1997, rideterminando l'imposta sostitutiva in euro " + num(ult.imposta) + " e la sanzione di conseguenza;");
    if (conTesi("stablecoin")) ch.push("in ogni caso, non applicare sanzioni in relazione alle permute in stablecoin, per l'obiettiva incertezza sulla portata della norma;");
    ch.push("motivare espressamente, ai sensi dell'art. 6-bis, comma 3, della L. 212/2000, in ordine alle osservazioni che ritenesse di non accogliere;");
    if (o.pecDomicilio) ch.push("indirizzare ogni comunicazione relativa al procedimento all'indirizzo PEC " + o.pecDomicilio + ".");
    B.push({ t: "p", testo: "che l'Ufficio voglia, in sede di adozione dell'eventuale atto impositivo:" });
    B.push({ t: "elenco", voci: ch.map(function (x, i) { return String.fromCharCode(97 + i) + ") " + x; }) });
    B.push({ t: "p", testo: "Resta ferma la disponibilità del contribuente a definire la posizione mediante accertamento con adesione." });
    B.push({ t: "p", testo: "Con osservanza." });
    B.push({ t: "p", testo: v(o.citta) + ", " + (o.data ? it(o.data) : "[data]") });
    B.push({ t: "p", testo: "Il procuratore speciale\n" + v(st.professionista) + "\n(firmato digitalmente)", allinea: "right" });
    B.push({ t: "sottotitolo", testo: "Elenco dei documenti depositati" });
    B.push({ t: "tabella", intest: ["Documento", "Riferimento"], righe: [["Prospetto di calcolo – osservazioni allo schema di atto " + v(A.numero) + " (file Excel)", "Allegato 1"]].concat((o.allegati || []).map(function (a, i) { return [a, "Allegato " + (i + 2)]; })) });
    return B;
  }
  function tabellaScenari(sc) {
    var cols = sc.colonne, righe = [];
    cols[0].righe.forEach(function (r, i) { righe.push([r.voce].concat(cols.map(function (c) { return num(c.righe[i].importo); }))); });
    if (cols[0].franchigia) righe.push(["Deduzione art. 67, c. 1, lett. c-sexies)"].concat(cols.map(function (c) { return num(c.franchigia); })));
    righe.push(["**Imponibile**"].concat(cols.map(function (c) { return "**" + num(c.imponibile) + "**"; })));
    righe.push(["Aliquota"].concat(cols.map(function (c) { return pct(c.aliquota); })));
    righe.push(["**Imposta sostitutiva**"].concat(cols.map(function (c) { return "**" + num(c.imposta) + "**"; })));
    if (cols[0].ivaca) righe.push(["Imposta sul valore delle cripto-attività"].concat(cols.map(function (c) { return num(c.ivaca); })));
    if (sc.misura != null) righe.push(["Sanzione (" + Math.round(sc.misura * 100) + "%)"].concat(cols.map(function (c) { return num(c.sanzione); })));
    return righe;
  }
  // 1.234,56 sempre con il punto delle migliaia (Intl in italiano non lo mette sotto le 10.000)
  function num(x) {
    if (x == null) return "–";
    var neg = x < 0, p = Math.abs(r2(x)).toFixed(2).split(".");
    return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + p[1];
  }
  function pct(x) { if (x == null) return "26%"; var v = Math.round(x * 10000) / 100; return (v % 1 ? v.toFixed(2) : String(v)).replace(".", ",") + "%"; }
  function it(g) { return g ? g.slice(8, 10) + "/" + g.slice(5, 7) + "/" + g.slice(0, 4) : ""; }

  /* testi delle tesi, dalle osservazioni dello studio (ottobre 2026) */
  var P = function (t) { return { t: "p", testo: t }; };
  var TESTO_STABLECOIN = [
    P("**La legge italiana: un'unica categoria per le rappresentazioni digitali di valore.** L'art. 67, comma 1, lett. c-sexies), del TUIR, introdotto dall'art. 1, comma 126, della L. 197/2022, definisce la cripto-attività come «una rappresentazione digitale di valore o di diritti che possono essere trasferiti e memorizzati elettronicamente, utilizzando la tecnologia di registro distribuito o una tecnologia analoga» e stabilisce che «non costituisce una fattispecie fiscalmente rilevante la permuta tra cripto-attività aventi eguali caratteristiche e funzioni». Da un lato vi sono le rappresentazioni digitali di valore, come bitcoin, ether, BNB, USDT, BUSD e simili, che servono a trasferire e conservare valore e come mezzo di scambio; dall'altro le rappresentazioni digitali di diritti, come gli NFT e gli altri token che incorporano il diritto su un bene, un servizio o un'utilità. Le cripto-attività del primo gruppo hanno tra loro medesima funzione economica: la permuta tra di esse non realizza alcun reddito e il valore di carico della cripto-attività ceduta si trasferisce su quella ricevuta."),
    P("**La Circolare n. 30/E del 2023: rileva la funzione economica, non l'ancoraggio al dollaro.** La Circolare n. 30/E del 27/10/2023 distingue le cripto-attività «sulla base della funzione economica svolta» e definisce i token di pagamento come «mezzi di pagamento per l'acquisto di beni o servizi oppure strumenti finalizzati al trasferimento di denaro e di valori» (pag. 8); al paragrafo 3.1 precisa che dal 1° gennaio 2023 non costituisce fattispecie realizzativa «lo scambio di una cripto-valuta con un'altra», perché gli scambi tra cripto-attività «aventi medesima funzionalità economica» si considerano «aventi eguali caratteristiche e funzioni» (pag. 47). USDT, BUSD, ether, BNB e bitcoin sono tutti token di pagamento. La stabilizzazione rispetto al dollaro è un criterio di classificazione diverso e separato (pagg. 7-8), che non incide sulla funzione economica; anche la nozione di valuta virtuale dell'art. 1, comma 2, lett. qq), del D.Lgs. 231/2007 comprende la rappresentazione digitale di valore «non necessariamente collegata a una valuta avente corso legale»."),
    P("**L'unica eccezione indicata dalla Circolare: l'e-money token.** La Circolare (pagg. 48-49) considera fiscalmente rilevante solo la permuta tra una cripto-valuta e un e-money token, che è moneta elettronica e «garantisce il diritto di credito del possessore al valore nominale rispetto ad una valuta fiat», ed esclude la rilevanza della permuta con un asset-referenced token. I due requisiti sono cumulativi. La qualifica di e-money token discende dal Regolamento (UE) 2023/1114 (MiCAR), i cui titoli III e IV si applicano soltanto dal 30/06/2024 (art. 149, par. 3); USDT, emesso da Tether, non è un e-money token neppure oggi e il rimborso non spetta a qualunque possessore al valore nominale; BUSD era emesso negli Stati Uniti da Paxos Trust Company e non era moneta elettronica ai sensi della direttiva 2009/110/CE."),
    P("**L'interrogazione parlamentare n. 5-03682.** Alla domanda se siano fiscalmente rilevanti le sole permute con stablecoin qualificate come e-money token o anche quelle con stablecoin che non rientrano in tale definizione, come USDT, il Governo (VI Commissione Finanze della Camera, 12/03/2025) non ha affermato la rilevanza di tali permute, ha richiamato la Circolare n. 30/E e ha annunciato un documento di prassi, che a oggi non risulta emanato. L'obiettiva incertezza sulla portata della norma, riconosciuta dalla stessa Amministrazione, esclude in ogni caso l'applicazione delle sanzioni (art. 10, comma 3, della L. 212/2000 e art. 6, comma 2, del D.Lgs. 472/1997)."),
    P("**La motivazione dello schema di atto.** La qualificazione di una permuta come rilevante perché comporta «la dismissione di una posizione» e «l'acquisizione di una diversa attività virtuale economicamente valorizzabile» si adatta a qualunque permuta tra cripto-attività, compreso lo scambio di ether con bitcoin che la legge e la Circolare escludono espressamente, e non dimostra che la stablecoin abbia caratteristiche e funzioni diverse da quelle della cripto-attività ceduta. Quando le stablecoin sono state poi riconvertite in cripto-attività, si tratta di cicli interamente interni alle cripto-attività, senza uscita verso una valuta avente corso legale: se non si attribuisce rilevanza alle riconversioni, per coerenza non la si può attribuire alle conversioni.")
  ];
  var TESTO_ALIQUOTA = [
    P("**Il dato normativo.** Lo schema applica l'aliquota del 26% richiamando l'art. 5 del D.Lgs. n. 461/1997, che al comma 2 prevede però l'aliquota «del 12,50 per cento». La L. 197/2022 (art. 1, comma 128, lett. a) ha esteso alla lett. c-sexies) gli artt. 5, 6, 7 e 10 del D.Lgs. 461/1997, ma non ha modificato l'art. 3, comma 1, del D.L. 66/2014, che eleva al 26% le imposte sostitutive sui redditi diversi «di cui all'articolo 67, comma 1, lettere da c-bis) a c-quinquies)» del TUIR. Le cripto-attività, disciplinate dalla lett. c-sexies), restano fuori da questa norma; l'aliquota è un elemento essenziale della prestazione tributaria, riservato alla legge (art. 23 Cost.)."),
    P("**Il mancato coordinamento era stato segnalato.** Il Dossier dei Servizi Studi del Senato e della Camera sulla legge di bilancio 2023 (26/01/2023, vol. I, pagg. 221-222) ha suggerito di «apportare la medesima modifica all'articolo 3, comma 1, del decreto legge n. 66 del 2014». Il legislatore non è intervenuto fino alla L. 207/2024."),
    P("**La L. 207/2024 conferma che prima del 2025 il 26% non si applicava.** Solo l'art. 1, comma 23, della L. 207/2024 ha stabilito che l'aliquota dell'imposta sostitutiva di cui all'art. 5 del D.Lgs. 461/1997 «è pari al 26 per cento». La norma non si qualifica come interpretativa (art. 1, comma 2, della L. 212/2000; Corte cost. n. 133/2020 e n. 397/1994), la formulazione «è da intendersi» è stata proposta e non approvata (emendamento 2.62, V Commissione della Camera, dicembre 2024) e le disposizioni tributarie non hanno efficacia retroattiva (art. 3, comma 1, della L. 212/2000). La stessa conclusione è sostenuta dal CNDCEC e dalla Fondazione Nazionale dei Commercialisti nel documento del 21/03/2025, che per i periodi d'imposta 2023 e 2024 indica l'aliquota del 12,50%.")
  ];

  return { tipoAtto: tipoAtto, NOMI_TIPO: NOMI_TIPO, intestazione: intestazione, leggiSchema: leggiSchema, natura: natura, NOMI_NATURA: NOMI_NATURA, scenari: scenari, TESI: TESI, applicabile: applicabile, scadenze: scadenze, proroga: proroga, osservazioni: osservazioni, tabellaScenari: tabellaScenari, importo: importo, num: num, STABLE: STABLE };
});
