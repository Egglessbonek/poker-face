# Presage in Poker Face: evidence and product ideas

Research review: 12 September 2026. This is a proposal, not a claim that the features or their effectiveness have been validated.

Work ownership: edit only PRs authored by this assistant; inspect other team PRs for awareness and integration boundaries. Teammate reveal and rail PRs remain theirs. No teammate code was changed during this research.

## Recommended direction

Use Presage to let players understand their physiological response during poker, practice a consistent decision routine, and discover whether their own patterns carry information. A pulse increase alone must not become a bluff verdict.

The initial product should combine:

1. A live, quality-qualified pulse/breathing display for authorized viewers.
2. A replay connecting measurement windows with the public betting sequence.
3. An optional practice mode with repeatable decisions and reflection.

Player-specific predictive tells are an experimental extension, conditional on evidence that they add information beyond betting context.

## Evidence ledger

| Source | What it supports | What it does not establish |
| --- | --- | --- |
| [Kosunen et al., 2018: Heart-rate sonification biofeedback for poker](https://research.aalto.fi/fi/publications/heart-rate-sonification-biofeedback-for-poker/) | A laboratory experiment with 29 participants found reduced emotional reactivity with synchronized heart-rate audio feedback; effects varied between people. | Better win rates, effectiveness of our camera measurements, or equivalent effects from a rolling-rate animation. |
| [Laakasuo, Palomäki & Salmela, 2015](https://pubmed.ncbi.nlm.nih.gov/24633674/) | In an experiment with 459 participants, anger reduced poker-task mathematical accuracy in the condition with a watching-eyes social cue. | That an elevated pulse identifies anger, that arousal always worsens play, or that our UI improves decision quality. |
| [Palomäki, Laakasuo & Salmela, 2014](https://researchportal.helsinki.fi/en/publications/losing-more-by-losing-it-poker-experience-sensitivity-to-losses-a/) | A correlational study of 417 players linked emotional sensitivity to losses with tilting severity. | Causal tilt detection from a camera, or a universal recovery-time threshold. |
| [Sung & Pentland: PokerMetrics](https://hd.media.mit.edu/tech-reports/TR-594.pdf) | An exploratory study covering 401 hands in 31 heads-up tournaments related physiological and behavioral features to poker situations and player reports. | General-purpose webcam bluff detection. It used contact sensors, audio and movement, involved a restricted participant population, and had relatively few examples of particular events. |
| [Slepian et al., 2013](https://www.columbia.edu/~ms4992/Publications/2013_Slepian-Young-Rutchick-Ambady_Poker_PychSci.pdf) | Observers extracted hand-strength information from arm movements in professional players' betting clips; perceived smoothness was informative. | That a still face, reduced head movement, or our specific freeze threshold diagnoses a bluff. Pushing chips and clicking a browser button are different behaviors. |
| [DePaulo et al., 2003](https://pubmed.ncbi.nlm.nih.gov/12555795/) | A broad meta-analysis covering 1,338 estimates of 158 deception cues found many weak or absent relationships. | Poker-specific weights for blinking, gaze, tension, or pulse. This is general deception evidence, not validation of a poker classifier. |
| [Southey et al.: Bayes' Bluff](https://arxiv.org/abs/1207.1411) | Probabilistic opponent modeling distinguishes uncertainty about strategy from uncertainty about the game. | Physiological features being predictive. It informs the modeling approach, not a pulse-to-bluff mapping. |

Practitioner material from Caro and Elwood can motivate hypotheses and contextual distinctions. It should be labeled practitioner guidance, rather than treated as measured effect sizes or a justification for exact numeric weights.

## Ranked concepts

### 1. Pressure replay

Let the player select a hand and see:

- Public events: deal, bet, raise, call, showdown.
- Pulse and breathing estimates, their baseline differences and valid measurement coverage.
- The player's cards after the match and the actual chip result.
- Optional self-report: calm, excited, frustrated, uncertain, or another description.

Example copy, with illustrative numbers: “Your pulse estimate averaged 84 BPM over this 12-second window; your baseline was 73. This window included the river bet and your call.”

The player can discover that both a strong hand and a bluff coincide with physiological changes. The UI should not attribute a rolling-window change to one event without the temporal evidence to do so.

### 2. Poker-face challenge

Compare outward behavior with physiology: “Movement stayed close to baseline; pulse was above baseline.” Do not label this a measured disagreement between an inner emotion and an outer emotion.

Offer short, repeatable practice scenarios involving a marginal call, a strong value hand and a draw. Keep scenario order varied. Show how the player's routine and measurements changed across attempts.

Reward completing and reviewing decisions. Do not award points for the lowest pulse, breath holding, exaggerated physiological responses, or universally slow actions.

### 3. Composure practice

A practice mode can offer a between-hand reset, an unobtrusive rate display, and a prompt to use a consistent decision routine.

Use the biofeedback study as motivation for a test, not a promise of benefit. An animation based on a 12-second average is an illustration of estimated rate, not a beat-synchronized recording of the heart.

For skill progression, use curated poker exercises with independently checked answers. Score the decision available at that moment; keep the eventual card outcome separate. Our current heuristic strategy module is not an optimal-play oracle.

### 4. Player-specific AI reads

Extend the existing showdown notebook with qualified measurements and comparable context: street, position, opponent count, bet/pot ratio and effective stack.

Initially, expose descriptive facts only. Later, test whether a player's measured patterns improve predictions after accounting for those poker variables. Preserve uncertainty when examples are sparse.

The AI may learn from cards legitimately shown at previous showdowns. It must never learn live labels from opponents' hidden cards, the rail's omniscient view, a future board, or private post-game annotations.

### 5. Spectator prediction game

The present rail shows every hand, so it cannot support a fair “guess the bluff” challenge as-is.

A separate prediction mode would need a server-filtered stream that withholds cards and outcomes until guesses are locked. Spectators could compare predictions from betting context alone with predictions after seeing qualified physiology. Track false alarms as well as correct guesses.

This would be a useful gameplay experiment, but it is a larger extension than the initial integration.

### 6. Adaptive presentation

Subtle table ambience could react to a player's valid pulse trend in an opted-in training experience. Keep it clearly representational, and respect reduced-motion/audio preferences.

Avoid silently changing cards, blinds, turn deadlines, or opponent strength in a multiplayer match based on physiology. Any adaptive training difficulty should be chosen transparently between rounds and tested for learning value.

## SDK constraints that shape the design

[Presage's measurement guide](https://smartspectra.presagetech.com/docs/measurement-quality/) specifies approximately 12 seconds for pulse, 30 seconds for breathing, and 60 seconds for HRV, with a sustained capture rate around 25–30 fps. Measurements need quality, stability and warm-up handling. Talking, motion, lighting and chest framing can undermine capture, including cases where confidence remains high.

[The Node SDK](https://smartspectra.presagetech.com/docs/nodejs/) supports custom video-frame input through a native runtime. It is not a browser-only inference library. For the current website, a remote worker means transmitting camera frames; the existing camera setup description must reflect that architecture. Do not describe it as on-device processing unless the worker actually runs on the player's device.

[Metric configuration](https://smartspectra.presagetech.com/docs/nodejs/metrics/) is subscription-dependent. Empty fields can indicate missing entitlement. Use documented metric names rather than copying the spike's numeric metric list without checking its SDK version.

Keep pulse and breathing as separate measurements. Defer HRV and derived stress indices until capture and their longer windows have been validated. No combined “stress probability” should be invented from an arbitrary weighted sum.

## Data contract

Collect the minimum measurements required by the chosen feature:

- Source and SDK version; pulse/breathing value and units.
- Capture/sample time, receive time and measurement-window boundaries.
- Per-metric confidence, stability, validation status and sample age.
- Baseline summary and quality; valid coverage and capture/drop statistics.
- Player identity scoped to the match; hand, street and public-event references.
- Poker context such as amount to call, bet/pot ratio and effective stack.

Keep observations, derived features and inferred labels distinct. Normalize SDK confidence explicitly; it is not a probability that the player is bluffing.

Use one shared measurement contract for gameplay, AI, rail and the teammate's reveal implementation. Reuse our existing tell-visibility rules. Stop processing on departure or camera disable; avoid retaining raw video by default.

## Validation before predictive claims

1. Reproduce the old clip spike, then test live people, devices and lighting. A second face is an integration smoke test, not statistical validation.
2. Compare measurements with a synchronized independent reference where possible; report error and missing-data coverage.
3. Test context-only predictions against context plus MediaPipe and then context plus MediaPipe plus Presage. The question is whether Presage adds information.
4. Split evaluation by person/session, with whole hands and overlapping measurement windows kept together. Thousands of frames from one person are not thousands of independent participants.
5. For personal adaptation, learn from earlier observations and evaluate on later unseen hands. Do not tune and report accuracy on the same examples.
6. Do not use the current low-equity aggression heuristic as ground truth for bluff intent. Separate estimated hand strength, draws/semi-bluffs, player-reported intent, opponent response and eventual result.
7. Report uncertainty, false alarms, usable coverage and sample counts. Exact thresholds must be either SDK requirements or explicitly labeled engineering choices pending validation.

## Existing implementation findings

- The freeze rule's 0.4 motion ratio and current evidence weights are heuristic choices; the cited arm-motion study does not validate those numbers.
- The existing `bluffLikelihood` is a heuristic signal score, not an empirically calibrated probability.
- The reveal currently identifies bluffs using aggressive action plus low Monte Carlo equity versus random opponents. This is a proxy that can mislabel intent, especially with draws and multiway play.
- AI decision changes demonstrate that the software used a signal. They do not establish that using it improved poker decisions.

These are requirements for future work on our own PRs, not permission to change the teammate's analytics PR.


Implementation steering: Presage starts with the existing camera setup and shares its stream. There is no separate Presage opt-in. Skipping or turning off the camera stops both pipelines. The camera explanation discloses server processing before capture starts.


## Adaptive implementation, September 13

Implemented private per-metric coverage/rejection diagnostics, confidence-cutoff comparisons, native transport telemetry, clearly aged previous readings, and descriptive completed-hand feedback in the existing camera sidebar. Default cutoffs remain 70. Rejected values are redacted; diagnostics retain confidence and all rejection flags only. Baselines and hand summaries deduplicate source timestamps. Hand summaries require three distinct valid windows contained within the hand and use reference data preceding the hand.

The [full pulse card](https://vandv.presagetech.com/arterial_pressure_model_card.html) reports lower return rates for some Fitzpatrick groups at its reported threshold of 97. These groups are not ethnic identities. The implementation never infers skin type or selects a threshold from demographics. The same card lists 40–180 BPM while the [SDK overview](https://smartspectra.presagetech.com/docs/model-cards-and-limitations/) lists 40–110; the narrower range remains until model/version applicability is confirmed. The [breathing card](https://vandv.presagetech.com/breathing_model_card.html) provides its own confidence/error curve, supporting independent metric policies, not blanket threshold reduction.

SDK motion flags exclude overlapping rate windows without restarting capture. Camera-derived jaw range >0.25 across at least six observed frames within one second is an additional breathing-artifact hint. This threshold is an explicit conservative engineering heuristic, not validated speech recognition. Test its false rejection rate during ordinary poker, including smiling, chewing and speaking. Do not count this hint as independent evidence of stress or bluffing. Native capture telemetry measures frames submitted to the SDK, not frames proven to contribute to an accurate result.

Decision timing uses a rolling median of prior same-street decisions (at least three), remains available without face data, and describes faster/slower actions neutrally. Hidden/offline turns are excluded. Existing facial-score weights remain heuristic and must not be described as calibrated probabilities. More available physiology metrics were deliberately deferred as proposed: adding correlated waveforms/HRV cannot solve missing source quality.

Pending empirical work: same-device crossover across teammates; matched independent reference; quiet versus natural-play sessions; per-person missing-output and accepted-estimate coverage; error distributions at confidence cutoffs 50/60/70/80/90. No live accuracy or fairness validation has been completed by automated tests.
