// 부산·울산 VR build: src/*.js 파일을 이름 순서대로 이어 붙여 template.html에 넣고
// 브라우저에서 바로 열 수 있는 index.html 한 파일을 만든다.
//   node build.mjs                 -> index.html
//   node build.mjs --fragment out  -> doctype/head/body 없는 조각(아티팩트용)도 함께 출력
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const template = readFileSync(join(src, 'template.html'), 'utf8');
const js = readdirSync(src)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => `// ===== ${f} =====\n` + readFileSync(join(src, f), 'utf8'))
  .join('\n');

const [head, body] = template.split('<!--BODY-->');
const bodyWithJs = body.replace('/*__GAME__*/', () => js);
const headClean = head.replace('<!--HEAD-->', '').trim();

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
