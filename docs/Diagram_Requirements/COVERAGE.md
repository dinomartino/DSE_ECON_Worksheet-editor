# Coverage of the §8 checklist

How each item of `00_ALL_Diagram_Requirements.md` §8 (A-level excluded) is met by the
editor. **Template** ids are in the picker (`src/model/diagramTemplates.ts`); **presets**
are the Shade menu (`src/model/diagramPresets.ts:SHADE_PRESETS`, or Shade › Revenue);
**shift / level / vertical / MR / tangent / parallel** are derived curves, **anchor**
an anchored point, **span** a bracket or arrow (`src/model/diagramAnchors.ts`). "Manual"
means drawn on the canvas with the existing tools. **n/a**: marked on words, not the
diagram.

Status: **C** covered · **P** partial · **N** not covered · **n/a**.

## A · supply and demand

### 1. Single-market shifts
| Item | Met by | St. |
|---|---|---|
| Axes labelled; good named in the title | every template; diagram title field | C |
| D₁, S₁, E₁ with drops to both axes | `supply-demand`: anchor + drops | C |
| Shifted curve labelled, arrow for direction | `demand-shift`, `supply-shift`: shift + arrow | C |
| E₂, P₂, Q₂; P₁→P₂, Q₁→Q₂ arrows | anchor; `arrow` spans on the axes | C |
| Separate diagrams for two markets | insert the template twice | C |
| Verbal elaboration | — | n/a |

### 2. Simultaneous shifts
| Item | Met by | St. |
|---|---|---|
| Both shifts drawn and labelled | `simultaneous-shifts`: two shifts | C |
| Dominant shift visibly larger | `simultaneous-shifts` (arrow lengths, label) | C |
| Resulting P or Q direction; equal shifts → P unchanged | axis spans follow; equal shifts by drag | C |
| Condition stated | template label "shift of D > shift of S" | C |

### 3. TR / TE areas
| Item | Met by | St. |
|---|---|---|
| TR rectangles, or + and − rectangles | `elastic-revenue`, `inelastic-revenue`; Revenue presets | C |
| + and − placed and sized correctly | revenue gain/loss derived from two anchors | C |
| Elasticity condition stated | — | n/a |
| Flat D elastic, steep D inelastic | the two templates | C |
| P and Q rise together → D shift | `demand-shift` + Revenue gain (L-shape) | C |
| Vertical S: value = P × fixed Q | `fixed-supply` + Revenue › Total revenue | C |

### 4. Price fixed away from equilibrium
| Item | Met by | St. |
|---|---|---|
| Labelled price line below / above equilibrium | `price-ceiling`, `minimum-wage`: level | C |
| Qs, Qd read off; gap bracketed and labelled | anchors at the line; `bracket` span | C |
| A change: shift plus a second bracket, compared | `shortage-change` | C |
| Fixed capacity: vertical S | `fixed-supply`: vertical | C |
| Q = short side; TR / wage-bill change as P × ΔQ | `fixed-price-revenue` (controlRevenue); controlGap preset | C |
| Minimum wage: W > We, jobs off D, G and L; ineffective W < We | `minimum-wage`, `minimum-wage-bill` (G/L); W dragged below We | C |
| Ceiling DWL; lowered ceiling shades the increase | `price-control-dwl`, `ceiling-lowered` | C |

### 5. Labour market
| Item | Met by | St. |
|---|---|---|
| Wage-rate / labour axes | labour templates | C |
| Derived-demand shift; S (local) and S′ (local + imported) | `labour-importation` (S′ a shift); D shift: `demand-shift` retitled | C |
| Local employment read off S (local) at the new wage | `labour-importation`: anchor on S (local) at W₁ | C |
| Fixed wages as in 4 | `minimum-wage` | C |

