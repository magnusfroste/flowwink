---
title: "Models — Selection, Dimensions, and Tradeoffs"
description: "OpenRouter as aggregator, open-source vs closed-source, local LLMs vs cloud-based — the dimensions that matter when choosing models for your agentic system."
order: 6.5
icon: "cpu"
---

# Models — Selection, Dimensions, and Tradeoffs

> **This chapter provides the framework for thinking about model selection. It is not a recommendation for specific models — that would be outdated by the time you read this. It is a set of questions you should ask about any model you consider.**

---

## The Starting Point: Claude Code and Beyond

OpenClaw began with Claude Code as its default model. This was a pragmatic choice: Claude was the best coding model, and the integration was tight. But Peter Steinberger designed OpenClaw to be model-agnostic from the start. The agent is the orchestration layer; the model is the reasoning engine that can be swapped.

This chapter expands on that design decision. When you can choose any model, you need a framework for choosing well.

---

## Why You Cannot Blindly Trust Cloud Models

Before discussing model options, one critical principle: **you cannot trust cloud models with sensitive data.**

This is not paranoia. It is a fundamental architectural concern:

- You send your data to a provider API
- You do not know how that data is processed
- You do not know where it is stored
- You do not know if it is used for training
- You do not know who has access to it
- Even if the model gives great responses, you have no audit path

The model provider may have excellent security. Their responses may be accurate. But you have no visibility into their processing pipeline. For healthcare data (HIPAA), financial data (SOX, GDPR), legal data, or any data covered by regulation — this is a compliance problem.

**The only way to have 100% certainty about data handling is to keep it within your security perimeter.**

This principle drives everything that follows. The question is not "which model is smartest?" The question is "where can I run this model while keeping my data secure?"

---

## Model Aggregators and Proxies

Most agentic tools today tie directly to one provider. OpenClaw ties to Anthropic's API. Claude Code is native to Claude. But there is another pattern: **use an aggregator**.

### OpenRouter

**OpenRouter** provides a unified API across 100+ models:

| Provider | Models | Type |
|---------|--------|------|
| Anthropic | Claude 3.5/3.7 | Closed-source |
| OpenAI | GPT-4o, o1 | Closed-source |
| Google | Gemini 2.0 | Closed-source |
| Meta | Llama 3.1, 3.3 | Open-weight |
| Mistral | Mixtral, Codestral | Open-weight |
| DeepSeek | DeepSeek Chat | Open-weight |
| Qwen | Qwen 2.5 | Open-weight |
| Google | Gemma 2 | Open-weight |

The aggregator pattern gives you:
- **Single API key** for many models
- **Fallback routing** — if one model fails, try another
- **Price optimization** — route cheaper for simpler tasks
- **Experimentation** — easy A/B testing between models

SiliconSoap uses this pattern. Flowwink uses this pattern. Both found that the aggregator is easier to operate than managing multiple provider relationships.

### What Aggregators Do Not Solve

An aggregator solves the **how do I access multiple models?** problem. It does **not** solve the **can I trust this model with my data?** problem.

When you use OpenRouter:
- Your data still goes to OpenRouter's servers
- OpenRouter forwards it to the underlying provider
- Neither entity is in your security perimeter
- You have no audit path

The aggregator value is convenience. The trust value is still dependent on the underlying provider.

---

## The Trust Spectrum

Think of model deployment on a trust spectrum:

```
High Trust ←──────────────────────────────────────→ Low Trust
    │                                              │
    │                                              │
Your GPU          Partner GPU          Cloud API     Unknown
in your rack     on-prem             (Anthropic)    (random API)
    │                                              │
    │                                              │
100% data        Shared trust       Provider       No visibility
control          boundary          manages it     into processing
```

| Deployment | Data Control | Compliance | Capability |
|------------|--------------|------------|------------|
| **Your GPU on-prem** | 100% | Full | Varies |
| **Trusted partner on-prem** | Shared | Full | High |
| **Cloud API (major provider)** | None | Provider's | Highest |
| **Random API** | None | Unknown | Unknown |

Every serious deployment for sensitive data eventually moves toward the left side of this spectrum. The question is how quickly compliance requirements force you there.

---

## Self-Hosted Local LLMs

When trust matters, you need to run models yourself. There are now mature tools for this:

### Tool Landscape

| Tool | What it does | Best for |
|------|-------------|---------|
| **Ollama** | Simple model serving, easy install | Beginners, single model |
| **LM Studio** | GUI for model management, chat interface | Exploring models locally |
| **llama.cpp** | Pure inference engine, no GPU needed | CPU-only, low resource |
| **vLLM** | High-performance inference, PagedAttention | Production serving |
| **SGLang** | Fast inference, radical parallelism | High-throughput workloads |
| **TRT-LLM (NVIDIA)** | TensorRT optimization, GPU acceleration | NVIDIA hardware, maximum performance |
| **Docker (AI)** | Containerized model serving | Kubernetes integration |

