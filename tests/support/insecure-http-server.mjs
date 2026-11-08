import http from 'node:http';
import {networkInterfaces} from 'node:os';

// A non-loopback HTTP origin exercises the browser's actual insecure-context
// rules. Proxy the existing preview server bytes without Playwright routes,
// whose pending callbacks can outlive a reload or context teardown.
export async function startInsecureHTTP(baseURL){
 const upstream=new URL(baseURL);
 if(upstream.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(upstream.hostname))throw Error('The insecure test server requires a local HTTP preview');
 const address=Object.values(networkInterfaces()).flat().find(n=>n?.family==='IPv4'&&!n.internal)?.address;
 if(!address)throw Error('No non-loopback IPv4 interface for the insecure HTTP test');
 const pending=new Set();
 const server=http.createServer((request,response)=>{
  const target=new URL(request.url,upstream);
  if(target.origin!==upstream.origin){response.writeHead(400);response.end();return;}
  const forward=http.request(target,{method:request.method,headers:{...request.headers,host:upstream.host}},incoming=>{
   response.writeHead(incoming.statusCode,incoming.headers);incoming.on('error',()=>response.destroy());incoming.pipe(response);
  });
  pending.add(forward);forward.on('close',()=>pending.delete(forward));
  forward.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end();});
  response.on('close',()=>forward.destroy());request.on('error',()=>forward.destroy());request.pipe(forward);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,address,resolve);});
 return {origin:`http://${address}:${server.address().port}`,close:async()=>{
  for(const request of pending)request.destroy();
  const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  server.closeAllConnections();await closed;
 }};
}
