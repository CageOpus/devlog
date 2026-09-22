+++
date = '2026-02-07T22:09:55+08:00'
draft = false
title = 'Devlog #0 -- Story Starts Here'
milestone = 'M0'
eyebrow = 'DEVLOG #0'
+++

## Not Enough Room

I have thousands of hours in city simulation games.

Every time I build past a certain scale, I start feeling the same thing — the
city hasn't grown into what I imagined, and it's already too full. Not because
the map is too small, but because the simulation itself has hit its ceiling.
Push the population a little further, and the system starts to struggle. More
often than not, I'd shrink my ambitions, restart on a smaller map, and accept
the performance limit as a given.

I could never quite make peace with that.

## More Than Traffic

Existing city sims do traffic remarkably well. With the right mods, you can
recreate almost any real-world road configuration — protected left-turn signals,
diverging diamond interchanges, the works. Transit options are plentiful too.

But residents behave like emotionless traffic machines. They drive, they ride
the metro, they sit in jams — but they won't move further out because rent is
too high, won't stay indoors because the air quality is bad, won't stop walking
a route because the environment has deteriorated around them. There's no real
life driving their decisions.

No matter how beautiful the city looks, it's just an elaborate traffic demo.

What I want is a city where every person has their own sense of things — a sense
of their environment, their cost of living, whether this place is worth staying
in. When you put all of that together, it should naturally reshape the city:
certain neighborhoods start to decay, things grow up in places nobody planned
for, the boundary between rich and poor slowly becomes visible on the map.

## A Young Engineer's Instinct

One day I had a dream. Someone in it told me to use the GPU to accelerate the
simulation.

Every moving object in a city is running the same logic. Check the space ahead.
Assess right-of-way. Apply acceleration. Move. This shouldn't be that hard. I
quickly built a CPU-side proof of concept to validate the idea, and the
algorithm ran smoothly. But things stalled there for a long time. Proper
software development is slow going, progress felt distant, and everything stayed
theoretical.

## The Turning Point

You might have guessed — I subscribed to Claude Code. It turned out to be a
genuinely good development partner. With clear requirements and a well-written
spec, things move fast. That meant I could make better use of my spare time,
because I wasn't getting ground down by tedious debugging — the most mentally
draining part of any project — and could focus on algorithm and system design
instead. After a short period of testing, I decided to commit to building CAGE.

## What Is CAGE

CAGE stands for City Architect: Golden Era. The story is set in 80s Taipei. I
didn't live through that era myself — the one people describe as gilded and
excessive — but as a game setting it's a natural fit. The walk-up apartments
that line almost every street in Taipei were built then. The MRT was being
planned. It's ready-made game material. Players take the role of a governing
authority, responsible not just for urban planning but for law, culture, and the
shape of daily life. The streetscape changes with how you govern. Manage things
poorly, and informal structures start appearing — buildings encroaching on
sidewalks, covered walkways taken over. Once that becomes the norm, tearing it
all down by force only breeds resentment. The results of your decisions show up
directly in what you see.

The detailed gameplay and visual direction are still in early discussion, but
the whole thing will be built around large-scale micro-simulation and a
<a href="https://en.wikipedia.org/wiki/Retrofuturism" target="_blank">
retrofuturist</a> aesthetic — simulating agent behavior and economic
decision-making as faithfully as possible.

## The Tech Stack

Unreal and Godot are reasonable choices, but I ruled them out quickly. The
reason is simple: running 1 million agents on the GPU means needing direct
control over the GPU compute pipeline. Off-the-shelf engines are built around
general-purpose rendering architectures, and that level of customization means
fighting the engine the whole way.

I went with Rust + wgpu. Rust's memory safety means a large codebase won't have
a time bomb hiding in some corner; wgpu is a low-level, cross-platform GPU API
that gives me direct control over the compute pipeline. Bevy handles game logic
organization as the ECS framework. There aren't many ready-made wheels to borrow
in this stack, but it gives me the control I need.

*Simulate Real, Parallel Real.*
