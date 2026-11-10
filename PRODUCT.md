# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite, React, and TypeScript in `clock/`. The approved plan specified that stack for a client-only browser app. Confirmed by the instruction to implement the plan.

## Users

Someone setting tomorrow tonight, or waking half-asleep at the alarm. They use a laptop, a bedside display, or an installed browser app that stays open. They are not relying on a quit browser or a locked phone.

## Product Purpose

Prelude is a browser clock. An alarm is a wake score: when the lead-in starts, how sound and light rise, what it takes to dismiss, and where that wake sits on one day. Sleep, timers, a stopwatch, and world time read and write that same day. Success is setting a wake in a few taps and meeting it, while the tab is open, with the rite the user chose.

## Positioning

Apple Clock stores a time and rings. Prelude stores the interval before that time and the act that ends it. A neighboring clock that only stores hour, minute, repeat, and a sound cannot claim the same mechanism.

## Operating Context

Local time only. Cities come from `Intl.supportedValuesOf('timeZone')`. State lives in one versioned `localStorage` document, `prelude:v1`. The page must stay open to ring. Bedside mode and an active prelude request a screen wake lock. A granted Notification permission also posts when an alarm fires. There is no account, sync, weather, calendar, or service-worker alarm daemon.

## Capabilities and Constraints

- Alarms with a 0–30 minute prelude, synthesized sound, limited snooze (length, max count, optional lengthening), and a dismiss rite: tap, math, memory sequence, or typed phrase.
- Scenes enable a set of alarms. Weekday and Weekend ship as editable drafts, both off. Nothing rings until the user enables an alarm.
- A 24-hour day ribbon marks alarms, bedtime, wind-down, and running timer ends.
- Sleep: a goal plus a linked alarm or a manual wake time produces lights-out. Wind-down is a dim countdown. A streak counts nights the user started wind-down. No sleep stages.
- Several timers, labels, chains, and a nap guard that offers to finish 15 minutes before the next alarm.
- Stopwatch with laps and the last 10 named sessions.
- World clocks with a compare slider and a work-window overlap for 2–4 cities.
- Three faces (numeral, dial, ribbon) and at least four palettes, one for a dark room. 12/24-hour and seconds are global.
- Returning within two minutes of a target still rings. Later, the alarm is marked missed.
- First launch writes a disabled 7:00 weekday draft and pins the local zone. The first-run screen states the open-tab limit in one sentence.
- Quitting the browser will not ring. Esc and a stray click do not dismiss a ringing alarm.
- Atlas hop policy, manifests, and mock corpus stay untouched.

## Brand Commitments

The product name is Prelude. Voice is plain and specific. Do not clone Apple Clock’s black field, orange numerals, and equal tab bar.

## Evidence on Hand

No customer evidence, sleep data, or recorded ringtones. Sounds are synthesized. First-run copy must not invent sleep history. Demo alarms ship disabled.

## Product Principles

- A wake is an interval with an ending act, not a beep at a minute.
- One day is the shared instrument. Alarms, sleep, timers, and cities mark the same ribbon.
- Tell the truth about the browser. If it cannot ring, say so on the surface.
- Nothing fires until the user turns it on.
- Dismissal is intentional. Snooze is limited and visible.

## Accessibility & Inclusion

Ringing is announced in a live region. The rite is keyboard reachable. `prefers-reduced-motion` shortens the sunrise to a fade. Time controls and rite prompts stay text-first, including for math and sequence.
