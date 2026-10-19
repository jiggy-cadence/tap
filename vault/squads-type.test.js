const m=require('@sqds/multisig'),w=require('@solana/web3.js');const{squads_vault_transfer}=require('./squads');
const ms=w.Keypair.generate().publicKey,agent=w.Keypair.generate(),phone=w.Keypair.generate();
const ct=m.accounts.ConfigTransaction.fromArgs({multisig:ms,creator:agent.publicKey,index:1n,bump:255,actions:[{__kind:'ChangeThreshold',newThreshold:1}]});
const [cfg]=m.generated.configTransactionBeet.serialize({accountDiscriminator:m.generated.configTransactionDiscriminator,...ct});
const fake=(data,owner)=>({getAccountInfo:async()=>({data,owner,lamports:1,executable:false})});
const S={phoneSecretKey:[...phone.secretKey]},pol={multisig:ms.toBase58(),agentPubkey:agent.publicKey.toBase58()},intent={transactionIndex:1,lamports:1000,to:agent.publicKey.toBase58()};
(async()=>{
  let n=0, pass=0;
  for(const[name,c]of[['config tx (threshold→1) at index',fake(cfg,m.PROGRAM_ID)],['vault-tx bytes owned by another program',fake(Buffer.concat([Buffer.from(m.generated.vaultTransactionDiscriminator),Buffer.alloc(200)]),w.SystemProgram.programId)]]){
    n++;
    try{await squads_vault_transfer(intent,S,pol,c);console.log('FAIL SIGNED',name);process.exitCode=1}
    catch(e){const ok=/not a VaultTransaction|not owned by the Squads/.test(e.message);if(!ok)process.exitCode=1;else pass++;console.log((ok?'PASS':'FAIL wrong reason')+' refused |',name,'|',e.message)}
  }
  console.log(pass+'/'+n+' pass');
})();
