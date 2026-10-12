+++
date = '2026-02-07T22:09:55+08:00'
draft = false
title = '開發日誌 #0 -- 一切的起點'
milestone = 'M0'
eyebrow = 'DEVLOG #0'
tags = ['devlog', 'simulation', 'gpu', 'rust']
+++

<!--80 char a line
12345678901234567890123456789012345678901234567890123456789012345678901234567890
-->
這是一個再正常不過的 Friday night, 我乘坐著極度擁擠的捷運，跨越大半個台北回到家，繼續遊玩我的
都市建造遊戲。「如果能再蓋得更大一點就好了」，我想，但是我那有點上了年紀的電腦實在跑不動了。也許
就像現實的台北，也已經太滿了，沒有我的容身之處，所以我才得每天跨越一小時到那，再回到這城市邊緣。

我還能擠在城市邊緣，但我模擬遊戲的地圖就沒辦法了。

「<a target="_blank" title="不能說的秘密 - random blog on Xuite - Web Archive" href="https://web.archive.org/web/20230822205830/https://blog.xuite.net/apple.ae/twblog/124843334#:~:text=%E5%81%9A%E4%BA%BA%E8%A6%81%E8%A6%8F%E8%A6%8F%E7%9F%A9%E7%9F%A9%EF%BC%8C%E8%A6%81%E7%95%B6%E4%B8%80%E5%80%8B%E6%99%AE%E9%80%9A%E7%9A%84%E4%BA%BA">做人要規規矩矩，要當一個普通的人。</a>」
這聲音時常在腦中迴盪。但是，等等，如果多數時候，多數人都是普通人，那不就是 "<a href="https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html#warps-and-simt:~:text=all%20threads%20in%20the%20warp%20are%20executing%20the%20same%20kernel%20code">all threads in the warp are executing the same kernel code</a>" (<abbr title="如果你看不懂也沒關係，反正就是 GPU, 是 AI">SIMT</abbr>) 嘛！

於是我設計了簡單的算法，確定了這真的是可行的。

{{< embed src="https://www.youtube.com/embed/vPZxVOn6smY" title="概念驗證：高速公路合流" caption="早期開發畫面: 加速車道匯入測試" ratio="7 / 3" reveal="true" >}}

技術棧的部分，我們選用 [Bevy](https://bevy.org/), 一個年輕的 Rust ECS 遊戲框架。交通部分
則在 GPU 上使用 computer shader 全量模擬。也就是說無論你看不看得到，該計算的都會忠實計算。
這將會是一個 software engineer 視角所開發的模擬遊戲，我想模擬的真實度以及效能是值得期待的。

簡單講一下開發方向：
- Micro Simulation
- 1M moving agents -- 沒錯，就是一百萬在移動的市民。遠比 65535 來得多。目前測試下來 MacBook Air M2 (16G) 可以順跑 30 FPS, 而 3080ti 則可以跑 100+ FPS (模擬固定 15 ticks per second)
- 以台北早年的時空背景為基底打造的城市系統，讓玩家模擬在這個時空背景下能做的建設。大概是以經營為主，而不只是造景。
- 以台北步登公寓為場景主體。可能會長出<a href="https://zh.wikipedia.org/wiki/%E5%A4%A9%E5%8F%B0%E5%B1%8B" target="_blank">非正式建築</a>。
