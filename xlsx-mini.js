/* Lumes Lab · generatore minimo di file Excel (.xlsx) senza librerie esterne.
   Scrive formule (ricalcolate all'apertura), stili essenziali e larghezze di colonna. Funziona anche in Node per le prove. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LumesXlsx = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* stili: indice -> descrizione (vedi styles.xml qui sotto) */
  var STILE = { normale: 0, grassetto: 1, titolo: 2, inputEuro: 3, euro: 4, totale: 5, intestazione: 6, nota: 7, inputPct: 8, differenza: 9, collegato: 10, euroGrassetto: 11 };

  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, "utf8"));
  }
  /* zip senza compressione (metodo "store"): sufficiente per file piccoli */
  function zip(files) {
    var parti = [], centrale = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var nome = utf8(f.nome), dati = utf8(f.testo), c = crc32(dati);
      var loc = [].concat([0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c), u32(dati.length), u32(dati.length), u16(nome.length), u16(0));
      parti.push(Uint8Array.from(loc), nome, dati);
      centrale.push(Uint8Array.from([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c), u32(dati.length), u32(dati.length), u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nome);
      off += loc.length + nome.length + dati.length;
    });
    var dimC = centrale.reduce(function (a, b) { return a + b.length; }, 0);
    var fine = Uint8Array.from([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(dimC), u32(off), u16(0)));
    var tutte = parti.concat(centrale, [fine]), tot = tutte.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(tot), p = 0;
    tutte.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }
  function x(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function colonna(n) { var s = ""; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 &quot;€&quot;;-#,##0 &quot;€&quot;;&quot;-&quot;"/></numFmts>' +
    '<fonts count="8">' +
    '<font><sz val="10"/><name val="Arial"/></font>' +
    '<font><b/><sz val="10"/><name val="Arial"/></font>' +
    '<font><b/><sz val="13"/><color rgb="FF14284A"/><name val="Arial"/></font>' +
    '<font><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
    '<font><i/><sz val="9"/><name val="Arial"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF1F7A4A"/><name val="Arial"/></font>' +
    '<font><sz val="10"/><color rgb="FF008000"/><name val="Arial"/></font>' +
    "</fonts>" +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF14284A"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF4EE"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="12">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '<xf numFmtId="9" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="7" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    "</cellXfs></styleSheet>";

  /* fogli: [{ nome, colonne: [larghezze], righe: [[cella, ...]], unisci: ["A10:E10"], altezze: {riga: pt}, orizzontale: A4 orizzontale, una pagina in larghezza }]
     cella: null | stringa | numero | { v, f, s } (f = formula senza "=", s = nome dello stile) */
  function crea(fogli) {
    var files = [];
    files.push({ nome: "[Content_Types].xml", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      fogli.map(function (f, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>" });
    files.push({ nome: "_rels/.rels", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ nome: "xl/workbook.xml", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      fogli.map(function (f, i) { return '<sheet name="' + x(f.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' });
    files.push({ nome: "xl/_rels/workbook.xml.rels", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      fogli.map(function (f, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (fogli.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    files.push({ nome: "xl/styles.xml", testo: STYLES });
    fogli.forEach(function (f, i) {
      var righe = f.righe.map(function (riga, r) {
        var h = f.altezze && f.altezze[r + 1] ? ' ht="' + f.altezze[r + 1] + '" customHeight="1"' : "";
        return '<row r="' + (r + 1) + '"' + h + ">" + riga.map(function (c, k) {
          if (c == null || c === "") return "";
          var ref = colonna(k) + (r + 1), o = typeof c === "object" ? c : { v: c };
          var s = o.s != null ? ' s="' + (STILE[o.s] != null ? STILE[o.s] : 0) + '"' : "";
          if (o.f != null) return '<c r="' + ref + '"' + s + "><f>" + x(o.f) + "</f></c>";
          if (typeof o.v === "number") return '<c r="' + ref + '"' + s + "><v>" + o.v + "</v></c>";
          return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + x(o.v) + "</t></is></c>";
        }).join("") + "</row>";
      }).join("");
      var cols = f.colonne ? "<cols>" + f.colonne.map(function (w, k) { return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>" : "";
      var merge = f.unisci && f.unisci.length ? '<mergeCells count="' + f.unisci.length + '">' + f.unisci.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + "</mergeCells>" : "";
      files.push({ nome: "xl/worksheets/sheet" + (i + 1) + ".xml", testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + (f.orizzontale ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "") + cols + "<sheetData>" + righe + "</sheetData>" + merge +
        (f.orizzontale ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : "") + "</worksheet>" });
    });
    return zip(files);
  }
  return { crea: crea, colonna: colonna };
});
