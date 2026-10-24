# Offline round analysis

`web/analysis.mjs` derives labels from existing replay data. It does not change
the parser, replay file schema or original frames. Results are suggestions for
review, not definitive tactical or economic intent.

## Sources and buy definitions

Primary competitive-team coaching sources, consulted 2026-10-23:

- [Dignitas: A Guide to the Economy in Counter-Strike (13 July 2023)](https://dignitas.gg/articles/a-guide-to-the-economy-in-counter-strike)
  describes full buys as rifles, armor and utility, eco as saving with at most
  a pistol, force as investing the available bank into limited gear, and half
  buys as limited investment preserving funds. It also discusses saved guns
  and teammate drops. These qualitative definitions inform the categories.
- [Dignitas: Economic Strategies in CSGO (2019)](https://dignitas.gg/articles/economic-strategies-in-csgo)
  explains that force-versus-eco is contextual and subjective; a limited buy
  preserving money differs from spending the bank. This supports the explicit
  uncertainty and mixed category.

Valve's [Reintroducing Nuke](https://www.counter-strike.net/reintroducing_nuke)
identifies A as the upper bombsite and B as the lower bombsite. This supplies
the Nuke floor association; the existing calibrated radar splitZ supplies the
world-height cutoff. It does not supply economic classification thresholds.

These are the team's own educational publications, not Valve rules. They
predate CS2 and are used only for stable conceptual definitions, not current
prices, economy rewards or MR12 round numbers. Valve does not provide official
numerical thresholds for these strategic labels. All thresholds below are
local, inspectable heuristics; no weapon-price table is assumed.

## Classification

Evaluate each side separately at the first frame on/after freeze end, requiring
it within 0.5 seconds using the replay's actual tick rate. A missing opening
sample produces `unknown` and is excluded from team identity and push origins;
later pickups cannot stand in for opening equipment. Detected pistol status
still comes from the existing regulation-round detector. Active
weapons and inventory display/internal names are normalized; holding a knife
does not conceal a rifle. The existing detected regulation pistols take
precedence (including legacy halftime detection). A missing five-player roster,
inventory, armor or balance produces `unknown`.

- Full buy: at least four rifle/sniper-class weapons (including Galil/FAMAS,
  excluding Scout), four armored players, five total grenades. Medium confidence.
- Eco: at most one primary weapon, one armored player, two grenades. Medium.
- Force: other limited gear, mean remaining balance at most $1,200, and at
  least two primary weapons or three armored players. Low confidence.
- Mixed / half buy: remaining partial, bonus, saved-weapon or high-bank cases.

Labels represent observed opening equipment, not actual purchase history.
Force intent, helmets, exact spending, loss bonuses, drops and future round
affordability cannot be reconstructed reliably from the available fields.
Saved rifles can resemble full buys; a costly low-utility rifle buy can remain
mixed. Utility is counted by inventory entries; parser omissions lower confidence.
Per-team identity uses at least three shared opening player IDs from the initial
rosters, following a team through halftime. Ambiguous rosters fall back to side IDs.

## Representative rounds

Group full-buy and force candidates independently by team identity AND side.
Each candidate has a normalized full-round, time-weighted occupancy vector (512-world-unit
cells), separated into 0–15, 15–30, 30–60 and 60+ second phases, and normalized
rifle, armor and grenade counts. Phase cells share a single full-round weight
denominator, retaining declining late influence while distinguishing reversed
routes with equal total occupancy. Compute the mean vector
within its group and select the actual candidate with minimum squared distance
to that mean, earliest round breaking ties. This is an observed round closest
to the average pattern, not a synthetic average or a success highlight. There
is one result per nonempty group, with candidateCount and distance exposed.

## Special formations

During seconds 5–30, require a formation for at least two continuous seconds
(sample gaps at most 0.5 seconds). CT site stacks need at least four living
players within 650 world units of a calibrated A/B radar anchor. Grouped pushes
need four living players within 450 units of an anchor player, within 180 Z
units, each at least 600 units from their own live-start position. Both sides
can produce a grouped-push tag. Each formation/site is emitted once per round.

These detect spatial patterns only: a grouped rotation or retreat can look like
a push, and spawn departures are excluded only by the time/movement thresholds.
Site anchors are points, not bombsite polygons; map versions affect accuracy.
Nuke stacks use separate upper A/lower B floors. Other multi-floor maps require
`map.siteFloors` entries (`upper`/`lower`) and numeric `splitZ`; unavailable floor
associations disable only those site tags and produce an analysis warning.
Maps with no site anchors likewise warn. No clutch, ace, execute or route intent
is inferred.

## Heatmaps

`buildHeatmap` returns world-coordinate cell centers, accumulated living-player
seconds and weighted seconds. Only the requested side contributes; freeze time
and dead players are excluded. Every frame contributes the duration until the
next frame, capped at 0.5 seconds to avoid filling missing data. Intervals clip
exactly to live/end/window boundaries. No additional time is created by denser
sampling. The first 30 seconds count twice; later influence starts at one and
halves every 30 seconds, integrated over each sample interval. An
optional 30-second window isolates openings. `startSeconds` selects a later
window without resetting early weighting. T is orange, CT is blue.

Weights are player-seconds, not visits, kills or winning probability. Cell
quantization, left-held positions and missing samples limit spatial accuracy.
No interpolation across gaps or navigation-path assumptions are made. Floor
height is not separated in this 2D heatmap. Rounds with less captured time have
less weight; normalizing for display changes intensity, not recorded duration.

## Verification

`node --test tests/analysis.test.mjs` covers independent team buys, display names,
missing equipment, knife selection, duplicate active grenades, freeze/dead/side
exclusion, sample-density invariance, early weighting, window clipping, sparse
gap caps, team identity through halftime, representative ties and persistent
stack/push formations, Nuke floor separation, unavailable-site warnings and
temporal route ordering.
