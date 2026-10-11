#!/usr/bin/env python3
"""TAP stone bench helper (no keys, no network).
  python3 make_requests.py            -> prints 3 ready-to-paste `ssign <194hex>` lines (devnet, nonzero, valid)
  python3 make_requests.py verify     -> paste the stone's SPUB/SSIG/REFUSED lines, Ctrl-D; each SSIG is checked
                                         with vault/stone-sig.js (Ed25519 + 150-byte layout + counter order)
  python3 make_requests.py --self-test
Request = cluster(1) || vault(32) || sha256(tx msg)(32) || sha256(tapId)(32). Bench values are fake but
deterministic, so the verifier can also check the stone signed exactly what was asked."""
import hashlib, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
def h(s): return hashlib.sha256(s.encode()).digest()
def request(i):
    cluster = 2  # devnet
    return bytes([cluster]) + h('bench-vault') + h('bench-tx-%d' % i) + h('bench-tapid-%d' % i)
def requests(n=3): return [request(i).hex() for i in range(1, n + 1)]
NODE = r'''
const s=require(process.argv[1]); const items=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log(JSON.stringify(items.map(it=>{const sig=Buffer.from(it.sig,'hex'),msg=Buffer.from(it.msg,'hex');
 const pk=msg.subarray(118,150); const ctr=msg.readBigUInt64LE(110);
 let ok=false; try{ok=s.verifyStoneSig(sig,msg,pk);}catch(e){}
 return {ok, prefix: msg.subarray(0,13).equals(Buffer.concat([s.DOMAIN,Buffer.from([s.VERSION])])), ctr:ctr.toString(), pk:pk.toString('hex')};})));
'''
def verify(text):
    reqs = {r[2:]: r for r in requests(10)}  # body after cluster byte, keyed for lookup
    items, spub, out, bad = [], None, [], 0
    for line in text.splitlines():
        p = line.strip().split()
        if len(p) == 2 and p[0] == 'SPUB': spub = p[1].lower()
        if len(p) == 4 and p[0] == 'SSIG':
            if len(p[2]) != 128 or len(p[3]) != 300: out.append('BAD  malformed SSIG line'); bad += 1; continue
            items.append({'ctr': p[1], 'sig': p[2].lower(), 'msg': p[3].lower()})
        if p and p[0] == 'REFUSED': out.append('note ' + line.strip())
    if not items: out.append('no SSIG lines found'); return out, 1
    res = json.loads(subprocess.run(['node', '-e', NODE, os.path.join(REPO, 'vault', 'stone-sig.js')],
                     input=json.dumps(items), capture_output=True, text=True, check=True).stdout)
    last = None
    for it, r in zip(items, res):
        m = bytes.fromhex(it['msg']); req = m[13:14] + m[14:110]
        checks = [('signature valid', r['ok']), ('TAP-stone-v1 + version', r['prefix']),
                  ('printed counter == signed counter', it['ctr'] == r['ctr']),
                  ('request is a bench request', req.hex() in requests(10)),
                  ('pubkey == SPUB', spub is None or spub == r['pk']),
                  ('counter strictly increasing', last is None or int(r['ctr']) > last)]
        last = int(r['ctr'])
        fails = [n for n, ok in checks if not ok]
        out.append(('OK   ' if not fails else 'BAD  ') + 'counter %s' % r['ctr'] + ('' if not fails else ': ' + ', '.join(fails)))
        bad += bool(fails)
    if spub is None: out.append('(no SPUB line pasted: pubkey not cross-checked)')
    return out, 1 if bad else 0
FAKE_STONE = r"""
const s=require(process.argv[1]); const nacl=require(require.resolve('tweetnacl',{paths:[require('path').dirname(process.argv[1])]}));
const kp=nacl.sign.keyPair.fromSeed(Buffer.alloc(32,0).map((_,i)=>i+7)); const req=Buffer.from(process.argv[2],'hex');
const msg=s.buildStoneMsg({cluster:req[0],vault:req.subarray(1,33),txHash:req.subarray(33,65),tapId:'bench-tapid-1',counter:1n,stonePubkey:Buffer.from(kp.publicKey)});
const sig=Buffer.from(nacl.sign.detached(msg,kp.secretKey));
console.log('SPUB '+Buffer.from(kp.publicKey).toString('hex').toUpperCase()+'\nSSIG 1 '+sig.toString('hex').toUpperCase()+' '+msg.toString('hex').toUpperCase());
"""
def self_test():
    rs = requests(); assert len(rs) == 3 and all(len(r) == 194 and int(r, 16) and r[:2] == '02' for r in rs)
    assert len(set(rs)) == 3
    good = subprocess.run(['node', '-e', FAKE_STONE, os.path.join(REPO, 'vault', 'stone-sig.js'), rs[0]],
                          capture_output=True, text=True, check=True).stdout
    o, rc = verify(good); assert rc == 0, o
    lines = good.splitlines(); bad = lines[1][:-2] + ('00' if not lines[1].endswith('00') else '11')
    o, rc = verify(lines[0] + '\n' + bad); assert rc == 1 and 'signature valid' in ' '.join(o), o
    o, rc = verify('SPUB ' + '00' * 32 + '\n' + lines[1]); assert rc == 1 and 'pubkey == SPUB' in ' '.join(o), o
    o, rc = verify(lines[1] + '\n' + lines[1]); assert rc == 1 and 'strictly' in ' '.join(o), o
    o, rc = verify('REFUSED NO_TOUCH'); assert rc == 1
    print('make_requests self-test: 5 passed, 0 failed')
if __name__ == '__main__':
    if '--self-test' in sys.argv: self_test()
    elif len(sys.argv) > 1 and sys.argv[1] == 'verify':
        print('Paste the stone output, then press Ctrl-D:', file=sys.stderr)
        o, rc = verify(sys.stdin.read()); print('\n'.join(o)); sys.exit(rc)
    else:
        for i, r in enumerate(requests(), 1): print('ssign ' + r)
