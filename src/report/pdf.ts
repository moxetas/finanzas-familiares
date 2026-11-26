/**
 * PDF del desglose de un mes, hecho en el propio móvil (sin librerías ni servidor).
 * Cada página se dibuja en un canvas A4 con las fuentes del sistema, así salen bien
 * todos los idiomas (también ruso o árabe), y se guarda como una imagen JPEG dentro
 * de un PDF mínimo.
 */

import type { MonthReport, ReportTable, Tone } from './month-report';

/** A4 a 150 ppp. */
const W = 1240;
const H = 1754;
const M = 90;
const FOOT = 70;
const ROW = 40;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const COLORS = { ink: '#16201e', muted: '#5b6966', line: '#dce4e2', zebra: '#f4f7f6', accent: '#0a6b5e', pos: '#0a7a5a', neg: '#b3261e', head: '#e8f1ef' };

const toneColor = (t: Tone | undefined) => (t === 'pos' ? COLORS.pos : t === 'neg' ? COLORS.neg : t === 'muted' ? COLORS.muted : COLORS.ink);

/** Recorta el texto con «…» para que quepa en `max` píxeles. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

/** Parte un texto largo en líneas de como mucho `max` píxeles (como mucho `lines`). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = fit(ctx, out.slice(lines - 1).join(' '), max);
    return kept;
  }
  return out.map((l) => fit(ctx, l, max));
}

export function drawPages(report: MonthReport, rtl = false): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = 0;
  const newPage = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    pages.push(c);
    y = M;
  };
  const room = (h: number) => {
    if (y + h > H - M - FOOT) newPage();
  };
  // En árabe, la página se dibuja de derecha a izquierda.
  const X = (x: number, w = 0) => (rtl ? W - x - w : x);
  const text = (s: string, x: number, w: number, opts: { size: number; bold?: boolean; color?: string; right?: boolean }) => {
    ctx.font = `${opts.bold ? 700 : 400} ${opts.size}px ${FONT}`;
    ctx.fillStyle = opts.color ?? COLORS.ink;
    const alignEnd = (opts.right ?? false) !== rtl;
    ctx.textAlign = alignEnd ? 'right' : 'left';
    const left = X(x, w);
    ctx.fillText(fit(ctx, s, w), alignEnd ? left + w : left, y);
  };

  newPage();
  // Cabecera
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, W, 12);
  y = M + 10;
  ctx.font = `700 46px ${FONT}`;
  const titleLines = wrap(ctx, report.title, W - 2 * M, 2);
  for (const l of titleLines) {
    text(l, M, W - 2 * M, { size: 46, bold: true });
    y += 58;
  }
  text(report.subtitle, M, W - 2 * M, { size: 24, color: COLORS.muted });
  y += 56;

  // Cifras del mes
  if (report.kpis.length) {
    const gap = 18;
    const bw = (W - 2 * M - gap * (report.kpis.length - 1)) / report.kpis.length;
    const bh = 104;
    report.kpis.forEach((k, i) => {
      const x = M + i * (bw + gap);
      ctx.fillStyle = COLORS.head;
      ctx.beginPath();
      ctx.roundRect(X(x, bw), y, bw, bh, 14);
      ctx.fill();
      const yy = y;
      y = yy + 32;
      text(k.label, x + 18, bw - 36, { size: 20, color: COLORS.muted });
      y = yy + 70;
      text(k.value, x + 18, bw - 36, { size: 30, bold: true, color: toneColor(k.tone) });
      y = yy;
    });
    y += bh + 40;
  }

  for (const table of report.tables) drawTable(table);

  function drawTable(tb: ReportTable) {
    const width = W - 2 * M;
    const xs: number[] = [];
    let acc = M;
    for (const w of tb.widths) {
      xs.push(acc);
      acc += w * width;
    }
    const cw = tb.widths.map((w) => w * width - 16);
    const header = () => {
      ctx.fillStyle = COLORS.head;
      ctx.fillRect(M, y - ROW / 2, width, ROW);
      tb.cols.forEach((c, i) => text(c.toLocaleUpperCase(), xs[i]! + 8, cw[i]!, { size: 16, bold: true, color: COLORS.muted, right: tb.right[i] }));
      y += ROW;
    };
    // El concepto ocupa hasta 2 líneas y la nota, hasta 2 más en pequeño.
    const layout = (r: ReportTable['rows'][number]) => {
      ctx.font = `${r.bold ? 700 : 400} 21px ${FONT}`;
      const main = wrap(ctx, r.cells[0] ?? '', cw[0]!, 2);
      ctx.font = `400 17px ${FONT}`;
      const sub = r.sub ? wrap(ctx, r.sub, cw[0]!, 2) : [];
      return { main, sub, h: Math.max(ROW, 14 + main.length * 27 + sub.length * 22) };
    };
    const title = (cont: boolean) => {
      text(cont ? `${tb.title} (${'…'})` : tb.title, M, width, { size: 28, bold: true, color: COLORS.accent });
      y += 46;
      header();
    };
    const first = tb.rows[0] ? layout(tb.rows[0]).h : ROW;
    room(56 + ROW + first);
    y += 10;
    title(false);
    if (tb.rows.length === 0) {
      text(tb.empty ?? '', M + 8, width - 16, { size: 21, color: COLORS.muted });
      y += ROW;
    }
    tb.rows.forEach((r, ri) => {
      const L = layout(r);
      if (y - ROW / 2 + L.h > H - M - FOOT) {
        newPage();
        y += ROW / 2;
        title(true);
      }
      const top = y - ROW / 2;
      if (r.bold) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M, top);
        ctx.lineTo(M + width, top);
        ctx.stroke();
      } else if (ri % 2 === 1) {
        ctx.fillStyle = COLORS.zebra;
        ctx.fillRect(M, top, width, L.h);
      }
      const y0 = top + 7 + 27 / 2;
      L.main.forEach((line, k) => {
        y = y0 + k * 27;
        text(line, xs[0]! + 8, cw[0]!, { size: 21, bold: r.bold, color: toneColor(r.tones?.[0]) });
      });
      L.sub.forEach((line, k) => {
        y = y0 + L.main.length * 27 + k * 22 - 3;
        text(line, xs[0]! + 8, cw[0]!, { size: 17, color: COLORS.muted });
      });
      y = y0;
      r.cells.slice(1).forEach((c, j) => {
        const i = j + 1;
        ctx.font = `${r.bold ? 700 : 400} 21px ${FONT}`;
        const lines = tb.right[i] ? [c] : wrap(ctx, c, cw[i]!, 2);
        lines.forEach((line, k) => {
          y = y0 + k * 27;
          text(line, xs[i]! + 8, cw[i]!, { size: 21, bold: r.bold, color: toneColor(r.tones?.[i]), right: tb.right[i] });
        });
      });
      y = top + L.h + ROW / 2;
    });
    y += 34;
  }

  // Pie: fecha y número de página
  pages.forEach((c, i) => {
    ctx = c.getContext('2d')!;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    y = H - M / 2 - 10;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, y - 30);
    ctx.lineTo(W - M, y - 30);
    ctx.stroke();
    text(report.footer, M, W - 2 * M - 120, { size: 18, color: COLORS.muted });
    text(`${i + 1}/${pages.length}`, W - M - 120, 120, { size: 18, color: COLORS.muted, right: true });
  });
  return pages;
}

async function jpeg(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) throw new Error('No se pudo dibujar la página');
  return new Uint8Array(await blob.arrayBuffer());
}

/** PDF con una imagen JPEG por página (A4). */
export function pdfFromJpegs(images: Uint8Array[], width = W, height = H): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    pos += u.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  const pw = 595.28;
  const ph = 841.89;
  const n = images.length;
  // 1 catálogo, 2 páginas, después por página: página, contenido, imagen.
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  images.forEach((img, i) => {
    const p = 3 + i * 3;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(p + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
      push(img);
      push('\nendstream');
    });
  });
  const total = 3 + n * 3;
  const xref = pos;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export async function reportPdf(report: MonthReport, rtl = false): Promise<Blob> {
  const pages = drawPages(report, rtl);
  const imgs: Uint8Array[] = [];
  for (const p of pages) imgs.push(await jpeg(p));
  return pdfFromJpegs(imgs);
}