### Ollama

The easiest way to start:

```
curl -fsSL https://ollama.com/install | sh
ollama run llama3.1
```

- Downloads models automatically
- Simple CLI and API
- Good for prototyping
- Not optimized for production throughput

### vLLM

For production serving:

```
pip install vllm
vllm serve meta-llama/Llama-3.1-70B-Instruct
```

- PagedAttention for memory efficiency
- Continuous batching
- OpenAI-compatible API
- Production-ready

### SGLang

For maximum throughput:

```
pip install sglang
python -m sglang.launch_server --model meta-llama/Llama-3.1-70B-Instruct
```

- Radical parallelism
- RadixAttention for long context
- Faster than vLLM in many benchmarks

### TRT-LLM (NVIDIA)

For NVIDIA hardware maximum performance:

```
# Build engine
trtllm-build --model_dir ./llama-3.1-70b --engine_dir ./engine
# Serve
trtllm-run --engine_dir ./engine
```

- TensorRT optimization
- FP8 quantization support
- Best-in-class throughput on NVIDIA A100/H100
- Requires NVIDIA ecosystem

### Docker (AI)

For containerized deployments:

```
docker run -v ./models:/models ghcr.io/ggerganov/llama.cpp:latest
```

- Kubernetes-native
- Portable across environments
- Standard tooling

---

## Tokenomics: Buy vs Rent

This is the traditional infrastructure question: **own vs rent**, applied to AI inference.

### The Rental Model (Cloud API)

```
Cost = Tokens × Price per token
Example: 100K tokens/day × $0.01/1K = $1/day
Example: 100K tokens/day × $0.15/1K = $15/day (Claude)
```

What you pay:
- Zero upfront
- Pay for what you use
- No maintenance
- Provider handles upgrades

What you don't control:
- Per-token costs scale with usage
- Agentic systems consume a LOT of tokens
- 6-8 iterations × memory injection × reasoning = high token count
- No data privacy

### The Buy Model (Own Infrastructure)

```
Example: NVIDIA A100 (80GB) = ~$15,000
Example: Server + networking = ~$2,000
Example: Electricity/year = ~$3,000
─────────────────────────────────
Total year 1 = ~$20,000
Token capacity = unlimited
```

What you pay:
- Upfront capital cost
- Fixed operating cost
- You own the hardware

What you get:
- Unlimited tokens
- Full data privacy
- Compliance certainty

### The Break-Even Calculation

```
Cloud cost: $X per 1M tokens
Your infrastructure: $Y per year

Break-even: $Y / $X tokens = tokens per year to hit break-even
```

For Claude-level pricing (~$15/1M input):
- $20,000 infrastructure = 1.3B tokens/year break-even
- 100K tokens/day = 36.5M tokens/year = ~$550/year cloud

For high-volume agents (Llama-level pricing ~$1/1M):
- $20,000 infrastructure = 20B tokens/year break-even
- This is impractical for most

**The calculus changes when you factor in:**
- **Data privacy value** — compliance fines or data breach costs
- **Compliance value** — avoiding regulation issues
- **Custom fine-tuning** — amortizing investment across many uses
- **Latency value** — faster response, happier users

---

## ROI Perspective: Why Agents Change the Math

Traditional chatbot: 1 question, 1 response, ~1K tokens
Agentic system: 6-8 iterations, memory injection, tool calls, ReAct loops

```
Traditional Chat:          500 tokens/request
Agentic Loop:         5,000-20,000 tokens/request (10-40x)
Daily Usage:          100 requests = 50K tokens vs 2M tokens
Monthly:            1.5M tokens vs 60M tokens
Monthly Cloud Cost:    ~$15 vs ~$900 (Claude pricing)
```

Agents are not chatbots. They consume an order of magnitude more tokens. This fundamentally changes the buy vs rent equation:

- **Low usage** (< 10K tokens/day): Cloud API wins on convenience
- **High usage** (> 500K tokens/day): Own infrastructure wins on cost
- **Sensitive data**: Own infrastructure wins on compliance
- **Combined** (high usage + sensitive data): Own infrastructure wins decisively

---

## Compliance and Security Perspective

For regulated industries, the choice is not economic. It is mandatory:

### Healthcare (HIPAA)

- PHI (Protected Health Information) must stay in your security perimeter
- Business Associate Agreements with providers are complex
- Audit requirements need logging you cannot get from cloud APIs

### Financial (SOX, GDPR, PCI)

