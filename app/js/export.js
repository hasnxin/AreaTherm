/* AreaTherm — CSV export (design comparison table, material comparison
   sheet, validation dataset). Deliberately plain-JS CSV rather than a
   SheetJS-generated .xlsx: CSV opens directly in Excel/Sheets/LibreOffice
   with zero runtime dependency, so export never depends on a CDN being
   reachable at demo time — consistent with this app's dependency-free,
   offline-safe design (see README "What this is"). PDF export uses the
   browser's native print-to-PDF for the same reason (see ui-3.js). */

window.APP_EXPORT = (function () {
  function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach(r => lines.push(r.map(csvEscape).join(",")));
    return lines.join("\r\n");
  }
  function downloadCsv(filename, headers, rows) {
    window.U.downloadFile(filename, toCsv(headers, rows), "text/csv;charset=utf-8");
  }
  return { toCsv, downloadCsv };
})();
