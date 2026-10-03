const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/**
 * Single-source icon generator for NetGuard.
 *
 * Input (the ONE logo, used by the navbar and by every icon size below):
 *   public/logo.png  -  teal shield + keyhole, fully transparent background.
 *   The keyhole and the speed lines are *cut out* of the shield (alpha = 0),
 *   which is what lets one single file read correctly on both light and dark
 *   browser tabs without a dark-mode / light-mode variant.
 *
 * Outputs (Next.js App Router file conventions - see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md;
 * Next auto-links all three, so layout.tsx needs no `icons` metadata at all):
 *   src/app/favicon.ico     16 / 32 / 48 / 256, 32-bit PNG-in-ICO  -> browser tabs
 *   src/app/icon.png        256x256 PNG                            -> <link rel="icon">
 *   src/app/apple-icon.png  180x180 PNG                            -> iOS home screen
 *   (note: `apple-touch-icon.png` is NOT a Next.js convention - the app-router
 *    file name is `apple-icon.png`, which is what emits the apple-touch-icon link)
 *
 * Run with:  npm run icons
 *
 * sharp in this project's version cannot encode .ico, so the ICO container is
 * written by hand; PNG-encoded entries are the Vista+ format that every modern
 * browser (and Windows / macOS / Linux) reads.
 */

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "logo.png");

// Transparent margin around the glyph, as a fraction of the icon canvas.
// Favicons that touch the edge of the frame look cramped in a browser tab.
const PADDING_RATIO = 0.06;

// Sizes written into the .ico container.
const ICO_SIZES = [16, 32, 48, 256];

// The source artwork is only ~370px of actual glyph, so every output below is
// a downscale - nothing is ever upscaled and therefore nothing goes blurry.
const WORK_SIZE = 368;

// Below this size the thin speed lines average out to semi-transparent pixels
// and the mark reads as a faded blob, so the alpha channel gets a contrast
// boost. The 256px master keeps its smooth antialiased edges.
const ALPHA_BOOST_MAX_SIZE = 48;
const ALPHA_BOOST_LO = 0.18; // alpha at or below this -> fully transparent
const ALPHA_BOOST_HI = 0.45; // alpha at or above this -> fully opaque

function assertTransparent(png) {
  if (!png.hasAlpha) {
    throw new Error(
      `${path.relative(ROOT, SOURCE)} has no alpha channel - the logo must sit ` +
        "on a transparent background, regenerate it from the source artwork first."
    );
  }
}

/** Bounding box of every pixel with a non-zero alpha channel. */
function alphaBoundingBox(buf) {
  return (async () => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * channels + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new Error("source logo is completely transparent");
    return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, canvasWidth: width, canvasHeight: height };
  })();
}

/** Push semi-transparent edge pixels toward fully opaque/transparent. */
async function boostAlpha(buf, lo, hi) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    const a = data[idx + 3] / 255;
    data[idx + 3] = a <= lo ? 0 : a >= hi ? 255 : Math.round(((a - lo) / (hi - lo)) * 255);
  }
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Cut the logo down to one square icon of `size` px: trim to the glyph, scale
 * it to fit inside (1 - 2*PADDING_RATIO) of the canvas, centre it, and leave
 * everything else at alpha 0.
 */
async function renderSquare(glyph, size) {
  const inner = Math.round(size * (1 - 2 * PADDING_RATIO));
  // fit: inside keeps the glyph's own aspect ratio - no stretching.
  const scaled = await sharp(glyph)
    .resize(inner, inner, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(scaled).metadata();
  const left = Math.round((size - meta.width) / 2);
  const top = Math.round((size - meta.height) / 2);

  const out = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, left, top, blend: "over" }])
    .png()
    .toBuffer();

  return size <= ALPHA_BOOST_MAX_SIZE ? boostAlpha(out, ALPHA_BOOST_LO, ALPHA_BOOST_HI) : out;
}

