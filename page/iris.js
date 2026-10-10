// Iris by Aperture — extracted verbatim from taps.html for reuse by suite.html. IRIS.draw(ctx,W,digestHex,refused,p,t).
(function(root){
function bytes(h){const b=[];for(let i=0;i<64;i+=2)b.push(parseInt(h.slice(i,i+2),16));return b}
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function euclid(k,n){const r=[];for(let i=0;i<n;i++)r.push(((i*k)%n)<k?1:0);return r}
const cache=new Map();
function model(h){if(cache.has(h))return cache.get(h);const B=bytes(h);
 const N=7+B[0]%6,M=N+3+B[2]%5,ROT0=B[1]/256*Math.PI*2,ANG=[];euclid(N,M).forEach((p,i)=>{if(p)ANG.push(i/M*Math.PI*2)});
 const P=[];for(let j=0;j<4;j++){const a=B[4+j*3]/256*Math.PI*2,d=.15+B[5+j*3]/256*.35;P.push({x:Math.cos(a)*d,y:Math.sin(a)*d,q:(B[6+j*3]&1)?1:-1})}
 if(!P.some(p=>p.q>0))P[0].q=1;if(!P.some(p=>p.q<0))P[1].q=-1;
 const F=(x,y)=>{let fx=0,fy=0;for(const p of P){const dx=x-p.x,dy=y-p.y,r2=dx*dx+dy*dy+1e-4,r3=r2*Math.sqrt(r2);fx+=p.q*dx/r3;fy+=p.q*dy/r3}return[fx,fy]};
 const L=[];for(const p of P){if(p.q<0)continue;const K=22;for(let k=0;k<K;k++){const a=k/K*Math.PI*2+B[20]/40;let x=p.x+Math.cos(a)*.02,y=p.y+Math.sin(a)*.02;const pts=[[x,y]];
  for(let s=0;s<420;s++){const[fx,fy]=F(x,y),m=Math.hypot(fx,fy)||1;x+=fx/m*.006;y+=fy/m*.006;pts.push([x,y]);if(Math.hypot(x,y)>1.25)break;if(P.some(q=>q.q<0&&Math.hypot(x-q.x,y-q.y)<.02))break}L.push(pts)}}
 // settling field: basins (attractors) from bytes 24..31, particles relax with swirl
 const A=[];const na=2+B[24]%3;for(let j=0;j<na;j++){const a=B[25+j]/256*Math.PI*2,d=.35+B[28+j%4]/256*.45;A.push({x:Math.cos(a)*d,y:Math.sin(a)*d,s:(B[29]&(1<<j))?1:-1})}
 const R=rng(B[12]<<24|B[13]<<16|B[14]<<8|B[15]);const S=[];
 for(let i=0;i<260;i++){let x=R()*2.4-1.2,y=R()*2.4-1.2;const pts=[[x,y]];for(let s=0;s<70;s++){let bx=0,by=0,bd=9;for(const a of A){const d=Math.hypot(x-a.x,y-a.y);if(d<bd){bd=d;bx=a.x-x;by=a.y-y;var sw=a.s}}
  const k=.045;x+=bx*k-by*k*.9*sw;y+=by*k+bx*k*.9*sw;pts.push([x,y])}S.push(pts)}
 const m={B,N,M,ROT0,ANG,L,S,A};cache.set(h,m);return m}
function poly(ctx,pts,cx,cy,sc,upto){ctx.beginPath();const n=upto==null?pts.length:Math.max(2,Math.floor(pts.length*upto));for(let i=0;i<n;i++){const X=cx+pts[i][0]*sc,Y=cy+pts[i][1]*sc;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y)}ctx.stroke()}
// p: 0..1 animation progress (1 = final deterministic frame)
function draw(ctx,W,h,refused,p=1,t=0){const m=model(h),cx=W/2,cy=W/2,R=W*.40,Sc=W*.5;
 ctx.globalCompositeOperation='source-over';ctx.fillStyle='#050302';ctx.fillRect(0,0,W,W);
 const e=p<1?1-Math.pow(1-p,3):1;
 // settling field layer
 ctx.lineWidth=Math.max(.6,W/1300);ctx.strokeStyle=refused?'rgba(190,80,55,0.17)':'rgba(220,150,60,0.14)';
 for(const s of m.S)poly(ctx,s,cx,cy,Sc,e);
 ctx.fillStyle=refused?'rgba(220,60,40,0.5)':'rgba(240,180,90,0.55)';for(const s of m.S){const q=s[Math.min(s.length-1,Math.floor((s.length-1)*e))];if(!q)continue;ctx.fillRect(cx+q[0]*Sc,cy+q[1]*Sc,W/600,W/600)}
 for(const a of m.A){ctx.strokeStyle='rgba(232,163,61,0.18)';ctx.beginPath();ctx.arc(cx+a.x*Sc,cy+a.y*Sc,W*.012,0,7);ctx.stroke()}
 ctx.lineWidth=Math.max(.5,W/1600);ctx.strokeStyle='rgba(200,140,50,0.07)';for(const L of m.L)poly(ctx,L,cx,cy,Sc);
 // iris
 const open=refused?0:Math.min(1,Math.max(0,(p-.35)/.55));const shut=refused?1:0;
 const r=R*(.035+.62*(refused?(1-Math.min(1,p*1.6))*.25:open*(1-shut)));
 const rot=m.ROT0+(1-open)*1.1+(refused?.12+.03*Math.sin(t*.004):0);
 const V=m.ANG.map(a=>[cx+Math.cos(a+rot)*r,cy+Math.sin(a+rot)*r]);
 ctx.save();ctx.beginPath();V.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.clip();
 const I=refused?.35:1,g=ctx.createRadialGradient(cx,cy,0,cx,cy,R*.75);
 if(refused){g.addColorStop(0,'rgba(255,90,70,.9)');g.addColorStop(1,'rgba(80,5,5,.6)')}else{g.addColorStop(0,`rgba(255,226,160,${I})`);g.addColorStop(.35,`rgba(240,160,60,${.75*I})`);g.addColorStop(1,`rgba(60,25,5,${.6*I})`)}
 ctx.fillStyle=g;ctx.fillRect(0,0,W,W);ctx.globalCompositeOperation='lighter';ctx.lineWidth=W/900;ctx.strokeStyle=`rgba(255,215,140,${.35*I})`;for(const L of m.L)poly(ctx,L,cx,cy,Sc);ctx.restore();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,7);V.slice().reverse().forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();
 const bg=ctx.createRadialGradient(cx,cy,r,cx,cy,R);bg.addColorStop(0,'#17110a');bg.addColorStop(1,'#070503');ctx.fillStyle=bg;ctx.globalAlpha=.94;ctx.fill('evenodd');ctx.globalAlpha=1;ctx.clip('evenodd');
 for(let i=0;i<V.length;i++){const a=V[(i-1+V.length)%V.length],b=V[i];let dx=b[0]-a[0],dy=b[1]-a[1];const mm=Math.hypot(dx,dy)||1;dx/=mm;dy/=mm;const px=b[0]-cx,py=b[1]-cy,bb=px*dx+py*dy,cc=px*px+py*py-R*R,s=-bb+Math.sqrt(Math.max(0,bb*bb-cc));
  const lg=ctx.createLinearGradient(b[0],b[1],b[0]+dx*s,b[1]+dy*s);lg.addColorStop(0,refused?'rgba(170,120,60,.5)':'rgba(255,200,110,.75)');lg.addColorStop(1,'rgba(120,80,30,.04)');ctx.strokeStyle=lg;ctx.lineWidth=W/700;ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(b[0]+dx*s,b[1]+dy*s);ctx.stroke()}
 ctx.restore();
 ctx.strokeStyle='rgba(210,150,70,.35)';ctx.lineWidth=W/500;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.stroke();
 if(refused){ctx.strokeStyle='rgba(220,30,25,.9)';ctx.lineWidth=Math.max(1,W/1100);ctx.beginPath();V.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.stroke();
  ctx.strokeStyle='rgba(200,25,20,.3)';ctx.lineWidth=Math.max(.7,W/1600);ctx.beginPath();ctx.arc(cx,cy,R*1.015,0,7);ctx.stroke()}
 if(refused){const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*.22);rg.addColorStop(0,'rgba(255,60,40,.55)');rg.addColorStop(1,'rgba(255,40,30,0)');ctx.globalCompositeOperation='lighter';ctx.fillStyle=rg;ctx.fillRect(cx-R,cy-R,2*R,2*R);ctx.globalCompositeOperation='source-over'}
 ctx.fillStyle='rgba(200,150,80,.5)';ctx.font=`${Math.round(W/46)}px monospace`;ctx.textAlign='center';ctx.fillText(`E(${m.N},${m.M}) · ${m.A.length} basins · ${h.slice(0,8)}`,cx,W*.965)}
root.IRIS={model,draw,bytes};})(typeof window!=='undefined'?window:globalThis);
