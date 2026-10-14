+++
date = '2026-10-02T12:00:00+08:00'
draft = false
title = 'The CAGE Highway Code — A Million in Parallel'
description = 'A GPU accelerated traffic simulation system'
milestone = 'M0'
tags = ['devlog', 'simulation', 'gpu']
+++

This article explains our general traffic mechanism, which allows us to maintain
smooth rendering while simulating at a rate of 15 simulation ticks per second. The implementation is quite complex, so we've made some
presentations to illustrate it.

## Requests and coordination

{{< anim name="request" title="One tick: request, sort, coordinate" caption="Where a proposal goes in one tick" zoomable="true" >}}

## Junctions

{{< anim name="junction" title="At a junction: all or nothing" caption="A turn requests its whole span at once" zoomable="true" >}}


## Lane changes

{{< anim name="lanechange" title="Changing lanes: probe, then commit" caption="Both lanes approved in the same tick, or no move" zoomable="true" >}}

## Afterword
The traffic simulation establishes the source of truth for the world
simulation, and pedestrians also follow these rules. However, we may moderately
adjust whether pedestrians need strict box junction ranges like cars, or have
them use collision-free movement and later introduce a social force model
within camera view. This keeps the simulation core streamlined while making the
visual effects more realistic. However, this will only affect visual
presentation, not the simulation logic. In other words, areas outside the
camera's view will maintain the exact same simulation logic. This is crucial: because
traffic affects the real economy, consistent computational performance
is required during multiplayer sessions, and our model achieves this
exceptionally well.
