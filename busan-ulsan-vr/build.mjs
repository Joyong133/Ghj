// 부산·울산 VR build: src/*.js 파일을 이름 순서대로 이어 붙여 template.html에 넣고
// 브라우저에서 바로 열 수 있는 index.html 한 파일을 만든다.
// 해운대 아파트(apartment/)의 코드·화면·스타일도 함께 넣는다:
//   - 코드는 함수 하나로 감싸 이름이 겹치지 않게 하고(const Apt = ...), 09_main.js 앞에 둔다
//   - 화면 요소의 id는 apt- 를 붙이고, CSS 선택자는 #apt-ui 안으로 한정한다
//   node build.mjs                 -> index.html
//   node build.mjs --fragment out  -> doctype/head/body 없는 조각(아티팩트용)도 함께 출력
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const aptSrc = join(root, 'apartment', 'src');
const template = readFileSync(join(src, 'template.html'), 'utf8');

// ---------------- 아파트 코드: import 줄은 빼고(바깥에서 같은 것을 가져온다) 함수로 감싼다
const aptJs = readdirSync(aptSrc).filter((f) => f.endsWith('.js')).sort()
  .map((f) => `// ----- apartment/${f} -----\n` + readFileSync(join(aptSrc, f), 'utf8').replace(/^import .*$/gm, ''))
  .join('\n');
const aptBundle = `// ===== apartment (해운대 아파트) =====\nconst Apt = ((APT_HOST) => {\n${aptJs}\nreturn APT_API;\n})(AptBridge);\n`;

const files = readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const js = files.map((f) => (f === '09_main.js' ? aptBundle : '') + `// ===== ${f} =====\n` + readFileSync(join(src, f), 'utf8')).join('\n');

// ---------------- 아파트 화면과 스타일
const aptTpl = readFileSync(join(aptSrc, 'template.html'), 'utf8');
const aptCss = aptTpl.match(/<style>([\s\S]*?)<\/style>/)[1];
const aptBody = aptTpl.split('<!--BODY-->')[1];
const pick = (re) => { const m = aptBody.match(re); if (!m) throw new Error('apartment template: ' + re); return m[0]; };
// 시작 화면·로딩·캔버스는 빼고 화면 위 UI(hud), 도움말, 깜박임만 쓴다
const hudHtml = aptBody.slice(aptBody.indexOf('<div id="hud"'), aptBody.indexOf('<div id="title"'));
const aptHtml = [hudHtml, pick(/<div id="help"[\s\S]*?<\/table>[\s\S]*?<\/div><\/div><\/div>/), pick(/<div id="flash"><\/div>/)].join('\n')
  .replace(/\bid="([\w-]+)"/g, 'id="apt-$1"');
const aptUi = `<div id="apt-ui" hidden>\n${aptHtml}\n</div>`;

// CSS 한정: 맨 위 규칙과 @media 안 규칙의 선택자 앞에 #apt-ui 를 붙이고 #id 는 #apt-id 로
function scopeSelector(sel) {
  sel = sel.trim();
  if (sel === ':root') return '#apt-ui';
  if (/^(html|body)$/.test(sel)) return null;
  if (sel === '*') return '#apt-ui *';
  const s = sel.replace(/#([A-Za-z][\w-]*)/g, '#apt-$1');
  return '#apt-ui ' + s;
}
function scopeCss(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const head = css.slice(i, open).trim();
    // 블록 끝 찾기 (중괄호 짝)
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    const headClean = head.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (headClean.startsWith('@media')) out += `${headClean} {\n${scopeCss(body)}}\n`;
    else if (headClean.startsWith('@keyframes')) out += `${headClean.replace(/@keyframes\s+(\S+)/, '@keyframes apt-$1')} {${body}}\n`;
    else {
      const sels = headClean.split(',').map(scopeSelector).filter(Boolean);
      if (sels.length) out += `${sels.join(', ')} {${body.replace(/animation:\s*(\w+)/g, 'animation: apt-$1')}}\n`;
    }
    i = j;
  }
  return out;
}
const aptStyle = `<style id="apt-style">\n#apt-ui { position: fixed; inset: 0; pointer-events: none; z-index: 20; font-family: var(--sans); color: var(--ink); }\n#apt-ui #apt-help { pointer-events: auto; }\n${scopeCss(aptCss)}</style>`;

const [head, body] = template.split('<!--BODY-->');
const bodyWithJs = body.replace('<!--APT-UI-->', () => aptUi).replace('/*__GAME__*/', () => js);
const headClean = head.replace('<!--HEAD-->', '').replace('<!--APT-STYLE-->', () => aptStyle).trim();

const full = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${headClean}
</head>
<body>
${bodyWithJs.trim()}
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), full);
console.log(`index.html ${(full.length / 1024).toFixed(1)} KB`);

const i = process.argv.indexOf('--fragment');
if (i > 0 && process.argv[i + 1]) {
  writeFileSync(process.argv[i + 1], headClean + '\n' + bodyWithJs.trim() + '\n');
  console.log(`fragment -> ${process.argv[i + 1]}`);
}
