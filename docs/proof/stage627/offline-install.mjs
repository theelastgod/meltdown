import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const worker = readFileSync('dist/sw.js', 'utf8');
const assets = JSON.parse(worker.match(/const ART = (\[[^;]*\]);/)[1]);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5297', '--strictPort'], { stdio: ['ignore','pipe','pipe'] });
await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('preview timeout')),120000);server.stdout.on('data',d=>{if(String(d).includes('5297')){clearTimeout(timer);resolve();}});server.on('exit',c=>reject(new Error('preview exit '+c))); });
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
  for (const [index, mutation] of [false,true,false].entries()) {
    writeFileSync('dist/sw.js', mutation ? worker.replace(/const ART = \[[^;]*\];/, 'const ART = [];') : worker);
    const context=await browser.newContext();
    const page=await context.newPage();
    // A static same-origin page isolates installation from game and backend startup.
    await page.goto('http://127.0.0.1:5297/manifest.webmanifest');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
    const result=await page.evaluate(async assets=>{const cache=await caches.open('meltdown-runtime-v1'); const hits=await Promise.all(assets.map(a=>cache.match(a,{ignoreVary:true})));return {cached:hits.filter(Boolean).length,total:assets.length};},assets);
    console.log(JSON.stringify({mutation,...result}));
    if(mutation ? result.cached!==0 : result.cached!==result.total) throw new Error('unexpected cache result');
    if(index===2) {
      const failures=[];
      page.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/assets/')) failures.push(r.url());});
      await context.setOffline(true);
      await page.goto('http://127.0.0.1:5297/?headless=1&level=drainage_yard&account=offline&name=OFFLINE&nonav=1', {waitUntil:'load',timeout:120000});
      await page.waitForFunction(()=>window.__game?.ready===true,null,{timeout:120000});
      const ticks=await page.evaluate(()=>{const before=window.__game.state().tick;window.__game.advance(60);return window.__game.state().tick-before;});
      console.log(JSON.stringify({offline:true,ticks,failedAssets:failures.length}));
      if(ticks!==60||failures.length) throw new Error('offline game failed');
    }
    await context.close();
  }
} finally { writeFileSync('dist/sw.js',worker); await browser.close(); server.kill(); }
