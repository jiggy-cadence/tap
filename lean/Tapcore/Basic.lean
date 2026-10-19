import Mathlib.Data.Nat.Choose.Basic

/-
  TAP Core — Minimal Verified Foundation
  Formalizes the TAP core spec (six steps below). The prose spec is not
  in this repo; the statements in this file are the spec of record.

  Six steps. Every security property is either [PROVEN], [ASSUMED], or [TESTED].

  Proof architecture (2026-10-14: three [ASSUMED-BITVEC] axioms promoted to [PROVEN]):
  - [ASSUMED-CRYPTO]: HMAC-SHA256 is a PRF. Modelled by ONE axiom in this
    file, `hmac_sha256` (opaque function); the PRF conclusion is stated as
    documentation, not as a Lean axiom. (The old collision-resistance axiom
    was removed on 2026-10-14; see Probability.lean.)
    Repo-wide there are 10 named axioms: this one plus 9 signature-scheme
    axioms in DualReceipt.lean. See lean/README.md for the table.
  - [PROVEN]: freshness, binding, Hamming geometry (incl. triangle inequality),
    challenge/amount encoding injectivity — real proofs, no unfinished goals.
-/

-- A 256-bit session key (Step 0: QR pairing)
abbrev SessionKey := Vector Bool 256

-- A 128-bit fresh challenge (Step 1)
abbrev Challenge := Vector Bool 128

