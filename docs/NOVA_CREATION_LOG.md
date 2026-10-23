# Nova Creation Log

Notes for the "Nova creation" video series. Plain language, dated entries, newest step at the bottom.
Dates come from the project's git history and pull requests.

---

## The goal

Nova is the creator's own tiny AI. It lives on an iPhone and runs inside Safari as a Home Screen web app.

- **It runs on the phone.** No data centers and no cloud model. Chat, memory, and learning stay on the device.
- **It is small on purpose.** No giant, water-hungry training runs. Nova learns a little at a time from the person talking to it.
- **It is honest.** When Nova doesn't know something, it says "i do not know." and lets you teach it. It doesn't invent an answer.
- **Nothing harmful.** It's a personal helper and a learning lab, not a copy of the big chatbots.

How Nova answers, in order: math first, then the creator's own word meanings, then taught lessons, and only after that the tiny neural "brain". If none of those has an answer, it admits it.

---

## 2026-09-06 — Starting from scratch

- **The scratch trainer.** A small Python trainer (in `scratch/`) builds a model from random weights using only the creator's own text. It doesn't download anyone else's model. This is the "purist" path: the model grows only from what you feed it.
- **The first phone brains.** The same day, early versions of the in-browser trainer went onto the phone (versions 4 to 6). They learned from chat lessons, could read pasted text with `read ...`, saved the brain to on-device storage, and moved training around until iPhone Safari actually counted training steps.

## 2026-09-07 — The v7 GRU brain

- Nova got a new brain: a small **GRU** neural network (64 hidden units) that guesses text one letter at a time.
- The brain can be exported as a file through the iPhone share sheet.
- An important choice: when Nova has no lesson for a question, it says **"i do not know"** instead of letting the brain babble.

## 2026-09-08 to 2026-09-09 — Rules first, a frozen base, on-device math

- **Frozen base brain.** The untrained starting point, `nova-v7-0` (step 0), was locked on 2026-09-08. Training happens on copies, so there's always a clean place to start over from.
- **Rule-first replies.** Exact lessons answer first, the brain comes later, and "i do not know" is the fallback.
- **Calculator on the phone.** Plain arithmetic, chains, powers, roots, and percents ("what is 25% of 200") are worked out by code on the device, with no model involved.
- **The creator's own word meanings.** `WORD means ...`, `edit WORD as ...`, and `lock WORD as ...` (a locked meaning can't be overwritten by accident). `my WORD` shows the creator's own meaning.
- **Ask, then learn.** "what is X" with no saved meaning gets "i do not know X. what do you mean by it?" and the next line teaches it.

## 2026-09-15 — Learning while talking, and teach-on-correction

