import Tapcore.Basic
import Mathlib.Probability.Distributions.Uniform
import Mathlib.Data.Fintype.Pi
import Mathlib.Data.Finset.Powerset
import Mathlib.Data.List.FinRange
import Mathlib.Data.Fintype.Fin
import Mathlib.Data.Fintype.Powerset

/-
  TAP Core — Acceptance probability.

  SCOPE (2026-10-16): The 32-bit radius-2 results in this section
  (529/2^32) formalize the TARGET SPEC — not the deployed system.
  Since 2026-10-13 the shipped app (app-v2) runs N_PAY=16 to match
  the flashed firmware (16 HMAC bits), accepting at most 1 slot flip
  over L ∈ {16,17,18} stuffed slots (see PARAMETRIZED SECTION below).
  Deployed per-attempt forge bound: (1+L)/2^L, e.g. L=16 → 17/65536
  ≈ 2.6e-4 — roughly 2,000× weaker than 529/2^32 (≈1.2e-7).
  Do not quote 529/2^32 as the deployed forge rate.

  Formalizes: a uniform random 32-bit word is accepted (Hamming distance
  ≤ 2 from the expected emission) with probability 529 / 2^32.

  The combinatorial heart: the Hamming ball of radius 2 around any
  32-bit center has exactly 529 elements — C(32,0) + C(32,1) + C(32,2).

  Status (2026-10-14):
  - hammingDist_eq_disagree_card: PROVEN
  - hammingBall_card: PROVEN — the 529 is real
  - acceptance_prob_cards: PROVEN — 529/2^32 as card ratio
  - acceptance_prob: PROVEN — uniformOfFinset wrapper around acceptance_prob_cards
  - hmac_collision_resistant axiom: KILLED (was mathematically impossible)
  Status (2026-10-19): deployed-config section below (radius 1, n bits):
  targetSet1_card, hammingBall1_card, acceptance_prob_radius1 PROVEN,
  i.e. the (1+n)/2^n bound. No unfinished goals in this file.
-/

open scoped Classical

set_option maxRecDepth 1000

