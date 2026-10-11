+++
date = '2026-02-07T22:09:55+08:00'
draft = false
title = 'Devlog #0 -- Story Starts Here'
milestone = 'M0'
eyebrow = 'DEVLOG #0'
tags = ['devlog', 'simulation', 'gpu', 'rust']
+++

<!--80 char a line
12345678901234567890123456789012345678901234567890123456789012345678901234567890
-->
Yet another Friday night.

Squeezed into a packed metro train, heading home as it cut straight across the
entire city of Taipei, I finally got back to my room and booted up my city
builder.

"What if the city could expand just a little more?" -- a voice whispered in my
head. But my aging computer simply couldn't take it anymore. Perhaps it mirrors
the reality of Taipei -- a city with no room left for me, forcing me to commute 
like this, spending hours each day traveling into the city and heading back to 
its edge.

I am lucky enough to be able to stay close to Taipei. My cims, however, aren't
so lucky. They don't even get the chance to come to life.

"<a href="https://web.archive.org/web/20230822205830/https://blog.xuite.net/apple.ae/twblog/124843334#:~:text=%E5%81%9A%E4%BA%BA%E8%A6%81%E8%A6%8F%E8%A6%8F%E7%9F%A9%E7%9F%A9%EF%BC%8C%E8%A6%81%E7%95%B6%E4%B8%80%E5%80%8B%E6%99%AE%E9%80%9A%E7%9A%84%E4%BA%BA" target="_blank">Be upright, follow the rules, and just be an ordinary person.</a>"

That voice often echoes in the back of my head. But wait, if most people are
doing ordinary things most of the time, isn't that just 
"<a href="https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html#warps-and-simt:~:text=all%20threads%20in%20the%20warp%20are%20executing%20the%20same%20kernel%20code">all threads in the warp are executing the same kernel code</a>" (<abbr title="GPU stuff, AI, whatever">SIMT</abbr>)?

So I sketched out a simple algorithm, and it just works.

{{< embed src="https://www.youtube.com/embed/vPZxVOn6smY" title="Proof of Concept: Highway Merge Simulation" caption="Captured during early prototyping." ratio="7 / 3" reveal="true" >}}

A quick look at the development roadmap:

- Micro Simulation
- 1M moving agents -- Yes, a full million citizens on the move. Far beyond the 
  classic 65,535 limit. Current benchmarks show it runs smoothly at 30 FPS on 
  a MacBook Air M2 (16GB), and easily pushes 100+ FPS on an RTX 3080 Ti (with
  the simulation locked at 15 ticks per second).
- Based on early Taipei's historical setting, challenging players to navigate
  the urban developments of that era. Focused heavily on management and
  simulation systems, rather than just aesthetics and catering to cosmetic
  vanity projects.
- Centered around Taipei's iconic walk-up apartments (bu-deng
  apartments), complete with <a href="https://en.wikipedia.org/wiki/Rooftop_structure" target="_blank">informal rooftop additions</a> that sprout up organically over time.
