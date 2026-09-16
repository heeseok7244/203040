# Smaller left-aligned lightbulb

Tool: built-in image_gen. Final image: public/map/Idea_campus.png.
Monument fits columns 4–5 and rows 5–6 (one-based); gameplay rules unchanged.

## Prompt

Precise local image edit. In this 1254x1254 map shrink and move the entire yellow lightbulb + blue book + stone pedestal LEFT into exactly the 2x2 tile block in columns 4 and 5, rows 5 and 6 (one-based). This block is bounded by x430..693 and y568..803. Center monument horizontally at x561 instead of current x627. Entire monument must fit with small margin within x450..673 and y582..791, including bulb top and pedestal edges. Preserve natural proportions, round bulb, same cute flat black-outline style, book and pedestal design; scale whole object down uniformly. Nothing should extend outside these four cells. Remove original large monument completely and restore exposed mint green tiles with faint paw prints behind old position, including row4 col5 and col6 rows5/6. Keep ALL other pixels and grid positions unchanged: 9x9 board, entrance, paths, borders, colors, corners. Do not move or resize canvas/grid. No new objects, no text. Output the edited square map only.
