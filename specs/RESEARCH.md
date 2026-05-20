# The theoretical backbones

Five frameworks that should anchor the design. I'm picking these because (a) they're empirically supported and (b) they map directly to product features, not just vibes.

### 1. Externalising executive function (Russell Barkley)

The single most important framework for ADHD product design. Barkley's thesis: ADHD is fundamentally a disorder of *self-regulation*, and the empirically supported intervention is to **move executive functions out of the brain and into the environment** — calendars, alarms, lists, sticky notes, etc.

**Application to Alibi:** You're externalising two specific executive functions — *working memory* (what did I do?) and *self-evaluation* (am I doing okay?). The agent is a prosthetic for both.

### 2. Dopamine reward pathway dysfunction (Volkow et al.)

Imaging studies show ADHD brains have decreased function in the dopamine reward pathway, with the "Achievement" trait scale significantly lower in ADHD participants and correlated with D2/D3 receptor availability. Translation: **ADHD brains struggle to convert accomplishment into felt reward.**

You did the thing. The dopamine hit didn't fire properly. So the brain doesn't register it as reward, doesn't reinforce, doesn't motivate the next action.

**Application to Alibi:** Making accomplishment *visible and re-readable* is essentially exogenous dopamine scaffolding. The done-list isn't decoration — it's a reward delivery mechanism.

### 3. Self-monitoring as evidence-based intervention

Multiple studies (including a college ADHD study where the self-monitoring group showed significant improvement in ADHD symptoms, academic behavior, GPA, and goal attainment). The act of recording behaviour changes behaviour. **Self-monitoring is one of the few non-pharmacological interventions with consistent positive evidence in ADHD adults.**

**Application to Alibi:** This is your scientific licence. You're not building a vibes app — you're building a frictionless self-monitoring system, which has 30+ years of clinical literature behind it.

### 4. Cognitive distortions + reframing (Beck/CBT, Solanto's CBT-for-ADHD)

ADHD is highly co-morbid with anxiety, depression, and rejection-sensitive dysphoria. The cognitive distortions are predictable: *all-or-nothing thinking* ("I did nothing today"), *discounting the positive* ("that doesn't count"), *catastrophising* ("I'm a fraud"). CBT's core technique: **counter the distortion with evidence.**

