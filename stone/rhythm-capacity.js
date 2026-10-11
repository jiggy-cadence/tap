// Capacity geometry of the bump rhythm. Each gap is a point in [gmin, gmax]; the detector's tolerance tau
// makes each accepted gap a cell of width ~2*tau, so a gap carries ~log2((gmax-gmin)/(2tau)+1) bits and a
// k-kick schedule is a point in a (k-1)-dimensional box tiled by cubes of side 2tau (a lattice packing).
// Ritual time = sum of gaps ≈ (k-1)*(gmin+gmax)/2. Question: which (gmin, gmax) maximises bits per SECOND?
const bitsPerGap=(gmin,gmax,tau)=>Math.log2((gmax-gmin)/(2*tau)+1);
for (const tau of [20,30,40]) {
  let best=null;
  for (let gmin=60; gmin<=400; gmin+=10) for (let gmax=gmin+20; gmax<=1200; gmax+=10) {
    const bps=bitsPerGap(gmin,gmax,tau)/((gmin+gmax)/2/1000);
    if(!best||bps>best.bps) best={gmin,gmax,bps};
  }
  const cur=bitsPerGap(200,700,tau)/0.45;
  console.log(`tau=${tau}ms  current 200–700: ${cur.toFixed(2)} bit/s  |  optimum gmin=${best.gmin} gmax=${best.gmax}: ${best.bps.toFixed(2)} bit/s  (×${(best.bps/cur).toFixed(2)})`);
}
// the floor that physics sets: refractoryMs=120 in bump.js (two kicks closer than 120 ms merge), kick 40 ms
console.log("constraint: gmin ≥ refractory 120 ms (bump.js) — optimum must respect it");
for (const tau of [20,30,40]) { let best=null; for (let gmax=140; gmax<=1200; gmax+=10){const bps=bitsPerGap(120,gmax,tau)/((120+gmax)/2/1000); if(!best||bps>best.bps)best={gmax,bps};}
  const cur=bitsPerGap(200,700,tau)/0.45; console.log(`tau=${tau}: gmin=120 → best gmax=${best.gmax}: ${best.bps.toFixed(2)} bit/s (×${(best.bps/cur).toFixed(2)} vs current)`); }
