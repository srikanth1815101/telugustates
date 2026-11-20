/* Read stored/deflated assets directly from the signed APK. No test web server. */
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=function apkMount(file){
const buf=fs.readFileSync(file);const end=buf.lastIndexOf(Buffer.from([0x50,0x4b,5,6]));assert(end>0);
const dir=new Map();let n=buf.readUInt32LE(end+16), count=buf.readUInt16LE(end+10);
for(let i=0;i<count;i++){
 assert.equal(buf.readUInt32LE(n),0x02014b50);const method=buf.readUInt16LE(n+10),len=buf.readUInt32LE(n+20),nl=buf.readUInt16LE(n+28),xl=buf.readUInt16LE(n+30),cl=buf.readUInt16LE(n+32),at=buf.readUInt32LE(n+42),name=buf.toString('utf8',n+46,n+46+nl);const p=at+30+buf.readUInt16LE(at+26)+buf.readUInt16LE(at+28);if(name.startsWith('assets/')){assert([0,8].includes(method));const data=buf.subarray(p,p+len);dir.set(name,method===8?require('node:zlib').inflateRawSync(data):data);}n+=46+nl+xl+cl;
}
const host='https://appassets.androidplatform.net',hub=host+'/_field/index.html';
const remote=[],miss=[],serv=new Set();let workers=0;
function mount(route){
 const u=new URL(route.request().url());if(u.origin!==host){remote.push(u.href);return route.abort()};
 let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
 const k=p.startsWith('/_field/')?'assets/console/'+p.slice(8):'assets/atlas'+p, b=dir.get(k);
 if(!b){if(p==='/favicon.ico') return route.fulfill({status:404,body:''});miss.push(p);return route.fulfill({status:404,body:'Not found'});}
 serv.add(p);if(p.endsWith('/placement-worker.js'))workers++;
 const mime={js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webp:'image/webp',woff2:'font/woff2',md:'text/plain',ogg:'audio/ogg'}[p.split('.').pop()]||'application/octet-stream';
 return route.fulfill({status:200,contentType:mime,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'},body:b});
}
return {host,hub,mount,remote,miss,serv,get workers(){return workers;}};
};
