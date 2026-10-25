/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · scrittura di un documento Word (.docx) senza librerie esterne, nello stile delle memorie dello studio:
   A4 verticale, Arial 12, interlinea 1,5, testo giustificato, titoli centrati in grassetto, intestazione e piè di pagina
   con i dati dello studio e «Pag. x di y». Usa lo zip di xlsx-mini.js.
   blocchi: [{ t: "p", testo, allinea: "left|center|right|both", b, spazioDopo },
             { t: "titolo", testo }            → centrato, grassetto, maiuscolo
             { t: "sottotitolo", testo }       → grassetto, a sinistra
             { t: "elenco", voci: [testo], numerato }
             { t: "tabella", intest: [..], righe: [[..]], numeri: [indici delle colonne numeriche] }
             { t: "pagina" }                   → interruzione di pagina ]
   Nei testi **grassetto** diventa grassetto. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./xlsx-mini.js"));
  else root.LumesDocx = factory(root.LumesXlsx);
})(typeof self !== "undefined" ? self : this, function (X) {
  "use strict";

  function x(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var FONT = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>';
  function run(testo, b, sz) {
    return "<w:r><w:rPr>" + FONT + (b ? "<w:b/>" : "") + (sz ? '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' : "") + '</w:rPr><w:t xml:space="preserve">' + x(testo) + "</w:t></w:r>";
  }
  // testo con **grassetto** e a capo «\n»
  function runs(testo, b, sz) {
    return String(testo == null ? "" : testo).split(/(\*\*[^*]+\*\*)/).map(function (p) {
      if (!p) return "";
      var gr = /^\*\*(.*)\*\*$/.exec(p), t = gr ? gr[1] : p;
      return t.split("\n").map(function (l, i) { return (i ? "<w:r><w:br/></w:r>" : "") + run(l, b || !!gr, sz); }).join("");
    }).join("");
  }
  function par(contenuto, o) {
    o = o || {};
    return "<w:p><w:pPr>" + (o.stile ? '<w:pStyle w:val="' + o.stile + '"/>' : "") + (o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + o.num + '"/></w:numPr>' : "") +
      (o.keep ? "<w:keepNext/>" : "") + '<w:spacing w:before="' + (o.prima || 0) + '" w:after="' + (o.dopo == null ? 120 : o.dopo) + '" w:line="' + (o.linea || 360) + '" w:lineRule="auto"/>' +
      (o.rientro ? '<w:ind w:left="' + o.rientro + '" w:hanging="' + (o.sporgente || 0) + '"/>' : "") + '<w:jc w:val="' + (o.allinea || "both") + '"/></w:pPr>' + contenuto + "</w:p>";
  }
  function tabella(b) {
    var n = b.intest.length, larg = Math.floor(7937 / n), num = b.numeri || [];
    var cella = function (t, i, testa) {
      return '<w:tc><w:tcPr><w:tcW w:w="' + larg + '" w:type="dxa"/>' + (testa ? '<w:shd w:val="clear" w:color="auto" w:fill="E7ECF3"/>' : "") + "</w:tcPr>" +
        par(runs(t, testa, 18), { allinea: !testa && num.indexOf(i) >= 0 ? "right" : "left", dopo: 0, linea: 240 }) + "</w:tc>";
    };
    var bordi = ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (k) { return "<w:" + k + ' w:val="single" w:sz="4" w:space="0" w:color="8A97AA"/>'; }).join("");
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + bordi + '</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      b.intest.map(function () { return '<w:gridCol w:w="' + larg + '"/>'; }).join("") + "</w:tblGrid>" +
      '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + b.intest.map(function (t, i) { return cella(t, i, true); }).join("") + "</w:tr>" +
      b.righe.map(function (r) { return "<w:tr><w:trPr><w:cantSplit/></w:trPr>" + r.map(function (t, i) { return cella(t, i, false); }).join("") + "</w:tr>"; }).join("") + "</w:tbl>" + par("", { dopo: 60 });
  }
  function corpo(blocchi) {
    var numId = 2; // 1 = elenco puntato; dal 2 un elenco numerato che riparte da 1 per ogni blocco
    var numerati = [];
    var xml = blocchi.map(function (b) {
      if (b.t === "titolo") return par(runs(String(b.testo).toUpperCase(), true), { allinea: "center", prima: 120, keep: true });
      if (b.t === "sottotitolo") return par(runs(b.testo, true), { allinea: "left", prima: 120, keep: true });
      if (b.t === "elenco") {
        var id = 1; if (b.numerato) { id = numId++; numerati.push(id); }
        return b.voci.map(function (v) { return par(runs(v, b.b), { num: id, rientro: 567, sporgente: 283 }); }).join("");
      }
      if (b.t === "tabella") return tabella(b);
      if (b.t === "pagina") return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      return par(runs(b.testo, b.b), { allinea: b.allinea, dopo: b.spazioDopo });
    }).join("");
    return { xml: xml, numerati: numerati };
  }

  /* opz: { intestazione: [righe], piede: [righe], titolo, autore } */
  function crea(blocchi, opz) {
    var o = opz || {}, c = corpo(blocchi);
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var testaPiede = function (tag, righe, pagine) {
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:' + tag + " " + NS + ">" +
        (righe || []).map(function (l, i) { return par(run(l, tag === "hdr" && i === 0, tag === "hdr" ? (i === 0 ? 22 : 18) : 16), { allinea: tag === "hdr" ? "left" : "center", dopo: 0, linea: 240 }); }).join("") +
        (pagine ? par(run("Pag. ", false, 16) + '<w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>' +
          run(" di ", false, 16) + '<w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr>' + FONT + '<w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>', { allinea: "center", dopo: 0, linea: 240 }) : "") +
        "</w:" + tag + ">";
    };
    var lvl = function (fmt, testo) { return '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + testo + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr><w:rPr>' + FONT + "</w:rPr></w:lvl>"; };
    var numerazione = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ' + NS + ">" +
      '<w:abstractNum w:abstractNumId="0">' + lvl("bullet", "–") + "</w:abstractNum>" + '<w:abstractNum w:abstractNumId="1">' + lvl("lowerLetter", "%1)") + "</w:abstractNum>" +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      c.numerati.map(function (id) { return '<w:num w:numId="' + id + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'; }).join("") + "</w:numbering>";
    var stili = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' + FONT + '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normale"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TabellaNormale"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    var documento = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + "><w:body>" + c.xml +
      '<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2268" w:right="1701" w:bottom="1985" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var files = [
      { nome: "[Content_Types].xml", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { nome: "_rels/.rels", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { nome: "docProps/core.xml", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + x(o.titolo || "") + "</dc:title><dc:creator>" + x(o.autore || "") + "</dc:creator></cp:coreProperties>" },
      { nome: "word/_rels/document.xml.rels", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
      { nome: "word/document.xml", testo: documento },
      { nome: "word/styles.xml", testo: stili },
      { nome: "word/numbering.xml", testo: numerazione },
      { nome: "word/header1.xml", testo: testaPiede("hdr", o.intestazione, false) },
      { nome: "word/footer1.xml", testo: testaPiede("ftr", o.piede, true) }
    ];
    return X.zip(files);
  }

  return { crea: crea, runs: runs };
});
