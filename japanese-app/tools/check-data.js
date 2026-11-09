#!/usr/bin/env node
/* 데이터 무결성 검사: node tools/check-data.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');

const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
function load(f) { vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f }); }
vm.runInContext('var window = this.window; var UNITS = window.UNITS = [];', ctx);
['js/conj.js', 'data/kana.js', 'data/units_s2.js', 'data/units_s3.js', 'data/units_s4.js', 'data/units_s5.js', 'data/kanji.js', 'data/stories.js'].forEach(load);
const W = ctx.window;
const UNITS = W.UNITS;
let errors = 0, warns = 0;
function err(m) { errors++; console.log('❌ ' + m); }
function warn(m) { warns++; if (process.argv.includes('-v')) console.log('⚠️  ' + m); }

const POS = new Set(['n', 'v5', 'v1', 'vs', 'vk', 'ai', 'an', 'adv', 'exp', 'pr', 'q', 'ctr', 'num', 'conj', 'par', 'interj', 'suf', 'pre']);
const FURI = /([㐀-鿿豈-﫿々〆ヶ0-9０-９]+)\[([^\]]+)\]/g;
const ids = new Set();
let nW = 0, nS = 0;
UNITS.forEach(u => {
  if (ids.has(u.id)) err('중복 유닛 id ' + u.id); ids.add(u.id);
  if (!u.tip || !u.tip.t || !u.tip.b) err(u.id + ': 가이드(tip) 없음');
  const words = u.w.split('\n').map(s => s.trim()).filter(Boolean);
  const sents = u.s.split('\n').map(s => s.trim()).filter(Boolean);
  nW += words.length; nS += sents.length;
  if (words.length < 10) warn(u.id + ': 단어 ' + words.length + '개');
  if (sents.length < 10) warn(u.id + ': 문장 ' + sents.length + '개');
  const seen = new Set();
  words.forEach(l => {
    const f = l.split('|');
    if (f.length < 3) return err(u.id + ': 단어 형식 오류 → ' + l);
    const [w, r0, m, p] = f; const r = r0 || w;
    if (!m) err(u.id + ': 뜻 없음 → ' + l);
    if (p && !POS.has(p)) err(u.id + ': 품사 오류 ' + p + ' → ' + l);
    if (/[㐀-鿿]/.test(w) && !r0) err(u.id + ': 한자 단어 읽기 없음 → ' + l);
    if (r0 && /[㐀-鿿]/.test(r0)) err(u.id + ': 읽기에 한자 → ' + l);
    if (seen.has(w + r)) warn(u.id + ': 단어 중복 ' + w); seen.add(w + r);
    if (p === 'v1' && !/る$/.test(r)) err(u.id + ': 1단 동사가 る로 안 끝남 → ' + l);
    if (p === 'v5' && !/[うくぐすつぬぶむる]$/.test(r)) err(u.id + ': 5단 동사 어미 오류 → ' + l);
    if (p === 'vs' && !/する$/.test(r)) err(u.id + ': する 동사 오류 → ' + l);
    if (p === 'ai' && !/い$/.test(r)) err(u.id + ': い형용사 오류 → ' + l);
    if (p === 'v1' && /[あうおかがさざただなはばぱまやらわ]る$/.test(r) && !/(ある|いる|できる|くれる)$/.test(r)) warn(u.id + ': 1단 동사 의심(a/u/o단+る) → ' + l);
  });
  sents.forEach(l => {
    const f = l.split('|');
    if (f.length < 2 || !f[1].trim()) return err(u.id + ': 문장 번역 없음 → ' + l);
    const j = f[0];
    const open = (j.match(/\[/g) || []).length, close = (j.match(/\]/g) || []).length;
    if (open !== close) err(u.id + ': 괄호 불일치 → ' + l);
    const stripped = j.replace(FURI, '$1');
    if (/[\[\]]/.test(stripped)) err(u.id + ': 후리가나 형식 오류(한자 아닌 곳에 []) → ' + l);
    j.replace(FURI, (m0, k, rd) => { if (/[㐀-鿿]/.test(rd)) err(u.id + ': 후리가나에 한자 → ' + l); return m0; });
    // 후리가나 누락된 한자
    const noFuri = j.replace(FURI, '');
    if (/[㐀-鿿]/.test(noFuri)) warn(u.id + ': 후리가나 없는 한자 → ' + l);
    if (/\(/.test(f[1])) warn(u.id + ': 번역에 괄호 → ' + l);
    const toks = j.split(/\s+/).filter(Boolean);
    if (toks.length < 1) err(u.id + ': 빈 문장');
  });
});
// 한자
const kj = W.KANJI_DATA.split('\n').map(s => s.trim()).filter(s => s && s[0] !== '#');
const kset = new Set();
kj.forEach(l => {
  const f = l.split('|');
  if (f.length < 6) return err('한자 형식 오류 → ' + l);
  if (kset.has(f[0])) err('한자 중복 ' + f[0]); kset.add(f[0]);
  if (!/^[345]$/.test(f[4])) err('JLPT 레벨 오류 → ' + l);
  if (f[2] && /[ぁ-ゖ]/.test(f[2])) err('음독에 히라가나 → ' + l);
  if (f[3] && /[ァ-ヶ]/.test(f[3])) err('훈독에 가타카나 → ' + l);
  f[5].split(';').forEach(e => { if (!/^.+?\(.+?\)=.+$/.test(e)) err('한자 예시 형식 오류 → ' + e + ' @ ' + f[0]); else if (e.indexOf(f[0]) < 0) err('예시에 해당 한자 없음 → ' + e + ' @ ' + f[0]); });
});
// 스토리
(W.STORIES || []).forEach(s => {
  s.lines.forEach(l => { const f = l.split('|'); if (f.length < 3) err('스토리 ' + s.id + ' 줄 형식 → ' + l); else if (f[0] !== 'N' && !s.c[f[0]]) err('스토리 ' + s.id + ' 화자 없음 → ' + f[0]); });
  (s.q || []).forEach(q => { if (q.a >= q.o.length) err('스토리 ' + s.id + ' 정답 인덱스 오류'); if (q.at > s.lines.length) err('스토리 ' + s.id + ' at 범위 오류'); });
});
console.log(`📊 유닛 ${UNITS.length} (+가나 ${W.KANA.units.length}) · 단어 ${nW} · 문장 ${nS} · 한자 ${kj.length} · 스토리 ${(W.STORIES || []).length}`);
console.log(errors ? `❌ 오류 ${errors}개, 경고 ${warns}개` : `✅ 데이터 검사 통과 (경고 ${warns}개, -v 로 보기)`);
if (errors) process.exit(1);
