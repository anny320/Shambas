# The v1 scoring model

A plain-language companion to `src/scoring/weights.ts`, which is the
authoritative version. If the two disagree, the code is right.

## Why it is not machine learning

At launch there is no labelled repayment data, so there is nothing to train
on. A model fitted to zero observed defaults would be a black box that had
learnt nothing. v1 is instead a transparent expert model: every weight is
visible, arguable and tunable, and every score traces back through those
weights to the inputs that produced it.

That is what lets a loan officer defend a decision to their supervisor and to
a regulator. It is also what makes the model replaceable: `score()` is pure
and I/O-free, so a trained model swaps in behind the same signature once a
pilot lender's repayment history exists.

The weights are priors, not findings. They should be recalibrated against real
outcomes as soon as any are available.

## What goes in

Three families, weighted as follows.

| Family | Weight | Signals |
| --- | --- | --- |
| Farm productivity | 40% | Vegetation against the regional norm, year-on-year vegetation trend, farm size |
| Climate risk | 30% | Rainfall reliability, drought seasons in the last five, this season's rainfall against norm, longest dry spell |
| Financial behaviour | 30% | Income regularity, income level, prior repayment record, cash buffer |

Farm productivity leads because it is the hardest signal to fake. It comes
from satellite rather than from anything the applicant says, and it is the
most direct read on whether the farm generates the surplus a loan is repaid
from.

Each raw value is mapped onto a 0-to-1 scale against a documented pair of
anchors, then combined. The score is reported on the familiar 300 to 850
range.

## How missing data is handled

This is the part that matters most, and the part most easily got wrong.

A model that averages whichever signals happened to arrive quietly rewards
withholding your worst one, because dropping the lowest number raises the mean
of what is left. An applicant with a poor income record would score better by
not linking it, and the product would be teaching people to hide their weakest
evidence.

So missing data is handled by four rules:

1. **A gap is never skipped.** Whatever weight went uninformed is filled at no
   better than a conservative anchor, and no better than what the present
   evidence already suggests. Absence never reads as strength.
2. **The score is shrunk toward that anchor as evidence thins** — but only ever
   downward. A weak file is never lifted by the fact that little is known
   about it.
3. **Missing evidence lowers confidence**, which is reported alongside the
   score as a share of the evidence the model expected.
4. **A missing signal family caps the offer**, whatever the score says, so
   there is little to gain by withholding.

### The honest limit

For a file that is already failing, hiding a signal can still nudge the number
up slightly: the model cannot know that the hidden signal was the worst one.
What it does guarantee is that hiding a signal never improves the *outcome* —
the risk band never gets better and the recommended amount never gets larger.
That is the property with real-world consequence, because an applicant
benefits from the loan, not from the score. Both behaviours are pinned by
tests.

### No prior credit is not bad credit

Two kinds of absence are deliberately treated differently.

A satellite outage is evidence we **failed to observe**: the vegetation
existed, we just could not see it, so the gap is filled conservatively.

No prior credit is not a gap in our observation. It is the ordinary state of
most smallholders, which is to say of exactly the people this product exists
to reach. Treating it as missing evidence would dock the score of a farmer who
has never borrowed, and could leave them ranked below one with a documented
history of paying late. So that weight is redistributed across the signals we
do have, and confidence is not reduced for it.

## What comes out

- **Score**, 300 to 850.
- **Default probability**, interpolated between two documented endpoints: 45%
  at the bottom of the range and 3% at the top. These are priors from
  published smallholder-portfolio experience, not measurements from our own
  book. Recalibrate before relying on the absolute numbers.
- **Risk band**, derived from the probability.
- **Confidence**, with reasons whenever it is not high.
- **Recommended terms**, or nothing. Nothing means "decide by hand", not
  "decline".
- **Factors**, each with signed score points and a plain-language sentence,
  ordered by how much they moved the result.

## How an offer is sized

The recommendation is the lower of two ceilings, scaled for risk:

- **Repayment capacity**: 25% of median monthly income over the loan term.
- **What the farm can absorb**: indicative input costs for the crop and
  hectarage, plus 20%.

The term follows the crop's cash cycle: six months for maize, beans, sorghum
and potato; four for horticulture; twelve for tea and coffee.

### An open policy question

When there is no income signal at all, the recommendation rests on the farm
ceiling alone, halved. That is how input-secured lending works, and refusing
outright would exclude the farmers with no linkable mobile-money history that
this product exists to reach.

The cost is an incentive: an applicant with genuinely poor income could fare
better by not linking their account than by linking it. The exposure cap
blunts this but does not remove it, so the officer is told plainly that such
an offer is farm-secured and unverified against income, and the lender
decides.

**This is a policy choice, not a technical one.** Set
`NO_INCOME_SIGNAL_MULTIPLIER` to `0` to refuse these outright instead.

## Fairness

The PRD's guardrail is that low data must not mean high risk by default, and
the rules above are how that is honoured. Two further things are worth
watching once real volume exists: whether the model systematically excludes a
region, a crop or a gender, and whether the regional-norm comparison is fair
in zones where the norm itself is very low.
