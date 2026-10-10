const {scheduleFromNonce,matchSchedule}=require('./bump.js');const N=40000;
const cfgs=[['current: 6 kicks, 5 must match',{kicks:6,minMatched:5}],['6 kicks, all 6 must match',{kicks:6,minMatched:6}],['8 kicks, 7 must match',{kicks:8,minMatched:7}],['10 kicks, 9 must match',{kicks:10,minMatched:9}]];
for(const tol of [20,30,40])for(const[n,c]of cfgs){const o={...c,toleranceMs:tol};let p=0;
 for(let i=0;i<N;i++){const a=scheduleFromNonce((Math.random()*2**32)>>>0,o),s=scheduleFromNonce((Math.random()*2**32)>>>0,o);if(matchSchedule(a,s,o).ok)p++;}
 const dur=Math.round(scheduleFromNonce(1,o).at(-1)/100)/10;console.log(`tol=${tol} ${n.padEnd(32)} p=${(p/N).toExponential(2)} bits=${p?(-Math.log2(p/N)).toFixed(1):'>'+Math.log2(N).toFixed(1)}  ritual≈${(c.kicks-1)*0.45}s`);}
