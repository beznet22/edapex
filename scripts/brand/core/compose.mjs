/**
 * Logo compositions: the symbol and the wordmark in one drawing.
 *
 * Everything is expressed in the wordmark's own units — the font laid out at size 1000, so a cap
 * is 745 of them — and every proportion comes from `tokens.lockup` as a fraction of that cap
 * height. That is what makes a typeface change a one-line edit rather than six.
 *
 * The symbol is aligned on its **mass centroid**, not its bounding box. This mark carries a thin
 * antenna above a heavy book, so its box centre sits 47 units above where the ink actually is;
 * centring on the box makes the word float. The centroid is measured from the raster, so it
 * stays true if the artwork ever changes.
 *
 * Because the centroid is off-centre, the composition is laid out in a provisional frame and
 * then settled onto its ink union. Assuming a symmetric frame would put the symbol's top above
 * the clear-space margin.
 */
import { layoutWordmark } from "./type.mjs";

/**
 * Four decimals, not two: the symbol is scaled by roughly 2.5, so a two-decimal scale moves its
 * ink by almost two composition units — enough to break the clear-space margin the validator
 * measures from the file's own transform.
 */
const fmt = (value) => Number(value.toFixed(4));

const fitted = (rawBox, scale) => ({
  scale,
  width: (rawBox.maxX - rawBox.minX) * scale,
  height: (rawBox.maxY - rawBox.minY) * scale,
  transform: (left, top) =>
    `translate(${fmt(left - rawBox.minX * scale)} ${fmt(top - rawBox.minY * scale)}) scale(${fmt(scale)})`
});

const union = (boxes) =>
  boxes.reduce((all, box) => ({
    minX: Math.min(all.minX, box.minX),
    minY: Math.min(all.minY, box.minY),
    maxX: Math.max(all.maxX, box.maxX),
    maxY: Math.max(all.maxY, box.maxY)
  }));

const measures = (tokens, which) => {
  const cap = tokens.typography.capHeight;
  const { text, tracking } = tokens.typography.wordmark[which];
  const layout = layoutWordmark(text, { tracking });

  return {
    cap,
    box: tokens.mark.ink.box,
    centroidY: tokens.mark.ink.centroid.y,
    pad: tokens.lockup.clearSpace * cap,
    gap: tokens.lockup.gap * cap,
    stackGap: tokens.lockup.stackGap * cap,
    shift: tokens.lockup.opticalShift * cap,
    symbolHeight: tokens.lockup.symbolHeight,
    stackSymbolHeight: tokens.lockup.stackSymbolHeight,
    glyphs: layout.glyphs,
    textString: layout.text,
    text: fitted(layout.box, which === "uppercase" ? tokens.lockup.capsCapHeight : 1)
  };
};

/** The symbol at a given height, with where its mass sits measured from the top of its ink box. */
const symbolFor = (m, heightFactor) => {
  const symbol = fitted(m.box, (heightFactor * m.cap) / (m.box.maxY - m.box.minY));
  return { ...symbol, massFromTop: (m.centroidY - m.box.minY) * symbol.scale };
};

/** Shift the provisional frame so the ink's top-left lands at the clear-space margin. */
const settle = (m, symbol, text) => {
  const boxes = [text.ink, ...(symbol === null ? [] : [symbol.ink])];
  const ink = union(boxes);
  const dx = m.pad - ink.minX;
  const dy = m.pad - ink.minY;

  return {
    width: fmt(ink.maxX - ink.minX + m.pad * 2),
    height: fmt(ink.maxY - ink.minY + m.pad * 2),
    symbol: symbol === null ? null : { ...symbol, left: symbol.ink.left + dx, top: symbol.ink.top + dy },
    text: { ...text, left: text.ink.left + dx, top: text.ink.top + dy }
  };
};

const inkBox = (part, left, top) => ({
  left,
  top,
  minX: left,
  minY: top,
  maxX: left + part.width,
  maxY: top + part.height
});

const horizontal = (m) => {
  const symbol = symbolFor(m, m.symbolHeight);
  const text = {
    ...m.text,
    ink: inkBox(m.text, symbol.width + m.gap, m.shift - m.text.height / 2)
  };
  return settle(m, { ...symbol, ink: inkBox(symbol, 0, -symbol.massFromTop) }, text);
};

const stacked = (m) => {
  const symbol = symbolFor(m, m.stackSymbolHeight);
  const width = Math.max(symbol.width, m.text.width);
  return settle(
    m,
    { ...symbol, ink: inkBox(symbol, (width - symbol.width) / 2, 0) },
    { ...m.text, ink: inkBox(m.text, (width - m.text.width) / 2, symbol.height + m.stackGap) }
  );
};

const wordmarkOnly = (m) => settle(m, null, { ...m.text, ink: inkBox(m.text, 0, 0) });

export const COMPOSITIONS = [
  { id: "lockup-horizontal", wordmark: "lowercase", geometry: horizontal },
  { id: "lockup-stacked", wordmark: "lowercase", geometry: stacked },
  { id: "wordmark-edapex", wordmark: "lowercase", geometry: wordmarkOnly },
  { id: "wordmark-edapex-caps", wordmark: "uppercase", geometry: wordmarkOnly }
];

export const geometry = (tokens, spec) => {
  const m = measures(tokens, spec.wordmark);
  const placed = spec.geometry(m);

  const part = (which) => which === null ? null : {
    left: placed[which].left,
    top: placed[which].top,
    width: placed[which].width,
    height: placed[which].height,
    transform: placed[which].transform(placed[which].left, placed[which].top)
  };

  return {
    id: spec.id,
    label: m.textString,
    wordmark: spec.wordmark,
    width: placed.width,
    height: placed.height,
    glyphs: m.glyphs,
    symbol: part(placed.symbol === null ? null : "symbol"),
    text: part("text")
  };
};
