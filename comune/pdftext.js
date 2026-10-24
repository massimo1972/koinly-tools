/* Estrazione del testo da PDF con pdf.js, pagina per pagina, ricostruendo le righe. */
(function (root) {
  async function pdfToPages(pdfjsLib, data) {
    var doc = await pdfjsLib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise;
    var pages = [];
    for (var n = 1; n <= doc.numPages; n++) {
      var page = await doc.getPage(n);
      var tc = await page.getTextContent();
      var lines = [], cur = "", lastY = null;
      tc.items.forEach(function (it) {
        if (typeof it.str !== "string") return;
        var y = it.transform ? Math.round(it.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && cur) { lines.push(cur); cur = ""; }
        cur += (cur && !/\s$/.test(cur) && it.str && !/^\s/.test(it.str) ? " " : "") + it.str;
        if (it.hasEOL) { lines.push(cur); cur = ""; lastY = null; return; }
        if (y !== null) lastY = y;
      });
      if (cur) lines.push(cur);
      pages.push({ n: n, text: lines.map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean).join("\n") });
      page.cleanup();
    }
    await doc.destroy();
    return pages;
  }
  root.LumesPdf = { pdfToPages: pdfToPages };
  if (typeof module !== "undefined" && module.exports) module.exports = root.LumesPdf;
})(typeof window !== "undefined" ? window : globalThis);
