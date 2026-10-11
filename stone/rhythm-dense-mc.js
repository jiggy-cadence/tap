const {scheduleFromNonce,matchSchedule}=require('./bump.js');const N=30000;
const cfgs=[['current 6 kicks 200–700',{kicks:6,minGapMs:200,maxGapMs:700,minMatched:5}],
 ['dense 9 kicks 150–420',{kicks:9,minGapMs:150,maxGapMs:420,minMatched:8}],
 ['dense 10 kicks 130–380',{kicks:10,minGapMs:130,maxGapMs:380,minMatched:9}]];
for(const tol of [20,30,40]) for(const [n,c] of cfgs){const o={...c,toleranceMs:tol};let p=0,honest=0;
 for(let i=0;i<N;i++){const s=scheduleFromNonce((Math.random()*2**32)>>>0,o);if(matchSchedule(scheduleFromNonce((Math.random()*2**32)>>>0,o),s,o).ok)p++;
   if(i<2000){const jit=s.map(t=>t+(Math.random()*2-1)*tol*0.6);if(matchSchedule(jit,s,o).ok)honest++;}}
 const dur=(scheduleFromNonce(7,o).at(-1)/1000).toFixed(2);
 console.log(`tol=${tol} ${n.padEnd(26)} ritual≈${dur}s  forge p=${(p/N).toExponential(2)} (${p?(-Math.log2(p/N)).toFixed(1):'>'+Math.log2(N).toFixed(1)} bits)  honest-with-jitter pass=${(honest/2000*100).toFixed(1)}%`);}
