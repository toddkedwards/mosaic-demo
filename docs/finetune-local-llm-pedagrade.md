# Fine-tuning a local LLM for PedaGrade (welcome-back notes)

**Goal:** replace the hosted Claude call in `grade` mode (`src/ai.js`) with an
on-device model that scores a learner transcript against a rubric and returns
`{"pass": bool, "feedback": "..."}`. This is the "regulated/offline moat"
already flagged in the `ai.js` header comment.

Grading is a *narrow, structured* task — the ideal case for a small fine-tuned
model. You do **not** need a giant model or a GPU cluster.

---

## The big picture (why this is very doable)

- The task is constrained: read (rubric + transcript) → output one JSON object.
- A 3B–8B model, fine-tuned on a few hundred good examples, can match a big
  model on *this one job* while running locally.
- You fine-tune with **LoRA/QLoRA** (trains ~1% of weights) so it fits on a
  single consumer GPU or a rented cloud GPU for a few dollars.

---

## Step-by-step plan

### 1. Learn the concepts (½ day)
- **LoRA / QLoRA** — cheap fine-tuning that trains small adapter layers.
- **SFT (supervised fine-tuning)** — teach input→output pairs. This is all you need.
- **GGUF + quantization** — the format/compression that lets the model run on CPU/laptop.
- Read: Hugging Face "TRL" SFT docs, and the Unsloth quickstart notebooks.

### 2. Pick a base model
Good local candidates (instruction-tuned, permissive licenses):
- **Llama 3.1 8B Instruct** — strongest, needs ~6–8 GB quantized.
- **Qwen2.5 7B Instruct** — excellent at structured/JSON output.
- **Phi-3.5-mini (3.8B)** — smallest, runs on a laptop CPU; try this first.

Start small (Phi-3.5-mini). If quality is short, move up.

### 3. Build the dataset (the real work — 1–2 days)
This is 90% of the outcome. Aim for **300–800 examples**.

Each example = one JSON row:
```json
{
  "system": "<the rubric + grading instructions, same as ai.js sends>",
  "input":  "<the learner transcript>",
  "output": "{\"pass\": true, \"feedback\": \"...\"}"
}
```

How to source them cheaply:
1. **Bootstrap with Claude.** Run the existing hosted `grade` path over real/
   synthetic transcripts and save the outputs — this is your first draft dataset
   (distillation). This is the fastest start given the app already calls Claude.
2. **Human-correct** a subset — fix wrong pass/fail and rewrite weak feedback.
   Corrected examples are worth far more than raw ones.
3. **Cover the edges:** clear pass, clear fail, borderline, empty/nonsense input,
   the phishing scenario, generic difficult-conversation scenarios (mirror the
   cases already in `mockGrade`).
4. Split 80/10/10 → train / validation / test.

> Data quality beats data quantity and beats model size. Spend your time here.

### 4. Fine-tune (½ day, mostly waiting)
- Easiest path: **Unsloth** notebook (free Colab T4 works for 7–8B QLoRA), or
  **Axolotl** / **TRL `SFTTrainer`** if you want a config-file workflow.
- Train for 2–3 epochs, watch validation loss, stop when it flattens.
- Cost: free on Colab, or ~$2–10 on a rented A100/L4 for an afternoon.

### 5. Evaluate before trusting it
- On the held-out **test set**, measure:
  - **pass/fail accuracy** (agreement with the human label),
  - **valid-JSON rate** (must be ~100% — invalid JSON breaks the app),
  - spot-check feedback quality by hand.
- Compare against the current hosted-Claude output as your baseline.

### 6. Quantize + run locally
- Convert the merged model to **GGUF**, quantize to `Q4_K_M` (good size/quality balance).
- Serve with **Ollama** or **llama.cpp** — Ollama exposes an OpenAI-compatible
  local endpoint (`http://localhost:11434`).

### 7. Wire it into Mosaic
- In `src/ai.js`, `callClaude` is the only network surface. Add a
  `callLocal(opts)` that POSTs to the local endpoint with the same
  `system`/`messages` shape, and branch on a config flag
  (e.g. `MosaicConfig.localModelUrl`).
- Keep the JSON contract identical (`{pass, feedback}`) so `grade` parsing is
  unchanged. The `mockGrade` fallback stays as-is for the no-model case.

---

## Suggested first-week order
1. Day 1: read concepts + get Ollama running Phi-3.5-mini locally.
2. Day 2–3: build/curate 300 grading examples (bootstrap from Claude, then correct).
3. Day 4: QLoRA fine-tune in an Unsloth notebook.
4. Day 5: evaluate on test set; if good, quantize to GGUF and wire `callLocal` into `ai.js`.

## Tools cheat-sheet
| Need | Tool |
|------|------|
| Fine-tune (easy) | Unsloth, Axolotl, TRL `SFTTrainer` |
| Run locally | Ollama, llama.cpp |
| Format/quantize | GGUF, `llama.cpp` convert scripts |
| Dataset/experiment tracking | Hugging Face Hub, Weights & Biases |

## Gotchas
- **Enforce JSON.** Use the base model's chat template + few-shot in the system
  prompt; consider constrained/grammar decoding (llama.cpp GBNF) to guarantee
  valid JSON.
- **Rubric must be in the prompt at inference**, exactly like the hosted path —
  the model grades *against the given rubric*, it shouldn't memorize rubrics.
- **Privacy is the point:** once local, learner transcripts never leave the
  device — that's the regulated/offline moat.