-- 32-bit keyed emission (Step 2: Jiggy's 32-bit ruling)
abbrev MagBits := Vector Bool 32

-- Unix timestamp
abbrev Timestamp := Nat

-- Amount in smallest units
abbrev Amount := Nat

-- SHA256 digest of canonical proofs
abbrev ProofHash := Vector Bool 256

/-- HMAC-SHA256, modeled as a pseudorandom function.
    [ASSUMED-CRYPTO]: PRF security. Opaque axiom — deliberately NOT
    defined, so no placeholder implementation can contradict the
    security assumptions below. Breaking this breaks the internet.

    NOTE (2026-10-14): the former `hmac_collision_resistant` axiom asserted
    literal injectivity (distinct 512-bit inputs → distinct 256-bit outputs),
    which is mathematically IMPOSSIBLE by pigeonhole (2^512 > 2^256).
    It has been REMOVED. Freshness and binding are now stated conditionally:
    encodings provably differ (see encode_challenge_injective,
    encode_amount_injective), and the MAC-inequality on each specific pair
    is an explicit hypothesis — the computational collision-resistance
    assumption, scoped to the pair, not claimed globally. -/
axiom hmac_sha256 : Vector Bool 256 → Vector Bool 512 → Vector Bool 256

/-- Encode a Nat as n bits, little-endian via testBit. -/
def natToBits (n : Nat) (x : Nat) : Vector Bool n :=
  Vector.ofFn (fun i => x.testBit i.val)

/-- The attestation input encoding: 128 + 32 + 32 + 64 + 256 = 512 bits.
    Fixed-width fields at fixed positions. -/
def encode (C : Challenge) (bits : MagBits) (t : Timestamp)
    (amt : Amount) (ph : ProofHash) : Vector Bool 512 :=
  C ++ bits ++ natToBits 32 t ++ natToBits 64 amt ++ ph

/-- The first 128 bits of an encoding are the challenge. [PROVEN]
    Fixed-width concatenation: `take 128` inverts the leading append. -/
theorem encode_take_challenge (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) :
    (encode C bits t amt ph).toList.take 128 = C.toList := by
  have hflat : (encode C bits t amt ph).toList
      = C.toList ++ (bits.toList ++ (natToBits 32 t).toList
        ++ (natToBits 64 amt).toList ++ ph.toList) := by
    simp only [encode, Vector.toList_append, List.append_assoc]
  have hlen : C.toList.length = 128 := Vector.length_toList
  have key := List.take_left (l₁ := C.toList)
    (l₂ := bits.toList ++ (natToBits 32 t).toList
      ++ (natToBits 64 amt).toList ++ ph.toList)
  rw [hlen] at key
  rw [hflat]
  exact key

/-- `encode` is injective in the challenge position. [PROVEN]
    Different challenges → different encodings, regardless of other fields.
    Pure bit-vector algebra; no cryptographic content. -/
theorem encode_challenge_injective (C₁ C₂ : Challenge)
    (bits : MagBits) (t : Timestamp) (amt : Amount) (ph : ProofHash)
    (h : C₁ ≠ C₂) :
    encode C₁ bits t amt ph ≠ encode C₂ bits t amt ph := by
  intro hcon
  apply h
  have hcon2 := congrArg (fun v : Vector Bool 512 => v.toList.take 128) hcon
  rw [encode_take_challenge, encode_take_challenge] at hcon2
  exact Vector.toList_inj.mp hcon2

/-- `natToBits 64` is injective on amounts below 2^64. [PROVEN]
    Equal bit-vectors → low 64 testBits agree; high bits are zero
    by the bound (`Nat.testBit_lt_two_pow`); extensionality finishes. -/
theorem natToBits_injective (amt₁ amt₂ : Nat)
    (h1 : amt₁ < 2 ^ 64) (h2 : amt₂ < 2 ^ 64)
    (h : natToBits 64 amt₁ = natToBits 64 amt₂) : amt₁ = amt₂ := by
  apply Nat.eq_iff_testBit_eq.mpr
  intro n
  by_cases hn : n < 64
  · have hget := congrArg (fun v : Vector Bool 64 => v[n]'hn) h
    simp only [natToBits, Vector.getElem_ofFn] at hget
    simpa using hget
  · have hn' : 64 ≤ n := Nat.not_lt.mp hn
    have e1 : amt₁.testBit n = false := by
      have hlt : amt₁ < 2 ^ n :=
        Nat.lt_of_lt_of_le h1 (Nat.pow_le_pow_right (n := 2) (by decide) hn')
      exact Nat.testBit_lt_two_pow hlt
    have e2 : amt₂.testBit n = false := by
      have hlt : amt₂ < 2 ^ n :=
        Nat.lt_of_lt_of_le h2 (Nat.pow_le_pow_right (n := 2) (by decide) hn')
      exact Nat.testBit_lt_two_pow hlt
    rw [e1, e2]

/-- Drop-192/take-64 extracts the fourth field. [PROVEN]
    Pure list surgery: drop the 128+32+32 prefix, take 64. -/
theorem drop192_take64 (A B C D E : List Bool)
    (hA : A.length = 128) (hB : B.length = 32)
    (hC : C.length = 32) (hD : D.length = 64) :
    ((A ++ (B ++ (C ++ (D ++ E)))).drop 192).take 64 = D := by
  have d1 : (A ++ (B ++ (C ++ (D ++ E)))).drop 192
      = (B ++ (C ++ (D ++ E))).drop 64 := by
    rw [List.drop_append,
        List.drop_eq_nil_of_le (by omega : A.length ≤ 192),
        List.nil_append]
    congr 1
    omega
  have d2 : (B ++ (C ++ (D ++ E))).drop 64
      = (C ++ (D ++ E)).drop 32 := by
    rw [List.drop_append,
        List.drop_eq_nil_of_le (by omega : B.length ≤ 64),
        List.nil_append]
    congr 1
    omega
  have d3 : (C ++ (D ++ E)).drop 32 = D ++ E := by
    have hsub : 32 - C.length = 0 := by omega
    rw [List.drop_append,
        List.drop_eq_nil_of_le (by omega : C.length ≤ 32),
        List.nil_append, hsub, List.drop_zero]
  rw [d1, d2, d3, ← hD]
  exact List.take_left

/-- The 64-bit amount field lives at bits [192, 256). [PROVEN] -/
theorem encode_take_amount (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) :
    ((encode C bits t amt ph).toList.drop 192).take 64
      = (natToBits 64 amt).toList := by
  have hflat : (encode C bits t amt ph).toList
      = C.toList ++ (bits.toList ++ ((natToBits 32 t).toList
        ++ ((natToBits 64 amt).toList ++ ph.toList))) := by
    simp only [encode, Vector.toList_append, List.append_assoc]
  rw [hflat]
  exact drop192_take64 _ _ _ _ _
    Vector.length_toList Vector.length_toList
    Vector.length_toList Vector.length_toList

/-- `encode` is injective in the amount position
    (for amounts below 2^64 — all realistic amounts). [PROVEN]
    Extract the field, apply `natToBits` injectivity.
    Pure bit-vector algebra; no cryptographic content. -/
theorem encode_amount_injective (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt₁ amt₂ : Amount) (ph : ProofHash)
    (h1 : amt₁ < 2 ^ 64) (h2 : amt₂ < 2 ^ 64) (h : amt₁ ≠ amt₂) :
    encode C bits t amt₁ ph ≠ encode C bits t amt₂ ph := by
  intro hcon
  apply h
  have hcon2 := congrArg
    (fun v : Vector Bool 512 => (v.toList.drop 192).take 64) hcon
  rw [encode_take_amount, encode_take_amount] at hcon2
  have hvec : natToBits 64 amt₁ = natToBits 64 amt₂ :=
    Vector.toList_inj.mp hcon2
  exact natToBits_injective amt₁ amt₂ h1 h2 hvec

/-- Step 4: Attestation. Commits to challenge, mag bits, timestamp,
    amount, and proof hashes. (TCH-01 F-CRIT-1 fix: value is bound.) -/
noncomputable def attest (K : SessionKey) (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) : Vector Bool 256 :=
  hmac_sha256 K (encode C bits t amt ph)

/-- Hamming distance: number of positions where the two words differ.
    Concrete, computable definition. Symmetry is [PROVEN] below;
    the triangle inequality is [PROVEN] below too (it was an
    [ASSUMED-BITVEC] axiom until 2026-10-14).
    [TESTED]: decode-vs-distance measured on hardware. -/
def hammingDist {n : Nat} (a b : Vector Bool n) : Nat :=
  (a.toList.zip b.toList).countP (fun p : Bool × Bool => p.1 != p.2)

/-- Counting disagreements doesn't care about list order. [PROVEN]
    by induction: the head contributes (x != y) = (y != x). -/
theorem zip_countP_swap (l₁ l₂ : List Bool) :
    (l₁.zip l₂).countP (fun p : Bool × Bool => p.1 != p.2) =
    (l₂.zip l₁).countP (fun p : Bool × Bool => p.1 != p.2) := by
  induction l₁ generalizing l₂ with
  | nil =>
    cases l₂ with
    | nil => rfl
    | cons _ _ => rfl
  | cons x xs ih =>
    cases l₂ with
    | nil => rfl
    | cons y ys =>
      show ((x, y) :: xs.zip ys).countP _ = ((y, x) :: ys.zip xs).countP _
      simp only [List.countP_cons]
      rw [ih]
      cases x <;> cases y <;> rfl

/-- Hamming distance is symmetric. [PROVEN] -/
theorem hammingDist_comm {n : Nat} (a b : Vector Bool n) :
    hammingDist a b = hammingDist b a :=
  zip_countP_swap a.toList b.toList

/-- List-level triangle inequality: counting disagreements satisfies the
    triangle law for equal-length lists. [PROVEN] by induction — the head
    contributes the Boolean fact (a≠c → a≠b ∨ b≠c), the tail uses the IH.
    (Equal lengths required: `zip` truncation would break it otherwise.) -/
theorem hamming_triangle_list (la lb lc : List Bool)
    (hab : la.length = lb.length) (hbc : lb.length = lc.length) :
    (la.zip lc).countP (fun p : Bool × Bool => p.1 != p.2) ≤
    (la.zip lb).countP (fun p : Bool × Bool => p.1 != p.2) +
    (lb.zip lc).countP (fun p : Bool × Bool => p.1 != p.2) := by
  induction la generalizing lb lc with
  | nil =>
    obtain rfl : lb = [] := List.length_eq_zero_iff.mp (by simpa using hab.symm)
    obtain rfl : lc = [] := List.length_eq_zero_iff.mp (by simpa using hbc.symm)
    simp
  | cons a as ih =>
    cases lb with
    | nil => simp at hab
    | cons b bs =>
      cases lc with
      | nil => simp at hbc
      | cons c cs =>
        have hab' : as.length = bs.length := by simpa using hab
        have hbc' : bs.length = cs.length := by simpa using hbc
        have ih' := ih bs cs hab' hbc'
        have head : (if a != c then 1 else 0)
            ≤ (if a != b then 1 else 0) + (if b != c then 1 else 0) := by
          cases a <;> cases b <;> cases c <;> decide
        simp only [List.zip_cons_cons, List.countP_cons]
        omega

/-- Triangle inequality for Hamming distance. [PROVEN]
    At each position, a[i] ≠ c[i] implies a[i] ≠ b[i] or b[i] ≠ c[i];
    the list-level lemma lifts this to counts. -/
theorem hamming_triangle {n : Nat} (a b c : Vector Bool n) :
    hammingDist a c ≤ hammingDist a b + hammingDist b c := by
  have h1 : a.toList.length = b.toList.length := by
    rw [Vector.length_toList, Vector.length_toList]
  have h2 : b.toList.length = c.toList.length := by
    rw [Vector.length_toList, Vector.length_toList]
  exact hamming_triangle_list a.toList b.toList c.toList h1 h2

/-- Hamming balls are disjoint when centers are more than 2r apart. [PROVEN]
    No observed word can be within radius r of both centers.
    This is the deterministic core of bilateral detection. -/
theorem ball_disjoint {n r : Nat} (c₁ c₂ w : Vector Bool n)
    (h : 2 * r < hammingDist c₁ c₂)
    (h₁ : hammingDist c₁ w ≤ r) (h₂ : hammingDist c₂ w ≤ r) : False := by
  have htri := hamming_triangle c₁ w c₂
  rw [hammingDist_comm w c₂] at htri
  omega

/-- The acceptance ball for the 32-bit rule has exactly 529 words.
    C(32,0) + C(32,1) + C(32,2) = 1 + 32 + 496. [PROVEN] by computation.
    Standard combinatorics: C(n,k) words sit at distance exactly k from
    any center. Consequence: a uniform random 32-bit word passes
    verification with probability 529 / 2^32 ≈ 1 in 8,119,031 —
    NOT 1 in 4.3 billion (that ignored the ≤2 error tolerance). -/
theorem accept_ball_size :
    Nat.choose 32 0 + Nat.choose 32 1 + Nat.choose 32 2 = 529 := by decide

/-- Step 3: Verification. Accept iff Hamming distance ≤ 2. -/
def verify (expected observed : MagBits) : Bool :=
  decide (hammingDist expected observed ≤ 2)

/-- Step 2: Keyed emission. Stone computes bits from K and C.
    Bits = HMAC-SHA256(K, "mag" || C)[0:32] (first 32 bits).
    The "mag" domain separator is 0x6D6167 ("mag" in ASCII), encoded as 24 bits.
    Input is padded to 512 bits with zeros (fixed public padding).
    [PROVEN]: linked to hmac_sha256 axiom, not a placeholder. -/
def magSep : Vector Bool 24 := natToBits 24 0x6D6167  -- "mag"

/-- The HMAC input for emission: "mag" || C || zero-pad to 512 bits.
    24 + 128 + 360 = 512. -/
def emitInput (C : Challenge) : Vector Bool 512 :=
  magSep ++ C ++ Vector.ofFn (fun _ : Fin 360 => false)

noncomputable def emitBits (K : SessionKey) (C : Challenge) : MagBits :=
  (hmac_sha256 K (emitInput C)).take 32

/-- The emission input encoding is injective in C.
    Different challenges give different HMAC inputs (the C field is at a fixed position).
    Proof: extract C via drop 24 / take 128; equal inputs give equal extracts. -/
theorem emitInput_injective (C₁ C₂ : Challenge) (h : emitInput C₁ = emitInput C₂) : C₁ = C₂ := by
  have hlist : (emitInput C₁).toList = (emitInput C₂).toList := congrArg Vector.toList h
  simp only [emitInput, Vector.toList_append, List.append_assoc] at hlist
  -- hlist : magSep.toList ++ (C₁.toList ++ pad.toList) = magSep.toList ++ (C₂.toList ++ pad.toList)
  have hlen_mag : magSep.toList.length = 24 := rfl
  have hlen_c1 : C₁.toList.length = 128 := Vector.length_toList
  have hlen_c2 : C₂.toList.length = 128 := Vector.length_toList
  -- Drop the 24-bit magSep prefix using List.drop_append
  have hdrop : List.drop 24 (magSep.toList ++ (C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList))
      = C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList := by
    rw [List.drop_append, List.drop_eq_nil_of_le (by rw [hlen_mag]), hlen_mag]
    simp
  have hdrop2 : List.drop 24 (magSep.toList ++ (C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList))
      = C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList := by
    rw [List.drop_append, List.drop_eq_nil_of_le (by rw [hlen_mag]), hlen_mag]
    simp
  have hmid : C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList
      = C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList := by
    have := congrArg (List.drop 24) hlist
    rw [hdrop, hdrop2] at this
    exact this
  -- Take 128 to extract C
  have htake1 : List.take 128 (C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList) = C₁.toList := by
    calc List.take 128 (C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList)
        = List.take (C₁.toList.length) (C₁.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList) := by
          rw [hlen_c1]
      _ = C₁.toList := by rw [List.take_left]
  have htake2 : List.take 128 (C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList) = C₂.toList := by
    calc List.take 128 (C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList)
        = List.take (C₂.toList.length) (C₂.toList ++ (Vector.ofFn (fun _ : Fin 360 => false)).toList) := by
          rw [hlen_c2]
      _ = C₂.toList := by rw [List.take_left]
  have hfinal : C₁.toList = C₂.toList := by
    have := congrArg (List.take 128) hmid
    rw [htake1, htake2] at this
    exact this
  exact Vector.toList_inj.mp hfinal

/-
  SECURITY PROPERTIES — [PROVEN] from the axioms above.
-/

/-- Property 2 [PROVEN, conditional]: Freshness.
    Replaying an old attestation with a new challenge fails —
    PROVIDED the MACs differ on this pair (computational
    collision-resistance, scoped to these inputs).
    Proof: distinct challenges → distinct encodings [PROVEN above];
    then the MAC-inequality hypothesis gives distinct attestations.
    The hypothesis is the crypto assumption, made explicit. -/
theorem freshness (K : SessionKey) (C_old C_new : Challenge)
    (h : C_old ≠ C_new) (bits : MagBits) (t : Timestamp)
    (amt : Amount) (ph : ProofHash)
    (hNoColl : hmac_sha256 K (encode C_old bits t amt ph) ≠
               hmac_sha256 K (encode C_new bits t amt ph)) :
    attest K C_old bits t amt ph ≠ attest K C_new bits t amt ph := by
  -- Encodings provably differ (structural, no crypto needed):
  have _hEnc := encode_challenge_injective C_old C_new bits t amt ph h
  unfold attest
  exact hNoColl

/-- Property 3 [PROVEN, conditional]: Binding.
    Swapping the amount invalidates the attestation —
    PROVIDED the MACs differ on this pair (computational
    collision-resistance, scoped to these inputs).
    This is the TCH-01 F-CRIT-1 fix, verified.
    Proof: distinct in-range amounts → distinct encodings [PROVEN above];
    then the MAC-inequality hypothesis gives distinct attestations. -/
theorem binding (K : SessionKey) (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt₁ amt₂ : Amount) (ph : ProofHash)
    (h1 : amt₁ < 2 ^ 64) (h2 : amt₂ < 2 ^ 64) (h : amt₁ ≠ amt₂)
    (hNoColl : hmac_sha256 K (encode C bits t amt₁ ph) ≠
               hmac_sha256 K (encode C bits t amt₂ ph)) :
    attest K C bits t amt₁ ph ≠ attest K C bits t amt₂ ph := by
  -- Encodings provably differ (structural, no crypto needed):
  have _hEnc := encode_amount_injective C bits t amt₁ amt₂ ph h1 h2 h
  unfold attest
  exact hNoColl

/-- Property 4 [PROVEN]: Bilateral detection, with the distance condition.
    If the two expected 32-bit emissions are more than 4 apart
    (twice the acceptance radius), no single observed word can verify
    under both — one coil can't blink two patterns.
    Proof: verify accepts iff within radius 2; ball_disjoint with r = 2.
    The remaining question — how likely are two independent keyed
    emissions to land within distance 4? — is probabilistic, not
    deterministic: under the PRF assumption the emissions are uniform,
    and P(dist ≤ 4) = (Σ_{k≤4} C(32,k)) / 2^32 = 41449 / 2^32
    ≈ 1 in 103,621. Documented, not formalized (needs the
    probabilistic adversary model). -/
theorem bilateral_far (c₁ c₂ : Vector Bool 32) (observed : Vector Bool 32)
    (hfar : 4 < hammingDist c₁ c₂)
    (h₁ : verify c₁ observed = true) (h₂ : verify c₂ observed = true) :
    False := by
  have e₁ : hammingDist c₁ observed ≤ 2 :=
    of_decide_eq_true (by simpa [verify] using h₁)
  have e₂ : hammingDist c₂ observed ≤ 2 :=
    of_decide_eq_true (by simpa [verify] using h₂)
  exact ball_disjoint c₁ c₂ observed (by omega) e₁ e₂

/-- Property 5 [PROVEN by `rfl`, weak]: Deniability. The Lean statement only
    says anyone holding K can compute the attestation; it is not a full
    deniability proof.
    HMAC is symmetric: either party holding K could have produced any
    attestation. No transferable proof of origin.
    
    Formalized: the attestation depends only on the shared key K and public
    values (C, bits, t, amt, ph). There is no party-specific secret input.
    Hence, given K, the computation is reproducible by either party —
    the transcript does not identify which party produced it.
    
    Proof: by construction — `attest` takes only symmetric inputs.
    No public key or party identifier appears in the definition.
    We exhibit the simulator (which is just `attest` itself, showing that
    knowledge of K suffices). -/
theorem deniable (K : SessionKey) (C : Challenge) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) :
    -- Anyone holding K can compute the attestation (simulatability).
    -- The transcript is party-agnostic.
    (fun K' : SessionKey => attest K' C bits t amt ph) K = attest K C bits t amt ph := by
  rfl

/-
  ACCEPTANCE — what it means for R to say "yes".
-/

/-- Full acceptance predicate. R accepts iff all three hold:
    (1) observed mag bits within tolerance of the genuine keyed emission;
    (2) the attestation recomputes exactly (over the *expected* bits,
        since the observed bits are noisy);
    (3) the timestamp is within the acceptance window — and never
        in the future (F-LOW-1: `t ≤ t_now`).
    This is the Lean mirror of TCH-02's verify_bundle. -/
noncomputable def verifyFull (K : SessionKey) (C : Challenge) (observed : MagBits)
    (t_now t : Timestamp) (amt : Amount) (ph : ProofHash)
    (att : Vector Bool 256) (window : Nat) : Bool :=
  decide (hammingDist (emitBits K C) observed ≤ 2 ∧
          att = attest K C (emitBits K C) t amt ph ∧
          t ≤ t_now ∧ t_now ≤ t + window)

/-- Soundness of acceptance. [PROVEN]
    If verifyFull says yes, then: the observed bits are close to the
    genuine keyed emission, the attestation is exactly the genuine one
    for (C, expected bits, t, amt, ph), and the timestamp is in-window.
    Note what this does NOT say: it doesn't say the prover knew K.
    That's unforgeability (Property 1) — this theorem says *if* the
    checks pass, *then* these equalities hold. -/
theorem verifyFull_sound (K : SessionKey) (C : Challenge) (observed : MagBits)
    (t_now t : Timestamp) (amt : Amount) (ph : ProofHash)
    (att : Vector Bool 256) (window : Nat)
    (h : verifyFull K C observed t_now t amt ph att window = true) :
    hammingDist (emitBits K C) observed ≤ 2 ∧
    att = attest K C (emitBits K C) t amt ph ∧
    t ≤ t_now ∧ t_now ≤ t + window :=
  of_decide_eq_true (by simpa [verifyFull] using h)

/-- Replay bound. [PROVEN]
    An attestation timestamped at t can never verify at a time more
    than `window` past t — the window is a hard replay horizon.
    (Within the window, single-use challenge tracking is the defense;
    that's wallet state, not cryptography.) -/
theorem replay_bound (K : SessionKey) (C : Challenge) (observed : MagBits)
    (t_now t : Timestamp) (amt : Amount) (ph : ProofHash)
    (att : Vector Bool 256) (window : Nat)
    (h : verifyFull K C observed t_now t amt ph att window = true)
    (hlate : t + window < t_now) : False := by
  obtain ⟨_, _, _, hwin⟩ :=
    verifyFull_sound K C observed t_now t amt ph att window h
  exact absurd hwin (Nat.not_le.mpr hlate)

-- Property 1 (unforgeability): the game is formal below; the
-- probabilistic conclusion is [ASSUMED-CRYPTO] (PRF security).
-- The game and reduction are stated in Lean just below.

/-
  UNFORGEABILITY — the game, the reduction, and what's assumed.
-/

/-- A forger: given oracle access to genuine attestations for chosen
    challenges, outputs a forgery attempt for a target challenge.
    (Randomized forgers are distributions over these; the deterministic
    case captures the reduction structure.) -/
def Forger := (Challenge → Vector Bool 256) → Challenge → Vector Bool 256

/-- Win condition: the forgery equals the genuine attestation for C*. -/
def forgerWins (F : Forger) (K : SessionKey) (bits : MagBits) (t : Timestamp)
    (amt : Amount) (ph : ProofHash) (Cstar : Challenge) : Prop :=
  F (fun C => attest K C bits t amt ph) Cstar = attest K Cstar bits t amt ph

/-- The reduction, explicit: a forger yields a PRF distinguisher.
    D runs F, answers F's oracle queries with D's own oracle O, and
    outputs true iff F's forgery matches O at the target encoding.
    [PROVEN] correct below — this construction is real, not sketched. -/
noncomputable def forgerToDistinguisher (F : Forger) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) (Cstar : Challenge) :
    (Vector Bool 512 → Vector Bool 256) → Bool :=
  fun O =>
    let oracle : Challenge → Vector Bool 256 :=
      fun C => O (encode C bits t amt ph)
    decide (F oracle Cstar = O (encode Cstar bits t amt ph))

/-- Reduction correctness. [PROVEN]
    If F forges against the real oracle (hmac_sha256 K), then the
    distinguisher built from F outputs true on hmac_sha256 K.
    This is the deterministic half of the unforgeability reduction,
    fully formal: forgery in the real world *is* distinguishing. -/
theorem reduction_correct (F : Forger) (K : SessionKey) (bits : MagBits)
    (t : Timestamp) (amt : Amount) (ph : ProofHash) (Cstar : Challenge)
    (h : forgerWins F K bits t amt ph Cstar) :
    forgerToDistinguisher F bits t amt ph Cstar (hmac_sha256 K) = true := by
  unfold forgerWins at h
  unfold forgerToDistinguisher
  simp only [attest] at h ⊢
  rw [h]
  simp

-- [ASSUMED-CRYPTO]: Ideal-world bound + PRF bridge.
-- Against a truly random function, a forger that never queries C*
-- succeeds with probability exactly 2^-256 — the forgery is
-- independent of the oracle's value at the unqueried point
-- (counting argument over the function space). The PRF assumption
-- says hmac_sha256 K is indistinguishable from random, so real-world
-- forgery probability ≤ 2^-256 + negligible PRF advantage.
-- The measure-theoretic content is assumed (beyond core Lean);
-- the reduction *structure* justifying it is proven above.
-- (Stated as documentation: core Lean has no probability operator.
-- A Mathlib-based formalization would state:
--   ∀ F C*, P[K ←$] (forgerWins F K … C*) ≤ 2^-256 + prfAdvantage(F).)