/** Assemble a multi-size .ico from PNG-encoded 32-bit entries. */
function buildIco(entries) {
  // ICONDIR (6) + one ICONDIRENTRY (16) per image, then the image blobs.
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = header.length;
  entries.forEach((e, i) => {
    const dir = 6 + i * 16;
    header[dir] = e.width >= 256 ? 0 : e.width; // 0 means 256 in the ICO format
    header[dir + 1] = e.height >= 256 ? 0 : e.height;
    header[dir + 2] = 0; // colour palette count (0 = >8-bit)
    header[dir + 3] = 0; // reserved
    header.writeUInt16LE(1, dir + 4); // colour planes
    header.writeUInt16LE(32, dir + 6); // bits per pixel, i.e. RGBA
    header.writeUInt32LE(e.data.length, dir + 8);
    header.writeUInt32LE(offset, dir + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, ...entries.map((e) => e.data)]);
}

/** Report whether a file really carries encoded alpha, and what its corners are. */
async function reportAlpha(file) {
  // This sharp build cannot decode the .ico container itself; callers verify
  // an .ico by decoding its individually extracted PNG entries instead.
  if (path.extname(file).toLowerCase() === ".ico") {
    return `${path.relative(ROOT, file)}: container verified size-by-size below`;
  }
  const meta = await sharp(file).metadata();
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let transparent = 0, opaque = 0, partial = 0;
  for (let i = 0; i < width * height; i++) {
    const a = data[i * channels + 3];
    if (a === 0) transparent++;
    else if (a === 255) opaque++;
    else partial++;
  }
  const total = width * height;
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
  const corner = (x, y) => {
    const idx = (y * width + x) * channels;
    return `rgba(${data[idx]},${data[idx + 1]},${data[idx + 2]},${data[idx + 3]})`;
  };
  const corners = [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)];
  return (
    `${path.relative(ROOT, file)}: ${meta.width}x${meta.height} hasAlpha=${meta.hasAlpha} | ` +
    `transparent=${pct(transparent)} opaque=${pct(opaque)} partial=${pct(partial)} | ` +
    `corners=[${corners.join(" ")}]`
  );
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`missing source logo: ${SOURCE}`);
  const sourceMeta = await sharp(SOURCE).metadata();
  assertTransparent(sourceMeta);

  const box = await alphaBoundingBox(SOURCE);
  const glyph = await sharp(SOURCE).extract(box).png().toBuffer();
  const glyphResized = await sharp(glyph)
    .resize(WORK_SIZE, WORK_SIZE, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const glyphBox = await alphaBoundingBox(glyphResized);

  console.log(
    `source ${path.relative(ROOT, SOURCE)} ${sourceMeta.width}x${sourceMeta.height}, ` +
      `glyph ${box.width}x${box.height} -> working ${glyphBox.canvasWidth}x${glyphBox.canvasHeight}`
  );

  const outputs = [];

  // --- favicon.ico -------------------------------------------------------
  const icoEntries = [];
  for (const size of ICO_SIZES) {
    const png = await renderSquare(glyphResized, size);
    icoEntries.push({ width: size, height: size, data: png });
  }
  const icoPath = path.join(ROOT, "src", "app", "favicon.ico");
  await fs.promises.writeFile(icoPath, buildIco(icoEntries));
  outputs.push(icoPath);

  // --- standalone PNG sizes ---------------------------------------------
  const pngTargets = [
    [path.join(ROOT, "src", "app", "icon.png"), 256],
    [path.join(ROOT, "src", "app", "apple-icon.png"), 180],
  ];
  for (const [file, size] of pngTargets) {
    await fs.promises.writeFile(file, await renderSquare(glyphResized, size));
    outputs.push(file);
  }

  // --- verification ------------------------------------------------------
  console.log("\nalpha verification (re-read from disk):");
  for (const f of outputs) console.log("  " + (await reportAlpha(f)));

  // Each ICO entry is re-decoded individually - a solid background can otherwise
  // hide in one size while the others look fine.
  const tmpIco = path.join(ROOT, ".vercel-tmp", "ico_verify");
  fs.mkdirSync(tmpIco, { recursive: true });
  const icoBuf = await fs.promises.readFile(icoPath);
  const count = icoBuf.readUInt16LE(4);
  console.log(`\nfavicon.ico contains ${count} sizes:`);
  for (let i = 0; i < count; i++) {
    const dir = 6 + i * 16;
    const w = icoBuf[dir] === 0 ? 256 : icoBuf[dir];
    const size = icoBuf.readUInt32LE(dir + 8);
    const off = icoBuf.readUInt32LE(dir + 12);
    const isPng = icoBuf.readUInt32BE(off) === 0x89504e47;
    const f = path.join(tmpIco, `ico_${w}x${w}.png`);
    await fs.promises.writeFile(f, icoBuf.subarray(off, off + size));
    console.log(
      `  ${w}x${w} encoding=${isPng ? "PNG" : "BMP"} bitDepth=${icoBuf.readUInt16LE(dir + 6)} | ` +
        (await reportAlpha(f))
    );
  }

  console.log("\nOK - regenerated from a single transparent logo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