- Customer financial data has strict handling requirements
- Data residency laws (GDPR = EU data in EU)
- Audit trail requirements

### Legal

- Attorney-client privilege requires data control
- You are responsible for how you handle client data
- Cloud API = no defensible position

### Government

- Classified data cannot leave secure networks
- FedRAMP requirements for cloud providers
- On-prem is often the only option

**For any of these: you must run locally or with a trusted partner.**

---

## The Partner Option: autoversio.ai

Clawable's partner [autoversio.ai](https://www.autoversio.ai) helps businesses with on-prem private AI:

- **Inference within your security perimeter** — your data never leaves
- **GPU infrastructure** — dedicated or shared
- **Compliance-ready** — audit paths, data residency, BPA support
- **Managed or co-managed** — your operational capacity

The choice is not binary between "cloud API" and "build yourself":

| Option | Data Control | Effort | Capability |
|--------|-------------|--------|------------|
| Cloud API | None | Zero | Highest |
| Partner on-prem | Shared | Low | High |
| Own on-prem | Full | High | Varies |

Either you have inference within your security perimeter, or you outsource it to a trusted partner. But you do not send sensitive data from any agent into an unknown provider.

---

## The First Distinction: Open-Source vs Closed-Source

This is the divide that matters most today:

### Closed-Source (API-only)

| Pros | Cons |
|------|------|
| Frontier capability — GPT-4o, Claude 3.7 are the smartest | Vendor lock-in — you don't own the model |
| Managed infrastructure — no hosting burden | Cost per token — scales with usage |
| Fast iteration — new releases automatically | Data leaves your infrastructure |
| Reliability — SLAs, uptime guarantees | Availability risk — API can go down or change |

### Open-Weight (Self-hostable)

| Pros | Cons |
|------|------|
| Full control — you own the stack | Operational burden — you host it |
| No per token cost — one GPU serves unlimited use | Slower iteration — you upgrade manually |
| Data stays local — nothing leaves your infrastructure | Capability gap — generally below frontier |
| Custom fine-tuning — adapt to your domain | Hardware cost — GPU investment required |

**The tradeoff** is not one-dimensional. It depends on:
- **Data sensitivity**: Healthcare, legal, finance → open-weight keeps data local
- **Volume**: High volume → open-weight becomes cheaper
- **Capability needs**: Frontier reasoning → closed-source
- **Regulatory**: Compliance requirements → self-hosted

Most real-world systems use both. Simple tasks go to open-weight models. Complex reasoning goes to frontier models.

---

## Local LLMs vs Cloud-Based

The open-weight vs closed-source distinction maps to a deployment distinction:

### Cloud-Based (API)

```
Your Agent → Internet → Provider API → Response
```

- Latency: 500ms-3s typical
- Availability: 99.9%+ typically
- Cost: Per-token metered
- Examples: Anthropic, OpenAI, Google APIs

### Local (Self-hosted)

```
Your Agent → Local Process → Model → Response
```

- Latency: 50ms-500ms (much faster)
- Availability: Depends on your infrastructure
- Cost: Fixed hardware + electricity
- Examples: Ollama, LM Studio, vLLM, llama.cpp

**The latency difference matters for agentic systems.** When your agent loops 6-8 times per operation, 500ms vs 50ms adds up. A 6-iteration ReAct loop that takes 3s in the cloud takes 300ms locally. That changes the user experience from "slow" to "responsive."

SiliconSoap demonstrates this: models run locally via Ollama for fast debate rounds. Flowwink uses cloud APIs for complex reasoning but could route to local for simple FAQ responses.

---

## The Model Dimensions

When evaluating any model, assess it across these dimensions:

### 1. Context Window

```
Model           Context Window
─────────────────────────────
GPT-4o          128K tokens
Claude 3.7      200K tokens
Llama 3.1       128K tokens
DeepSeek Chat   64K tokens
Qwen 2.5        32K-128K (varies)
Gemma 2         8K-32K (varies)
```

**Why it matters**: Agentic systems inject memory, skills, and conversation history into the context. If your window is too small, you can't load enough context to be useful.

**Rule of thumb**: You need at least 32K context for any serious agentic work. 128K+ is where agentic systems thrive.

### 2. Reasoning Capability

This is hard to measure directly. Look at:
- **Benchmarks**: MMLU, HumanEval, GPQA — but these are artificial
- **Real-world signals**: How does the model perform on tasks similar to yours?
- **Chain-of-thought**: Does it show its reasoning or go straight to answers?

There is still a gap between benchmark performance and real-world agentic performance. The best benchmark scorer is not always the best coding agent.

### 3. Tool Use / Function Calling

Not all models support tool use equally well:

