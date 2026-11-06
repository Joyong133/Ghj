// 안드로이드 앱과 같은 페이지 스크립트(스르륵·고정·분량)를 web/ 폴더로 복사합니다.
// 원본은 arena-android/app/src/main/assets/ 에 있고, 두 앱이 같은 파일을 씁니다.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', '..', 'arena-android', 'app', 'src', 'main', 'assets');
const to = path.join(__dirname, '..', 'web');
fs.mkdirSync(to, { recursive: true });
for (const name of ['srr.js', 'lock.js', 'length.js']) {
  fs.copyFileSync(path.join(from, name), path.join(to, name));
  console.log('copied', name);
}
