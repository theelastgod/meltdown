// Run from the repository root. Exercise the actual probe predicates against CI's
// observed text, their old expectations, and invalid behavior/text.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
function condition(file, name) {
  const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  let found;
  function visit(node) {
    if(ts.isCallExpression(node) && node.expression.getText(tree)==='check' && node.arguments[0]?.text===name) found=node.arguments[1].getText(tree);
    ts.forEachChild(node,visit);
  }
  visit(tree);
  assert.ok(found, name);
  return found;
}
const clockSource=readFileSync('probe/stage5.ts','utf8');
const clock=clockSource.match(/const m = (\/FLIP IN .+\/)\.exec\(said\);/)[1];
const said='NODE B · VANTAGE  CELL ONE PULLING · FLIP IN 1.7S';
assert.equal(runInNewContext(`${clock}.exec(said)?.[1]`,{said}),'1.7');
assert.equal(runInNewContext('/FLIP IN ([0-9.]+)s/.test(said)',{said}),false);
assert.equal(runInNewContext(`${clock}.test(said)`,{said:'FLIP IN 1.7SECONDS'}),false);
console.log('PASS countdown: reads 1.7; old lowercase parser fails; invalid unit rejected');
for(const [name,key,text,old,wrong] of [
  ['shop: a fresh Blank cannot afford a node','poor','NEEDS 400 SCRIP','/Scrip/.test(poor.reason ?? "")','NEEDS 40 SCRIP'],
  ['shop: ring III is gated on Depth (BLACK SWAN needs 30)','deep','NEEDS DEPTH 30','/Depth/.test(deep.reason ?? "")','NEEDS DEPTH 3'],
  ['shop: ownership is permanent — buying a node twice is refused','twice','ALREADY IN YOUR FILE','/already/.test(twice.reason ?? "")','UNKNOWN NODE'],
]) {
  const code=condition('probe/stage7.ts',name);
  assert.equal(runInNewContext(code,{[key]:{ok:false,reason:text}}),true);
  assert.equal(runInNewContext(old,{[key]:{ok:false,reason:text}}),false);
  assert.equal(runInNewContext(code,{[key]:{ok:true,reason:text}}),false);
  assert.equal(runInNewContext(code,{[key]:{ok:false,reason:wrong}}),false);
  console.log(`PASS ${key}: observed refusal accepted; old expectation fails; success and wrong reason rejected`);
}
const touch=condition('probe/stage32.ts','the menu tells a thumb how to use it rather than naming keys a phone has not got, on its footer and on the settings line');
const menuSaid={foot:'TAP A LINE TO CHOOSE · dev',build:'dev',settings:'TAP [−] [+] · APPLIED LIVE · KEPT IN THIS BROWSER',chips:16};
const menuKeys=/ARROW|ENTER|ESC/;
assert.equal(runInNewContext(touch,{menuSaid,menuKeys}),true);
assert.equal(/^tap \[\u2212\] \[\+\]/.test(menuSaid.settings),false);
assert.equal(runInNewContext(touch,{menuSaid:{...menuSaid,chips:0},menuKeys}),false);
assert.equal(runInNewContext(touch,{menuSaid:{...menuSaid,settings:'PRESS ENTER'},menuKeys}),false);
console.log('PASS touch: observed instructions accepted; old expectation fails; missing chips and keyboard instructions rejected');