**Application to Alibi:** The coach mode is literally CBT reframing — but powered by *actual data from your day* rather than asking the user to recall evidence themselves (which they can't, because of the executive function deficit).

### 5. Narrative identity & self-continuity (Dan McAdams)

We construct our sense of self from stories about our past. When the past is fragmented (ADHD memory gaps), identity becomes unstable. Days feel like they "didn't happen." The shame spiral is partly an *identity* problem, not just a feelings problem.

**Application to Alibi:** A continuous, retrievable record of your days is identity scaffolding. You become a person with a coherent past.

---

**Bonus framework worth knowing:** Barkley's "wall of time" — ADHD brains live in *Now and Not-Now*. The future is foggy, the past evaporates. This is why retrospective logging is uniquely valuable for ADHD specifically (vs. neurotypicals, who can mostly recall their day fine).

---

# Part 1: The data schema (theory-driven)

Each log entry needs to capture three layers:

### Layer 1 — The activity itself
```
- raw_input            // exact words the user typed/spoke (preserve!)
- description          // cleaned, normalised
- timestamp_logged
- timestamp_activity   // when it actually happened (often = logged)
- duration_estimate    // in minutes, vague is fine
- project              // free text, agent infers
- category             // deep_work | admin | social | errands | care | creative | rest
```

### Layer 2 — Affect & state (this is the ADHD-specific layer)
```
- mood_at_logging      // joyful | neutral | flat | anxious | guilty | proud
- effort_level         // easy | medium | hard | grind
- satisfaction         // satisfied | mixed | frustrated | unclear
```

### Layer 3 — ADHD pattern markers (the goldmine)
```
- avoidance_marker     // bool — flagged if "finally", "had been putting off"
- hyperfocus_marker    // bool — flagged if "lost track of time", long duration
- guilt_marker         // bool — flagged if "should have", "wasted"
- novelty_marker       // bool — flagged if "new", "tried", "first time"
- input_mode           // text | voice
- session_type         // log | coach | reflect
```

**Why this schema is good:**

- **Preserves raw input** — language carries meaning your structured fields lose. You'll want it later for retraining and for the coach mode (it can quote the user back to themselves).
- **Captures effort/satisfaction separately** — because in ADHD they're often *decoupled* (you can grind something hard and feel nothing, or fly through something and feel proud). That decoupling is a key insight you can surface.
- **Flags markers, doesn't infer states** — keep it light. You're not diagnosing; you're noticing patterns.

---

# How the agent parses (the prompt structure)

The LLM does this in one call per log. System prompt structure:

```
You are a logger for a person with ADHD. They will tell you 
something they did, in any form.

Extract the following from their message:
- description (cleaned, 1 line)
- duration_estimate (best guess, in minutes)
- project (free text)
- category (one of: deep_work, admin, social, errands, care, 
  creative, rest)
- mood_at_logging (one of: joyful, neutral, flat, anxious, 
  guilty, proud)
- effort_level (easy/medium/hard/grind)
- satisfaction (satisfied/mixed/frustrated/unclear)
- markers: detect avoidance ("finally", "had been putting off"), 
  hyperfocus ("lost track", long sessions), guilt ("should 
  have", "wasted"), novelty ("first time", "new")

Then call log_activity() with all of this.
Reply to user with one short warm acknowledgement.
Do not ask follow-up questions.
```

**Key design choice:** the LLM is doing *all* the parsing. You don't write regex. You don't classify yourself. The model is genuinely good at this and it's the whole point of using an agent.

---

# Part 2: How the data informs back

Three layers, mapped to theory:

### Loop A — Immediate dopamine (the visible done list)
**Theory:** Reward pathway scaffolding. Self-monitoring evidence.
**Mechanism:** Live-rendering done list. Every entry is a small visible win. Receipt aesthetic makes it linger visually.
**Build-day deliverable:** ✅ MVP — this is the core feature.

### Loop B — Acute reframing (the coach mode)
**Theory:** CBT cognitive restructuring + self-compassion.
**Mechanism:** When user expresses distress, agent retrieves *today's actual log* and reflects it back warmly, evidence-led. Counters the all-or-nothing distortion with specific data.
**Build-day deliverable:** ✅ MVP — second feature.

The coach prompt structure:

```
The user is expressing distress about their day. 
You have just retrieved their log via get_today_log().

Your job:
1. Acknowledge the feeling briefly. Do not minimise.
2. Reflect back 3-5 specific things they actually did, 
   using their own language where possible.
3. Note effort markers — call out grind/hard tasks.
4. Note avoidance markers — they did things they'd been 
   putting off, that's worth seeing.
5. Close with something warm and human, not advice.

Do not say "you should". Do not say "be kind to yourself" 
(too generic). Be specific. Be a friend.
```

### Loop C — Pattern reflection (the mirror — v1.1)
**Theory:** Narrative identity + self-knowledge as agency.
**Mechanism:** Aggregate analysis surfaces *gentle* observations:
- *"Your most satisfying work tends to happen between 11am and 2pm."*
- *"You've logged 'finally did X' five times this week — there's a list of things that have been weighing on you, and you're handling them."*
- *"On Tuesdays you almost always have a long deep-work block. Tuesdays look like your Tuesday."*

**Build-day:** Talk about it in pitch as roadmap. Maybe stub one insight in a "Patterns" tab.

---

# The key insight that makes this hackathon-worthy

Most ADHD apps treat the user as a person who *fails to do things* and needs help doing them.

Alibi treats the user as a person who *does plenty of things but cannot perceive them*, and needs help **seeing**.

That's a real reframe of the problem. Backed by Barkley (executive function), Volkow (reward pathway), and 30 years of self-monitoring literature.

Your pitch can land this in one line:

> *"ADHD shame isn't a doing problem. It's a perception problem. Alibi closes the gap between what you actually did and what you remember doing — using the same self-monitoring techniques that have decades of clinical evidence, but with zero friction because the agent does the structuring."*

---

# Practical next move

You don't need to build all three loops. Build A and B, talk about C.

For the schema: implement layers 1 and 2 fully, layer 3 as just `markers: []` (let the model populate it freely as a string array — don't pre-define enum). You can analyse markers post-hoc; you don't need rigid types on day 1.
