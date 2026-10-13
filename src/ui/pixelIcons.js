// Hand-drawn 12x12 pixel icons for the HUD (ASCII art + palette).
const PAL = {
  '.': null, K: '#17130e', W: '#f3ead2', R: '#e04a3a', r: '#a02a20', P: '#ff8a8a', Y: '#f2b630', y: '#c0861c', O: '#ff9a40',
  B: '#5ab0e0', b: '#2a70a8', G: '#7bc86c', g: '#3e8a38', N: '#8a5a30', n: '#5a3a1a', C: '#d8cdb2', S: '#a8adb4', s: '#6a6e74',
  V: '#b07ad8', T: '#40d0c0', E: '#ffe0a0',
};
const ART = {
  heart: [
    '..KK..KK....', '.KRRK KRRK..'.replace(' ', 'K'), 'KRPRRKRRRRK.', 'KRPRRRRRRRK.', 'KRRRRRRRRRK.', '.KRRRRRRRK..', '..KRRRRRK...', '...KRRRK....', '....KRK.....', '.....K......', '............', '............',
  ],
  food: [
    '......KKK...', '.....KWWWK..', '....KWWKWK..', '...KNNKKK...', '..KNOONK....', '.KNOOOONK...', 'KNOOOOONK...', 'KNOOOONNK...', 'KNNOONNK....', '.KNNNNK.....', '..KKKK......', '............',
  ],
  water: [
    '.....K......', '....KBK.....', '....KBK.....', '...KBBBK....', '..KBWBBBK...', '..KBWBBBK...', '.KBWBBBBBK..', '.KBBBBBBBK..', '.KBBBBBBbK..', '..KbBBBbK...', '...KKKKK....', '............',
  ],
  bolt: [
    '......KKK...', '.....KYYK...', '....KYYK....', '...KYYK.....', '..KYYYYYK...', '.KKKKYYK....', '....KYK.....', '...KYK......', '..KYK.......', '..KK........', '............', '............',
  ],
  temp: [
    '....KKK.....', '...KWWWK....', '...KWRWK....', '...KWRWK....', '...KWRWK....', '...KWRWK....', '..KWRRRWK...', '.KWRRRRRWK..', '.KWRRRRRWK..', '..KWRRRWK...', '...KKKKK....', '............',
  ],
  zzz: [
    '............', '.KKKKK......', '.KWWWK......', '..KWK.......', '.KWWWKKKK...', '.KKKKKWWK...', '.....KWK....', '....KWWKK...', '....KKKKK...', '............', '............', '............',
  ],
  van: [
    '............', '..KKKKKKK...', '.KCCCCCCCK..', 'KCBBKCCBBCK.', 'KCBBKCCBBCK.', 'KCCCCCCCCCKK', 'KYYYYYYYYYYK', 'KCCCCCCCCCCK', 'KKsKKKKKsKKK', '.KSK...KSK..', '..K.....K...', '............',
  ],
  friend: [
    '....KKKK....', '...KOOOOK...', '..KOOOOOOK..', '..KOKOOKOK..', '..KOOROOOK..', '...KOOOOK...', '..KKBBBBKK..', '.KBBBBBBBBK.', '.KBBBBBBBBK.', '..KKKKKKKK..', '............', '............',
  ],
  dino: [
    '.......KKK..', '......KGGGK.', '......KGKGK.', '.....KGGGGK.', '....KGGGKK..', 'KK.KGGGGK...', 'KGKGGGGGK...', '.KGGGGGGK...', '..KGGKGGK...', '..KGK.KGK...', '..KK..KK....', '............',
  ],
  pin: [
    '...KKKK.....', '..KRRRRK....', '.KRRWWRRK...', '.KRRWWRRK...', '.KRRRRRRK...', '..KRRRRK....', '...KRRK.....', '....KK......', '....KK......', '............', '............', '............',
  ],
  star: [
    '.....K......', '....KYK.....', '....KYK.....', 'KKKKYYYKKKK.', '.KYYYYYYYK..', '..KYYYYYK...', '..KYYKYYK...', '.KYYK.KYYK..', '.KK.....KK..', '............', '............', '............',
  ],
  poi: [
    '............', '.....KK.....', '....KWWK....', '...KWYYWK...', '..KWYYYYWK..', '...KWYYWK...', '....KWWK....', '.....KK.....', '............', '............', '............', '............',
  ],
  nest: [
    '............', '....KKKK....', '...KWWWWK...', '..KWWWWWWK..', '..KWWWWWWK..', '.KNKWWWWKNK.', 'KNNNKKKKNNNK', 'KnNNNNNNNNnK', '.KnnnnnnnnK.', '..KKKKKKKK..', '............', '............',
  ],
  skull: [
    '...KKKKK....', '..KWWWWWK...', '.KWWWWWWWK..', '.KWKKWKKWK..', '.KWKKWKKWK..', '.KWWWKWWWK..', '..KWWWWWK...', '..KWKWKWK...', '...KKKKK....', '............', '............', '............',
  ],
  wifi: [
    '............', '..KKKKKKK...', '.KTTTTTTTK..', 'KTKKKKKKKTK.', '.KTTTTTTTK..', '..KKKKKKK...', '...KTTTK....', '....KKK.....', '....KTK.....', '.....K......', '............', '............',
  ],
};

const cache = new Map();
export function iconCanvas(name, scale = 1) {
  const key = name + scale;
  if (cache.has(key)) return cache.get(key).cloneNode ? cloneCanvas(cache.get(key)) : null;
  const art = ART[name] ?? ART.poi;
  const c = document.createElement('canvas');
  c.width = 12 * scale; c.height = 12 * scale;
  const x = c.getContext('2d');
  art.forEach((row, j) => [...row.padEnd(12, '.')].slice(0, 12).forEach((ch, i) => { const col = PAL[ch]; if (col) { x.fillStyle = col; x.fillRect(i * scale, j * scale, scale, scale); } }));
  cache.set(key, c);
  return cloneCanvas(c);
}
function cloneCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); d.className = 'icon'; return d; }
export function iconURL(name, scale = 2) { const c = iconCanvas(name, scale); return c.toDataURL(); }
export const ICON_NAMES = Object.keys(ART);
