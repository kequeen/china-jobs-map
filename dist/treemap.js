/* Squarified treemap: pure layout, no network or third-party runtime. */
(function (root) {
  'use strict';
  function squarify(items, width, height) {
    if (!(width > 0 && height > 0)) return [];
    const positive = items.filter(d => Number.isFinite(d.value) && d.value > 0).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    const total = positive.reduce((n, d) => n + d.value, 0);
    if (!total) return [];
    let pending = positive.map(d => ({ ...d, area: d.value / total * width * height }));
    let box = { x: 0, y: 0, w: width, h: height };
    const output = [];
    function worst(row, side) {
      if (!row.length) return Infinity;
      const sum = row.reduce((n, d) => n + d.area, 0);
      const min = Math.min(...row.map(d => d.area)), max = Math.max(...row.map(d => d.area));
      return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min));
    }
    function place(row) {
      const sum = row.reduce((n, d) => n + d.area, 0);
      if (box.w >= box.h) {
        const strip = Math.min(box.w, sum / box.h);
        let y = box.y;
        row.forEach((d, i) => {
          const h = i === row.length - 1 ? box.y + box.h - y : d.area / strip;
          output.push({ ...d, x: box.x, y, w: strip, h }); y += h;
        });
        box = { x: box.x + strip, y: box.y, w: Math.max(0, box.w - strip), h: box.h };
      } else {
        const strip = Math.min(box.h, sum / box.w);
        let x = box.x;
        row.forEach((d, i) => {
          const w = i === row.length - 1 ? box.x + box.w - x : d.area / strip;
          output.push({ ...d, x, y: box.y, w, h: strip }); x += w;
        });
        box = { x: box.x, y: box.y + strip, w: box.w, h: Math.max(0, box.h - strip) };
      }
    }
    while (pending.length) {
      const row = [pending.shift()];
      const side = Math.min(box.w, box.h);
      while (pending.length && worst([...row, pending[0]], side) <= worst(row, side)) row.push(pending.shift());
      place(row);
    }
    return output;
  }
  root.ChinaTreemap = { squarify };
  if (typeof module !== 'undefined') module.exports = root.ChinaTreemap;
})(typeof window === 'undefined' ? globalThis : window);

