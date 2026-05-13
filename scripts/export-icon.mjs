import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const yellow = [248, 195, 66, 255];
const navy = [7, 18, 31, 255];
const blue = [0, 82, 255, 255];
const white = [255, 255, 255, 255];
const transparent = [0, 0, 0, 0];

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data = Buffer.alloc(0)) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));

  return Buffer.concat([length, typeBuffer, data, crc]);
};

const encodePng = (width, height, pixels) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0;
    pixels.copy(raw, y * rowLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND"),
  ]);
};

const blend = (base, color, alpha) => {
  const srcAlpha = (color[3] / 255) * alpha;
  const dstAlpha = base[3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (outAlpha <= 0) {
    return transparent;
  }

  return [
    Math.round((color[0] * srcAlpha + base[0] * dstAlpha * (1 - srcAlpha)) / outAlpha),
    Math.round((color[1] * srcAlpha + base[1] * dstAlpha * (1 - srcAlpha)) / outAlpha),
    Math.round((color[2] * srcAlpha + base[2] * dstAlpha * (1 - srcAlpha)) / outAlpha),
    Math.round(outAlpha * 255),
  ];
};

const roundedRect = (x, y, rectX, rectY, rectW, rectH, radius) => {
  const px = Math.max(rectX + radius, Math.min(x, rectX + rectW - radius));
  const py = Math.max(rectY + radius, Math.min(y, rectY + rectH - radius));

  return (x - px) ** 2 + (y - py) ** 2 <= radius ** 2;
};

const rotatedRoundedRect = (x, y, rectX, rectY, rectW, rectH, radius, degrees, centerX, centerY) => {
  const angle = (-degrees * Math.PI) / 180;
  const dx = x - centerX;
  const dy = y - centerY;
  const rx = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);

  return roundedRect(rx, ry, rectX, rectY, rectW, rectH, radius);
};

const polygon = (x, y, points) => {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const regularHex = (cx, cy, radius) =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * (Math.PI / 180);

    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });

const circle = (x, y, cx, cy, radius) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;

const renderIcon = ({ size, background }) => {
  const samples = size >= 180 ? 3 : 4;
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const sx = (value) => value * scale;
  const shapes = [
    {
      color: yellow,
      test: (x, y) => rotatedRoundedRect(x, y, sx(96), sx(84), sx(320), sx(344), sx(82), 6, sx(256), sx(256)),
    },
    { color: navy, test: (x, y) => roundedRect(x, y, sx(126), sx(126), sx(260), sx(260), sx(72)) },
    { color: white, test: (x, y) => roundedRect(x, y, sx(146), sx(146), sx(220), sx(220), sx(56)) },
    { color: navy, test: (x, y) => polygon(x, y, regularHex(sx(256), sx(256), sx(94))) },
    { color: yellow, test: (x, y) => polygon(x, y, regularHex(sx(256), sx(256), sx(66))) },
    { color: navy, test: (x, y) => circle(x, y, sx(220), sx(257), sx(17)) },
    { color: navy, test: (x, y) => circle(x, y, sx(292), sx(257), sx(17)) },
    { color: blue, test: (x, y) => roundedRect(x, y, sx(214), sx(310), sx(84), sx(18), sx(9)) },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = background ? [...background] : [...transparent];

      for (const shape of shapes) {
        let hits = 0;

        for (let sy = 0; sy < samples; sy += 1) {
          for (let sxIndex = 0; sxIndex < samples; sxIndex += 1) {
            const sampleX = x + (sxIndex + 0.5) / samples;
            const sampleY = y + (sy + 0.5) / samples;

            if (shape.test(sampleX, sampleY)) {
              hits += 1;
            }
          }
        }

        if (hits > 0) {
          color = blend(color, shape.color, hits / (samples * samples));
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }

  return encodePng(size, size, pixels);
};

const encodeIco = (entries) => {
  const header = Buffer.alloc(6);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  entries.forEach(({ size, png }, index) => {
    const entryOffset = index * 16;

    directory[entryOffset] = size >= 256 ? 0 : size;
    directory[entryOffset + 1] = size >= 256 ? 0 : size;
    directory[entryOffset + 2] = 0;
    directory[entryOffset + 3] = 0;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(png.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
};

const writeAsset = async (path, bytes) => {
  const output = resolve(root, path);

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
};

const brandPng = renderIcon({ size: 512 });
const appIconPng = renderIcon({ size: 512, background: navy });
const appleIconPng = renderIcon({ size: 180, background: navy });
const faviconEntries = [16, 32, 48].map((size) => ({
  size,
  png: renderIcon({ size, background: navy }),
}));

await writeAsset("public/brand/beesweeper-icon.png", brandPng);
await writeAsset("app/icon.png", appIconPng);
await writeAsset("app/apple-icon.png", appleIconPng);
await writeAsset("app/favicon.ico", encodeIco(faviconEntries));

console.log("Exported BeeSweeper brand icons.");
