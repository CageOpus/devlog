+++
date = '2026-11-03T12:00:00+08:00'
draft = false
title = 'Devlog #1 — The Traffic Signs Regulations (Part I)'
description = "We introduced the traffic simulation algorithm in our previous post. After several months of development, we're happy to introduce the first prototype of CAGE's road model. In this post, we'll showcase the different road layouts and intersection configurations that CAGE supports."
milestone = 'M1'
tags = ['devlog', 'roads']
images = ['cover.webp']
coverDark = 'cover.dark.webp'
coverAlt = '十字路口的素描，斜俯視角，工程圖'
notByAI = true
+++

We introduced the traffic simulation algorithm in our previous post. After several months of development, we're happy to introduce the first prototype of CAGE's road model. In this post, we'll showcase the different road layouts and intersection configurations that CAGE supports.

The illustrations in this post are rendered from intermediate data produced during development. They are styled to match the look of the post. Let's start with an overview:

![intersection ovreview](overview.svg "yet another intersection")

## Intersection

Intersections are more complicated then corridors. Let's start with it.

### Channelization

A intersection is defined by a set of connected traffic movements. Players can customize the connections, and we'll fill the remaining areas with channelizing markings to guide traffic.

![槽化線](channelization.svg "A intersection with channelizing markings")


### Refuge Islands

We also place refuge islands where pedestrian crossings meet road medians. You can also place bus and tram stops on medians, with pedestrian crossings connecting them to the sidewalks.

![Refuge Islands](refuge.svg "A crossing with a refuge island")


### Turn Pockets

You can have a bay on a median or a pavement for turn pockets, just like the real world.

![Left-Rurn Pocket](pocket.svg "Left-Rurn Pocket")

### Bus Bays

You can also have bus bays along pavements or even on medians. Of course, you can use them for roadside parking or drop-off areas instead. Maybe we'll even have food trucks there someday 🚐🍦!

![Bus bay](busbay.svg "Yet another bus bay")

## Conclusion

We've built the foundation of our road system and are now working on verification and 3D modeling. We're also working on integrating it into gameplay, including interactive road construction and realistic traffic closures during roadworks.

More features such as road markings (arrows and stop lines), traffic signals, pedestrian overpasses, bridges, and tunnels, are also nearing completion. Stay tuned!