/-- 32-bit words are the same as functions `Fin 32 → Bool`. -/
def vectorFinEquiv : (Fin 32 → Bool) ≃ Vector Bool 32 where
  toFun := Vector.ofFn
  invFun := fun v i => v[i.val]'(i.isLt)
  left_inv := fun f => by
    funext i
    show (Vector.ofFn f)[i.val]'(i.isLt) = f i
    rw [Vector.getElem_ofFn]
  right_inv := fun v => by
    apply Vector.ext
    intro i h
    show (Vector.ofFn fun j => v[j.val]'(j.isLt))[i]'h = v[i]'h
    rw [Vector.getElem_ofFn]

/-- 32-bit vectors form a finite type (via the function equivalence). -/
instance : Fintype (Vector Bool 32) :=
  Fintype.ofEquiv (Fin 32 → Bool) vectorFinEquiv

/-- Discrete measurable space on 32-bit vectors (for the uniform measure). -/
instance : MeasurableSpace (Vector Bool 32) := ⊤

/-- Singletons are measurable in the discrete space. -/
instance : MeasurableSingletonClass (Vector Bool 32) := ⟨fun _ => trivial⟩

/-- There are 2^32 possible 32-bit words. [PROVEN] -/
theorem card_vector_bool_32 : Fintype.card (Vector Bool 32) = 2 ^ 32 := by
  rw [← Fintype.card_congr vectorFinEquiv, Fintype.card_pi]
  simp [Fintype.card_bool]

/-- The disagreement set: positions where `w` and `c` differ. -/
def disagreeSet (c w : Vector Bool 32) : Finset (Fin 32) :=
  Finset.univ.filter (fun i => w[i.val]'(i.isLt) != c[i.val]'(i.isLt))

/-- Key bridge: zip of toLists equals map over finRange. [PROVEN]
    The fiddly `List.get` vs `List.getElem` API mismatch is handled via
    `List.get_eq_getElem`. -/
theorem zip_eq_map_finRange (c w : Vector Bool 32) :
    (w.toList.zip c.toList)
    = (List.finRange 32).map (fun i : Fin 32 => (w[i.val]'(i.isLt), c[i.val]'(i.isLt))) := by
  have hw : w.toList.length = 32 := by simp
  have hc : c.toList.length = 32 := by simp
  have hzip : (w.toList.zip c.toList).length = 32 := by
    rw [List.length_zip, hw, hc, Nat.min_self]
  apply List.ext_get
  · rw [hzip]
    simp [List.length_map, List.length_finRange]
  · intro n h1 h2
    rw [List.get_eq_getElem, List.getElem_zip, List.get_eq_getElem]
    simp only [List.getElem_map, List.getElem_finRange]
    simp [Vector.getElem_toList]

/-- Bridge: list-based `hammingDist` equals the disagreement-set card. [PROVEN]
    Route: zip = map over finRange → countP_map → countP over finRange
    = filter length = filter card over univ (finRange is nodup). -/
theorem hammingDist_eq_disagree_card (c w : Vector Bool 32) :
    hammingDist w c = (disagreeSet c w).card := by
  unfold hammingDist disagreeSet
  rw [zip_eq_map_finRange, List.countP_map]
  simp only [Function.comp_def]
  rw [List.countP_eq_length_filter]
  have hnodup : (List.finRange 32).Nodup := List.nodup_finRange 32
  have hfnodup : ((List.finRange 32).filter (fun i : Fin 32 => w[i.val]'(i.isLt) != c[i.val]'(i.isLt))).Nodup :=
    List.Nodup.filter _ hnodup
  rw [← List.toFinset_card_of_nodup hfnodup, List.toFinset_filter, List.toFinset_finRange]

/-- The Hamming ball of radius 2: all words within distance 2 of `c`. -/
def hammingBall (c : Vector Bool 32) : Finset (Vector Bool 32) :=
  Finset.univ.filter (fun w => decide (hammingDist w c ≤ 2))

/-- Inverse of `disagreeSet`: flip bits of `c` at positions in `S`. -/
def flipAt (c : Vector Bool 32) (S : Finset (Fin 32)) : Vector Bool 32 :=
  Vector.ofFn (fun i : Fin 32 => if i ∈ S then !(c[i.val]'(i.isLt)) else c[i.val]'(i.isLt))

/-- `disagreeSet c` undoes `flipAt c`. [PROVEN] -/
theorem disagree_flip (c : Vector Bool 32) (S : Finset (Fin 32)) :
    disagreeSet c (flipAt c S) = S := by
  unfold disagreeSet flipAt
  ext i
  simp only [Finset.mem_filter, Finset.mem_univ, true_and]
  by_cases hi : i ∈ S <;> simp [hi]

/-- `flipAt c` undoes `disagreeSet c`. [PROVEN]
    For Bool: `w[i] ≠ c[i]` implies `w[i] = !c[i]` (case analysis). -/
theorem flip_disagree (c w : Vector Bool 32) :
    flipAt c (disagreeSet c w) = w := by
  unfold flipAt disagreeSet
  apply Vector.ext
  intro n h
  simp only [Vector.getElem_ofFn]
  by_cases hmem : (⟨n, h⟩ : Fin 32) ∈
      ({i : Fin 32 | (w[i.val]'(i.isLt) != c[i.val]'(i.isLt)) = true} : Finset (Fin 32))
  · rw [if_pos hmem]
    simp at hmem
    cases hc : c[n]'h <;> cases hw : w[n]'h <;> simp_all
  · rw [if_neg hmem]
    simp at hmem
    cases hc : c[n]'h <;> cases hw : w[n]'h <;> simp_all

/-- Target of the bijection: subsets of `Fin 32` with card ≤ 2. -/
def targetSet : Finset (Finset (Fin 32)) :=
  Finset.univ.filter (fun S => decide (S.card ≤ 2))

/-- `targetSet` is the disjoint union of `powersetCard k univ` for k=0,1,2. [PROVEN] -/
theorem targetSet_eq_union :
    targetSet = Finset.powersetCard 0 Finset.univ ∪ Finset.powersetCard 1 Finset.univ
      ∪ Finset.powersetCard 2 Finset.univ := by
  unfold targetSet
  ext S
  simp only [Finset.mem_filter, Finset.mem_univ, true_and, Finset.mem_union,
    Finset.mem_powersetCard]
  constructor
  · intro h
    have hle : S.card ≤ 2 := of_decide_eq_true h
    have hcases : S.card = 0 ∨ S.card = 1 ∨ S.card = 2 := by omega
    rcases hcases with h0 | h1 | h2
    · left; left; exact ⟨Finset.subset_univ _, h0⟩
    · left; right; exact ⟨Finset.subset_univ _, h1⟩
    · right; exact ⟨Finset.subset_univ _, h2⟩
  · intro h
    rcases h with (⟨_, h0⟩ | ⟨_, h1⟩) | ⟨_, h2⟩
    · rw [h0]; decide
    · rw [h1]; decide
    · rw [h2]; decide

/-- Disjointness of distinct `powersetCard`s (different element cards). [PROVEN] -/
theorem disjoint_powersetCard' {n m : ℕ} (hnm : n ≠ m) :
    Disjoint (Finset.powersetCard n (Finset.univ : Finset (Fin 32)))
      (Finset.powersetCard m Finset.univ) := by
  apply Finset.disjoint_left.mpr
  intro S hSn hSm
  rw [Finset.mem_powersetCard] at hSn hSm
  exact hnm (by omega : n = m)

/-- Card of a disjoint union. -/
theorem card_union_disjoint' {s t : Finset (Finset (Fin 32))} (h : Disjoint s t) :
    (s ∪ t).card = s.card + t.card := by
  rw [Finset.card_union, Finset.disjoint_iff_inter_eq_empty.mp h, Finset.card_empty]
  simp

/-- `targetSet` has exactly 529 elements: C(32,0)+C(32,1)+C(32,2). [PROVEN] -/
theorem targetSet_card : targetSet.card = 529 := by
  rw [targetSet_eq_union]
  have dAB_C : Disjoint (Finset.powersetCard 0 (Finset.univ : Finset (Fin 32)) ∪
      Finset.powersetCard 1 Finset.univ) (Finset.powersetCard 2 Finset.univ) := by
    apply Finset.disjoint_union_left.mpr
    exact ⟨disjoint_powersetCard' (by decide), disjoint_powersetCard' (by decide)⟩
  have dA_B : Disjoint (Finset.powersetCard 0 (Finset.univ : Finset (Fin 32)))
      (Finset.powersetCard 1 Finset.univ) :=
    disjoint_powersetCard' (by decide)
  rw [card_union_disjoint' dAB_C, card_union_disjoint' dA_B]
  rw [Finset.card_powersetCard, Finset.card_powersetCard, Finset.card_powersetCard]
  simp [Finset.card_univ, Fintype.card_fin]
  rfl

/-- The radius-2 Hamming ball has exactly 529 elements. [PROVEN]
    Via the bijection `w ↦ disagreeSet c w` from the ball onto `targetSet`,
    with inverse `S ↦ flipAt c S`. -/
theorem hammingBall_card (c : Vector Bool 32) :
    (hammingBall c).card = 529 := by
  have hbij : (hammingBall c).card = targetSet.card := by
    apply Finset.card_bij (fun w _ => disagreeSet c w)
    · intro w hw
      rw [hammingBall] at hw
      simp at hw
      rw [targetSet]
      simp
      rw [← hammingDist_eq_disagree_card]
      exact hw
    · intro w₁ _ w₂ _ heq
      have e1 := flip_disagree c w₁
      have e2 := flip_disagree c w₂
      rw [heq] at e1
      rw [← e2]; exact e1.symm
    · intro S hS
      rw [targetSet] at hS
      simp at hS
      refine ⟨flipAt c S, ?_, ?_⟩
      · rw [hammingBall]
        simp
        rw [hammingDist_eq_disagree_card, disagree_flip]
        exact hS
      · exact disagree_flip c S
  rw [hbij, targetSet_card]

/-- The acceptance probability as a card ratio (no measure theory).
    This is the mathematical content; the `uniformOfFinset` version follows
    by `uniformOfFinset_apply`. -/
theorem acceptance_prob_cards (c : Vector Bool 32) :
    ((hammingBall c).card : ENNReal) / ((Fintype.card (Vector Bool 32) : ℕ) : ENNReal)
      = 529 / 2 ^ 32 := by
  rw [hammingBall_card, card_vector_bool_32]
  norm_cast

/-- The acceptance probability via the uniform measure.
    By `uniformOfFinset_apply`, the measure equals (filter card)/(univ card),
    and the filter equals `hammingBall c` (proven as `hfeq` above, via `ext`).
    Fully proven via uniformOfFinset_apply and acceptance_prob_cards. -/
theorem acceptance_prob (c : Vector Bool 32) :
    MeasureTheory.Measure.uniformOfFinset (Finset.univ : Finset (Vector Bool 32))
      {w | hammingDist w c ≤ 2} = 529 / 2 ^ 32 := by
  -- First: the Set {w | ...} equals the coercion of hammingBall c
  have hset : ({w : Vector Bool 32 | hammingDist w c ≤ 2} : Set (Vector Bool 32))
      = ↑(hammingBall c) := by
    ext w
    simp [hammingBall]
  rw [hset]
  -- Now the goal is about uniformOfFinset univ ↑(hammingBall c)
  -- Apply uniformOfFinset_apply; the filter will be over ↑(hammingBall c)
  have h3 := MeasureTheory.Measure.uniformOfFinset_apply
    (s := (Finset.univ : Finset (Vector Bool 32))) (t := (↑(hammingBall c) : Set (Vector Bool 32)))
  rw [h3]
  -- The filter is now: Finset.filter (fun x => x ∈ ↑(hammingBall c)) univ
  -- Show it equals hammingBall c
  have hfeq : Finset.filter (fun x : Vector Bool 32 => x ∈ (↑(hammingBall c) : Set (Vector Bool 32))) Finset.univ
      = hammingBall c := by
    ext x
    simp
  -- Rewrite the filter card
  have hcard : (Finset.filter (fun x : Vector Bool 32 => x ∈ (↑(hammingBall c) : Set (Vector Bool 32))) Finset.univ).card = 529 := by
    rw [hfeq, hammingBall_card]
  have hden : (Finset.univ : Finset (Vector Bool 32)).card = 2 ^ 32 := by
    rw [Finset.card_univ, card_vector_bool_32]
  -- Now: goal is ↑(filter.card) / ↑(univ.card) = 529 / 2^32
  -- hcard : filter.card = 529, hden : univ.card = 2^32
  -- Try rewriting just the denominator first
  have hden' : ((Finset.univ : Finset (Vector Bool 32)).card : ENNReal) = 2 ^ 32 := by
    exact_mod_cast hden
  rw [hden']
  -- Now goal: ↑(filter.card) / 2^32 = 529 / 2^32
  -- hcard : filter.card = 529 (Nat). Lift to ENNReal via congr.
  congr 1
  exact_mod_cast hcard

/- ============================================================================
   PARAMETRIZED SECTION (2026-10-15, scope corrected 2026-10-16): Deployed config.
   The shipped app (app-v2, since 2026-10-13) runs N_PAY=16 with radius 1
   over L ∈ {16,17,18} stuffed slots. This section parametrizes by (n, r=1).
   ============================================================================ -/

/-- General equivalence: n-bit vectors ≃ (Fin n → Bool). -/
def vectorFinEquivN (n : ℕ) : (Fin n → Bool) ≃ Vector Bool n where
  toFun := Vector.ofFn
  invFun := fun v i => v[i.val]'(i.isLt)
  left_inv := fun f => by
    funext i
    show (Vector.ofFn f)[i.val]'(i.isLt) = f i
    rw [Vector.getElem_ofFn]
  right_inv := fun v => by
    apply Vector.ext
    intro i h
    show (Vector.ofFn fun j => v[j.val]'(j.isLt))[i]'h = v[i]'h
    rw [Vector.getElem_ofFn]

/-- General Fintype instance for n-bit vectors. -/
instance fintypeVectorBool (n : ℕ) : Fintype (Vector Bool n) :=
  Fintype.ofEquiv (Fin n → Bool) (vectorFinEquivN n)

/-- Discrete measurable space for n-bit vectors. -/
instance measurableSpaceVectorBool (n : ℕ) : MeasurableSpace (Vector Bool n) := ⊤

/-- Singletons measurable. -/
instance measurableSingletonVectorBool (n : ℕ) : MeasurableSingletonClass (Vector Bool n) :=
  ⟨fun _ => trivial⟩

section ParametrizedRadius1

variable (n : ℕ)

/-- The radius-1 Hamming ball: all n-bit words within distance 1 of `c`. -/
def hammingBall1 (c : Vector Bool n) : Finset (Vector Bool n) :=
  Finset.univ.filter (fun w => decide (hammingDist w c ≤ 1))

/-- Disagreement set, parametrized by n. -/
def disagreeSetN (c w : Vector Bool n) : Finset (Fin n) :=
  Finset.univ.filter (fun i => w[i.val]'(i.isLt) != c[i.val]'(i.isLt))

/-- Flip bits of `c` at positions in `S`, parametrized by n. -/
def flipAtN (c : Vector Bool n) (S : Finset (Fin n)) : Vector Bool n :=
  Vector.ofFn (fun i : Fin n => if i ∈ S then !(c[i.val]'(i.isLt)) else c[i.val]'(i.isLt))

/-- Bridge: hammingDist equals disagreeSet card, for general n.
    (Same proof as the n=32 version, generalized.) -/
theorem hammingDist_eq_disagree_card_n (c w : Vector Bool n) :
    hammingDist w c = (disagreeSetN n c w).card := by
  unfold hammingDist disagreeSetN
  -- The zip/map/finRange argument generalizes directly
  have hw : w.toList.length = n := by simp
  have hc : c.toList.length = n := by simp
  have hzip : (w.toList.zip c.toList).length = n := by
    rw [List.length_zip, hw, hc, Nat.min_self]
  have hzeq : (w.toList.zip c.toList)
      = (List.finRange n).map (fun i : Fin n => (w[i.val]'(i.isLt), c[i.val]'(i.isLt))) := by
    apply List.ext_get
    · rw [hzip]; simp [List.length_map, List.length_finRange]
    · intro k h1 h2
      rw [List.get_eq_getElem, List.getElem_zip, List.get_eq_getElem]
      simp only [List.getElem_map, List.getElem_finRange]
      simp [Vector.getElem_toList]
  rw [hzeq, List.countP_map]
  simp only [Function.comp_def]
  rw [List.countP_eq_length_filter]
  have hnodup : (List.finRange n).Nodup := List.nodup_finRange n
  have hfnodup : ((List.finRange n).filter
      (fun i : Fin n => w[i.val]'(i.isLt) != c[i.val]'(i.isLt))).Nodup :=
    List.Nodup.filter _ hnodup
  rw [← List.toFinset_card_of_nodup hfnodup, List.toFinset_filter, List.toFinset_finRange]

/-- `disagreeSetN c` undoes `flipAtN c`. -/
theorem disagree_flip_n (c : Vector Bool n) (S : Finset (Fin n)) :
    disagreeSetN n c (flipAtN n c S) = S := by
  unfold disagreeSetN flipAtN
  ext i
  simp only [Finset.mem_filter, Finset.mem_univ, true_and]
  by_cases hi : i ∈ S <;> simp [hi]

/-- `flipAtN c` undoes `disagreeSetN c`. -/
theorem flip_disagree_n (c w : Vector Bool n) :
    flipAtN n c (disagreeSetN n c w) = w := by
  unfold flipAtN disagreeSetN
  apply Vector.ext
  intro k h
  simp only [Vector.getElem_ofFn]
  by_cases hmem : (⟨k, h⟩ : Fin n) ∈
      ({i : Fin n | (w[i.val]'(i.isLt) != c[i.val]'(i.isLt)) = true} : Finset (Fin n))
  · rw [if_pos hmem]
    simp at hmem
    cases hc : c[k]'h <;> cases hw : w[k]'h <;> simp_all
  · rw [if_neg hmem]
    simp at hmem
    cases hc : c[k]'h <;> cases hw : w[k]'h <;> simp_all

/-- Target: subsets of `Fin n` with card ≤ 1. -/
def targetSet1 : Finset (Finset (Fin n)) :=
  Finset.univ.filter (fun S => decide (S.card ≤ 1))

/-- `targetSet1` is the disjoint union of powersetCard 0 and 1. -/
theorem targetSet1_eq_union :
    targetSet1 n = Finset.powersetCard 0 Finset.univ ∪ Finset.powersetCard 1 Finset.univ := by
  unfold targetSet1
  ext S
  simp only [Finset.mem_filter, Finset.mem_univ, true_and, Finset.mem_union,
    Finset.mem_powersetCard]
  constructor
  · intro h
    have hle : S.card ≤ 1 := of_decide_eq_true h
    have hcases : S.card = 0 ∨ S.card = 1 := by omega
    rcases hcases with h0 | h1
    · left; exact ⟨Finset.subset_univ _, h0⟩
    · right; exact ⟨Finset.subset_univ _, h1⟩
  · intro h
    rcases h with ⟨_, h0⟩ | ⟨_, h1⟩
    · rw [h0]; decide
    · rw [h1]; decide

/-- `targetSet1` has exactly 1 + n elements: C(n,0) + C(n,1). -/
theorem targetSet1_card : (targetSet1 n).card = 1 + n := by
  rw [targetSet1_eq_union]
  have hdisj : Disjoint (Finset.powersetCard 0 (Finset.univ : Finset (Fin n)))
      (Finset.powersetCard 1 Finset.univ) := by
    apply Finset.disjoint_left.mpr
    intro S hSn hSm
    rw [Finset.mem_powersetCard] at hSn hSm
    omega
  rw [Finset.card_union_of_disjoint hdisj]
  rw [Finset.card_powersetCard, Finset.card_powersetCard]
  simp [Finset.card_univ, Fintype.card_fin, Nat.choose_one_right, Nat.choose_zero_right]

/-- MAIN: The radius-1 Hamming ball over n bits has exactly 1 + n elements.
    Via the bijection w ↦ disagreeSetN c w. -/
theorem hammingBall1_card (c : Vector Bool n) :
    (hammingBall1 n c).card = 1 + n := by
  have hbij : (hammingBall1 n c).card = (targetSet1 n).card := by
    apply Finset.card_bij (fun w _ => disagreeSetN n c w)
    · intro w hw
      rw [hammingBall1] at hw
      simp at hw
      rw [targetSet1]
      simp
      rw [← hammingDist_eq_disagree_card_n]
      exact hw
    · intro w₁ _ w₂ _ heq
      have e1 := flip_disagree_n n c w₁
      have e2 := flip_disagree_n n c w₂
      rw [heq] at e1
      rw [← e2]; exact e1.symm
    · intro S hS
      rw [targetSet1] at hS
      simp at hS
      refine ⟨flipAtN n c S, ?_, ?_⟩
      · rw [hammingBall1]
        simp
        rw [hammingDist_eq_disagree_card_n, disagree_flip_n]
        exact hS
      · exact disagree_flip_n n c S
  rw [hbij, targetSet1_card]

/-- Acceptance probability for radius 1: (1+n)/2^n.
    Deployed config: n ∈ {16,17,18} (N_PAY=16). -/
theorem acceptance_prob_radius1 (c : Vector Bool n) :
    ((hammingBall1 n c).card : ENNReal) / ((Fintype.card (Vector Bool n) : ℕ) : ENNReal)
      = (1 + n : ENNReal) / 2 ^ n := by
  rw [hammingBall1_card]
  have hcard : Fintype.card (Vector Bool n) = 2 ^ n := by
    -- Via the Fin n → Bool equivalence
    have hequiv : (Fin n → Bool) ≃ Vector Bool n :=
      { toFun := Vector.ofFn
        invFun := fun v i => v[i.val]'(i.isLt)
        left_inv := fun f => by
          funext i
          show (Vector.ofFn f)[i.val]'(i.isLt) = f i
          rw [Vector.getElem_ofFn]
        right_inv := fun v => by
          apply Vector.ext
          intro i h
          show (Vector.ofFn fun j => v[j.val]'(j.isLt))[i]'h = v[i]'h
          rw [Vector.getElem_ofFn] }
    rw [← Fintype.card_congr hequiv, Fintype.card_pi]
    simp [Fintype.card_bool]
  rw [hcard]
  norm_cast

end ParametrizedRadius1

/- Deployed instantiations (2026-10-16, per Cadence review 2026-10-15):
   radius 1 over L stuffed slots, L ∈ {16,17,18} (N_PAY=16).
   Forge bound per attempt: (1+L)/2^L.
   L=16: 17/65536 ≈ 2.6e-4
   L=18: 19/262144 ≈ 7.2e-5 -/
