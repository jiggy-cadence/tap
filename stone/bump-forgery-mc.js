const B=require('./bump.js');const {scheduleFromNonce,matchSchedule}=B;
const N=+process.argv[2]||20000;
// Strategies a blind attacker might use (does NOT know the nonce)
const strat={
 'other-nonce (6 bumps)':()=>scheduleFromNonce((Math.random()*2**32)>>>0),
 'other-nonce +2 extras (8)':()=>{const s=scheduleFromNonce((Math.random()*2**32)>>>0);return [...s,s[5]+225,s[5]+450].sort((a,b)=>a-b)},
 'metronome 450ms (8)':()=>Array.from({length:8},(_,i)=>i*450),
 'dense comb 30ms x8? (8, spread)':()=>Array.from({length:8},(_,i)=>i*300),
};
for(const tol of [20,30,40]){
 for(const [name,f] of Object.entries(strat)){let pass=0;
  for(let i=0;i<N;i++){const nonce=(Math.random()*2**32)>>>0;const sched=scheduleFromNonce(nonce);const r=matchSchedule(f(),sched,{toleranceMs:tol});if(r.ok)pass++;}
  const p=pass/N;console.log(`tol=${tol}ms  ${name.padEnd(30)} pass=${pass}/${N} p=${p.toExponential(2)}  bits=${p?(-Math.log2(p)).toFixed(1):'>'+Math.log2(N).toFixed(1)}`);}
}
