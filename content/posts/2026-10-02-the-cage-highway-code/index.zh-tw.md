+++
date = '2026-10-02T12:00:00+08:00'
draft = false
title = 'CAGE 道路使用規則：一種基於道路空間協調之百萬實例級平行交通模擬系統'
description = 'A GPU accelerated traffic simulation system'
milestone = 'M0'
tags = ['devlog', 'simulation', 'gpu']
+++

<!--
12345678901234567890123456789012345678901234567890123456789012345678901234567890
-->
這篇文章講解了我們大略的 traffic 機制，使得我們可以在每秒 15 ticks 模擬幀的情況下，仍然維持流
暢的渲染。實作比較複雜，所以我們製作了動畫跟簡報來說明。

## 個人請求與中央協調

{{< anim name="request" title="One tick: request, sort, coordinate" caption="一個 tick 裡，提案走過的路" zoomable="true" >}}

## 路口

{{< anim name="junction" title="At a junction: all or nothing" caption="轉彎一次就要整段淨空區" zoomable="true" >}}


## 換道

{{< anim name="lanechange" title="Changing lanes: probe, then commit" caption="兩條車道同一個 tick 都核准，才動" zoomable="true" >}}


## 後記
<!--
12345678901234567890123456789012345678901234567890123456789012345678901234567890
-->
Traffic 模擬訂定了世界模擬的 source of truth, 行人也遵循這個規則。但我們可能會適度的調整行
人是否也需要像是車子這樣嚴格的 box junction 範圍，或是在行人使用無碰撞，並在後續導入視野範圍
內的社交力模型，使得模擬核心精簡的情況下，視覺效果更為真實。但是這只會影響視覺效果，不影響模擬。
也就是說，無論有沒有被鏡頭看到的地方都會保持著相同的模擬邏輯。這是很重要的：因為交通會影響真實經
濟，多人連線時也需要有相同的計算性能，而我們的模型可以很好的做到這一點。