---
title: 'MultiMind: Four AI Agents That Find and Fix Bugs in Python Code'
description: A LangGraph multi-agent system where a Planner, Coder, Tester and Reviewer repair Python bugs with a retry loop. 25/25 cases fixed, but a single LLM call did just as well on the easy ones.
pubDate: 2026-01-20
heroImage: ''
---

Here's the short version of MultiMind: you paste in some broken Python and a description of what's going wrong, and four AI agents pass it around until it's fixed. A Planner figures out where the bug is, a Coder rewrites the code, a Tester runs it, and a Reviewer decides whether it's good enough or needs another go.

I built it with two teammates as a course project, and we ended up writing a [paper about it](https://www.researchgate.net/publication/414416306_MultiMind_A_Multi-Agent_System_for_Automated_Bug_Localization_and_Code_Repair) too. The code is [on GitHub](https://github.com/hamzaasad26/MultiMind-Agentic-Ai).

## The idea

When you ask one LLM to fix a bug, you're asking it to diagnose the problem, write the fix, test it and grade itself, all in one breath. It can't actually run anything, so it just sounds confident. And a model grading its own homework is going to be generous.

Real teams don't work like that. The person who writes the fix isn't the one who signs off on it. So the question I wanted to try out was simple: if I split those jobs across separate agents, and one of them has to *actually run the code*, do I get something I can trust more?

## What's under the hood

It's built on LangGraph, running Llama 3.3 70B through Groq's free tier. The four agents all read from and write to one shared state object, so nobody has to re-figure-out what the Planner already found, and there's no agent-to-agent chatter to go off the rails.

The flow is a loop:

```
🐛 Bug + Error
      ↓
🧠 Planner
      ↓
💻 Coder
      ↓
🧪 Tester
      ↓
🔍 Reviewer
      ↓
 Score ≥ 7
 & Tests Pass?
   ↙       ↘
 YES       NO
  ↓         ↓
✅ Done   🔄 Retry
            ↓
        🧠 Planner
```

Three small decisions turned out to matter more than I expected:

- **The Tester runs the code before the model says anything about it.** It executes the fix in a subprocess (15-second timeout) and only then asks the LLM what the output means. Pass or fail comes from the code running, not from the model's vibes.
- **The Coder's output gets parsed with `ast` first.** If it isn't valid Python, we throw it out and keep the original, rather than letting broken syntax travel down the pipeline.
- **The Reviewer can't approve on score alone.** It needs a 7 or higher *and* passing tests. When it rejects a fix, its feedback goes back to the Planner, so the retry isn't a blind guess.

## How it did

We threw 25 bugs at it: 15 I'd call classic (off-by-one, type errors, logic errors, runtime errors) and 10 harder ones based on notorious Python gotchas like exhausted generators, shallow copies, late-binding closures and floating-point surprises.

It fixed all 25. Average reviewer score was 9.15 out of 10, an average of 1.09 attempts per bug, and about 8 seconds per task. The Reviewer never approved a fix the Tester had flagged as failing, which was the failure I was most worried about.

The most interesting case was an infinite loop. The Planner nailed the cause immediately: someone wrote `i == i - 1` (a comparison) where they meant `i = i - 1` (an assignment). But the Coder's first two fixes created new problems, the Tester caught them, and the Reviewer's feedback nudged things closer each round until the third attempt got approved. It took 42 seconds, and it's the one time the loop earned its keep.

## The part I didn't expect

I also ran the boring baseline: same model, one call, no agents. On our 15 simple cases, it got 100% too.

| | One LLM call | MultiMind |
|---|---|---|
| Fixed | 15 / 15 | 15 / 15 |
| Time per task | 0.62 s | 10.17 s |
| Tokens per task | 117 | 452 |

So for small, well-described bugs, a good model just fixes them, and all my agents bought was 16x the wait. What MultiMind actually adds is the stuff around the fix: it ran the code to check, it gives you a score, it can retry, and you can see what every agent decided and why. Whether that's worth the extra time depends on how much you need to trust the answer.

I'd rather tell you that than pretend the architecture won on accuracy. It didn't, at least not on these bugs.

## What it can't do (yet)

It only handles single-file Python bugs. Real debugging usually means chasing a problem across a whole repo, and we didn't touch that. Our 25 bugs are also mostly well-known patterns the model has probably seen plenty of, so a harder benchmark is the real test, and I'd want to run the baseline comparison on the hard cases too.

If you try it on a bug of your own, I'd love to hear whether it fixes it. And if you like it, a star on the repo is always nice.