| Model | Tool Support | Notes |
|-------|-------------|-------|
| Claude 3.7 | Native | Best-in-class tool definitions |
| GPT-4o | Native | OpenAI function calling |
| Llama 3.1 | Limited | Requires fine-tuning or RLHF |
| DeepSeek | Good | Competitive with frontier |

If your agent needs to call tools — and every agentic system does — this dimension is critical.

### 4. Speed / Throughput

```
Throughput (tokens/sec)     Cloud        Local
─────────────────────────────────────────
Fast generation           100+         50-200+
Typical                   40-80        20-50
Slow                      <40          <20
```

**Cloud**: Depends on provider and model
**Local**: Depends on GPU (A100 vs consumer card) and quantization (Q4 vs Q8)

### 5. Pricing (Cloud Models)

Prices change frequently. Check OpenRouter for current rates:

```
$ per 1M tokens (input / output)
─────────────────────────────────
Claude 3.7:     $15 / $75
GPT-4o:         $10 / $30
Llama 3.1:       ~$1 (varies by provider)
DeepSeek:        ~$0.5 (varies by provider)
```

For high-volume agents, the price differential matters. A 100K token/day agent costs $10/day with Llama or $250/day with Claude. At scale, that difference is real.

### 6. License Type

This is the dimension most people overlook:

| License | What you can do | Examples |
|---------|-----------------|---------|
| **Proprietary** | Use API only, no modification | Claude, GPT |
| **Llama License** | Commercial use with <700M monthly users | Llama 3.1 |
| **Apache 2.0** | Commercial use, no restrictions | Mistral variants |
| **MIT** | Full commercial freedom | Many small models |

**SiliconSoap tracks this with the `license_type` field in their curated models table**: `open-weight` (self-hostable) vs `closed` (API-only).

---

## The Selection Framework

For any agentic system, ask these questions in order:

### Question 1: Data Constraints
Does your data leave your infrastructure?
- **Yes** → closed-source cloud
- **No** → open-weight local

### Question 2: Capability Requirements
Do you need frontier reasoning?
- **Yes** → Claude, GPT, or Gemini
- **No** → open-weight can work

### Question 3: Volume / Cost
How many tokens will you use?
- **High volume** → open-weight becomes economical
- **Low volume** → convenience of API wins

### Question 4: Latency
Is response time critical?
- **Yes** → local or edge deployment
- **No** → cloud is fine

### Question 5: Compliance
Are you regulated?
- **Yes** → local or trusted partner
- **No** → any option

Most systems answer these questions and end up with a **hybrid**:
- Frontier model for complex reasoning (cloud)
- Open-weight model for simple tasks (local)
- Local model for low-latency, private cases
- Cloud fallback for reliability

---

## Practical Patterns

### Pattern 1: Primary + Fallback
```
Primary: Claude 3.7 (complex reasoning)
Fallback: Llama 3.1 (cost savings on failure)
Route via: OpenRouter automatic fallback
```

### Pattern 2: Tiered Routing
```
Simple queries → Llama (cheap, fast)
Medium queries → DeepSeek (balanced)
Complex queries → Claude (capability)
```

### Pattern 3: Local + Cloud
```
FAQ, simple tasks → Local Ollama (fast, private)
Complex reasoning → Cloud API (capability)
Sensitive data → Local (compliance)
```

### Pattern 4: Trust-Based Routing
```
Public data → Cloud API (convenient)
Internal data → Partner GPU (trusted)
Customer data → On-prem (compliance)
Regulated data → Your GPU (full control)
```

---

## What Changes Fast

Model rankings change every few months. The specific models recommended here will be outdated. But the dimensions — context window, tool support, pricing, license, latency — are stable.

The trust principle does not change: **you cannot trust cloud models with sensitive data.** This is a fundamental architectural constraint, not a temporary gap that will close.

Build your system to be model-agnostic. OpenClaw did this. Flowwink did this. SiliconSoap did this. The pattern is consistent: swap the model without rewriting the agent.

Build your system to support local deployment. The tools (Ollama, vLLM, SGLang, TRT-LLM) are mature. The economics (for sensitive data + high volume) work. The compliance case is mandatory in regulated industries.

---

## Summary: The Questions

| Question | Answer determines |
|----------|-----------------|
| Can data leave? | Cloud vs local |
| Need frontier capability? | Closed vs open-weight |
| How many tokens? | Cost tradeoff |
| Need low latency? | Local deployment |
| Are you regulated? | Partner or on-prem |
| Is data sensitive? | On-prem required |

The model you choose today will not be the best model in 12 months. The question is whether your system is built to swap models when that happens. And whether your system keeps your data within your security perimeter.

---

*Next: the ten design laws that emerged from building FlowPilot in production. [The 10 Laws →](04-flowwink-laws.md)*