### 6. Per-unit tax / tariff / subsidy
| Item | Met by | St. |
|---|---|---|
| Parallel shift of S by t or s; distance marked | `per-unit-tax`, `per-unit-subsidy`: shift + `dimension` span | C |
| P₁, P₁ − t (or P₁ + s), Q₁ | anchors (sellers' price on S₀ under E₁) | C |
| Buyers' and sellers' burdens; steepness matches | buyersBurden, sellersBurden presets; steepness by drag | C |
| Subsidy CB and PB | consumerBenefit, producerBenefit presets | C |
| Extreme cases (flat D, vertical S); tax revenue | taxRevenue preset; flat D / vertical S manual | P — presets do not read a flat line as demand |
| TE / market value net of tax | Revenue › Total revenue, point re-picked to P₁ − t | P — needs the point re-picked |

### 7. Quota
| Item | Met by | St. |
|---|---|---|
| Kinked S: S to the quota, then vertical | `domestic-quota` | C |
| Effective quota left of Qe; P rises, Q falls | anchors; axis spans | C |
| Quota change moves the segment; abolition | `quota-enlarged`; delete S₁ | C |
| G / L when TE is asked | `quota-revenue` | C |

### 8. Surplus diagrams
| Item | Met by | St. |
|---|---|---|
| CS and PS labelled | `surplus`: CS, PS presets | C |
| Changes as + and − (ceiling) | `ceiling-cs-change`: ceilingCsGain / Loss | C |
| MC rises: TSS loss band | `mc-rise-tss`: tssLoss | C |
| Tax: CS loss = buyers' burden + triangle | csLossTax preset on `per-unit-tax` | C |

## B · firms and micro

### Price control (ceiling, floor, administered price)
| Item | Met by | St. |
|---|---|---|
| Line below (ceiling) or above (floor), labelled | level; `price-ceiling`, `minimum-wage` | C |
| P₀ / Q₀ labelled when compared | Pe, Qe ticks on the anchored E | C |
| Q transacted on the short side, with a drop | anchored reading (Qs / Qt) | C |
| DWL triangle labelled | `price-control-dwl`: controlDwl | C |
| Shortage / excess bracketed | `bracket` span | C |
| Wrong-side control identified as ineffective | `ineffective-ceiling` | C |
| MB ≠ MC in words | D = MB, S = MC labels; words | n/a |

### Quota
| Item | Met by | St. |
|---|---|---|
| Kinked S, or a vertical line at the quota | `domestic-quota`; + Vertical line | C |
| Higher quota shifts the segment right | `quota-enlarged` | C |
| D shift with arrows, Q fixed at the quota | `quota-demand-increase` | C |
| DWL change as a band; efficient Q moves | `quota-enlarged` (DWL falls), `quota-demand-increase` (DWL₀ + increase) | C |
| D as MB, S as MC | S = MC in `quota-demand-increase`; D relabelled on the canvas | C |

### Per-unit subsidy (or tax) and efficiency
| Item | Met by | St. |
|---|---|---|
| S₀ = MC and the shifted S, with arrows | `subsidy-efficiency`: shift + arrow | C |
| Q₀ and Q₁ | anchors | C |
| MC on S₀ and MB on D at Q₁ | `subsidy-efficiency` anchors; the tax case by hand | P — no tax variant |
| DWL triangle | subsidyDwl preset | C |
| CB / PB optional | `per-unit-subsidy` | C |

### Lorenz curve (MCQ)
| Item | Met by | St. |
|---|---|---|
| Line of equality; closer curve → lower Gini | `lorenz` | C |
| Shift toward the diagonal after policy | `lorenz` (A before, B after) | C |

### MSC / MSB
| Item | Met by | St. |
|---|---|---|
| No diagram required | — | n/a |

## C · macro

### AD–AS demand shock
| Item | Met by | St. |
|---|---|---|
| Price level / real output axes, origin 0 | macro templates | C |
| AD₀, SRAS, E₀ with P₀, Y₀ | `ad-shift`: anchor + drops | C |
| AD shifts the right way, arrow | shift + arrow | C |
| New P and Y with directions | axis spans | C |
| Only Y when only output is asked | delete the P span | C |
| Verbal chain | — | n/a |

### Supply shock
| Item | Met by | St. |
|---|---|---|
| SRAS left or right | `sras-shift`: shift (drag for right) | C |
| New P, Y; AD and SRAS both left → only Y determinate | `ad-sras-left` | C |

### Long run, vertical LRAS
| Item | Met by | St. |
|---|---|---|
| Vertical LRAS at Yf | vertical; `ad-as`, gap templates | C |
| AD grows, capacity not: P rises, Y stays | `ad-shift-at-capacity` | C |
| Growth: LRAS₀ → LRAS₁ and AD shift | `lras-growth`: LRAS₁ a shift | C |

### Output gaps
| Item | Met by | St. |
|---|---|---|
| Deflationary gap as bracket / double arrow Y → Yf | `deflationary-gap`: `doubleArrow` span to LRAS | C |
| gap₀ and gap₁, visibly different | `gap-narrows` | C |
| Inflationary gap | `inflationary-gap` | C |

### Long-run self-adjustment
| Item | Met by | St. |
|---|---|---|
| Deflationary: SRAS right to Yf, P falls | `self-adjustment`: SRAS₁ parallel through AD ∩ LRAS | C |
| Inflationary: SRAS left, P rises | `self-adjustment-inflationary` | C |
| AD does not move | both templates | C |
| Shock then recovery, arrows 1 and 2 | `shock-recovery` | C |

### Money market (MCQ)
| Item | Met by | St. |
|---|---|---|
| Vertical Ms, falling Md, nominal rate | `money-market`: vertical | C |
| Md shifters | `money-demand-shift` | C |
| Ms shifters | `money-supply-shift` | C |
| A rate change is a movement along Md | manual (a point on Md) | P — no template |

## D · international and electives

### A. Exchange rate and one demand curve
| Item | Met by | St. |
|---|---|---|
| Price axis in the stated currency | axis titles (HK$, Yen); retitle | C |
| Movement along D: arrows, + / − rectangles, relative size | `exchange-rate-revenue`, `elastic-revenue`, `inelastic-revenue` | C |
| Price fixed in seller's currency: D₀ → D₁, gain P × ΔQ | `fixed-export-price` | C |
| Substitute goods: D shifts left on an upward S | `substitute-revenue` | C |
| Verbal elasticity condition | — | n/a |

### B. Small-open-economy tariff / quota
| Item | Met by | St. |
|---|---|---|
| Domestic S and D, Pw below autarky | `tariff` | C |
| Tariff: "Pw + t", Q₁, QM bracket, revenue; PS gain, DWL | `tariff`, `tariff-welfare`: level + shift, `bracket` span, tariff presets | C |
| Quota: kinked S with quota, EA, D shift first, quota rent | `import-quota`, `import-quota-demand` (quotaRent) | C |
| Pw + t moves with Pw; binding quota price independent of Pw | Pw + t a shift of Pw; S with quota is drawn geometry | P — the quota step does not follow Pw |

### C. Monopoly
| Item | Met by | St. |
|---|---|---|
| MR from D's intercept, twice as steep | MR derived in every monopoly template | C |
| MC horizontal, zero, upward or U-shaped | `monopoly`, `monopoly-mc-zero`, `monopoly-rising-mc`; U-shape drawn curved | P — U-shaped MC by hand |
| Qm at MR = MC, Pm up to D | anchor on D above MR ∩ MC | C |
| Efficient Qc, Pc where D = MC | anchor; `monopoly`, `monopoly-rising-mc` | C |
| DWL triangle labelled | monopolyDwl preset | C |
| MC shifts (new Q, P, old and new DWL); lump-sum labels | `monopoly-cost-fall`, `monopoly-mc-rises`, `monopoly-lump-sum` | C |
| Same P and Q after MC falls: increase in DL | `monopoly-same-output` | C |

### D. PPF / CPF
| Item | Met by | St. |
|---|---|---|
| Linear PPFs from data; specialise at an intercept | `ppf-linear-trade`, `ppf-two-countries` (axis max 100) | C |
| Concave: production where TOT is tangent | `ppf-concave-trade`: CPF tangent at B | C |
| CPF slope TOT, parallel to the world price line, for both | TOT guide parallel to CPF; `ppf-two-countries` parallel CPFs | C |
| Consumption on the CPF outside the PPF; "same X" constraint | C anchored on the CPF at a fixed X | P — X not tied to A |
| Export and import volumes as axis brackets | `bracket` spans in both PPF-trade templates | C |
| Growth shifts the PPF (and CPF) | `ppf-shift`; CPF by hand | P — CPF not in the template |
| One mark per element | — | n/a |

## E · S4 rounds

### One shift
| Item | Met by | St. |
|---|---|---|
| Axes, curves, new position with arrow | `demand-shift`, `supply-shift` | C |
| E₁, E₂ with drops; P and Q arrows | anchors, axis spans | C |
| TR change as L or + / − rectangles | Revenue presets on the shift templates | C |
| Related markets: separate diagrams | insert twice | C |
| Verbal explanation | — | n/a |

### Two simultaneous shifts
| Item | Met by | St. |
|---|---|---|
| Both shifts with arrows | `simultaneous-shifts` | C |
| Relative size matches the condition | `simultaneous-shifts` | C |
| Final P or Q direction | axis spans | C |
| Depends on relative size, in words | — | n/a |

### Price fixed away from equilibrium
| Item | Met by | St. |
|---|---|---|
| Horizontal line clearly above / below | level | C |
| Vertical S for fixed capacity | `fixed-supply` | C |
| Excess bracketed on the price line | `bracket` span | C |
| After a change: a new, visibly different bracket | `shortage-change` | C |
| Short side; revenue / wage bill rectangle | `fixed-price-revenue`, wageBill preset | C |

### Labour market
| Item | Met by | St. |
|---|---|---|
| Derived demand shifts | `demand-shift` with labour axes | C |
| S (local) and S′ (local + imported) | `labour-importation` | C |
| Local employment off S (local) | anchor | C |
| Fixed wages | `minimum-wage` | C |

### Elasticity and TR
| Item | Met by | St. |
|---|---|---|
| Movement along D, or an S shift; say which | revenue and shift templates | C |
| + and − rectangles labelled | revenue gain/loss | C |
| Relative size matches | geometry of the templates | C |
| Steepness consistent | `elastic-revenue` / `inelastic-revenue` | C |
| Vertical S (licences); S down for a subsidy | `fixed-supply`, `per-unit-subsidy` | C |
| P and Q both rose → D shift | `demand-shift` | C |

### Subsidy, quota, price-control extensions
| Item | Met by | St. |
|---|---|---|
| Subsidy: CB and PB, relative size | `per-unit-subsidy` | C |
| Quota: kinked S shifts right; gain vs loss | `quota-enlarged` + Revenue presets | C |
| Ceiling DWL; after D shifts left, a smaller triangle | `price-control-dwl` + Shift D, then controlDwl on D₁ | P — second DWL added by hand |

### MCQ graph patterns
| Item | Met by | St. |
|---|---|---|
| Shift vs movement along | shift and revenue templates | C |
| Four-point double-shift grid | `double-shift-grid` | C |
| Related-market option diagrams | one diagram per option | C |
| TR: rectangular hyperbola, upper half of a line elastic | curved D by hand; revenue presets read its polyline | P — no hyperbola template |

## F · S5–S6 rounds

### Surplus areas
| Item | Met by | St. |
|---|---|---|
| CS, PS triangles; price line to the axis | `surplus` | C |
| Tax on sellers: S up by t, P and Q arrows, burdens, CS loss | `per-unit-tax` + csLossTax | C |
| MC rises: TSS loss band | `mc-rise-tss` | C |

### Price controls: efficiency
| Item | Met by | St. |
|---|---|---|
| Control on the correct side, labelled | level templates | C |
| Q on the short side, labelled | anchored reading | C |
| Shortage / excess bracket | `bracket` span | C |
| DWL triangle "DL" | controlDwl (label retyped) | C |
| MB > MC in words | — | n/a |
| CS change under a ceiling: + and − | `ceiling-cs-change` | C |

### Domestic quota
| Item | Met by | St. |
|---|---|---|
| Kinked S | `domestic-quota` | C |
| Quota increase: S₁ → S₂, DWL falls | `quota-enlarged` | C |
| D rises under a fixed quota: DWL grows | `quota-demand-increase` | C |

### Per-unit subsidy
| Item | Met by | St. |
|---|---|---|
| S down (Ss); P₁ and P₂ = P₁ + s | `per-unit-subsidy` | C |
| At Q₁ MC > MB, both marked | `subsidy-efficiency` | C |

### Small-open-economy trade
| Item | Met by | St. |
|---|---|---|
| Tariff: Pw + t, Q₁, QM bracket, revenue; MCQ areas | `tariff`, `tariff-welfare`; tariffCsLoss preset | C |
| Import quota: kinked S, QA, EA; D shift with arrow | `import-quota`, `import-quota-demand` | C |

### Exchange rate: TR boxes
| Item | Met by | St. |
|---|---|---|
| One D, price axis in the currency asked | `exchange-rate-revenue` | C |
| P and Q arrows on both axes | axis spans | C |
| Gain / loss rectangles, relative size | revenue gain/loss | C |
| Mark allocation | — | n/a |
| Fixed exporter price: D₀ → D₁, gain P × ΔQ | `fixed-export-price` | C |

### AD–AS (inferred)
| Item | Met by | St. |
|---|---|---|
| LRAS at Yf, SRAS, AD₀ at Y₀ < Yf, gap labelled | `deflationary-gap` | C |
| AD right toward Yf, narrower gap | `gap-narrows` | C |
| MCQ: SRAS left; LRAS right | `sras-shift`, `lras-growth` | C |

### Monopoly (inferred)
| Item | Met by | St. |
|---|---|---|
| Q at MR = MC, P on D | monopoly templates | C |
| Cost fall: Q up, P down | `monopoly-cost-fall` | C |
| DWL beyond Qm; P > MC | monopolyDwl | C |

### PPF with trade (inferred)
| Item | Met by | St. |
|---|---|---|
| Specialisation point, trade line at world price, consumption | `ppf-linear-trade`, `ppf-concave-trade` | C |
| Gain as C's distance from the PPF; export / import brackets | brackets in both; the gain as a span by hand | P — gain span manual |

### Money market (MCQ)
| Item | Met by | St. |
|---|---|---|
| Md right and / or Ms left; new rate read | money templates; the second shift via Shift | C |

## Totals

167 rows: **145 covered · 11 partial · 0 not covered · 11 n/a**.

## Not covered

Nothing is wholly uncovered. The partial rows, and why:

- A flat demand curve (Ed = ∞) is not read as demand by the presets.
- Net-of-tax revenue needs the Revenue point re-picked to P₁ − t.
- MC and MB at Q₁ for a tax (the subsidy has its template).
- A change in r as a movement along Md.
- The import quota's "S with quota" is drawn geometry: its step does not follow Pw.
- U-shaped MC, and the TR hyperbola, are drawn by hand (crossings read the polyline).
- Consumption "same X as before" is not tied to the no-trade point.
- Growth shifting the CPF with the PPF.
- A second, smaller ceiling DWL after D shifts left.
- The gain from trade as a span from C to the PPF.
