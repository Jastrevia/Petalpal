<div align="center">

# 🌸 PetalPal

<p><em>A Social Mood Garden Where Moments Bloom into Memories</em></p>

<p>A privacy-first social reflection app that turns everyday emotions and meaningful moments into a living virtual garden.</p>

<p>
<a href="https://www.youtube.com/watch?v=X4YzB332bxQ"><img src="https://img.shields.io/badge/%E2%96%B6%20Watch%20the%20film-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch the PetalPal film on YouTube"></a>
&nbsp;
<a href="https://petalpal-web.netlify.app/"><img src="https://img.shields.io/badge/%F0%9F%8C%B8%20Visit%20the%20website-petalpal--web-8E6CC8?style=for-the-badge" alt="Visit the PetalPal website"></a>
</p>

![React Native](https://img.shields.io/badge/React%20Native-Expo-000000?logo=expo&logoColor=white)
![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-2F6B3B)
![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Prisma-315D8A)
![AI](https://img.shields.io/badge/AI-Cloudflare%20Workers%20AI%20%2B%20Claude-F38020)
![Art](https://img.shields.io/badge/Art-Painted%20%2B%20AI%20Motion-B07CC6)

[See PetalPal](#-see-petalpal) · [Product](#-product) · [Technology](#-technology-stack) · [Architecture](#-system-architecture) · [Status](#-project-status) · [Getting Started](#-getting-started) · [Team](#-team)

</div>

---

## 🎬 See PetalPal

<table>
<tr>
<td width="50%" align="center" valign="top">
<a href="https://www.youtube.com/watch?v=X4YzB332bxQ"><img src="https://img.youtube.com/vi/X4YzB332bxQ/maxresdefault.jpg" alt="Watch the PetalPal film" width="100%"></a>
<br><b><a href="https://www.youtube.com/watch?v=X4YzB332bxQ">▶ Watch the film</a></b>
<br><sub>A short film introducing PetalPal</sub>
</td>
<td width="50%" align="center" valign="top">
<a href="https://petalpal-web.netlify.app/"><img src="docs/readme/petalpal-web.webp" alt="The PetalPal website" width="100%"></a>
<br><b><a href="https://petalpal-web.netlify.app/">🌐 Visit the website</a></b>
<br><sub>petalpal-web.netlify.app</sub>
</td>
</tr>
</table>

---

## 🌱 Product

PetalPal combines **personal reflection, interactive virtual environments, social connection, and AI** in one experience.

Instead of treating journaling as a static text workflow, PetalPal turns emotions, events, and reflection into an evolving world of **flowers, gardens, Fairy interactions, social visits, and long-term personal patterns**.

### Core Experience

| Experience | What it does |
| --- | --- |
| 🌸 **Mood-to-Garden** | Turns meaningful Events into mood-inspired flowers and garden progression |
| 📖 **Private Journal** | Keeps personal journaling separate from long-term AI processing |
| 👥 **Social Garden** | Supports friend search, requests, Garden visits, support, and messages |
| 🧚 **Interactive Fairy** | Uses Spine animation for state-driven Fairy experiences |
| 🧠 **Long-Term Reflection** | Builds EventMemory, retrieval foundations, and grounded reflection workflows |
| 🏛️ **Reflection Pavilion** | Keeps Weekly and Monthly reflections as painted books on a shelf, with a book of kept cards and insights |
| 🔮 **Petal Tarot** | A daily petal card drawn like tarot, with a short AI reading for the chosen topic |
| 🤝 **Fairy Bond** | Daily calendar check-in, keepsakes, closeness levels, and rewards |
| 🐾 **Garden Residents** | Painted animals that live in the Garden, each with its own habits |

### 🌸 Mood-to-Garden

Daily activity and meaningful Events can influence:

- Flower generation
- Garden progression
- Visual states
- Fairy interactions
- Reflection history

Rather than storing emotions only as text, PetalPal turns them into something users can see and interact with.

### 🎨 Dynamic Environments

PetalPal uses interactive Garden and Treehouse environments instead of static form-based screens.

Garden rendering, camera transforms, zoom/pan, and state-driven visuals make these environments interactive.

### 👥 Social Garden

Social features include:

- Friend search and requests
- Garden visits
- Garden privacy controls
- Flower support
- Supportive messages
- Visitor history
- Real-time interactions

### 📖 Journal & Treehouse

The Treehouse is part of PetalPal’s interactive environment. Private journaling remains intentionally separate from explicit AI-enabled Events.

| Private Journal | AI-enabled Event direction |
| --- | --- |
| Journal → private storage | Event → EventMemory |
| No long-term AI, embeddings, RAG, or AI reports | Weekly Reflection → Monthly Patterns → Yearly Journey |

> **Privacy boundary:** Journal remains private and separate from long-term AI. Grounded Weekly / Monthly reflections and the Interactive Yearly Journey are still in progress.

This boundary allows PetalPal to build personalized long-term experiences without treating every private Journal entry as AI data.

### 🧚 Fairy Experience

Spine-powered skeletal animation brings the Fairy to life through character states and state-driven interactions. Daily activity and meaningful Events can influence Fairy interactions.

### 🏛️ Reflection Pavilion

The Weekly and Monthly reflections live in a pavilion in the Garden. Each reflection is a painted book on a shelf: tapping one pulls it out, carries it to the desk and opens it.

- **Weekly 2.0:** code finds facts in the owner's own words, and the model only picks and phrases them. Every sentence is checked, with template fallbacks.
- **Monthly 2.0:** written by code with no model call. It shows a month garden calendar, the spread of the month's Weekly cards, and the threads that came back.
- **The petal book:** kept petal cards, insights, threads, and letters to a later week, plus a year book computed from the twelve month gardens.

### 🔮 Petal Tarot & Fairy Bond

- **Petal Tarot:** a daily petal card drawn like tarot. The owner picks one of five topics, draws from 78 cards (some reversed), and can get a short AI reading for that topic.
- **Fairy Bond:** a daily calendar check-in that reveals a keepsake from the Fairy, with streaks and closeness levels. Levels open rewards, including Fairy Moments and outfits for the Garden pets.
- **Fairy Moments:** the Fairy keeps her own small feed of painted moments and captions.

### 🐾 Garden Residents

The Garden has painted animals that live in it, each moving in hand-painted frames and following its own rules:

- **Rabbit and hedgehog:** play only on lawns that have no flowers yet, one animal to a lawn.
- **Butterfly:** rests on lawn stones and flutters from stone to stone.
- **Bluebird:** flies between perches. About half the time, the puppy gallops after it and sits down where the bird lands.
- **Memory Otter:** swims the lake at night, alongside lanterns and fireflies.

Painted frames are played by the distance walked, not by time, so paws never skid. The puppy is also getting outfits from the Fairy Bond rewards: each look walks, runs, and sits as the same dog at the same size.

---

## ⚡ Technology Stack

| Area | Technologies |
| --- | --- |
| Mobile Frontend | React Native, Expo, React Native Skia |
| Web Frontend | React, Vite, JavaScript |
| Character Animation | Spine (Fairy), painted frame sheets (Garden residents) |
| Visual Design | Adobe Photoshop, Custom Visual Assets |
| Generative Art Pipeline | AI image generation and editing, AI video generation for motion, Python + OpenCV (optical flow, tracking), rembg cut-outs |
| Backend | Node.js, Express, REST APIs |
| Database | PostgreSQL, Prisma ORM |
| Authentication | Firebase Authentication, Firebase Admin |
| Real-Time | Socket.IO |
| AI Integration | Cloudflare Workers AI, Anthropic Claude (Haiku, Sonnet, Opus) through Cloudflare AI Gateway |
| Long-Term AI | EventMemory, Evidence Provenance, Background AI Jobs |
| Machine Learning | Python, PyTorch, ONNX |
| Retrieval | PostgreSQL, pgvector |
| Infrastructure | Render, Docker |
| Reliability | Transactions, Idempotency, Rate Limiting, Background Workers |

---

## 🏗️ System Architecture

```text
React / React Native + Expo
            │
Skia Scenes + Spine Animation
            │
   Firebase Authentication
            │
            ▼
      Express Backend
    REST APIs + Socket.IO
            │
   ┌────────┼─────────┐
   │        │         │
   ▼        ▼         ▼
Garden   Journal   Event / AI
Social               │
                     ▼
              Background AI Jobs
                     │
                     ▼
                 EventMemory
                     │
                     ▼
              Long-Term Reflection
                     │
                     ▼
              PostgreSQL + Prisma
```

The backend acts as PetalPal's trusted security boundary. Authentication, authorization, private-resource ownership, and AI workflow controls are enforced server-side rather than trusting client-supplied user IDs or model output.

---

## 🎨 Frontend & Interactive Experience

The mobile experience combines:

| Layer | Role in the experience |
| --- | --- |
| React Native + Expo | Application structure and core mobile flows |
| React Native Skia | Garden rendering, camera transforms, zoom/pan, and state-driven visuals |
| Spine | Fairy skeletal animation and character states |
| Reanimated | UI-thread motion for the Fairy, Garden residents, and transitions |
| Adobe Photoshop | Custom Garden, Flower, Treehouse, icon, and interface assets |
| AI-assisted art pipeline | Painted icons, card faces, and illustrations; Garden residents' motion made from generated clips and packed into frame sheets |

The web frontend uses React, Vite, and JavaScript. Firebase Authentication, REST APIs, and Socket.IO connect the interfaces to account and real-time social workflows.

---

## ⚙️ Backend Engineering

PetalPal's backend is built with **Node.js, Express, PostgreSQL, and Prisma**.

### Core Capabilities

- Authentication and authorization
- Journal storage
- Events and flower generation
- Garden and Flower state
- Fairy runtime state
- Friend relationships
- Real-time social interactions
- AI processing
- Long-term memory infrastructure

---

## 🤖 AI, RAG & Long-Term Memory

PetalPal uses AI as a **supporting product layer**, not as an unrestricted controller of private user content.

### Long-Term AI Foundation

The architecture includes:

- Private EventMemory
- Evidence provenance
- Owner-scoped retrieval
- Durable background AI processing
- Retrieval evaluation interfaces
- Weekly and Monthly reflection foundations
- Yearly reflection architecture
- Trend-analysis infrastructure

> **Backend systems calculate factual trends. AI explains them.**

```text
Verified Data
    +
Relevant Events
    +
AI Explanation
    ↓
Grounded Reflection
```

### Retrieval & RAG Direction

PetalPal is building toward owner-scoped RAG workflows that combine:

- PostgreSQL-backed EventMemory
- pgvector semantic retrieval
- embedding-based historical context
- retrieval evaluation and ranking benchmarks
- evidence-grounded LLM generation
- insufficient-evidence handling and fallback paths

> **In progress:** Production semantic retrieval and full RAG generation are still under development.

---

## 🧠 Machine Learning

PetalPal includes an independent **multi-label emotion classification** pipeline, separated from long-term AI memory so both systems can be evaluated independently.

### Current ML Work

- Python
- PyTorch
- ONNX
- Multi-label emotion classification
- Dataset evaluation
- Threshold evaluation
- Leakage-resistant evaluation
- Frozen test sets
- Human review
- Model adjudication
- Inference optimization

```text
User Input
    ↓
Emotion Classification
    ↓
Structured Emotion Signal
    ↓
Product Experience
```

---

## 🔐 Security & Reliability

Security and reliability are treated as core product infrastructure.

- Firebase-authenticated API access
- Server-side authorization
- Owner-scoped private resources
- Input validation
- Rate limiting
- Transactions and database migrations
- Idempotency
- Background-job recovery
- Retry and fallback controls
- AI-output validation
- Docker-based local development
- Render deployment
- Automated backend testing

These controls keep core product flows reliable even when external AI services or background processing fail.

---

## ⭐ Engineering Highlights

- Built a cross-platform product with **React, React Native, and Expo**
- Built interactive Garden and Treehouse experiences with **React Native Skia**
- Integrated **Spine** for animated Fairy character experiences
- Built a **generative art pipeline**: AI-generated motion clips are cut out, tracked, and packed into frame sheets that Skia plays by distance walked
- Brought **Garden residents** to life with rule-driven behaviour: lawn rules, a bluebird chase, and sitting and rising
- Built real-time social interactions using **Socket.IO**
- Designed a **Node.js + Express + PostgreSQL + Prisma** backend
- Implemented **Firebase-authenticated private-resource ownership**
- Added transaction-safe, idempotent, and failure-aware workflows
- Built durable PostgreSQL-backed AI processing
- Integrated **Anthropic Claude** through Cloudflare AI Gateway, with code-checked outputs and fallbacks
- Designed a privacy-separated **Journal / Event** architecture
- Built **EventMemory**, evidence provenance, and owner-scoped retrieval foundations
- Developed **PostgreSQL + pgvector** semantic-retrieval foundations for RAG
- Developed a **PyTorch multi-label emotion classification** pipeline
- Explored **ONNX** for efficient inference
- Containerized backend services with **Docker**
- Deployed backend infrastructure with **Render**

---

## 🚧 Project Status

| Status | Area |
| --- | --- |
| ✅ Implemented | React Native + Expo mobile foundation |
| ✅ Implemented | React Native Skia Garden rendering and camera interactions |
| ✅ Implemented | Spine-powered Fairy animation integration |
| ✅ Implemented | Friends, privacy controls, and Garden visit flows |
| ✅ Implemented | Node.js + Express backend |
| ✅ Implemented | PostgreSQL + Prisma data layer |
| ✅ Implemented | Firebase authentication and authorization |
| ✅ Implemented | Real-time social interactions with Socket.IO |
| ✅ Implemented | Durable background AI processing |
| ✅ Implemented | Private EventMemory foundation |
| ✅ Implemented | Multi-label emotion classification pipeline |
| ✅ Implemented | Reflection pavilion with Weekly 2.0 and Monthly 2.0 (switched on per owner during beta) |
| ✅ Implemented | Petal Tarot daily draw and AI readings |
| ✅ Implemented | Fairy Bond: calendar check-in, keepsakes, and closeness levels |
| ✅ Implemented | Garden residents and night view |
| 🔨 In Progress | Expanded Garden and Treehouse interactions |
| 🔨 In Progress | Embedding model evaluation |
| 🔨 In Progress | PostgreSQL + pgvector semantic retrieval and full RAG generation |
| 🔨 In Progress | Garden pet wardrobe: outfits, feeding, and petting |
| 🔨 In Progress | Interactive Yearly Journey |
| 🔨 In Progress | Continued ML evaluation and data-quality improvement |
| 🔨 In Progress | Beta testing and product iteration |

---

## 🗺️ Roadmap

```text
Current Product
    ↓
Long-Term AI Foundation
    ↓
Embedding Evaluation
    ↓
Owner-Scoped Semantic Retrieval
    ↓
Grounded Weekly / Monthly Reflection
    ↓
Interactive Yearly Journey
```

---

## 🚀 Getting Started

### Clone

```bash
git clone https://github.com/Jastrevia/Petalpal.git
cd Petalpal
```

### Install

Backend:

```bash
npm install
```

Frontend:

```bash
cd client
npm install
cd ..
```

### Database

```bash
npx prisma generate
npx prisma migrate deploy
```

### Run

Backend:

```bash
npm start
```

Frontend:

```bash
cd client
npm run dev
```

AI worker:

```bash
npm run start:ai-worker
```

---

## 📚 Technical Documentation

Detailed engineering documentation is maintained separately:

- [`INTEGRATION_DEPLOYMENT.md`](./INTEGRATION_DEPLOYMENT.md) — Canonical SOP to read before branch integration, isolated testing or controlled deployment; [`WARNING.md`](./WARNING.md) takes precedence for privacy and credential safety
- [`MOBILE.md`](./MOBILE.md) — Physical-iPhone setup, mobile authentication, and isolated native testing runbook
- [`LONG_TERM_AI.md`](./LONG_TERM_AI.md) — Long-term AI, memory, reports, and retrieval architecture
- [`SECURITY.md`](./SECURITY.md) — Security architecture and backend hardening
- [`experiments/emotion-classifier-v2/ML_PROGRESS.md`](./experiments/emotion-classifier-v2/ML_PROGRESS.md) — Machine learning experiments and evaluation

---

## 👥 Team

PetalPal is developed by **Jastrevia**.

### 👩🏻‍💻 Jinyin Cao
*Co-Founder · Product / Frontend Lead*

Jinyin leads PetalPal's product and frontend direction, with a focus on user experience, visual design, interactive environments, and product growth.

#### 🎯 Product Strategy & UX

- Lead product vision, roadmap, user journeys, and mobile experience direction
- Co-design Journal, Events, Garden, Fairy, social, and reflection experiences
- Lead usability testing, product iteration, and visual experience refinement
- Shape engagement, progression, interaction, and retention systems with the team

#### 💻 Frontend Engineering

- Lead mobile frontend development with React Native, Expo, and reusable components
- Build responsive interfaces and interactive product flows across core mobile experiences
- Develop dynamic Garden and environmental experiences using React Native Skia
- Integrate Firebase Authentication, REST APIs, Socket.IO, and application state

#### 🎨 Visual & Interactive Experience

- Create custom visual assets and scenes using Adobe Photoshop
- Design flowers, gardens, Fairy environments, icons, and interface elements
- Build progression-driven and state-driven visual experiences across the product
- Develop Spine-powered Fairy animations and production-ready visual interactions

#### 🔗 Product Integration

- Coordinate frontend implementation across Garden, Events, Journal, social, and account experiences
- Collaborate on frontend-backend integration, feature behavior, and cross-stack product decisions
- Validate interactive experiences across mobile layouts, devices, and responsive states
- Refine feature flows through product testing, iteration, and user feedback

#### 🚀 Product Growth & Delivery

- Plan beta testing, user-feedback programs, and product validation
- Coordinate product iteration, feature delivery, and release readiness
- Prepare branding, product presentation, launch materials, and visual communication
- Support continued product development, adoption, and early-stage growth

---

### 👩🏻‍💻 Xingran Ma
*Co-Founder · Technical / AI Lead*

Xingran leads PetalPal's backend architecture, AI and retrieval systems, machine learning, security, reliability, and production infrastructure.

#### ⚙️ Backend Engineering

- Design Node.js and Express REST APIs with PostgreSQL and Prisma data models
- Build Firebase-authenticated server authorization and owner-scoped private-resource access
- Implement transactional, idempotent, and failure-aware workflows for multi-step operations
- Develop backend infrastructure for Events, Journal, Garden, social, and AI features

#### 🤖 AI, RAG & Long-Term Memory

- Design privacy-first long-term AI architecture separating Journal from Event-based processing
- Build EventMemory, evidence provenance, and owner-scoped RAG retrieval foundations
- Develop PostgreSQL and pgvector semantic retrieval with embedding-based historical context
- Build grounded reflection workflows with retrieval evaluation, validation, retry, and fallback

#### 🧠 Machine Learning

- Develop multi-label emotion classifiers using Python, PyTorch, and ONNX
- Build model, threshold, dataset, and benchmark evaluation workflows
- Design leakage-resistant evaluation, frozen test sets, human review, and adjudication
- Integrate production inference with validation, fallback, versioning, and evaluation boundaries

#### 🔐 Security, Reliability & Production Engineering

- Enforce authentication, authorization, owner isolation, and private-resource boundaries
- Implement rate limiting, validation, transactions, migrations, idempotency, and recovery
- Harden AI jobs against duplicate execution, partial failures, retries, and invalid outputs
- Maintain automated testing, Docker development environments, Render deployment, and reliability controls

#### 🎨 Visual Design & Interactive Frontend

- Design and paint every icon in the app and what it shows, including the Petal Tarot card faces and the calendar
- Build the first version of the Treehouse
- Create every animated Garden animal end to end, from art and motion clips to frame sheets and in-Garden behaviour, including the puppy's outfits
- Design and build the reflection pavilion's contents: the shelf, the books, and what each one opens

#### 🔗 Product & Frontend Integration

- Contribute to product strategy, UX, and interaction design across core experiences
- Implement React Native and Expo flows for navigation, privacy, visits, and Treehouse
- Contribute to Skia camera interactions and Spine-powered Fairy integration
- Validate end-to-end flows across frontend, APIs, PostgreSQL, social, and AI/LLM processing

---

## 🌸 Jastrevia

**Jastrevia** builds AI-native consumer products that combine interactive design, software engineering, and personalized intelligent experiences.

PetalPal is designed to help people preserve meaningful moments, understand patterns over time, and watch their experiences grow into a living digital world.

---

<div align="center">

If you find PetalPal interesting, feel free to ⭐ the repository.

</div>