Five pull requests (#1 to #5) landed together:

- **Learn while talking.** `start learning` turns learning on, so each chat turn becomes a small training lesson for the v7 brain. `stop learning` freezes the weights. Learning is off by default.
- **Teach on correction.** After "i do not know", whatever you type next becomes the answer for that question. You can also say `say ...` or `the answer is ...`, or just reply "no".
- **The Skip chip.** A Skip button (or typing `skip`) cancels a pending teach, so a stray line doesn't get saved as an answer.

Shortly after (2026-09-17 to 2026-09-20), yes/no questions ("can you swim?") started getting "yes or no?" so the creator's yes or no becomes the saved answer.

## 2026-09-28 — Three fixes (versions 38 to 40)

- **v38: Locked meanings win.** If you lock a word, "what is WORD" now gives your locked meaning even when an older lesson said something else, and locking clears those stale "what is" lessons. (PR #6)
- **v39: `when i say A say B` overwrites.** Teaching a new answer for the same question replaces the old one instead of being outvoted by it. (PR #9)
- **v40: No more false matches on how/what/why questions.** "How do you live?" used to grab the canned "do you live" answer. Short question keys no longer match inside longer how/what/why questions, so Nova honestly says it doesn't know and you can teach it. (PR #10)

## 2026-10-02 — v41: Replying from the brain, with strict gates

- When the rules and lessons have no answer, Nova now lets the v7 brain try a short reply. It seeds the brain with the last few taught lessons plus the current line.
- **Strict gates.** The guess is thrown away if it looks like gibberish, contains digits or letter soup, uses words the brain was never shown, is an "i do not know", or looks like a command. Then Nova falls back to an honest "i do not know." and the teach slot opens. (PR #11)
- An exact taught question still returns exactly the taught answer.

## 2026-10-08 — v42: First math reasoning (word problems)

Nova can now work through simple story problems, all on the phone, with no model and no internet. It's plain rules written in JavaScript (`web/word-math.js`), and it runs right after the regular calculator.

**What it does**

1. **Finds the numbers.** Digits and number words: "four", "twenty-one", "a dozen", "half a dozen", and "ate a cookie" counts as 1.
2. **Reads the action words and turns them into math.**
   - *Take away:* took, ate, lost, gave away, gave (from the person who has them), spent, broke, sold, used, dropped, and "2 were eaten".
   - *Add:* got, found, bought, was given, received, picked, collected, won, made, and "Mary gives him 3" (added to the person who has them).
   - *Multiply:* "3 bags with 4 apples each", "4 apples in each of 3 bags", "3 groups of 5", or "Jon has 3 bags. Each bag has 6 marbles."
   - *Divide:* "shared equally", "split", or "divided" among, between, or into a number of people or groups. A name list counts too ("between Jon and Sue" is 2), and leftovers are reported.
3. **Keeps score.** Nova tracks each person, what they're holding, and how many. "He", "she", and "they" point to the last person named, so a follow-up like "how many does he have now?" works. This memory only lasts for the session, about 15 minutes after the last problem.
4. **Answers in a plain sentence**, with simple plurals: "Jon has 2 cookies left." / "Jon has 7 cookies now." / "Each friend gets 4 candies."

**Staying honest and safe**

- If Nova can't read a line confidently, the solver steps aside and everything works exactly as before.
- Questions it doesn't handle yet ("how many did Mary take?", "how many legs does a spider have?") still get "i do not know."
- If the story doesn't add up (eating 5 cookies when you only have 2), Nova says so instead of answering with a negative number.
- Yes/no questions, "what is WORD", teaching, owner commands, and percent math all behave the same as in v41.
- Solved answers aren't saved as lessons, so an old answer can't come back later out of context.

**The test examples** (run automatically with `node --test tests/`)

| You say | Nova says |
|---|---|
| If Jon has 4 cookies then Mary took 2, how many are left? | Jon has 2 cookies left. |
| Jon has 4 cookies and Mary gives him 3, how many now? | Jon has 7 cookies now. |
| He ate 1. How many does he have now? | Jon has 6 cookies now. |
| Sam has 3 bags with 4 apples each. How many apples does he have? | Sam has 12 apples. |
| 12 candies shared equally among 3 friends. How many does each friend get? | Each friend gets 4 candies. |
| 13 cookies split between 2 kids | Each kid gets 6 cookies. 1 cookie is left over. |
| Jon has four cookies and ate one. How many are left? | Jon has 3 cookies left. |
| Jon has 2 cookies and ate 5, how many left? | Jon only had 2 cookies. that does not add up. |
| how are you | i am here. (normal reply, not math) |
| how many legs does a spider have | i do not know. |

All 41 tests pass: the 10 new word-problem tests plus every earlier test for teaching, owner commands, and math.

**What's next**

- **Comparisons:** "how many more does Mary have than Jon?"
- **If-then chains:** longer stories where one step depends on another.
- **Time and money:** minutes and hours, dollars and cents, and making change.

---

## 2026-10-13 — v43: the new-word index ("building blocks")

**What it does**

Nova now quietly keeps a list of every word you use that it doesn't know yet. For each word it remembers how many times you've said it, when it first and last heard it, and up to three of your sentences where it came up. It does *not* guess what the words mean. It just keeps them, like a pile of building blocks waiting to be labelled.

**Why**

This was the creator's own idea. A tiny AI can't learn everything at once, but it can notice what it's missing. Keeping the list means Nova knows *which* words matter most to the person talking to it, while staying honest: it still says "i do not know" instead of making something up.

**How it works**

- Every line you send is split into words.
- A word counts as "known" if Nova has seen it in its base text, its built-in replies, your lessons, your saved meanings, things you've had it read, or a short list of everyday words like "the" and "is".
- Numbers, number words, single letters, web links, very long tokens, command words, and "skip" lines are ignored.
- Anything left over goes on the list. When you teach Nova a word (by answering "what does it mean", "lock", "edit", "means", or "when i say"), it drops off the list.
- The list never changes what Nova replies. Everything else works exactly as in v42.

**The commands**

| You say | Nova does |
|---|---|
| what words don't you know / new words | Lists up to 10 unknown words by count, e.g. "words i do not know yet: reactor (3), zorp (1)..." |
| teach me new words / ask me a word | Asks about your most-used one: 'you have said "reactor" 3 times. what does reactor mean?' Your next line saves the meaning. "skip" cancels. |
| forget new words | Clears the list. |

Nova only asks when you tell it to. No nagging.

**Tests**

All 50 tests pass (`node --test tests/`): the 41 earlier ones plus 9 new ones. The new ones check counting and example sentences, the words that must be skipped, the list, ask and forget commands, skip, every way of teaching a word, and that replies come out exactly the same with the list on or off.

**Demo clip:** `/workspace/nova-demo/v43_demo.mp4`

**What's next**

- Optional gentle prompts, where Nova might offer once in a while to learn your top word (only if the creator wants that).
- Sharing the list and lessons between the Jarvis app and Nova, since each Home Screen app keeps its own memory right now.

- **2026-10-14 · Jarvis safety test.** Nova now has a test that boots it the way the Jarvis app does and checks that it still answers ("what is 25% of 200" gives "50.") and still learns, so a Nova update can't quietly break Jarvis.

---

## 2026-10-17 — v44: offline dictionary

**What it does**

When you ask about a word Nova has no meaning for, it now looks the word up in a dictionary stored with the app and says so plainly: *"dictionary says: river (noun): a large natural stream of water (larger than a creek). want me to remember it?"* Say **yes** and it saves that as your meaning. Say **no** or **skip** and nothing is saved.

**Why**

The creator approved it. Nova only knew words it had been taught. Now it can tell you what a dictionary says, without ever pretending the meaning is its own knowledge, and you decide whether it keeps it.

**How it works**

- The dictionary is Princeton WordNet 3.0 (free, WordNet license, credited in the README and `web/dict/LICENSE-WordNet.txt`), cut down to the first one or two meanings of each word plus its part of speech.
- It's about 151,000 words in 550 small files, split by the first two letters (13.6 MB total, the biggest file under 0.5 MB). Nova loads only the one file it needs, when it needs it.
- The phone keeps every file it has used, so those words work offline. **download dictionary** keeps all of them.
- Order: math, word problems, your locked and saved meanings, your lessons, then the dictionary, then the old "i do not know X. what do you mean by it?" plus Skip when the dictionary has nothing.
- Simple plurals work ("cats" finds cat, "mice" finds mouse). **what else** gives the second meaning.
- **teach me new words** now offers the dictionary meaning of your most-used unknown word for a yes or no.
- After **stop learning**, Nova still looks words up but doesn't offer to save. **start learning** turns the offer back on.
- Dictionary replies are never stored as lessons.

**Tests**

All 65 tests pass (`node --test tests/`): the 52 earlier ones, including the Jarvis safety test, plus 13 new ones. The new ones cover yes, no and skip, every way of asking, facts beating the dictionary, the fallback when a word isn't there or the files can't load, stop learning, no dictionary lessons, the new-word offer, loading one file at a time, and file sizes and the license.

**Demo clip:** `/workspace/nova-demo/v44_demo.mp4`

**What's next**

- Optional: Nova could offer the dictionary meaning on its own for words it keeps hearing (part of the self-learning plan).

- **2026-10-17 · v45: math misses (minor).** When a line looks like a math word problem (a number plus words like "how many", "left", "each" or "percent") and neither Nova's plain math nor its word-problem solver can answer it, Nova notes the line on the phone. **math misses** (or **what math couldn't you do**) lists the last 10, newest first, with a count. **clear math misses** empties the list. Replies don't change, Nova never edits its own solver, and nothing is noted after **stop learning** until **start learning**. Answers typed after "i do not know" and teach commands with numbers in them are not noted. A new test makes 4,000 problems with known answers from a fixed seed (adding, taking away, too-many-taken, groups of, sharing equally, leftovers, percent, plain math) and checks the solvers. All 4,000 pass. It also found two solver bugs, now marked as to-do tests to fix later: cents are ignored in money ("5 dollars minus 2 dollars 50 cents" gives 3 dollars), and "1 eggs" prints as "eggses". All 83 tests run: 81 pass, the 2 bug tests are to-do, and none fail, including the Jarvis safety test.

- **2026-10-19 · v46: a new question isn't saved as an answer (fix).** After "i do not know" or "yes or no?", Nova used to save almost any next line as the answer. That included a new question like "if all cats are animals and tom is a cat, is tom an animal". Now a line that is itself a question takes over the open slot instead of being saved, and it gets answered normally. A line counts as a question if it starts with a question word or helper word (what, why, how, can, is, do, should…), contains a "?", starts with "so/ok/and" followed by "should I / can you…", or has a question part after a comma. A plain next line still teaches, a line starting with yes or no still counts as an answer, and "skip" still cancels. Found in the Jarvis question run.

- **2026-10-19 · v47: "what is my …" reads what you saved (fix).** "remember my favorite color is blue" saved the memory, but "what is my favorite color" still answered "i do not know my favorite color". Now any "what is my X", "what's my X" or "tell me my X" checks your saved memories first ("your favorite color is blue."), then your own meanings ("my WORD", "WORD means …"), then anything you taught for "my X". Only after that does it go to the dictionary or the "what do you mean by it?" prompt. Found in the Jarvis question run.
