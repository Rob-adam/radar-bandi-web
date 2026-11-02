import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../integration/site/stripe-checkout-existing-sheet-test.js',import.meta.url),'utf8');
test('il checkout riutilizza la scheda #scheda ed il riepilogo esistenti',()=>{
 assert.match(script,/form#scheda/);
 assert.match(script,/getElementById\('riepilogo'\)/);
 assert.match(script,/summary\.append\(box\)/);
});
test('non raccoglie una seconda scheda né dati di nuovi campi',()=>{
 assert.match(script,/new FormData\(form\)/);
 assert.doesNotMatch(script,/createElement\('input'\)/);
});
test('resta disabilitato fuori dall’ambiente di collaudo',()=>{
 assert.match(script,/cfg\.enabled!==true\|\|location\.origin!==cfg\.origin/);
});
test('checkout richiede consensi e stesso dominio',()=>{
 assert.match(script,/sheet\.privacy!=='Sì'/);
 assert.match(script,/credentials:'same-origin'/);
 assert.match(script,/url\.hostname!=='checkout\.stripe\.com'/);
});
