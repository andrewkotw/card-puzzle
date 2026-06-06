# 乾坤大挪移 / Card Puzzle

A browser remake of an old solitaire-style card puzzle, inspired by **Calculation Solitaire**.

This project started from a colleague's memory of a card game he played around 30 years ago. He recreated the puzzle in Excel, and I rebuilt it as a small HTML/CSS/JavaScript web game with help from AI. The web UI is directly inspired by that Excel version: the spreadsheet layout gave the project its first structure, while the browser version modifies it with clearer card areas, stronger visual feedback, scoring, difficulty settings, undo, and a table-like interface that feels more like a real game.

The target audience is middle school students. The game is meant to be a short, focused brain-training activity: students practice number patterns, planning ahead, working memory, and decision-making under constraints while still feeling like they are playing a card game.

## A Short History

Calculation Solitaire belongs to the wider family of patience or solitaire card games: single-player games where the challenge comes from arranging a shuffled deck into a required order. It is commonly described as part of the old **Sir Tommy** family of patience games, a group where players must decide how to store cards temporarily before they can be played to the foundations.

The game is also known by several other names, including **Broken Intervals**, **Hopscotch**, and **Four Kings Solitaire**. Some references trace it to France, where it is known as **La Plus Belle**. Unlike the more famous Klondike Solitaire, Calculation is less about suits and colors and more about arithmetic sequences. That makes it a good fit for a classroom-friendly puzzle: the player has to keep track of four different counting patterns at the same time.

## About the Game

Calculation Solitaire is a one-deck solitaire game built around four foundation columns. Each column follows a different counting pattern:

- `+1`: A, 2, 3, 4, 5 ... K
- `+2`: 2, 4, 6, 8, 10 ... K
- `+3`: 3, 6, 9, Q, 2 ... K
- `+4`: 4, 8, Q, 3, 7 ... K

This version keeps that core idea and presents it as a rank-based puzzle. Cards can be placed into four temporary stacks, but only the top card of each stack can later be moved to a correct target column. Planning ahead matters: a bad temporary placement can trap the card you need.

## Learning Goals

For middle school learners, this game can support:

- Pattern recognition through repeated `+1`, `+2`, `+3`, and `+4` sequences
- Mental arithmetic with wraparound card ranks
- Strategic planning before placing a card into a temporary stack
- Working memory, because students must remember what each target column needs next
- Reflection after mistakes, especially when a trapped card blocks future moves

## Features

- Playable directly in the browser with no build step
- Four target columns based on `+1`, `+2`, `+3`, and `+4` sequences
- Four temporary stack columns for planning future moves
- Difficulty slider that controls how many rows are prefilled
- Shareable challenge codes for replaying the same shuffled puzzle
- Optional future-card hints
- Mistake reflection after invalid moves without revealing answers before students try
- Stuck detection when no legal moves remain
- Combo scoring for consecutive correct placements
- Penalties for temporary moves and undo
- Gentle sound and animation feedback, with a sound toggle for classroom use
- Clear feedback for invalid moves
- Responsive table-style UI modified from and inspired by the original Excel recreation

## How to Play

1. Look at the current card on the left.
2. Place it directly into a target column if it matches the next required rank.
3. If it cannot be played yet, place it into one of the four temporary stacks.
4. Move only the top card of a temporary stack into a target column when it becomes valid.
5. Complete all four target columns to finish the round.
6. Use `下一局` to continue with a harder round after clearing the board.

## Running Locally

Open `index.html` in a browser, or serve the folder with any simple static server.


## Project Structure

```text
.
├── index.html   # Game layout
├── style.css    # Visual design and responsive table UI
├── game.js      # Game state, rules, scoring, and interactions
└── README.md
```

## Notes

This is a personal recreation of a remembered game variant, not a strict archival implementation. The rules are inspired by Calculation Solitaire, while the UI, scoring system, prefilled rows, and hint options were added for a smoother web experience.

Useful rule references:

- [BVS Solitaire: Calculation Solitaire](https://www.bvssolitaire.com/rules/calculation.htm)
- [Solitaire Network: Calculation Solitaire Rules](https://www.solitairenetwork.com/solitaire/calculation-solitaire-game.html)
- [Wikipedia: Calculation (card game)](https://en.wikipedia.org/wiki/Calculation_(card_game))
