import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';import fs from 'node:fs';
// Persistent browser instances run outside Playwright Test's context hooks.
// This exercises normal OPFS disk storage rather than Chromium's incognito quota.
test('real HTTPS WebDAV large upload, readback and restore preserve every photo',async({browserName,baseURL},info)=>{
 test.skip(info.project.name==='mobile','Chromium storage is covered by the desktop persistent run; mobile UI has separate pointer tests.');test.setTimeout(35*60000);const output=info.outputPath('large');
 const log=execFileSync(process.execPath,['tests/support/large-backup-runner.mjs',browserName,baseURL!,output,info.project.use.channel||'chromium'],{encoding:'utf8',maxBuffer:4*1024**2,timeout:34*60000});
 console.log(log);const report=JSON.parse(fs.readFileSync(output+'/large-report.json','utf8'));expect(report.records.count).toBe(report.fixture.count);
});
